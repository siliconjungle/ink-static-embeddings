import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=process.cwd(),processes=Number(process.env.BENCH_PROCESSES??3),runs=[],validation=[];
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Ink JavaScript rows</title>');return;}
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
try{
  for(let group=0;group<processes;group++){
    const browser=await chromium.launch({channel:'chrome',headless:false});
    try{
      const page=await browser.newPage();await page.goto(url);
      const result=await page.evaluate(async group=>{
        const {createJavascriptEncoder}=await import('/runtime/static-embedding.mjs');
        const {createJavascriptEncoder:previous}=await import('/artifacts/javascript-rows/runtime-before.mjs');
        const dir='/build/general/potion-2m',row=dir+'/javascript/packed-rows';
        const [m,layout,bytes,corpus,reference,base,array,dense]=await Promise.all([
          fetch(dir+'/model.json').then(r=>r.json()),fetch(row+'/layout.json').then(r=>r.json()),fetch(dir+'/weights.f32').then(r=>r.arrayBuffer()),
          fetch('/build/corpus.json').then(r=>r.json()),fetch('/results/raw-0-upstream.json').then(r=>r.json()),
          import(dir+'/optimized.mjs'),import(row+'/array-reference.mjs'),import(row+'/model.mjs')]);
        const weights=new Float32Array(bytes),encoders={},setup={};
        for(const [name,module,host,options] of [['previous',base,previous,{}],['rows-array',array,createJavascriptEncoder,{layout}],['rows',dense,createJavascriptEncoder,{layout}]]){
          const start=performance.now();encoders[name]=host(module,m,weights,options);setup[name]=performance.now()-start;
          const out=encoders[name].encodeBatch(corpus.cases.map(c=>c.ids)),actual=new Uint32Array(out.buffer),expected=new Uint32Array(Float32Array.from(reference.ordered_outputs.flat()).buffer);
          if(actual.length!==expected.length||actual.some((x,i)=>x!==expected[i]))throw Error(name+' output mismatch');
        }
        const cases=corpus.cases,buckets={all:cases,empty:cases.filter(c=>!c.ids.length),short:cases.filter(c=>c.ids.length>0&&c.ids.length<=16),
          medium:cases.filter(c=>c.ids.length>16&&c.ids.length<=128),long:cases.filter(c=>c.ids.length>128)};
        let order=['previous','rows-array','rows'];order=order.slice(group%3).concat(order.slice(0,group%3));if(group%2)order.reverse();
        let checksum=0;const modes={};
        for(const mode of order){
          const encode=ids=>encoders[mode].encode(ids);
          for(let k=0;k<150;k++)for(const c of cases)for(const x of encode(c.ids))checksum+=x;
          const samples={};
          for(const [bucket,selected] of Object.entries(buckets)){
            const times=[];
            for(let round=0;round<9;round++){
              const t=performance.now();for(let k=0;k<100;k++)for(const c of selected)for(const x of encode(c.ids))checksum+=x;
              times.push((performance.now()-t)*1e6/(100*selected.length));
            }
            samples[bucket]={cases:selected.length,samples_ns_per_embedding:times};
          }
          modes[mode]={samples,all_outputs_bit_exact:true};
        }
        return {modes,setup_ms:setup,order,checksum,user_agent:navigator.userAgent};
      },group);
      result.browser_version=browser.version();runs.push(result);
      await fs.mkdir('results/javascript-rows/browser',{recursive:true});
      await fs.writeFile(`results/javascript-rows/browser/${group}.json`,JSON.stringify(result,null,2)+'\n');
      console.log(group,Object.fromEntries(Object.entries(result.modes).map(([k,v])=>[k,median(v.samples.all.samples_ns_per_embedding)/1000])));
    }finally{await browser.close();}
  }
  const browser=await chromium.launch({channel:'chrome',headless:false});
  try{
    for(const name of ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']){
      const page=await browser.newPage();await page.goto(url);
      try{
        const result=await page.evaluate(async name=>{
          const {loadStaticEmbedding}=await import('/runtime/static-embedding.mjs');
          const dir='/build/general/'+name,fixture=await fetch(dir+'/validation.json').then(r=>r.json());
          const model=await loadStaticEmbedding(dir+'/',{backend:'javascript',javascriptLayout:'packed-rows'});
          const expected=new Uint32Array(Float32Array.from(fixture.ordered_outputs.flat()).buffer),out=model.encodeBatch(fixture.queries);
          if(new Uint32Array(out.buffer).some((x,i)=>x!==expected[i]))throw Error('Model output mismatch '+name);
          for(let trial=0;trial<3;trial++)for(let i=fixture.queries.length-1;i>=0;i--){
            const value=model.encode(fixture.queries[i]),want=new Uint32Array(Float32Array.from(fixture.ordered_outputs[i]).buffer);
            if(new Uint32Array(value.buffer).some((x,j)=>x!==want[j]))throw Error('Reordered query mismatch');value.fill(99);
          }
          for(const ids of [[-1],[model.manifest.vocabulary_size],[NaN],[1.5]]){
            let failed=false;try{model.encode(ids);}catch{failed=true;}if(!failed)throw Error('Invalid ID accepted');
          }
          return {model_id:model.manifest.model_id,dimensions:model.manifest.dimensions,cases:fixture.queries.length,
            all_outputs_bit_exact:true,reordered_queries:true,detached_outputs:true,invalid_ids_rejected:true};
        },name);
        validation.push(result);console.log('Validated',name);
      }finally{await page.close();}
    }
  }finally{await browser.close();}
}finally{await new Promise(resolve=>server.close(resolve));}
function median(a){const b=[...a].sort((a,b)=>a-b);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2;}
const summary=Object.fromEntries(['all','empty','short','medium','long'].map(bucket=>[bucket,Object.fromEntries(['previous','rows-array','rows'].map(mode=>[mode,median(runs.map(r=>median(r.modes[mode].samples[bucket].samples_ns_per_embedding)))]))]));
const files=['scripts/js_rows_browser.mjs','runtime/static-embedding.mjs','artifacts/javascript-rows/runtime-before.mjs',
  'build/general/potion-2m/optimized.mjs','build/general/potion-2m/javascript/packed-rows/model.mjs','build/general/potion-2m/javascript/packed-rows/array-reference.mjs'];
const hashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));
const report={schema:1,processes,summary_ns_per_embedding:summary,validation,source_sha256:hashes,runs,
  scope:'Installed visible Chrome, CPU only, public encode API; complete detached output consumed, loading/tokenization/model preparation excluded. The same row Ink source is compiled with old slot-array versus new dense F32 storage. Row source is authored, not a proof-selected rewrite.'};
await fs.writeFile('results/javascript-rows/browser/report.json',JSON.stringify(report,null,2)+'\n');
const lines=['# JavaScript rows in Chrome','',report.scope,'',`Chrome ${runs[0].browser_version}; Apple M4 Pro; ${processes} fresh browsers, nine rounds, 100 repetitions. µs/query; median of process medians.`,
 '', '| Input | Previous JS | Rows, array storage | Rows, dense storage | Previous / new |',
 '| --- | ---: | ---: | ---: | ---: |',...Object.entries(summary).map(([k,v])=>`| ${k} | ${(v.previous/1000).toFixed(3)} | ${(v['rows-array']/1000).toFixed(3)} | ${(v.rows/1000).toFixed(3)} | ${(v.previous/v.rows).toFixed(2)}× |`),
 '', 'All 64 benchmark outputs and all 16 retained cases for each of the five model/fixtures match the ordered F32 oracle bit for bit. The actual public loader is tested. Changing/reordered queries, detached results and ID rejection are checked. The NumPy CPU comparison is in the separate matched Node/Python study; no browser NumPy or GPU speedup is claimed here.'];
await fs.writeFile('results/javascript-rows/browser/REPORT.md',lines.join('\n')+'\n');console.log(lines.join('\n'));
