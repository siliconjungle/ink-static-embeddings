// Public host for schema-2 imports. Tokenization remains outside numeric Ink.
// JavaScript captures bounded shards; GPU uses one resident flat table.
export function validateManifest(m) {
  if(m.schema!==2||m.architecture!=='static-embedding-mean'||m.dtype!=='float32-le')throw Error('Unsupported static model manifest');
  if(!Number.isInteger(m.dimensions)||m.dimensions<1||m.dimensions>4096||!Number.isInteger(m.vocabulary_size)||m.vocabulary_size<1||m.parameters!==m.dimensions*m.vocabulary_size||m.parameters>0xffffffff)throw Error('Invalid model shape');
  let offset=0;
  if(!Array.isArray(m.shards)||!m.shards.length)throw Error('Missing shards');
  for(let i=0;i<m.shards.length;i++){
    const s=m.shards[i];
    if(s.name!==`weight_${i}`||s.offset!==offset||!Number.isInteger(s.elements)||s.elements<1||s.elements>999000)throw Error('Invalid shard layout');
    offset+=s.elements;
  }
  if(offset!==m.parameters)throw Error('Incomplete shard layout');
  if(!['none','l2-add-epsilon','l2-clamp'].includes(m.normalization?.kind))throw Error('Unsupported normalization');
}

function validateIds(ids,m,maxTokens=0xffffffff){
  if(!Array.isArray(ids)&&!(ids instanceof Uint32Array))throw Error('Token IDs must be an array or Uint32Array');
  if(ids.length>maxTokens)throw Error(`Query exceeds declared ${maxTokens}-token capacity; inputs are never silently truncated`);
  for(const id of ids)if(!Number.isInteger(id)||id<0||id>=m.vocabulary_size)throw Error('Token ID outside vocabulary');
}

function validateWeights(weights,m){
  validateManifest(m);
  if(!(weights instanceof Float32Array)||weights.length!==m.parameters)throw Error('Weight length or dtype mismatch');
  for(const value of weights)if(!Number.isFinite(value))throw Error('Nonfinite weight');
}

export function createJavascriptEncoder(module,manifest,weights,{layout=null}={}){
  validateWeights(weights,manifest);
  const codec=module.compiledValues.encode;
  let captured,count;
  if(layout===null){
    count=manifest.shards.length;
    if(codec.params.length!==count+1)throw Error('Compiled module/manifest ABI mismatch');
    captured=manifest.shards.map((s,i)=>[i,codec.params[i].capture(weights.subarray(s.offset,s.offset+s.elements))]);
  }else{
    if(layout.schema!==1||layout.kind!=='row-packed-f32'||layout.base_source_sha256!==manifest.source_sha256||
       layout.weights_sha256!==manifest.weights_sha256||layout.dimensions!==manifest.dimensions||layout.vocabulary_size!==manifest.vocabulary_size||
       !Array.isArray(layout.shards)||!layout.shards.length)throw Error('Packed row layout/model mismatch');
    count=layout.shards.length;
    if(codec.params.length!==count+1)throw Error('Compiled row module/manifest ABI mismatch');
    let start=0;captured=[];
    for(let i=0;i<count;i++){
      const s=layout.shards[i];
      if(s.name!==`rows_${i}`||s.row_offset!==start||!Number.isInteger(s.rows)||s.rows<1||
         s.rows*(manifest.dimensions+1)>999000||start+s.rows>manifest.vocabulary_size)throw Error('Invalid packed row shard');
      const rows=Array.from({length:s.rows},(_,r)=>weights.subarray((start+r)*manifest.dimensions,(start+r+1)*manifest.dimensions));
      captured.push([i,codec.params[i].capture(rows)]);start+=s.rows;
    }
    if(start!==manifest.vocabulary_size)throw Error('Incomplete packed row table');
  }
  if(codec.params.length!==count+1)throw Error('Compiled module/manifest ABI mismatch');
  const prepared=module.prepareCompiled('encode',captured);
  return {
    backend:'javascript',manifest,
    encode(ids){
      validateIds(ids,manifest);
      // Into's public F32 carrier can contain exact {F32Bits} values. Convert
      // those through a word view, preserving infinities and NaN payloads.
      const values=new Array(manifest.dimensions),result=new Float32Array(manifest.dimensions);
      const n=module.callPreparedCompiledInto(prepared,[codec.params[count].capture(ids)],values);
      if(n!==result.length)throw Error('Unexpected embedding dimension');
      let bits;
      for(let i=0;i<n;i++){
        const x=values[i];
        if(typeof x==='number')result[i]=x;
        else (bits??=new Uint32Array(result.buffer))[i]=x.F32Bits;
      }
      return result;
    },
    encodeBatch(queries){
      const output=new Float32Array(queries.length*manifest.dimensions);
      queries.forEach((ids,i)=>output.set(this.encode(ids),i*manifest.dimensions));return output;
    },
  };
}

export async function loadStaticEmbedding(base,{backend='javascript',device=null,optimized=false,javascriptLayout='reference'}={}){
  const root=new URL(base,globalThis.location?.href);
  if(!root.pathname.endsWith('/'))root.pathname+='/';
  const json=async name=>{const r=await fetch(new URL(name,root));if(!r.ok)throw Error(`Cannot load ${name}: ${r.status}`);return r.json();};
  const manifest=await json('model.json');validateManifest(manifest);
  if(!['javascript','gpu'].includes(backend))throw Error('Backend must be javascript or gpu');
  if(!['reference','packed-rows'].includes(javascriptLayout))throw Error('Unsupported JavaScript layout');
  if(backend==='gpu'&&manifest.parameters*4+4>256*1024*1024)throw Error('Model exceeds existing Ink GPU buffer budget; use JavaScript or Rust');
  const response=await fetch(new URL('weights.f32',root));
  if(!response.ok)throw Error('Cannot load model weights');
  const bytes=await response.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==manifest.weights_sha256)throw Error('Weight checksum mismatch');
  const weights=new Float32Array(bytes);validateWeights(weights,manifest);
  if(backend==='javascript'){
    if(javascriptLayout==='packed-rows'){
      const layout=await json('javascript/packed-rows/layout.json');
      const module=await import(new URL('javascript/packed-rows/model.mjs',root));
      return createJavascriptEncoder(module,manifest,weights,{layout});
    }
    const compilation=await json('target-compilation.json');
    if(compilation.source_sha256!==manifest.source_sha256)throw Error('Compiled source/model mismatch');
    const module=await import(new URL(optimized?'optimized.mjs':'literal.mjs',root));
    return createJavascriptEncoder(module,manifest,weights);
  }
  const targets=await json('targets.json');
  if(targets.schema!==2||targets.dimensions!==manifest.dimensions||targets.sources['model.ink']!==manifest.source_sha256)throw Error('Target/model mismatch');
  // Ink additionally enforces the entire live-allocation budget during open.
  const {loadInk}=await import(new URL('webgpu/ink-gpu.mjs',root));
  const runtime=await loadInk(new URL('webgpu/',root),{device,backend:'gpu',policy:'static',staticBackend:'gpu'});
  const sessions=new Set();
  return {
    backend:'gpu',manifest,
    async createSession({batchSize,tokenCapacity}){
      if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize*manifest.dimensions>0xffffffff||!Number.isSafeInteger(tokenCapacity)||tokenCapacity<0||tokenCapacity>0xffffffff)throw Error('Invalid batch capacity');
      const minimumBytes=weights.byteLength+tokenCapacity*4+batchSize*(manifest.dimensions+3)*4;
      if(minimumBytes>256*1024*1024)throw Error('Session inputs exceed existing Ink GPU memory budget');
      const names=['weights','tokens','starts','lengths','positions'];
      const plan={inputs:{weights,tokens:new Uint32Array(tokenCapacity),starts:new Uint32Array(batchSize),lengths:new Uint32Array(batchSize),
        positions:Uint32Array.from({length:batchSize*manifest.dimensions},(_,i)=>i),documents:Uint32Array.from({length:batchSize},(_,i)=>i)},steps:[
        {id:'means',call:'pool_batch',args:names.map(input=>({input}))},
        {id:'norms',call:'norm_batch',args:[{step:'means'},{input:'documents'}]},
        {id:'embeddings',call:'normalize_batch',args:[{step:'means'},{step:'norms'},{input:'positions'}]}],outputs:['embeddings']};
      const session=await runtime.open(plan,{backend:'gpu-required'});sessions.add(session);
      let pending=Promise.resolve();
      return {
        backend:session.backend,
        encodeBatch(queries){
          if(!Array.isArray(queries)||queries.length!==batchSize)return Promise.reject(Error('Batch size differs from session capacity'));
          let total=0;
          for(const ids of queries){validateIds(ids,manifest,targets.max_tokens);total+=ids.length;}
          if(total>tokenCapacity)return Promise.reject(Error('Token count exceeds session capacity'));
          const tokens=new Uint32Array(tokenCapacity),starts=new Uint32Array(batchSize),lengths=new Uint32Array(batchSize);
          let offset=0;queries.forEach((ids,i)=>{starts[i]=offset;lengths[i]=ids.length;tokens.set(ids,offset);offset+=ids.length;});
          const run=async()=>{
            await session.write('tokens',tokens);await session.write('starts',starts);await session.write('lengths',lengths);
            const receipt=await session.step();
            if(receipt.backend!=='gpu')throw Error('GPU fallback');
            const out=await session.read({outputs:['embeddings']});
            return Float32Array.from(out.values.embeddings);
          };
          const result=pending.then(run);pending=result.catch(()=>{});return result;
        },
        async close(){await pending;await session.close();sessions.delete(session);},
      };
    },
    async close(){for(const session of sessions)await session.close();sessions.clear();await runtime.close();},
  };
}
