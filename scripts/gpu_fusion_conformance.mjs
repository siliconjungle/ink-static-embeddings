// Focused lifecycle/search controls, separate from performance measurements.
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright'),root=process.cwd();
const server=http.createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>GPU conformance</title>');return;}
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
    res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:false});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const report=await page.evaluate(async()=>{
    const {loadStaticEmbedding}=await import('/runtime/static-embedding.mjs');
    const adapter=await navigator.gpu.requestAdapter();if(!adapter||adapter.info.isFallbackAdapter)throw Error('Hardware GPU required');
    const device=await adapter.requestDevice(),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    const base='/build/general/unseen-clamp/',fixture=await fetch(base+'validation.json').then(r=>r.json());
    const corpus=Array.from({length:64},(_,i)=>fixture.queries[i%fixture.queries.length]),queries=corpus.slice(0,3),records=[];
    for(const mode of ['fused-strict','fused-native']){
      const opts={backend:'gpu',device,gpuKernel:mode},model=await loadStaticEmbedding(base,opts),other=await loadStaticEmbedding(base,opts);
      const session=q=>model.createSession({batchSize:q.length,tokenCapacity:q.reduce((n,x)=>n+x.length,0)});
      const a=await session(queries),b=await session(corpus),foreignSession=await other.createSession({batchSize:3,tokenCapacity:queries.reduce((n,x)=>n+x.length,0)});
      const ah=await a.encodeBatchResident(queries),bh=await b.encodeBatchResident(corpus),fh=await foreignSession.encodeBatchResident(queries);
      const av=await ah.read(),bv=await bh.read();
      for(const k of [1,7,32,3,32]){
        const out=await ah.search(bh,{k});
        for(let i=0;i<3;i++){
          const scores=corpus.map((_,j)=>{let total=0;for(let dim=0;dim<5;dim++)total=Math.fround(total+Math.fround(av[i*5+dim]*bv[j*5+dim]));return {j,total};});
          scores.sort((x,y)=>y.total-x.total||x.j-y.j);
          for(let p=0;p<k;p++){
            const index=out.indices[i*k+p],score=out.scores[i*k+p];
            if(mode==='fused-strict'&&(index!==scores[p].j||score!==scores[p].total))throw Error('Growing/shrinking top-k mismatch');
            if(index>=64||!Number.isFinite(score))throw Error('Invalid top-k value');
          }
        }
        out.indices.fill(999);out.scores.fill(999);
      }
      for(const [target,k] of [[bh,0],[bh,33],[bh,1.5],[fh,1]]){
        let rejected=false;try{await ah.search(target,{k});}catch{rejected=true;}if(!rejected)throw Error('Invalid search accepted');
      }
      // A queued encode completes before close releases its output, while the
      // returned resident lease is invalidated by that close.
      const inFlight=a.encodeBatchResident(queries),closing=a.close(),lease=await inFlight;await closing;
      let rejected=false;try{await lease.search(bh,{k:1});}catch{rejected=true;}if(!rejected)throw Error('Closed lease accepted');
      const bytesBefore=model.liveBytes;await model.close();await other.close();await model.close();
      if(model.liveBytes!==0||other.liveBytes!==0)throw Error('Search cache or session leaked');
      records.push({mode,top_k_sizes:[1,7,32,3,32],stable_ties_checked:mode==='fused-strict',detached_results:true,foreign_invalid_and_closed_handles_rejected:true,queued_close:true,bytes_before_close:bytesBefore,bytes_after_close:model.liveBytes});
    }
    if(errors.length)throw Error(errors.join('\n'));device.destroy();return {records,scope:'Actual hardware lifecycle/search conformance, no performance claim.'};
  });
  report.browser_version=browser.version();report.sha256={};
  for(const file of ['scripts/gpu_fusion_conformance.mjs','runtime/static-embedding.mjs','runtime/static-embedding-gpu.mjs'])report.sha256[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
  await fs.writeFile('results/gpu-fusion/conformance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
