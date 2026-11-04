// Controlled producer/consumer composition from ordinary compiled Ink.
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright'),root=process.cwd();
const processes=Number(process.env.BENCH_PROCESSES??3),rounds=9,repetitions=4,outdir='results/generalization/resident';await fs.mkdir(outdir,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Resident composition</title>');return;}const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error('Path');res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const runs=[];
try{for(let group=0;group<processes;group++){
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async({group,rounds,repetitions})=>{
   const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter||adapter.info.isFallbackAdapter)throw Error('Hardware required');
   const device=await adapter.requestDevice(),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
   const cases=await fetch('/work/generalization/inputs.json').then(r=>r.json()),records=[],checks=[];
   const expectedPost=bits=>{const f=new Float32Array(Uint32Array.from(bits).buffer),out=new Float32Array(f.length),words=new Uint32Array(out.buffer);for(let i=0;i<f.length;i++){out[i]=Math.fround(Math.fround(f[i]*.5)+.25);if(Number.isNaN(out[i]))words[i]=0x7fc00000;}return words;};
   const equal=(out,bits)=>{const actual=new Uint32Array(out.buffer,out.byteOffset,out.length);if(actual.length!==bits.length||actual.some((x,i)=>x!==bits[i]))throw Error('Complete output bits differ');};
   for(const name of ['matrix-columns','filter-bank','channel-energy']){
    const base='/build/generalization/resident/'+name+'/',module=await import(base+'ink-gpu.mjs'),loadStart=performance.now(),runtime=await module.loadInk(base,{device,backend:'gpu',policy:'static',staticBackend:'gpu'}),runtime_load_ms=performance.now()-loadStart;
    const selected=cases.filter(c=>c.name===name&&!c.edge&&[64,512].includes(c.length)&&[16,64].includes(c.lanes)&&(name!=='matrix-columns'||c.width===64));
    for(const c of selected){
     const inputs=Object.fromEntries(c.args[0].map((x,i)=>['a'+i,x])),references=c.args[0].map((_,i)=>({input:'a'+i})),changing=c.args[0].map((_,i)=>i).filter(i=>!c.stable_parameters.includes(i));
     const sourcePlan={inputs,steps:[{id:'produced',call:'run',args:references}],outputs:['produced']};
     const targetPlan={inputs:{values:new Float32Array(c.lanes)},steps:[{id:'consumed',call:'postprocess',args:[{input:'values'}]}],outputs:['consumed']};
     const combinedPlan={inputs,steps:[...sourcePlan.steps,{id:'consumed',call:'postprocess',args:[{step:'produced'}]}],outputs:['consumed']};
     let setupStart=performance.now();const source=await runtime.open(sourcePlan,{backend:'gpu-required'}),producer_open_ms=performance.now()-setupStart;
     setupStart=performance.now();const target=await runtime.open(targetPlan,{backend:'gpu-required'}),consumer_open_ms=performance.now()-setupStart;
     setupStart=performance.now();const combined=await runtime.open(combinedPlan,{backend:'gpu-required'}),combined_open_ms=performance.now()-setupStart;
     const expected=c.expected_bits.map(expectedPost),samples=Object.fromEntries(['roundtrip','resident-copy','combined'].map(x=>[x,[]]));let counters;
     async function invoke(mode,shift){
      const producer=mode==='combined'?combined:source;for(const i of changing)await producer.write('a'+i,c.args[shift][i]);
      const first=await producer.step();if(first.backend!=='gpu')throw Error('Fallback');
      let transfer={counters:{upload_bytes:0,readback_bytes:0,resident_copy_bytes:0}};
      if(mode==='roundtrip'){const value=new Float32Array(c.lanes),read=await source.readInto('produced',value),write=await target.write('values',value);transfer={counters:{readback_bytes:read.counters.readback_bytes,upload_bytes:write.counters.upload_bytes,resident_copy_bytes:0}};}
      if(mode==='resident-copy')transfer=await target.writeFrom('values',source,'produced');
      if(mode!=='combined'){const second=await target.step();if(second.backend!=='gpu')throw Error('Consumer fallback');}
      const out=new Float32Array(c.lanes),read=await (mode==='combined'?combined:target).readInto('consumed',out);
      counters={intermediate:transfer.counters,final_read:read.counters,producer_dispatches:first.counters.dispatches};return out;
     }
     let order=['roundtrip','resident-copy','combined'];if(group%2)order.reverse();
     for(let warmup=0;warmup<12;warmup++)for(const mode of order)equal(await invoke(mode,warmup%2),expected[warmup%2]);
     const receipts={};
     for(let round=0;round<rounds;round++){
      for(const mode of order){let elapsed=0;for(let repeat=0;repeat<repetitions;repeat++){const shift=(round+repeat)%2,start=performance.now(),out=await invoke(mode,shift);elapsed+=performance.now()-start;equal(out,expected[shift]);}samples[mode].push(elapsed*1e6/repetitions);receipts[mode]=counters;}
      order=order.slice(1).concat(order[0]);
     }
     // A transfer snapshots the source's current value before source close.
     await source.step();await target.writeFrom('values',source,'produced');await source.close();await target.step();
     const retained=new Float32Array(c.lanes);await target.readInto('consumed',retained);equal(retained,expected[(rounds-1+repetitions-1)%2]);
     let closedRejected=false;try{await target.writeFrom('values',source,'produced');}catch{closedRejected=true;}if(!closedRejected)throw Error('Closed source accepted');
     await target.close();await combined.close();records.push({name,length:c.length,lanes:c.lanes,width:c.width,setup_ms:{shared_runtime_load:runtime_load_ms,producer_open:producer_open_ms,consumer_open:consumer_open_ms,combined_open:combined_open_ms},samples_ns:samples,receipts,all_bits_exact:true,source_close_snapshot:true});
    }
    if(group===0){
     const c=selected[0],refs=c.args[0].map((_,i)=>({input:'a'+i})),inputs=Object.fromEntries(c.args[0].map((x,i)=>['a'+i,x]));
     for(const [a,b]of [['cpu','gpu-required'],['gpu-required','cpu']]){
      const source=await runtime.open({inputs,steps:[{id:'produced',call:'run',args:refs}],outputs:['produced']},{backend:a});
      const target=await runtime.open({inputs:{values:new Float32Array(c.lanes)},steps:[{id:'consumed',call:'postprocess',args:[{input:'values'}]}],outputs:['consumed']},{backend:b});
      await source.step();const transfer=await target.writeFrom('values',source,'produced');await target.step();const out=new Float32Array(c.lanes);await target.readInto('consumed',out);equal(out,expectedPost(c.expected_bits[0]));
      await source.close();await target.close();checks.push({name,source:a,target:b,all_bits_exact:true,transfer});
     }
    }
    await runtime.close();
   }
   // The original consumer motivating residency: embedding -> exact similarity.
   const embeddings=[],base='/build/generalization/resident/potion-2m/',module=await import(base+'ink-gpu.mjs'),loadStart=performance.now(),runtime=await module.loadInk(base,{device,backend:'gpu',policy:'static',staticBackend:'gpu'}),runtime_load_ms=performance.now()-loadStart;
   const weights=new Float32Array(await fetch('/build/general/potion-2m/weights.f32').then(r=>r.arrayBuffer())),corpus=await fetch('/build/corpus.json').then(r=>r.json()),oracle=await fetch('/results/raw-0-upstream.json').then(r=>r.json());
   const pack=(queries,capacity)=>{const tokens=new Uint32Array(capacity),starts=new Uint32Array(queries.length),lengths=new Uint32Array(queries.length);let at=0;queries.forEach((q,i)=>{starts[i]=at;lengths[i]=q.length;tokens.set(q,at);at+=q.length;});return {tokens,starts,lengths};};
   const plan=(batch,capacity)=>({inputs:{weights,tokens:new Uint32Array(capacity),starts:new Uint32Array(batch),lengths:new Uint32Array(batch),positions:Uint32Array.from({length:batch*64},(_,i)=>i),documents:Uint32Array.from({length:batch},(_,i)=>i)},steps:[{id:'means',call:'pool_batch',args:['weights','tokens','starts','lengths','positions'].map(input=>({input}))},{id:'norms',call:'norm_batch',args:[{step:'means'},{input:'documents'}]},{id:'embeddings',call:'normalize_batch',args:[{step:'means'},{step:'norms'},{input:'positions'}]}],outputs:['embeddings']});
   for(const [batch,documents]of [[1,64],[16,256],[64,256]]){
    const qs=[0,1].map(shift=>Array.from({length:batch},(_,i)=>corpus.cases[(i+shift)%64].ids)),cs=Array.from({length:documents},(_,i)=>corpus.cases[i%64].ids),capacity=Math.max(...qs.map(q=>q.reduce((n,x)=>n+x.length,0)));
    let setupStart=performance.now();const source=await runtime.open(plan(batch,capacity),{backend:'gpu-required'}),producer_open_ms=performance.now()-setupStart;
    setupStart=performance.now();const corpusSession=await runtime.open(plan(documents,cs.reduce((n,q)=>n+q.length,0)),{backend:'gpu-required'}),corpus_open_ms=performance.now()-setupStart;
    setupStart=performance.now();const corpusInput=pack(cs,cs.reduce((n,q)=>n+q.length,0));for(const [k,v]of Object.entries(corpusInput))await corpusSession.write(k,v);await corpusSession.step();await corpusSession.finish();const corpus_upload_and_encode_ms=performance.now()-setupStart;
    const consumer={id:'scores',call:'similarity',args:[{input:'queries'},{input:'corpus'},documents,64,{input:'scorePositions'}]},consumerInputs={queries:new Float32Array(batch*64),corpus:new Float32Array(documents*64),scorePositions:Uint32Array.from({length:batch*documents},(_,i)=>i)};
    setupStart=performance.now();const target=await runtime.open({inputs:consumerInputs,steps:[consumer],outputs:['scores']},{backend:'gpu-required'}),consumer_open_ms=performance.now()-setupStart,combinedPlan=plan(batch,capacity);
    combinedPlan.inputs={...combinedPlan.inputs,...consumerInputs};combinedPlan.steps.push({...consumer,args:[{step:'embeddings'},...consumer.args.slice(1)]});combinedPlan.outputs=['scores'];
    setupStart=performance.now();const combined=await runtime.open(combinedPlan,{backend:'gpu-required'}),combined_open_ms=performance.now()-setupStart;
    setupStart=performance.now();await target.writeFrom('corpus',corpusSession,'embeddings');await combined.writeFrom('corpus',corpusSession,'embeddings');await combined.finish();const two_corpus_copies_ms=performance.now()-setupStart;
    const expected=[0,1].map(shift=>{const out=new Float32Array(batch*documents);for(let a=0;a<batch;a++)for(let b=0;b<documents;b++){let total=0;const q=oracle.ordered_outputs[(a+shift)%64],c=oracle.ordered_outputs[b%64];for(let dim=0;dim<64;dim++)total=Math.fround(total+Math.fround(q[dim]*c[dim]));out[a*documents+b]=total;}return new Uint32Array(out.buffer);});
    const samples=Object.fromEntries(['roundtrip','resident-copy','combined'].map(m=>[m,[]]));const receipts={};
    async function invoke(mode,shift){
     const producer=mode==='combined'?combined:source,inputs=pack(qs[shift],capacity);for(const [k,v]of Object.entries(inputs))await producer.write(k,v);
     const dispatch=await producer.step();if(dispatch.backend!=='gpu')throw Error('Embedding fallback');let intermediate={upload_bytes:0,readback_bytes:0,resident_copy_bytes:0};
     if(mode==='roundtrip'){const value=new Float32Array(batch*64),read=await source.readInto('embeddings',value),write=await target.write('queries',value);intermediate={readback_bytes:read.counters.readback_bytes,upload_bytes:write.counters.upload_bytes,resident_copy_bytes:0};}
     if(mode==='resident-copy')intermediate=(await target.writeFrom('queries',source,'embeddings')).counters;
     if(mode!=='combined')await target.step();const out=new Float32Array(batch*documents);await(mode==='combined'?combined:target).readInto('scores',out);receipts[mode]={intermediate,final_readback_bytes:out.byteLength};return out;
    }
    let order=['roundtrip','resident-copy','combined'];if(group%2)order.reverse();for(let warmup=0;warmup<12;warmup++)for(const mode of order)equal(await invoke(mode,warmup%2),expected[warmup%2]);
    for(let round=0;round<rounds;round++){for(const mode of order){let elapsed=0;for(let repeat=0;repeat<repetitions;repeat++){const shift=(round+repeat)%2,start=performance.now(),out=await invoke(mode,shift);elapsed+=performance.now()-start;equal(out,expected[shift]);}samples[mode].push(elapsed*1e6/(repetitions*batch));}order=order.slice(1).concat(order[0]);}
    for(const s of [source,corpusSession,target,combined])await s.close();embeddings.push({batch,documents,weights_bytes:weights.byteLength,setup_ms:{shared_runtime_load:runtime_load_ms,producer_open:producer_open_ms,corpus_open:corpus_open_ms,corpus_upload_and_encode:corpus_upload_and_encode_ms,consumer_open:consumer_open_ms,combined_open:combined_open_ms,two_corpus_copies:two_corpus_copies_ms},samples_ns_per_query:samples,receipts,all_bits_exact:true});
   }
   await runtime.close();if(errors.length)throw Error(errors.join('\n'));device.destroy();return {records,checks,embeddings,adapter:Object.fromEntries(['vendor','architecture','isFallbackAdapter'].map(k=>[k,adapter.info[k]]))};
  },{group,rounds,repetitions});
  result.browser_version=browser.version();runs.push(result);await fs.writeFile(`${outdir}/${group}.json`,JSON.stringify(result,null,2)+'\n');console.log('resident process',group,'cases',result.records.length);
 }finally{await browser.close();}
}}finally{await new Promise(resolve=>server.close(resolve));}
function median(v){const x=[...v].sort((a,b)=>a-b);return x[Math.floor(x.length/2)];}
const summary=runs[0].records.map((r,i)=>({name:r.name,length:r.length,lanes:r.lanes,width:r.width,median_ns:Object.fromEntries(Object.keys(r.samples_ns).map(mode=>[mode,median(runs.map(p=>median(p.records[i].samples_ns[mode])))]))}));
const files=['scripts/resident_composition_browser.mjs','experiments/generalization/sources/resident-consumers.ink','build/generalization/resident/build.json','work/generalization/inputs.json'];for(const n of ['potion-2m','matrix-columns','filter-bank','channel-energy'])for(const f of ['ink-gpu.mjs','ink-device.mjs','manifest.json'])files.push(`build/generalization/resident/${n}/${f}`);
const hashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));
const embeddingSummary=runs[0].embeddings.map((r,i)=>({batch:r.batch,documents:r.documents,median_ns:Object.fromEntries(Object.keys(r.samples_ns_per_query).map(mode=>[mode,median(runs.map(p=>median(p.embeddings[i].samples_ns_per_query[mode])))]))}));
const report={schema:1,scope:'Actual Chrome hardware; frozen unrelated producer programs plus the same literal Ink postprocess consumer, and Potion embedding -> exact similarity. Roundtrip uses typed readback and upload; resident uses GPU copy only; combined is the strong already-supported one-session pipeline control. Complete fresh final output included. Source/consumer numeric operations remain exact and identical. Cold setup and correctness checking excluded. Cross-backend CPU/GPU and source-close snapshots validated outside timing.',processes,rounds,repetitions,summary,embeddingSummary,runs,hashes};await fs.writeFile(outdir+'/report.json',JSON.stringify(report,null,2)+'\n');
const rows=['# Resident producer/consumer composition','',report.scope,'','| Program | Input length | Lanes | Roundtrip µs | Resident copy µs | Combined pipeline µs | Roundtrip/resident |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |',...summary.map(r=>`| ${r.name} | ${r.length} | ${r.lanes} | ${(r.median_ns.roundtrip/1000).toFixed(3)} | ${(r.median_ns['resident-copy']/1000).toFixed(3)} | ${(r.median_ns.combined/1000).toFixed(3)} | ${(r.median_ns.roundtrip/r.median_ns['resident-copy']).toFixed(2)}× |`),'','## Potion embedding -> similarity','','Corpus embeddings are prepared once outside timing and stay resident in all modes. Complete query encodes changing IDs and returns the full score matrix, not top-k. µs/query; batched throughput.','','| Queries | Documents | Roundtrip | Resident copy | Combined pipeline | Roundtrip/resident |','| ---: | ---: | ---: | ---: | ---: | ---: |',...embeddingSummary.map(r=>`| ${r.batch} | ${r.documents} | ${(r.median_ns.roundtrip/1000).toFixed(3)} | ${(r.median_ns['resident-copy']/1000).toFixed(3)} | ${(r.median_ns.combined/1000).toFixed(3)} | ${(r.median_ns.roundtrip/r.median_ns['resident-copy']).toFixed(2)}× |`)];await fs.writeFile(outdir+'/REPORT.md',rows.join('\n')+'\n');console.log(rows.join('\n'));
