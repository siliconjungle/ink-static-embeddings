// Installed, visible Chrome; fresh browsers and the same public CPU API.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=process.cwd(),processes=Number(process.env.BENCH_PROCESSES??6);
const rounds=9,repetitions=100,build='build/general/potion-2m',dest='results/wasm';
const names=['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp'];
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Ink Rust/Wasm</title>');return;}
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`,runs=[],validation=[];
await fs.mkdir(dest,{recursive:true});
try{
  for(let group=0;group<processes;group++){
    const browser=await chromium.launch({channel:'chrome',headless:false});
    try{
      const page=await browser.newPage();await page.goto(url);
      const result=await page.evaluate(async({build,group,rounds,repetitions})=>{
        const {createWasmEncoder}=await import('/runtime/static-embedding-wasm.mjs');
        const {createJavascriptEncoder}=await import('/runtime/static-embedding.mjs');
        const [m,bytes,binary,corpus,reference,js]=await Promise.all([
          fetch('/'+build+'/model.json').then(r=>r.json()),fetch('/'+build+'/weights.f32').then(r=>r.arrayBuffer()),
          fetch('/'+build+'/wasm/model.wasm').then(r=>r.arrayBuffer()),fetch('/build/corpus.json').then(r=>r.json()),
          fetch('/results/raw-0-upstream.json').then(r=>r.json()),import('/'+build+'/js-final.mjs')]);
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
        if(hash!==m.weights_sha256)throw Error('Changed weights');
        const weights=new Float32Array(bytes),encoders={},setup={};
        for(const mode of ['javascript','ink','ink-quads']){
          const start=performance.now();
          encoders[mode]=mode==='javascript'?createJavascriptEncoder(js,m,weights):await createWasmEncoder(binary,m,weights,{variant:mode});
          setup[mode]={capture_prepare_ms:performance.now()-start,statistics:encoders[mode].statistics?.()};
          const out=encoders[mode].encodeBatch(corpus.cases.map(c=>c.ids)),actual=new Uint32Array(out.buffer),expected=new Uint32Array(Float32Array.from(reference.ordered_outputs.flat()).buffer);
          if(actual.length!==expected.length)throw Error('Output length');
          for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw Error(mode+' output mismatch '+i);
        }
        const cases=corpus.cases,buckets={all:cases,empty:cases.filter(c=>!c.ids.length),
          short:cases.filter(c=>c.ids.length>0&&c.ids.length<=16),medium:cases.filter(c=>c.ids.length>16&&c.ids.length<=128),long:cases.filter(c=>c.ids.length>128)};
        let order=['javascript','ink','ink-quads'];order=order.slice(group%3).concat(order.slice(0,group%3));if(group%2)order.reverse();
        let checksum=0;const modes={};
        for(const mode of order){
          const encode=ids=>encoders[mode].encode(ids);
          for(let k=0;k<150;k++)for(const c of cases)for(const x of encode(c.ids))checksum+=x;
          const samples={};
          for(const [name,groupCases] of Object.entries(buckets)){
            const times=[];
            for(let r=0;r<rounds;r++){
              const t=performance.now();
              for(let k=0;k<repetitions;k++)for(const c of groupCases)for(const x of encode(c.ids))checksum+=x;
              times.push((performance.now()-t)*1e6/(repetitions*groupCases.length));
            }
            samples[name]={cases:groupCases.length,samples_ns_per_embedding:times};
          }
          modes[mode]={samples,all_64_outputs_bit_exact:true};
        }
        for(const e of Object.values(encoders))e.close?.();
        return {modes,setup,order,checksum,user_agent:navigator.userAgent,cross_origin_isolated:crossOriginIsolated};
      },{build,group,rounds,repetitions});
      result.browser_version=browser.version();runs.push(result);
      await fs.writeFile(`${dest}/browser-${group}.json`,JSON.stringify(result,null,2)+'\n');
      console.log('Browser',group,...Object.entries(result.modes).map(([mode,d])=>mode+': '+(median(d.samples.all.samples_ns_per_embedding)/1000).toFixed(3)+' us'));
    }finally{await browser.close();}
  }
  const browser=await chromium.launch({channel:'chrome',headless:false});
  try{
    for(const name of names){
      const page=await browser.newPage();await page.goto(url);
      try{
        const result=await page.evaluate(async name=>{
          const {checkWasm}=await import('/scripts/wasm_conformance.mjs');
          const dir='/build/general/'+name;
          const [binary,manifest,bytes,fixture]=await Promise.all([
            fetch(dir+'/wasm/model.wasm').then(r=>r.arrayBuffer()),fetch(dir+'/model.json').then(r=>r.json()),
            fetch(dir+'/weights.f32').then(r=>r.arrayBuffer()),fetch(dir+'/validation.json').then(r=>r.json())]);
          return checkWasm({binary,manifest,weights:new Float32Array(bytes),fixture});
        },name);
        validation.push(result);console.log('Validated',name,result.reports.map(r=>r.variant).join(', '));
      }finally{await page.close();}
    }
  }finally{await browser.close();}
}finally{await new Promise(resolve=>server.close(resolve));}
function median(a){const b=[...a].sort((a,b)=>a-b);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2;}
const aggregate=Object.fromEntries(['all','empty','short','medium','long'].map(bucket=>[bucket,
  Object.fromEntries(['javascript','ink','ink-quads'].map(mode=>[mode,median(runs.map(r=>median(r.modes[mode].samples[bucket].samples_ns_per_embedding)))]))]));
const files=['scripts/build_wasm.py','scripts/wasm_browser_benchmark.mjs','scripts/wasm_conformance.mjs','wasm/resident.rs',
 'runtime/static-embedding-wasm.mjs',build+'/model.ink',build+'/model.json',build+'/wasm/model.ink',
 build+'/wasm/model.wasm',build+'/wasm/plan.json',build+'/js-final.mjs','build/corpus.json'];
const hashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));
const report={schema:1,processes,rounds,repetitions,scope:'Visible installed Chrome, single-query CPU latency, resident immutable weights. Public encode allocates detached F32 output; ID validation/upload and complete output consumption included. Loading, network, compilation and one-time capture/preparation excluded and setup recorded separately. Ink-quads is an authored Vec4 source layout, not a proof-selected optimizer rewrite. SIMD enabled; exact instruction coverage is recorded separately.',
  summary_ns_per_embedding:aggregate,validation,source_sha256:hashes,runs};
await fs.writeFile(dest+'/report.json',JSON.stringify(report,null,2)+'\n');
const rows=['# Rust/Wasm in the browser','',report.scope,'',
 `Chrome ${runs[0]?.browser_version}; Apple M4 Pro. Median of medians over ${processes} fresh browsers, ${rounds} rounds and ${repetitions} repetitions per corpus group.`,
 '', '| Input length | Ink → JS | Ink → Rust/Wasm | Ink quads → Rust/Wasm | JS / quads |',
 '| --- | ---: | ---: | ---: | ---: |',
 ...Object.entries(aggregate).map(([bucket,r])=>`| ${bucket} | ${(r.javascript/1000).toFixed(3)} | ${(r.ink/1000).toFixed(3)} | ${(r['ink-quads']/1000).toFixed(3)} | ${(r.javascript/r['ink-quads']).toFixed(2)}× |`),
 '', 'Times are µs/query. Short = 1–16 tokens; medium = 17–128; long = 129–512. All 64 complete benchmark outputs match the ordered F32 oracle bit for bit. Each call changes input IDs; no result memoization. Weights are loaded once, split into resident Rust vectors once and borrowed on every invocation.',
 '', 'Both paths compile through the pinned Ink Rust lowering and the existing checked read-only physical plan. The quad source groups independent dimensions but preserves each dimension’s token order and the original right-fold norm. No weights, dimensions, quality target or compiler semantics change.',
 '', 'All five retained model/fixture suites pass both Wasm variants in actual Chrome, including 5/7-dimensional tails, 32 shards, non-row-aligned splits, normalization policies, reordered calls, detached outputs, host mutations, capacity limits, invalid IDs and close/source-mismatch rejection. Exact source/plan/target identities and all raw process samples are retained.',
 '', 'This report compares CPU implementations in the same browser. Historical NumPy and GPU measurements are separate studies; this is not a matched browser NumPy or GPU comparison. The API performs one Wasm inference call per document, including encodeBatch; it does not yet amortize the boundary across a Rust-native batch.'];
await fs.writeFile(dest+'/REPORT.md',rows.join('\n')+'\n');console.log(rows.join('\n'));
