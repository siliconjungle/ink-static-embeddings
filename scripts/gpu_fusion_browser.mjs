// Controlled real-hardware experiment. No CPU/software fallback.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=process.cwd(),groups=Number(process.env.BENCH_PROCESSES??3),rounds=9,repetitions=8,warmups=20;
const destination='results/gpu-fusion';await fs.mkdir(destination,{recursive:true});
const files=['runtime/static-embedding.mjs','runtime/static-embedding-gpu.mjs','scripts/build_gpu_fusion.py','scripts/prepare_gpu_edges.py','src/ink_static_embeddings/gpu.py','scripts/gpu_fusion_browser.mjs','artifacts/gpu-fusion/runtime-before.mjs','build/corpus.json'];
for(const name of ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']){
  const dir=`build/general/${name}`;files.push(`${dir}/model.json`,`${dir}/targets.json`,`${dir}/validation.json`,`${dir}/gpu-experimental/receipt.json`,`${dir}/webgpu/manifest.json`);
  const manifest=JSON.parse(await fs.readFile(`${dir}/webgpu/manifest.json`,'utf8'));
  for(const filename of Object.keys(manifest.shaders))files.push(`${dir}/webgpu/${filename}`);
  for(const file of await fs.readdir(`${dir}/gpu-experimental`))if(file.endsWith('.wgsl'))files.push(`${dir}/gpu-experimental/${file}`);
}
for(const d of [1,7,65,1025]){
  const dir=`build/gpu-edges/${d}`;files.push(`${dir}/model.json`,`${dir}/weights.f32`,`${dir}/validation.json`,`${dir}/gpu-experimental/receipt.json`);
  for(const file of await fs.readdir(`${dir}/gpu-experimental`))if(file.endsWith('.wgsl'))files.push(`${dir}/gpu-experimental/${file}`);
}
async function hashFiles(){return Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await fs.readFile(f)).digest('hex')])));}
const hashes=await hashFiles();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>GPU fusion experiment</title>');return;}
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
    res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`,runs=[];
try{
  for(let group=0;group<groups;group++){
    const browser=await chromium.launch({channel:'chrome',headless:false});
    try{
      const page=await browser.newPage();page.on('pageerror',e=>console.error(e.message));await page.goto(url);
      const result=await page.evaluate(async({group,rounds,repetitions,warmups})=>{
        const {loadStaticEmbedding}=await import('/runtime/static-embedding.mjs');
        const {loadStaticEmbedding:previous}=await import('/artifacts/gpu-fusion/runtime-before.mjs');
        const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
        if(!adapter||adapter.info.isFallbackAdapter)throw Error('Hardware WebGPU required');
        const device=await adapter.requestDevice({requiredLimits:{
          maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,256*1024*1024),
          maxBufferSize:Math.min(adapter.limits.maxBufferSize,256*1024*1024)}});
        const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
        const bits=x=>new Uint32Array(Float32Array.from(x).buffer);
        function compare(actual,expected,exact){
          if(actual.length!==expected.length)throw Error('Output length differs');
          const a=bits(actual),b=bits(expected);let maxAbs=0,maxRelative=0,differentBits=0;
          for(let i=0;i<actual.length;i++){
            if(a[i]!==b[i])differentBits++;
            if(exact&&a[i]!==b[i])throw Error(`Strict mismatch ${i}: ${a[i].toString(16)} != ${b[i].toString(16)}`);
            if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i])){
              if(!exact)throw Error('Nonfinite native output');continue;
            }
            const error=Math.abs(actual[i]-expected[i]);maxAbs=Math.max(maxAbs,error);maxRelative=Math.max(maxRelative,error/Math.max(1e-30,Math.abs(expected[i])));
            if(!exact&&error>2e-6+2e-5*Math.abs(expected[i]))throw Error(`Native error exceeds contract at ${i}: ${error}`);
          }
          return {max_abs_error:maxAbs,max_relative_error:maxRelative,different_bits:differentBits,scalars:actual.length,exact};
        }
        const modes=['ink','split-strict','fused-strict','split-native','fused-native'];
        const options=mode=>({backend:'gpu',device,gpuKernel:mode==='ink'?'ink':mode.endsWith('native')?'fused-native':'fused-strict',gpuSchedule:mode.startsWith('split')?'split':'fused'});
        const validation=[],edges=[];
        if(group===0){
          for(const name of ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']){
            const base='/build/general/'+name+'/',fixture=await fetch(base+'validation.json').then(r=>r.json());
            const manifest=await fetch(base+'model.json').then(r=>r.json());
            for(const mode of modes.filter(x=>x!=='ink')){
              const model=await loadStaticEmbedding(base,options(mode));
              const session=await model.createSession({batchSize:fixture.queries.length,tokenCapacity:fixture.queries.reduce((n,q)=>n+q.length,0)});
              const checks=[];let retained;
              for(let shift=0;shift<3;shift++){
                const queries=fixture.queries.map((_,i)=>fixture.queries[(i+shift)%fixture.queries.length]);
                const out=await session.encodeBatch(queries),expected=fixture.queries.flatMap((_,i)=>fixture.ordered_outputs[(i+shift)%fixture.queries.length]);
                checks.push(compare(out,expected,!mode.endsWith('native')));
                if(retained&&retained.some(x=>x!==123))throw Error('Previously returned output mutated');out.fill(123);retained=out;
              }
              for(const ids of [[-1],[manifest.vocabulary_size],[NaN],[1.5],new Uint32Array(4097)]){
                let rejected=false;try{await session.encodeBatch(fixture.queries.map((q,i)=>i===0?ids:q));}catch{rejected=true;}
                if(!rejected)throw Error('Invalid query accepted');
              }
              let rejected=false;try{await model.createSession({batchSize:1,tokenCapacity:70_000_000});}catch{rejected=true;}if(!rejected)throw Error('Excessive allocation accepted');
              const handle=await session.encodeBatchResident(fixture.queries);
              const resident=await handle.read();checks.push(compare(resident,fixture.ordered_outputs.flat(),!mode.endsWith('native')));
              await session.encodeBatchResident(fixture.queries);
              let expired=false;try{await handle.read();}catch{expired=true;}if(!expired)throw Error('Stale resident handle accepted');
              await session.close();await model.close();if(model.liveBytes!==0)throw Error('Buffers leaked');
              validation.push({name,mode,checks,detached_outputs:true,invalid_rejected:true,stale_resident_rejected:true,zero_live_bytes_after_close:true});
            }
          }
          for(const dimensions of [1,7,65,1025]){
            const base=`/build/gpu-edges/${dimensions}/`,fixture=await fetch(base+'validation.json').then(r=>r.json());
            for(const mode of ['split-strict','fused-strict']){
              const model=await loadStaticEmbedding(base,options(mode)),session=await model.createSession({batchSize:fixture.queries.length,tokenCapacity:fixture.queries.reduce((n,q)=>n+q.length,0)});
              for(let shift=0;shift<3;shift++){
                const out=await session.encodeBatch(fixture.queries.map((_,i)=>fixture.queries[(i+shift)%fixture.queries.length]));
                const actual=bits(out),expected=fixture.queries.flatMap((_,i)=>fixture.ordered_bits[(i+shift)%fixture.queries.length]);
                if(actual.length!==expected.length||actual.some((x,i)=>x!==expected[i]))throw Error(`Edge mismatch D=${dimensions} ${mode}`);
              }
              const handle=await session.encodeBatchResident(fixture.queries);await model.close();await model.close();await session.close();
              let rejected=false;try{await handle.read();}catch{rejected=true;}if(!rejected||model.liveBytes!==0)throw Error('Close did not invalidate/release');
              edges.push({dimensions,mode,queries:fixture.queries.length,rounds:3,all_bits_exact:true,signed_zero_subnormal_overflow:true,max_tokens:4096});
            }
            let rejected=false;try{const model=await loadStaticEmbedding(base,options('fused-native'));await model.close();}catch(error){rejected=/finite-intermediate contract/.test(error.message);}
            if(!rejected)throw Error('Native float accepted unbounded overflow fixture');
          }
        }
        const corpus=await fetch('/build/corpus.json').then(r=>r.json()),reference=await fetch('/results/raw-0-upstream.json').then(r=>r.json());
        const models={},setup={};
        for(const mode of modes){const start=performance.now();models[mode]=await (mode==='ink'?previous:loadStaticEmbedding)('/build/general/potion-2m/',options(mode));setup[mode]=performance.now()-start;}
        const reports=[];
        for(const batch of [1,16,64,256,1024]){
          const cases=shift=>Array.from({length:batch},(_,i)=>corpus.cases[(i+shift)%corpus.cases.length].ids);
          const queries=[cases(0),cases(1)],expected=shift=>queries[shift].flatMap((_,i)=>reference.ordered_outputs[(i+shift)%corpus.cases.length]);
          const capacity=Math.max(...queries.map(q=>q.reduce((n,x)=>n+x.length,0)));
          const sessions={};for(const mode of modes)sessions[mode]=await models[mode].createSession({batchSize:batch,tokenCapacity:capacity});
          for(let warmup=0;warmup<warmups;warmup++)for(const mode of modes)compare(await sessions[mode].encodeBatch(queries[warmup%2]),expected(warmup%2),!mode.endsWith('native'));
          const measurements=Object.fromEntries(modes.map(m=>[m,{query_ns:[],resident_finish_ns:[],read_ns:[],timings:[],accuracy:[]}]));
          let order=modes.slice(group%modes.length).concat(modes.slice(0,group%modes.length));if(group%2)order.reverse();
          for(let round=0;round<rounds;round++){
            const shift=round%2;
            for(const mode of order){
              const s=sessions[mode],r=measurements[mode];let elapsed=0;
              for(let repeat=0;repeat<repetitions;repeat++){
                const selected=(shift+repeat)%2,start=performance.now();
                const out=await s.encodeBatch(queries[selected]);elapsed+=performance.now()-start;
                r.accuracy.push(compare(out,expected(selected),!mode.endsWith('native')));
                if(s.lastTiming)r.timings.push(s.lastTiming);
              }
              r.query_ns.push(elapsed*1e6/(batch*repetitions));
            }
            order=order.slice(1).concat(order[0]);
          }
          // Separate completed resident and readback operations. Readback here
          // follows an explicit queue finish; do not call this GPU timestamp time.
          for(let round=0;round<rounds;round++)for(const mode of order.filter(x=>x!=='ink')){
            const s=sessions[mode],r=measurements[mode],start=performance.now();
            const handle=await s.encodeBatchResident(queries[round%2]);await s.finish();const done=performance.now();
            const out=await handle.read();const read=performance.now();
            r.resident_finish_ns.push((done-start)*1e6/batch);r.read_ns.push((read-done)*1e6/batch);
            compare(out,expected(round%2),!mode.endsWith('native'));
          }
          for(const s of Object.values(sessions))await s.close();reports.push({batch,measurements});
        }
        // Resident embedding -> device scores -> device top-k -> only IDs/scores.
        const search=[];
        for(const mode of ['fused-strict','fused-native']){
          const model=models[mode],q=Array.from({length:16},(_,i)=>corpus.cases[(i+3)%64].ids),c=Array.from({length:256},(_,i)=>corpus.cases[i%64].ids);
          const qs=await model.createSession({batchSize:q.length,tokenCapacity:q.reduce((n,x)=>n+x.length,0)}),cs=await model.createSession({batchSize:c.length,tokenCapacity:c.reduce((n,x)=>n+x.length,0)});
          const ch=await cs.encodeBatchResident(c),corpusValues=await ch.read(),times=[],forcedRead=[],ranks=[];
          for(let round=0;round<rounds+3;round++){
            let qh,out;
            for(const path of ((round+group)%2?['resident','forced-read']:['forced-read','resident'])){
              const start=performance.now();qh=await qs.encodeBatchResident(q);
              if(path==='forced-read')await qh.read();
              const result=await qh.search(ch,{k:10}),end=performance.now();
              if(round>=3)(path==='resident'?times:forcedRead).push((end-start)*1e6/q.length);
              if(path==='resident')out=result;
            }
            const queryValues=await qh.read();let recall=0;
            for(let a=0;a<q.length;a++){
              const expected=[];
              for(let b=0;b<c.length;b++){
                let sum=0;for(let dim=0;dim<64;dim++)sum=Math.fround(sum+Math.fround(queryValues[a*64+dim]*corpusValues[b*64+dim]));expected.push({index:b,score:sum});
              }
              expected.sort((a,b)=>b.score-a.score||a.index-b.index);
              for(let k=0;k<10;k++){
                const index=out.indices[a*10+k],score=out.scores[a*10+k];
                if(mode==='fused-strict'&&(index!==expected[k].index||bits([score])[0]!==bits([expected[k].score])[0]))throw Error('Strict search mismatch');
                if(expected.slice(0,10).some(x=>x.index===index))recall++;
              }
            }
            ranks.push(recall/(q.length*10));
          }
          search.push({mode,queries:q.length,documents:c.length,k:10,resident_encode_search_ns_per_query:times,forced_embedding_read_before_search_ns_per_query:forcedRead,recall_at_10_vs_same_embeddings:ranks,embedding_readback_bytes_in_search:0,result_readback_bytes:16*10*8,forced_embedding_read_extra_bytes:q.length*64*4,scope:'Dot-product top-k, lower document index wins exact ties. Matched forced-read control adds query embedding download before the same device search; it does not re-upload or claim an upstream search baseline. Native recall compares native GPU dot products to ordered F32 dots of the same native embeddings. No semantic-retrieval-quality benchmark.'});
          await qs.close();await cs.close();
        }
        for(const m of Object.values(models))await m.close();
        const lossModel=await loadStaticEmbedding('/build/general/unseen-clamp/',options('fused-strict'));
        await lossModel.createSession({batchSize:1,tokenCapacity:0});device.destroy();await device.lost;await lossModel.close();
        if(lossModel.liveBytes!==0)throw Error('Device loss cleanup leaked');
        if(errors.length)throw Error(errors.join('\n'));
        return {adapter:Object.fromEntries(['vendor','architecture','description','isFallbackAdapter'].map(k=>[k,adapter.info[k]])),user_agent:navigator.userAgent,setup_ms:setup,validation,edges,reports,search,device_loss_cleanup:true};
      },{group,rounds,repetitions,warmups});
      result.browser_version=browser.version();runs.push(result);
      await fs.writeFile(`${destination}/${group}.json`,JSON.stringify(result,null,2)+'\n');
      console.log('group',group,result.reports.map(r=>({batch:r.batch,modes:Object.fromEntries(Object.entries(r.measurements).map(([m,v])=>[m,median(v.query_ns)/1000]))})));
    }finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
function median(a){const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)];}
const summary=[1,16,64,256,1024].map(batch=>({batch,modes:Object.fromEntries(['ink','split-strict','fused-strict','split-native','fused-native'].map(mode=>[mode,{query_ns:median(runs.map(r=>median(r.reports.find(x=>x.batch===batch).measurements[mode].query_ns))),resident_finish_ns:mode==='ink'?null:median(runs.map(r=>median(r.reports.find(x=>x.batch===batch).measurements[mode].resident_finish_ns))),read_ns:mode==='ink'?null:median(runs.map(r=>median(r.reports.find(x=>x.batch===batch).measurements[mode].read_ns)))}]))}));
if(JSON.stringify(hashes)!==JSON.stringify(await hashFiles()))throw Error('Measured source/artifact changed during experiment');
const report={schema:1,groups,rounds,repetitions,warmups,summary,runs,hashes,scope:'Same hardware/device in fresh headed Chrome profiles; modes interleaved and rotated. Public encodeBatch with changing token IDs, resident weights, complete fresh detached F32 readback. Excludes tokenizer/download/model/pipeline/session creation. Authored experimental kernels are not Ink compiler output. Strict split is a matched-host three-dispatch control. Native float is approximate; no semantic-quality gain or compiler proof claimed. Resident completion uses queue completion, not GPU timestamps.'};
await fs.writeFile(destination+'/report.json',JSON.stringify(report,null,2)+'\n');
const rows=['# Experimental GPU schedules','',report.scope,'',`Chrome ${runs[0].browser_version}; ${JSON.stringify(runs[0].adapter)}. ${groups} fresh processes, ${rounds} alternating-query rounds per batch, ${repetitions} complete calls per round; ${warmups} warmups per mode and batch.`,'','| Batch | Existing Ink µs/embedding | Matched strict split | Strict fused | Native split | Native fused | Ink/native speedup |','| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',...summary.map(r=>`| ${r.batch} | ${['ink','split-strict','fused-strict','split-native','fused-native'].map(m=>(r.modes[m].query_ns/1000).toFixed(3)).join(' | ')} | ${(r.modes.ink.query_ns/r.modes['fused-native'].query_ns).toFixed(2)}× |`)];
await fs.writeFile(destination+'/REPORT.md',rows.join('\n')+'\n');console.log(rows.join('\n'));
