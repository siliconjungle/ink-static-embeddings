// Hardware WebGPU validation for arbitrary schema-2 imports. No model names,
// dimensions, normalization assumptions or table splits are encoded here.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=process.cwd(),directories=process.argv.slice(2);
if(!directories.length)throw Error('Pass one or more compiled model directories');
const mime={'.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.wgsl':'text/plain'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Static model validation</title>');return;}
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
    res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:false});
  for(const directory of directories){
    const relative=path.relative(root,path.resolve(directory));
    if(relative.startsWith('..'))throw Error('Model directory must be inside the repository');
    const page=await browser.newPage();
    try{
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const record=await page.evaluate(async({relative})=>{
        if(!navigator.gpu)throw Error('WebGPU unavailable');
        const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
        if(!adapter||adapter.info.isFallbackAdapter)throw Error('Hardware adapter required');
        const device=await adapter.requestDevice({requiredLimits:{
          maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,256*1024*1024),
          maxBufferSize:Math.min(adapter.limits.maxBufferSize,256*1024*1024),
          maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
        const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
        const {loadStaticEmbedding}=await import('/runtime/static-embedding.mjs');
        const base='/'+relative+'/',fixture=await fetch(base+'validation.json').then(r=>r.json());
        const manifest=await fetch(base+'model.json').then(r=>r.json());
        const targetInfo=await fetch(base+'targets.json').then(r=>r.json());
        let javascriptLoaderChecked=false;
        if(manifest.parameters<1000){
          const cpu=await loadStaticEmbedding(base,{backend:'javascript'});
          const actual=new Uint32Array(cpu.encodeBatch(fixture.queries).buffer);
          const expected=new Uint32Array(Float32Array.from(fixture.ordered_outputs.flat()).buffer);
          if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))throw Error('Browser JavaScript loader mismatch');
          javascriptLoaderChecked=true;
        }
        const start=performance.now(),model=await loadStaticEmbedding(base,{backend:'gpu',device});
        const loaded=performance.now(),queries=fixture.queries;
        const session=await model.createSession({batchSize:queries.length,tokenCapacity:queries.reduce((n,q)=>n+q.length,0)});
        const opened=performance.now(),rounds=[];
        const bits=values=>new Uint32Array(Float32Array.from(values).buffer);
        const expected=fixture.ordered_outputs.map(bits);
        for(let shift=0;shift<3;shift++){
          const inputs=queries.map((_,i)=>queries[(i+shift)%queries.length]);
          const before=performance.now(),out=await session.encodeBatch(inputs),elapsed=performance.now()-before;
          const actual=new Uint32Array(out.buffer);
          if(actual.length!==queries.length*manifest.dimensions)throw Error('Output length mismatch');
          for(let i=0;i<actual.length;i++)if(actual[i]!==expected[(Math.floor(i/manifest.dimensions)+shift)%queries.length][i%manifest.dimensions])throw Error(`GPU output mismatch at ${i}`);
          const hash=await crypto.subtle.digest('SHA-256',actual);
          rounds.push({shift,elapsed_ms:elapsed,output_sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')});
        }
        let invalidRejected=false;
        try{await session.encodeBatch(queries.map((q,i)=>i===0?[manifest.vocabulary_size]:q));}catch{invalidRejected=true;}
        if(!invalidRejected)throw Error('Invalid token ID accepted');
        let oversizedRejected=false;
        try{await session.encodeBatch(queries.map((q,i)=>i===0?new Uint32Array(targetInfo.max_tokens+1):q));}catch(error){oversizedRejected=/declared.*token capacity/.test(error.message);}
        if(!oversizedRejected)throw Error('Oversized document was not explicitly rejected');
        let memoryRejected=false;
        try{await model.createSession({batchSize:1,tokenCapacity:70_000_000});}catch(error){memoryRejected=/memory budget/.test(error.message);}
        if(!memoryRejected)throw Error('Oversized allocation not rejected before allocation');
        await session.close();await model.close();device.destroy();
        if(errors.length)throw Error(errors.join('\n'));
        return {backend:'hardware-webgpu',all_outputs_bit_exact:true,invalid_ids_rejected:true,
          oversized_documents_rejected:true,oversized_allocations_rejected:true,javascript_loader_checked:javascriptLoaderChecked,
          adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,isFallbackAdapter:adapter.info.isFallbackAdapter},
          load_ms:loaded-start,session_open_ms:opened-loaded,rounds,
          scope:'Correctness validation with changing query order; round timings are diagnostics, not a controlled performance benchmark.'};
      },{relative});
      record.browser_version=browser.version();
      await fs.writeFile(path.join(directory,'browser-validation.json'),JSON.stringify(record,null,2)+'\n');
      console.log(directory,'hardware WebGPU bit-exact; invalid IDs rejected');
    }finally{await page.close();}
  }
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
