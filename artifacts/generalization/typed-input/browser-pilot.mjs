// Matched compiler-ABI ablation: identical emitted hosts, shaders and input data.
import http from'node:http';import fs from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright'),root=process.cwd(),outdir='results/generalization/typed-input',processes=Number(process.env.BENCH_PROCESSES??3),rounds=7,repetitions=4;
await fs.mkdir(outdir,{recursive:true});
const server=http.createServer(async(req,res)=>{try{
 let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Typed input comparison</title>');return;}
 const match=p.match(/^\/(before|after)\/(.*)$/),label=match?.[1];if(match)p='/'+match[2];
 if(label&&p.endsWith('/ink-abi.mjs'))p='/artifacts/generalization/typed-input/'+label+'.mjs';
 else if(label)p=p.replace(/^\/build\/general\/([^/]+)\/webgpu\//,'/build/generalization/typed-input/$1/');
 const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const runs=[];
try{for(let group=0;group<processes;group++){
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async({group,rounds,repetitions})=>{
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter||adapter.info.isFallbackAdapter)throw Error('Hardware required');
  const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.min(256*1024*1024,adapter.limits.maxStorageBufferBindingSize),maxBufferSize:Math.min(256*1024*1024,adapter.limits.maxBufferSize)}}),errors=[];
  device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const labels=group%2?['after','before']:['before','after'],data=await fetch('/work/generalization/inputs.json').then(r=>r.json()),records=[];
  const words=value=>{if(value instanceof Float32Array)return new Uint32Array(value.buffer,value.byteOffset,value.length);const out=new Float32Array(value.length),bits=new Uint32Array(out.buffer);for(let i=0;i<value.length;i++)typeof value[i]==='number'?out[i]=value[i]:bits[i]=value[i].F32Bits;return bits;};
  const equal=(value,expected)=>{const actual=words(value);if(actual.length!==expected.length||actual.some((x,i)=>x!==expected[i]))throw Error('Full output bits differ');};
  for(const name of ['matrix-columns','filter-bank','channel-energy']){
   const runtimes={},loads={};
   for(const label of labels){const base='/'+label+'/build/generalization/typed-input/'+name+'/',module=await import(base+'ink-gpu.mjs'),start=performance.now();runtimes[label]=await module.loadInk(base,{device,backend:'gpu',policy:'static',staticBackend:'gpu'});loads[label]=performance.now()-start;}
   const manifest=await fetch('/build/generalization/typed-input/'+name+'/manifest.json').then(r=>r.json()),params=manifest.functions.find(f=>f.name==='run').params;
   const typed=args=>args.map((value,i)=>params[i].type.kind==='list'&&['f32','u32'].includes(params[i].type.element.kind)?params[i].type.element.kind==='f32'?Float32Array.from(value):Uint32Array.from(value):value);
   const cases=data.filter(c=>c.name===name&&!c.edge&&[64,512].includes(c.length)&&[16,64].includes(c.lanes)&&(name!=='matrix-columns'||c.width===64));
   for(const c of cases){
    const args=c.args.map(a=>typed(structuredClone(a))),changing=c.stable_parameters?params.map((_,i)=>i).filter(i=>!c.stable_parameters.includes(i)):[];
    const plan={inputs:Object.fromEntries(args[0].map((v,i)=>['a'+i,v])),steps:[{id:'result',call:'run',args:params.map((_,i)=>({input:'a'+i}))}],outputs:['result']};
    const sessions={},prepared={},setup={},receipts={};
    for(const label of labels){
     const runtime=runtimes[label];let start=performance.now();sessions[label]=await runtime.open(plan,{backend:'gpu-required'});await sessions[label].finish();const first_open_ms=performance.now()-start;
     const captures=[];prepared[label]=[];
     for(let shift=0;shift<2;shift++){
      const input=typed(structuredClone(c.args[shift]));start=performance.now();prepared[label].push(runtime.prepareCall('run',input));captures.push(performance.now()-start);
      // A prepared handle must own the original input snapshot.
      for(const value of input){if(ArrayBuffer.isView(value))value.fill(9);else if(Array.isArray(value))for(const item of value)if(item&&typeof item==='object')for(const k of Object.keys(item))item[k]=9;}
     }
     start=performance.now();const first=await prepared[label][0].run({backend:'gpu-required'});const first_prepared_run_ms=performance.now()-start;equal(first.value,c.expected_bits[0]);
     setup[label]={shared_runtime_load_ms:loads[label],first_open_ms,capture_ms:captures,first_prepared_run_ms,warm_open_ms:[]};
    }
    let order=labels.flatMap(label=>['ordinary','prepared','resident'].map(mode=>({label,mode})));const samples=Object.fromEntries(order.map(m=>[m.label+'/'+m.mode,[]]));
    async function invoke({label,mode},shift){
     const runtime=runtimes[label];if(mode!=='resident'){const r=mode==='ordinary'?await runtime.call('run',args[shift],{backend:'gpu-required'}):await prepared[label][shift].run({backend:'gpu-required'});if(r.backend!=='gpu')throw Error('Fallback');receipts[label+'/'+mode]=r.counters;return r.value;}
     const session=sessions[label];let uploaded=0;for(const i of changing)uploaded+=(await session.write('a'+i,args[shift][i])).counters.upload_bytes;
     const step=await session.step();if(step.backend!=='gpu')throw Error('Resident fallback');const out=new Float32Array(c.lanes),read=await session.readInto('result',out);if(read.count!==out.length)throw Error('Output count');receipts[label+'/'+mode]={...step.counters,upload_bytes:uploaded,readback_bytes:read.counters.readback_bytes};return out;
    }
    for(let warm=0;warm<12;warm++)for(const mode of order)equal(await invoke(mode,warm%2),c.expected_bits[warm%2]);
    for(let round=0;round<rounds;round++){
     for(const mode of order){let elapsed=0;for(let repeat=0;repeat<repetitions;repeat++){const shift=(round+repeat)%2,start=performance.now(),out=await invoke(mode,shift);elapsed+=performance.now()-start;equal(out,c.expected_bits[shift]);out.fill(123);}samples[mode.label+'/'+mode.mode].push(elapsed*1e6/repetitions);}
     order=order.slice(1).concat(order[0]);
    }
    // Fresh invalid typed writes reject and leave the last resident inputs intact.
    let floatIndex=params.findIndex(p=>p.type.kind==='list'&&p.type.element.kind==='f32');let field=null;
    if(floatIndex<0){floatIndex=params.findIndex(p=>p.type.kind==='list'&&p.type.element.kind==='record'&&p.type.element.fields.some(f=>f.type.kind==='f32'));if(floatIndex>=0)field=params[floatIndex].type.element.fields.find(f=>f.type.kind==='f32').name;}
    let rejected=false;
    if(floatIndex>=0){for(const label of labels){const invalid=structuredClone(args[0][floatIndex]);if(field)invalid[0][field]=Infinity;else invalid[0]=Infinity;try{await sessions[label].write('a'+floatIndex,invalid);throw Error('Nonfinite accepted');}catch(e){if(!String(e.message).includes('f32 input overflow'))throw e;}await sessions[label].step();const out=new Float32Array(c.lanes);await sessions[label].readInto('result',out);equal(out,c.expected_bits[(rounds-1+repetitions-1)%2]);}rejected=true;}
    for(let round=0;round<3;round++)for(const label of round%2?[...labels].reverse():labels){const start=performance.now(),s=await runtimes[label].open(plan,{backend:'gpu-required'});await s.finish();setup[label].warm_open_ms.push(performance.now()-start);await s.close();}
    for(const label of labels){for(const p of prepared[label])await p.close();await sessions[label].close();}
    records.push({name,length:c.length,lanes:c.lanes,width:c.width,setup,samples_ns:samples,receipts,all_bits_exact:true,prepared_snapshot_mutation:true,fresh_invalid_float_write_rejected:rejected});
   }
   for(const runtime of Object.values(runtimes))await runtime.close();
  }
  const {loadStaticEmbedding}=await import('/runtime/static-embedding.mjs'),validation=[];
  if(group===0)for(const name of ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp'])for(const label of labels){
   const base='/'+label+'/build/general/'+name+'/',fixture=await fetch(base+'validation.json').then(r=>r.json()),encoder=await loadStaticEmbedding(base,{backend:'gpu',device});
   const capacity=fixture.queries.reduce((n,q)=>n+q.length,0),session=await encoder.createSession({batchSize:fixture.queries.length,tokenCapacity:capacity});
   for(let shift=0;shift<2;shift++){const q=fixture.queries.map((_,i)=>fixture.queries[(i+shift)%fixture.queries.length]),expected=words(q.flatMap((_,i)=>fixture.ordered_outputs[(i+shift)%q.length]));const out=await session.encodeBatch(q);equal(out,expected);out.fill(123);}
   await session.close();await encoder.close();validation.push({name,label,all_bits_exact:true,actual_public_loader:true});
  }
  // Public Potion loader: isolate reusable model-session setup from warm encodes.
  const corpus=await fetch('/build/corpus.json').then(r=>r.json()),oracle=await fetch('/results/raw-0-upstream.json').then(r=>r.json()),batch=16,queries=[0,1].map(shift=>Array.from({length:batch},(_,i)=>corpus.cases[(i+shift)%64].ids)),capacity=Math.max(...queries.map(q=>q.reduce((n,v)=>n+v.length,0))),expected=[0,1].map(shift=>words(Array.from({length:batch},(_,i)=>oracle.ordered_outputs[(i+shift)%64]).flat())),encoders={},sessions={},modelSetup={},modelSamples={before:[],after:[]};
  for(const label of labels){let start=performance.now();encoders[label]=await loadStaticEmbedding('/'+label+'/build/general/potion-2m/',{backend:'gpu',device});const loader_ms=performance.now()-start;start=performance.now();sessions[label]=await encoders[label].createSession({batchSize:batch,tokenCapacity:capacity});await device.queue.onSubmittedWorkDone();modelSetup[label]={loader_fetch_validate_ms:loader_ms,first_open_ms:performance.now()-start,warm_open_ms:[]};}
  for(let round=0;round<7;round++)for(const label of round%2?[...labels].reverse():labels){const start=performance.now(),s=await encoders[label].createSession({batchSize:batch,tokenCapacity:capacity});await device.queue.onSubmittedWorkDone();modelSetup[label].warm_open_ms.push(performance.now()-start);await s.close();}
  for(let warm=0;warm<12;warm++)for(const label of labels)equal(await sessions[label].encodeBatch(queries[warm%2]),expected[warm%2]);
  for(let round=0;round<rounds;round++)for(const label of round%2?[...labels].reverse():labels){let elapsed=0;for(let repeat=0;repeat<repetitions;repeat++){const shift=(round+repeat)%2,start=performance.now(),out=await sessions[label].encodeBatch(queries[shift]);elapsed+=performance.now()-start;equal(out,expected[shift]);out.fill(123);}modelSamples[label].push(elapsed*1e6/(batch*repetitions));}
  for(const label of labels){await sessions[label].close();await encoders[label].close();}if(errors.length)throw Error(errors.join('\n'));device.destroy();
  return {records,validation,potion:{batch,setup:modelSetup,samples_ns_per_embedding:modelSamples,all_bits_exact:true},adapter:Object.fromEntries(['vendor','architecture','isFallbackAdapter'].map(k=>[k,adapter.info[k]]))};
 },{group,rounds,repetitions});result.browser_version=browser.version();runs.push(result);await fs.writeFile(`${outdir}/browser-${group}.json`,JSON.stringify(result,null,2)+'\n');console.log('typed ingress browser process',group,'frozen cases',result.records.length);
 }finally{await browser.close();}
}}finally{await new Promise(resolve=>server.close(resolve));}
const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
const summary=runs[0].records.map((c,i)=>({name:c.name,length:c.length,lanes:c.lanes,width:c.width,median_ns:Object.fromEntries(Object.keys(c.samples_ns).map(mode=>[mode,median(runs.map(r=>median(r.records[i].samples_ns[mode])))]))}));
const potion={batch:16,median_ns_per_embedding:Object.fromEntries(['before','after'].map(label=>[label,median(runs.map(r=>median(r.potion.samples_ns_per_embedding[label])))])),median_warm_open_ms:Object.fromEntries(['before','after'].map(label=>[label,median(runs.map(r=>median(r.potion.setup[label].warm_open_ms)))]))};
const files=['scripts/typed_input_browser.mjs','build/generalization/typed-input/build.json','artifacts/generalization/typed-input/before.mjs','artifacts/generalization/typed-input/after.mjs','work/generalization/inputs.json'];const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await fs.readFile(f)).digest('hex')])));
const report={schema:1,scope:'ABI-only before/after comparison on actual Chrome hardware. Identical emitted source, shaders and host; only the compiler-package packed codec changes. Ordinary and prepared calls return complete owned Arrays; resident sessions return complete fresh typed destinations. Stable model/context data versus changed inputs and prepared snapshots retain their separate lifetimes. Three fresh processes rotate label/mode order; twelve warmups, seven rounds, four calls/round. Setup, first runs and repeated ready-session opens are retained separately and never added to warm medians. Output validation is outside timers; every timed output is checked and mutated to check detachment. Upload/readback counters isolate unchanged transfer volume. No handwritten or approximate kernels.',summary,potion,runs,hashes};await fs.writeFile(outdir+'/browser-report.json',JSON.stringify(report,null,2)+'\n');
const rows=['# Typed input complete GPU calls','',report.scope,'','| Program | Items / lanes | Boundary | Before µs | After µs | Before/after |','| --- | --- | --- | ---: | ---: | ---: |'];for(const c of summary)for(const mode of ['ordinary','prepared','resident'])rows.push(`| ${c.name} | ${c.length} / ${c.lanes} | ${mode} | ${(c.median_ns['before/'+mode]/1000).toFixed(3)} | ${(c.median_ns['after/'+mode]/1000).toFixed(3)} | ${(c.median_ns['before/'+mode]/c.median_ns['after/'+mode]).toFixed(2)}× |`);
rows.push('','## Public Potion 2M, batch 16','','| Boundary | Before | After | Before/after |','| --- | ---: | ---: | ---: |',`| Ready session open, ms | ${potion.median_warm_open_ms.before.toFixed(3)} | ${potion.median_warm_open_ms.after.toFixed(3)} | ${(potion.median_warm_open_ms.before/potion.median_warm_open_ms.after).toFixed(2)}× |`,`| Warm encode, µs/embedding | ${(potion.median_ns_per_embedding.before/1000).toFixed(3)} | ${(potion.median_ns_per_embedding.after/1000).toFixed(3)} | ${(potion.median_ns_per_embedding.before/potion.median_ns_per_embedding.after).toFixed(2)}× |`);await fs.writeFile(outdir+'/BROWSER.md',rows.join('\n')+'\n');console.log(rows.join('\n'));
