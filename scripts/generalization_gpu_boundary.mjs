// Same Ink source/shaders: isolate legacy versus typed destination readback.
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=process.cwd(),processes=Number(process.env.BENCH_PROCESSES??3),rounds=9,repetitions=8,directory='results/generalization/gpu-boundary';
await fs.mkdir(directory,{recursive:true});
const server=http.createServer(async(req,res)=>{
 try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>General GPU boundary</title>');return;}
 const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let runs=[];
try{
 for(let group=0;group<processes;group++){
  const browser=await chromium.launch({channel:'chrome',headless:false});
  try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
   const report=await page.evaluate(async({group,rounds,repetitions})=>{
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter||adapter.info.isFallbackAdapter)throw Error('Hardware required');
    const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.min(256*1024*1024,adapter.limits.maxStorageBufferBindingSize),maxBufferSize:Math.min(256*1024*1024,adapter.limits.maxBufferSize)}}),errors=[];
    device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    const load=async(base,old=false)=>{const mod=await import(base+'ink-gpu.mjs');return mod.loadInk(base,{device,backend:'gpu',policy:'static',staticBackend:'gpu'});};
    const numeric=values=>{const out=new Float32Array(values.length),bits=new Uint32Array(out.buffer);for(let i=0;i<values.length;i++)typeof values[i]==='number'?out[i]=values[i]:bits[i]=values[i].F32Bits;return out;};
    const words=values=>new Uint32Array(Float32Array.from(values).buffer);
    const equal=(actual,expected)=>{const bits=new Uint32Array(actual.buffer,actual.byteOffset,actual.length);if(bits.length!==expected.length||bits.some((v,i)=>v!==expected[i]))throw Error('Output bits differ');};
    async function session(runtime,m,weights,batch,capacity){
     const names=['weights','tokens','starts','lengths','positions'];
     return runtime.open({inputs:{weights,tokens:new Uint32Array(capacity),starts:new Uint32Array(batch),lengths:new Uint32Array(batch),positions:Uint32Array.from({length:batch*m.dimensions},(_,i)=>i),documents:Uint32Array.from({length:batch},(_,i)=>i)},steps:[
      {id:'means',call:'pool_batch',args:names.map(input=>({input}))},
      {id:'norms',call:'norm_batch',args:[{step:'means'},{input:'documents'}]},
      {id:'embeddings',call:'normalize_batch',args:[{step:'means'},{step:'norms'},{input:'positions'}]}],outputs:['embeddings']},{backend:'gpu-required'});
    }
    async function encode(s,m,queries,capacity,typed){
     const tokens=new Uint32Array(capacity),starts=new Uint32Array(queries.length),lengths=new Uint32Array(queries.length);let at=0;
     queries.forEach((ids,i)=>{if(ids.length>4096||at+ids.length>capacity)throw Error('Query capacity');for(const id of ids)if(!Number.isInteger(id)||id<0||id>=m.vocabulary_size)throw Error('Invalid ID');starts[i]=at;lengths[i]=ids.length;tokens.set(ids,at);at+=ids.length;});
     await s.write('tokens',tokens);await s.write('starts',starts);await s.write('lengths',lengths);
     const receipt=await s.step();if(receipt.backend!=='gpu'||receipt.counters.dispatches!==3)throw Error('Not three hardware dispatches');
     if(typed){const out=new Float32Array(queries.length*m.dimensions);const r=await s.readInto('embeddings',out);if(r.count!==out.length)throw Error('Truncated destination');return out;}
     return numeric((await s.read({outputs:['embeddings']})).values.embeddings);
    }
    const validation=[];
    if(group===0){for(const name of ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']){
     const base='/build/general/'+name+'/',m=await fetch(base+'model.json').then(r=>r.json()),fixture=await fetch(base+'validation.json').then(r=>r.json()),weights=new Float32Array(await fetch(base+'weights.f32').then(r=>r.arrayBuffer()));
     const runtime=await load('/build/generalization/gpu/'+name+'/'),q=fixture.queries,capacity=q.reduce((n,x)=>n+x.length,0),s=await session(runtime,m,weights,q.length,capacity);
     let held;
     for(let shift=0;shift<3;shift++){
      const queries=q.map((_,i)=>q[(i+shift)%q.length]),expected=words(q.flatMap((_,i)=>fixture.ordered_outputs[(i+shift)%q.length]));
      const out=await encode(s,m,queries,capacity,true);equal(out,expected);if(held&&held.some(x=>x!==123))throw Error('Detached output changed');out.fill(123);held=out;
      const tail=new Float32Array(out.length+2);tail.fill(77);await s.readInto('embeddings',tail);equal(tail.subarray(0,out.length),expected);if(tail[out.length]!==77||tail[out.length+1]!==77)throw Error('Tail overwritten');
     }
     const short=new Float32Array([123]);let rejected=false;try{await s.readInto('embeddings',short);}catch{rejected=true;}if(!rejected||short[0]!==123)throw Error('Capacity guard wrote');
     rejected=false;try{await s.readInto('embeddings',new Uint32Array(q.length*m.dimensions));}catch{rejected=true;}if(!rejected)throw Error('Dtype accepted');
     await s.close();await runtime.close();validation.push({name,all_bits_exact:true,tail_and_capacity_and_dtype:true,detached_results:true});
    }}
    const base='/build/general/potion-2m/',m=await fetch(base+'model.json').then(r=>r.json()),weights=new Float32Array(await fetch(base+'weights.f32').then(r=>r.arrayBuffer())),corpus=await fetch('/build/corpus.json').then(r=>r.json()),oracle=await fetch('/results/raw-0-upstream.json').then(r=>r.json());
    const runtimes={old:await load(base+'webgpu/'),new:await load('/build/generalization/gpu/potion-2m/')};
    const reports=[];
    for(const batch of [1,16,64,256,1024]){
     const queries=[0,1].map(shift=>Array.from({length:batch},(_,i)=>corpus.cases[(i+shift)%64].ids));
     const expected=[0,1].map(shift=>words(Array.from({length:batch},(_,i)=>oracle.ordered_outputs[(i+shift)%64]).flat())),capacity=Math.max(...queries.map(q=>q.reduce((n,x)=>n+x.length,0)));
     const sessions={'old-read':await session(runtimes.old,m,weights,batch,capacity),'new-read-control':await session(runtimes.new,m,weights,batch,capacity),'new-read-into':await session(runtimes.new,m,weights,batch,capacity)},samples=Object.fromEntries(Object.keys(sessions).map(k=>[k,[]]));
     let order=Object.keys(sessions);if(group%2)order.reverse();order=order.slice(group%3).concat(order.slice(0,group%3));
     for(let warmup=0;warmup<20;warmup++)for(const mode of order)equal(await encode(sessions[mode],m,queries[warmup%2],capacity,mode==='new-read-into'),expected[warmup%2]);
     for(let round=0;round<rounds;round++){
      for(const mode of order){let elapsed=0;for(let repeat=0;repeat<repetitions;repeat++){const shift=(round+repeat)%2,start=performance.now(),out=await encode(sessions[mode],m,queries[shift],capacity,mode==='new-read-into');elapsed+=performance.now()-start;equal(out,expected[shift]);}samples[mode].push(elapsed*1e6/(batch*repetitions));}
      order=order.slice(1).concat(order[0]);
     }
     for(const s of Object.values(sessions))await s.close();reports.push({batch,samples_ns_per_embedding:samples,all_bits_exact:true});
    }
    for(const r of Object.values(runtimes))await r.close();if(errors.length)throw Error(errors.join('\n'));device.destroy();
    return {reports,validation,adapter:Object.fromEntries(['vendor','architecture','description','isFallbackAdapter'].map(k=>[k,adapter.info[k]]))};
   },{group,rounds,repetitions});
   report.browser_version=browser.version();runs.push(report);await fs.writeFile(`${directory}/${group}.json`,JSON.stringify(report,null,2)+'\n');console.log('GPU boundary process',group,report.reports.map(r=>({batch:r.batch,...Object.fromEntries(Object.entries(r.samples_ns_per_embedding).map(([k,v])=>[k,median(v)/1000]))})));
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
function median(v){const x=[...v].sort((a,b)=>a-b);return x[Math.floor(x.length/2)];}
const summary=runs[0].reports.map(r=>({batch:r.batch,median_ns:Object.fromEntries(Object.keys(r.samples_ns_per_embedding).map(mode=>[mode,median(runs.map(p=>median(p.reports.find(x=>x.batch===r.batch).samples_ns_per_embedding[mode])))]))}));
const hashes={};for(const file of ['scripts/generalization_gpu_boundary.mjs','build/generalization/gpu/potion-2m/ink-abi.mjs','build/generalization/gpu/potion-2m/ink-device.mjs','build/generalization/gpu/potion-2m/ink-gpu.mjs'])hashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={schema:1,scope:'Same Ink sources and byte-identical emitted entry shaders. All modes include common query validation, packing, three uploads/dispatches and detached complete output. New read control isolates host version from typed destination API. Actual Chrome hardware, 20 warmups, alternating IDs, process/mode order rotation. Setup/loading and correctness checking excluded. No handwritten GPU kernel or approximate arithmetic.',processes,rounds,repetitions,summary,runs,hashes};
await fs.writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');
const rows=['# General typed GPU result boundary','',report.scope,'','| Batch | Before µs/embedding | New host, legacy read | Typed readInto | Before/typed |','| ---: | ---: | ---: | ---: | ---: |',...summary.map(r=>`| ${r.batch} | ${(r.median_ns['old-read']/1000).toFixed(3)} | ${(r.median_ns['new-read-control']/1000).toFixed(3)} | ${(r.median_ns['new-read-into']/1000).toFixed(3)} | ${(r.median_ns['old-read']/r.median_ns['new-read-into']).toFixed(2)}× |`)];
await fs.writeFile(directory+'/REPORT.md',rows.join('\n')+'\n');console.log(rows.join('\n'));
