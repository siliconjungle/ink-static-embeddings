// Resident weights around Ink-emitted Rust, compiled with wasm32 + simd128.
import {validateManifest} from './static-embedding.mjs';

export async function createWasmEncoder(binary,manifest,weights,{variant='ink-quads',maxTokens=4096}={}){
  manifest=structuredClone(manifest);
  manifest.shards?.forEach(Object.freeze);
  Object.freeze(manifest.shards);Object.freeze(manifest.normalization);Object.freeze(manifest);
  validateManifest(manifest);
  if(!['ink','ink-quads'].includes(variant))throw Error('Wasm variant must be ink or ink-quads');
  if(!Number.isInteger(maxTokens)||maxTokens<0||maxTokens>1_000_000)throw Error('Invalid token capacity');
  if(!(weights instanceof Float32Array)||weights.length!==manifest.parameters)throw Error('Weight shape mismatch');
  if(typeof SharedArrayBuffer!=='undefined'&&weights.buffer instanceof SharedArrayBuffer)throw Error('Shared mutable model memory is unsupported');
  for(const x of weights)if(!Number.isFinite(x))throw Error('Nonfinite weight');
  const result=await WebAssembly.instantiate(binary,{});
  const instance=result.instance??result,e=instance.exports;
  const source=Array.from({length:8},(_,i)=>(e.source_word(i)>>>0).toString(16).padStart(8,'0')).join('');
  if(source!==manifest.source_sha256||e.dimensions()!==manifest.dimensions||e.parameters()!==manifest.parameters)throw Error('Wasm module/model mismatch');
  if(e.model_init(maxTokens)!==0)throw Error('Model or capacity exceeds Wasm memory budget');
  let closed=false;const weightBytes=weights.byteLength;
  try{
    new Float32Array(e.memory.buffer,e.weights_ptr(),weights.length).set(weights);
    if(e.model_commit()!==0)throw Error('Cannot commit model weights');
  }catch(error){e.model_close();throw error;}
  let buffer=null,input=null;
  const check=ids=>{
    if(closed)throw Error('Encoder is closed');
    if(!Array.isArray(ids)&&!(ids instanceof Uint32Array))throw Error('Token IDs must be an array or Uint32Array');
    if(ids.length>maxTokens)throw Error('Query exceeds token capacity');
    for(const id of ids)if(!Number.isInteger(id)||id<0||id>=manifest.vocabulary_size)throw Error('Token ID outside vocabulary');
  };
  const mode=variant==='ink'?0:1;
  const encoder={
    backend:'rust-wasm',variant,manifest,
    encodeInto(ids,destination){
      check(ids);
      if(!(destination instanceof Float32Array)||destination.length<manifest.dimensions)throw Error('Destination too small or wrong dtype');
      if(buffer!==e.memory.buffer){buffer=e.memory.buffer;input=new Uint32Array(buffer,e.input_ptr(),maxTokens);}
      input.set(ids);
      if(e.encode(ids.length,mode)!==0)throw Error('Wasm rejected input');
      // Source execution may grow linear memory or replace its result vector.
      const output=new Float32Array(e.memory.buffer,e.output_ptr(),manifest.dimensions);
      destination.set(output);return destination;
    },
    encode(ids){const out=new Float32Array(manifest.dimensions);return this.encodeInto(ids,out);},
    encodeBatch(queries){
      if(closed)throw Error('Encoder is closed');
      if(!Array.isArray(queries))throw Error('Queries must be an array');
      // Validate the complete batch before any inference. Fresh outputs detach.
      for(const ids of queries)check(ids);
      const out=new Float32Array(queries.length*manifest.dimensions);
      queries.forEach((ids,i)=>this.encodeInto(ids,out.subarray(i*manifest.dimensions,(i+1)*manifest.dimensions)));
      return out;
    },
    statistics(){return {linear_memory_bytes:e.memory.buffer.byteLength,resident_weight_bytes:weightBytes,maxTokens};},
    close(){if(!closed){e.model_close();closed=true;buffer=null;input=null;}},
  };
  return encoder;
}

export async function loadWasmStaticEmbedding(base,options={}){
  const root=new URL(base,globalThis.location?.href);
  if(!root.pathname.endsWith('/'))root.pathname+='/';
  const fetchFile=async name=>{
    const response=await fetch(new URL(name,root));
    if(!response.ok)throw Error(`Cannot load ${name}: ${response.status}`);
    return response;
  };
  const manifest=await(await fetchFile('model.json')).json();validateManifest(manifest);
  const receipt=await(await fetchFile('wasm/build.json')).json();
  if(receipt.source_sha256!==manifest.source_sha256)throw Error('Wasm source mismatch');
  const [binary,bytes]=await Promise.all(['wasm/model.wasm','weights.f32'].map(async p=>(await fetchFile(p)).arrayBuffer()));
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(await digest(bytes)!==manifest.weights_sha256||await digest(binary)!==receipt.wasm_sha256)throw Error('Wasm or weight checksum mismatch');
  return createWasmEncoder(binary,manifest,new Float32Array(bytes),options);
}
