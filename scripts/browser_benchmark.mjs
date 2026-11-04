// Run from the repository root. Install Playwright separately; its module path
// can be supplied with PLAYWRIGHT_MODULE. Uses installed Chrome, actual WebGPU,
// and an isolated fresh profile for each process group; never permits fallback.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=process.cwd(), mime={'.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.wgsl':'text/plain'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Ink browser benchmark</title>');return;}
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const processes=Number(process.env.BENCH_PROCESSES??3),rounds=9;
const runs=[];
try {
  for(let processIndex=0;processIndex<processes;processIndex++){
    const browser=await chromium.launch({channel:'chrome',headless:false});
    try {
      const page=await browser.newPage();
      page.on('pageerror',e=>console.error(e.message));
      await page.goto(url);
      const result=await page.evaluate(async({rounds})=>{
        if(!navigator.gpu)throw Error('Browser has no WebGPU');
        const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
        if(!adapter||adapter.info.isFallbackAdapter)throw Error('No hardware GPU adapter');
        const adapterInfo={...Object.fromEntries(['vendor','architecture','device','description','isFallbackAdapter'].map(k=>[k,adapter.info[k]]))};
        const device=await adapter.requestDevice();
        const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
        const {loadInk}=await import('/build/gpu-batch/ink-gpu.mjs');
        const t0=performance.now();
        const runtime=await loadInk('/build/gpu-batch/',{device,backend:'gpu',policy:'static',staticBackend:'gpu'});
        const runtimeMs=performance.now()-t0;
        const [manifest,corpusData,oracleData,weightBytes]=await Promise.all([
          fetch('/build/model.json').then(r=>r.json()),fetch('/build/corpus.json').then(r=>r.json()),
          fetch('/results/raw-0-upstream.json').then(r=>r.json()),fetch('/build/weights.f32').then(r=>r.arrayBuffer())]);
        const corpus=corpusData.cases,weights=new Float32Array(weightBytes),split=manifest.shard_elements;
        const first=weights.slice(0,split),second=weights.slice(split),reports=[];
        const bits=array=>new Uint32Array(Float32Array.from(array).buffer);
        const expected=oracleData.ordered_outputs.map(bits);
        for(const batch of [1,16,64,256,1024]){
          const inputs=shift=>{
            const tokens=[],starts=[],lengths=[];
            for(let i=0;i<batch;i++){const ids=corpus[(i+shift)%corpus.length].ids;starts.push(tokens.length);lengths.push(ids.length);tokens.push(...ids);}
            return {tokens,starts,lengths};
          };
          const a=inputs(0),b=inputs(1),capacity=Math.max(a.tokens.length,b.tokens.length);
          for(const v of [a,b])while(v.tokens.length<capacity)v.tokens.push(0);
          const plan={inputs:{first,second,...a,positions:Array.from({length:batch*64},(_,i)=>i),documents:Array.from({length:batch},(_,i)=>i)},steps:[
            {id:'means',call:'pool_batch',args:['first','second','tokens','starts','lengths','positions'].map(input=>({input}))},
            {id:'norms',call:'norm_batch',args:[{step:'means'},{input:'documents'}]},
            {id:'embeddings',call:'normalize_batch',args:[{step:'means'},{step:'norms'},{input:'positions'}]}],outputs:['embeddings']};
          const begin=performance.now(),session=await runtime.open(plan,{backend:'gpu-required'}),openMs=performance.now()-begin;
          if(session.backend!=='gpu')throw Error('CPU fallback');
          for(let i=0;i<3;i++){await session.step();await session.finish();}
          const samples=[],computes=[],reads=[],outputHashes=[];
          for(let round=0;round<rounds;round++){
            const shift=round%2,v=[a,b][shift],start=performance.now();
            for(const key of ['tokens','starts','lengths'])await session.write(key,v[key]);
            const computeStart=performance.now(),step=await session.step();await session.finish();
            const computeEnd=performance.now();
            const out=await session.read({outputs:['embeddings']});const end=performance.now();
            if(step.backend!=='gpu'||step.counters.dispatches!==3)throw Error('Unexpected GPU execution');
            samples.push((end-start)*1e6/batch);computes.push((computeEnd-computeStart)*1e6/batch);reads.push((end-computeEnd)*1e6/batch);
            const actual=bits(out.values.embeddings);
            if(actual.length!==batch*64)throw Error('Truncated output');
            for(let i=0;i<actual.length;i++)if(actual[i]!==expected[(Math.floor(i/64)+shift)%corpus.length][i%64])throw Error(`Output mismatch batch=${batch} round=${round} index=${i}`);
            const hash=await crypto.subtle.digest('SHA-256',actual);
            outputHashes.push(Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''));
          }
          reports.push({batch,rounds,open_ms:openMs,new_query_ns_per_embedding:samples,compute_ns_per_embedding:computes,read_ns_per_embedding:reads,output_sha256:outputHashes,all_outputs_bit_exact:true});
          await session.close();
        }
        await runtime.close();device.destroy();
        if(errors.length)throw Error(errors.join('\n'));
        return {adapter:adapterInfo,user_agent:navigator.userAgent,cross_origin_isolated:crossOriginIsolated,runtime_load_ms:runtimeMs,reports};
      },{rounds});
      result.browser_version=browser.version();runs.push(result);
      for(const row of result.reports)console.log('Browser group',processIndex+1,'batch',row.batch,'median us/embedding',median(row.new_query_ns_per_embedding)/1000);
    }finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
function median(a){const sorted=[...a].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}
const summary=[1,16,64,256,1024].map(batch=>({batch,...Object.fromEntries(['new_query','compute','read'].map(mode=>[mode+'_ns_per_embedding',median(runs.map(run=>median(run.reports.find(r=>r.batch===batch)[mode+'_ns_per_embedding'])))]))}));
const sourceFiles=['scripts/browser_benchmark.mjs','build/batch-model.ink','build/gpu-batch/manifest.json','build/corpus.json'];
const source_sha256=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const report={schema:1,processes,rounds,scope:'Headed installed Chrome, isolated fresh profiles, actual hardware WebGPU required. Warm resident model; alternating token queries. Complete query includes input packing/uploads, three completed dispatches and complete decoded output readback. Excludes tokenization, model download/loading, session/pipeline creation and correctness checking. Large batch values describe amortized throughput, not individual request latency. Exact F32 shaders emitted by unchanged Ink; no upstream browser GPU baseline.',source_sha256,summary,runs};
await fs.mkdir('results/browser',{recursive:true});
await fs.writeFile('results/browser/report.json',JSON.stringify(report,null,2)+'\n');
const rows=['# Browser WebGPU experiment','',report.scope,'',`Chrome ${runs[0].browser_version}; GPU ${JSON.stringify(runs[0].adapter)}. Three warmups, ${rounds} measured queries in each of ${processes} fresh browser process groups. Every output bit matches the ordered F32 oracle.`,'','| Batch | Complete query µs / embedding | Compute + finish µs / embedding | Read + decode µs / embedding |','| ---: | ---: | ---: | ---: |',...summary.map(r=>`| ${r.batch} | ${(r.new_query_ns_per_embedding/1000).toFixed(3)} | ${(r.compute_ns_per_embedding/1000).toFixed(3)} | ${(r.read_ns_per_embedding/1000).toFixed(3)} |`)];
await fs.writeFile('results/browser/REPORT.md',rows.join('\n')+'\n');console.log(rows.join('\n'));
