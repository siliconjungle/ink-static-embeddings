// Explicit experimental schedules, separate from Ink's checked lowering.
// All operations on a model serialize, including resident search and close.
export async function createExperimentalGpuEncoder(device,manifest,weights,receipt,shaderSources,{mode='strict',schedule='fused',maxTokens=4096}={}) {
  if(!['strict','native'].includes(mode)||!['fused','split'].includes(schedule))throw Error('Unknown experimental GPU mode');
  if(!device)throw Error('Experimental GPU requires a caller-supplied WebGPU device');
  if(receipt.schema!==1||receipt.kind!=='authored-cooperative-static-embedding-gpu'||receipt.model_source_sha256!==manifest.source_sha256||
    receipt.weights_sha256!==manifest.weights_sha256||receipt.dimensions!==manifest.dimensions||
    JSON.stringify(receipt.normalization)!==JSON.stringify(manifest.normalization))throw Error('Experimental GPU receipt/model mismatch');
  if(!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>1_000_000)throw Error('Invalid token limit');
  const d=manifest.dimensions,limit=256*1024*1024,sessions=new Map(),handles=new WeakMap();
  if(schedule==='fused'&&d*4+4>device.limits.maxComputeWorkgroupStorageSize)throw Error('Fused kernel exceeds device workgroup storage limit');
  let closed=false,closing=false,closePromise,lost=false,pending=Promise.resolve(),liveBytes=0;
  device.lost.then(()=>{lost=true;});
  const guard=()=>{if(closed||lost)throw Error('GPU model closed or device lost');};
  function enqueue(fn,cleanup=false){
    if(closed||closing)return Promise.reject(Error('GPU model closed'));
    const result=pending.then(()=>{if(!cleanup)guard();return fn();});pending=result.catch(()=>{});return result;
  }
  if(mode==='native'){
    // Bound every intermediate in pooling, squared norm and dot products. This
    // is a numerical input contract, not a claim of exact arithmetic parity.
    const bound=Math.min(Math.sqrt(3.402823466e38/d)/4,3.402823466e38/(2*maxTokens));
    for(const x of weights)if(!Number.isFinite(x)||Math.abs(x)>bound)throw Error('Weights exceed native-float finite-intermediate contract');
    if(manifest.normalization.kind!=='none'){
      const epsilon=Number(manifest.normalization.epsilon);
      const minimum=Math.max(1.1754943508222875e-38,Math.sqrt(d*1.1754943508222875e-38*16/3.402823466e38));
      if(!(epsilon>=minimum&&epsilon<=1e30))throw Error('Epsilon exceeds native-float contract');
    }
  }
  async function pipeline(name){
    const filename=`${mode}-${name}.wgsl`,code=shaderSources[filename];
    if(typeof code!=='string')throw Error('Missing experimental shader');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code))),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==receipt.shaders[filename])throw Error('Experimental shader checksum mismatch');
    const module=device.createShaderModule({code,label:filename});
    const errors=(await module.getCompilationInfo()).messages.filter(x=>x.type==='error');
    if(errors.length)throw Error(errors.map(x=>x.message).join('\n'));
    return device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'},label:filename});
  }
  const pipelines={};
  for(const name of [...(schedule==='fused'?['fused']:['pool','norm','output']),'scores','topk'])pipelines[name]=await pipeline(name);
  function allocate(size,usage,label){
    size=Math.max(4,size);
    if(!Number.isSafeInteger(size)||size>device.limits.maxBufferSize||
      ((usage&GPUBufferUsage.STORAGE)&&size>device.limits.maxStorageBufferBindingSize)||liveBytes+size>limit)throw Error('GPU memory budget or device buffer limit exceeded');
    const b=device.createBuffer({size,usage,label});liveBytes+=size;return b;
  }
  function release(b){if(b){liveBytes-=b.size;b.destroy();}}
  const table=allocate(weights.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'resident weights');
  device.queue.writeBuffer(table,0,weights);
  const bind=(name,buffers)=>device.createBindGroup({layout:pipelines[name].getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
  function dispatch(encoder,name,group,count){
    if(count>device.limits.maxComputeWorkgroupsPerDimension)throw Error('Dispatch exceeds device limit');
    const pass=encoder.beginComputePass();pass.setPipeline(pipelines[name]);pass.setBindGroup(0,group);pass.dispatchWorkgroups(count);pass.end();
  }
  async function read(buffer,staging,size){
    const commands=device.createCommandEncoder();commands.copyBufferToBuffer(buffer,0,staging,0,size);device.queue.submit([commands.finish()]);
    await staging.mapAsync(GPUMapMode.READ,0,size);
    try{return staging.getMappedRange(0,size).slice(0);}finally{staging.unmap();}
  }
  function record(handle){const r=handles.get(handle);if(!r||r.state.closed||r.state.generation!==r.generation)throw Error('Resident embedding expired after next encode or close');return r;}
  const model={backend:'gpu-experimental',manifest,mode,schedule,numericalContract:mode==='strict'?receipt.strict_contract:receipt.native_contract,
    createSession({batchSize,tokenCapacity}){return enqueue(()=>{
      if(!Number.isSafeInteger(batchSize)||batchSize<1||!Number.isSafeInteger(tokenCapacity)||tokenCapacity<0||
        batchSize>device.limits.maxComputeWorkgroupsPerDimension||batchSize*d>0xffffffff||2*batchSize+tokenCapacity>0xffffffff)throw Error('Invalid GPU session capacity');
      const bytes=(2*batchSize+tokenCapacity)*4,outputBytes=batchSize*d*4;
      // Preflight all session storage, including readback, before allocation.
      const needed=bytes+2*outputBytes+(schedule==='split'?outputBytes+batchSize*4:0);
      if(liveBytes+needed>limit||Math.max(bytes,outputBytes)>device.limits.maxStorageBufferBindingSize)throw Error('GPU memory budget exceeded');
      const owned=[];
      const make=(n,usage,label)=>{const b=allocate(n,usage,label);owned.push(b);return b;};
      let query,output,staging,means,norms;
      try{
        query=make(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'query metadata and tokens');
        output=make(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'embeddings');
        staging=make(outputBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'embedding readback');
        if(schedule==='split'){
          means=make(outputBytes,GPUBufferUsage.STORAGE,'means');norms=make(batchSize*4,GPUBufferUsage.STORAGE,'norms');
        }
      }catch(error){owned.forEach(release);throw error;}
      const groups=schedule==='fused'?{fused:bind('fused',[table,query,output])}:{pool:bind('pool',[table,query,means]),norm:bind('norm',[means,norms]),output:bind('output',[means,norms,output])};
      const state={closed:false,generation:0};let scoreCapacity=0,resultCapacity=0,scoreBuffer,resultBuffer,resultRead,shape;
      function live(){if(state.closed)throw Error('GPU session closed');}
      async function search(left,other,k){
        const a=record(left),b=record(other);
        if(!Number.isInteger(k)||k<1||k>32||k>b.batchSize)throw Error('Search k must be 1..min(32, corpus size)');
        const pairs=a.batchSize*b.batchSize,resultBytes=a.batchSize*k*8;
        if(!Number.isSafeInteger(pairs)||Math.ceil(pairs/64)>device.limits.maxComputeWorkgroupsPerDimension)throw Error('Search exceeds dispatch capacity');
        const wanted=pairs*4;
        if(wanted>device.limits.maxStorageBufferBindingSize||resultBytes>device.limits.maxStorageBufferBindingSize||liveBytes+
          (wanted>scoreCapacity?wanted:0)+(resultBytes>resultCapacity?resultBytes*2:0)+(shape?0:16)>limit)throw Error('Search exceeds GPU memory budget');
        if(wanted>scoreCapacity){const replacement=allocate(wanted,GPUBufferUsage.STORAGE,'similarity scores');release(scoreBuffer);scoreBuffer=replacement;scoreCapacity=wanted;}
        if(resultBytes>resultCapacity){
          const replacement=allocate(resultBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'top k');let staging;
          try{staging=allocate(resultBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'top k readback');}catch(error){release(replacement);throw error;}
          release(resultBuffer);release(resultRead);resultBuffer=replacement;resultRead=staging;resultCapacity=resultBytes;
        }
        shape??=allocate(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'search shape');
        device.queue.writeBuffer(shape,0,new Uint32Array([a.batchSize,b.batchSize,k,0]));
        const commands=device.createCommandEncoder();
        dispatch(commands,'scores',bind('scores',[a.output,b.output,scoreBuffer,shape]),Math.ceil(pairs/64));
        dispatch(commands,'topk',bind('topk',[scoreBuffer,resultBuffer,shape]),Math.ceil(a.batchSize/64));
        device.queue.submit([commands.finish()]);
        const bytes=await read(resultBuffer,resultRead,resultBytes),words=new Uint32Array(bytes),floats=new Float32Array(bytes);
        const indices=new Uint32Array(a.batchSize*k),scores=new Float32Array(a.batchSize*k);
        for(let i=0;i<indices.length;i++){indices[i]=words[i*2];scores[i]=floats[i*2+1];}
        return {indices,scores,k,batchSize:a.batchSize,counters:{dispatches:2,readback_bytes:resultBytes,embedding_readback_bytes:0}};
      }
      function encode(queries,download){return enqueue(async()=>{
        live();if(!Array.isArray(queries)||queries.length!==batchSize)throw Error('Batch size differs from session capacity');
        const before=performance.now(),packed=new Uint32Array(2*batchSize+tokenCapacity);let cursor=2*batchSize;
        queries.forEach((ids,i)=>{
          if(!Array.isArray(ids)&&!(ids instanceof Uint32Array))throw Error('Token IDs must be an array or Uint32Array');
          if(ids.length>maxTokens)throw Error('Query exceeds declared token capacity');
          if(cursor+ids.length>packed.length)throw Error('Token count exceeds session capacity');
          for(const id of ids)if(!Number.isInteger(id)||id<0||id>=manifest.vocabulary_size)throw Error('Token ID outside vocabulary');
          packed[i*2]=cursor;packed[i*2+1]=ids.length;packed.set(ids,cursor);cursor+=ids.length;
        });
        state.generation++;
        device.queue.writeBuffer(query,0,packed);
        const commands=device.createCommandEncoder();
        if(schedule==='fused')dispatch(commands,'fused',groups.fused,batchSize);
        else{
          dispatch(commands,'pool',groups.pool,Math.ceil(batchSize*d/64));
          dispatch(commands,'norm',groups.norm,Math.ceil(batchSize/64));
          dispatch(commands,'output',groups.output,Math.ceil(batchSize*d/64));
        }
        device.queue.submit([commands.finish()]);
        const submitted=performance.now();
        const handle=Object.freeze({batchSize,dimensions:d,
          read:()=>enqueue(async()=>{record(handle);return new Float32Array(await read(output,staging,outputBytes));}),
          search:(other,{k=10}={})=>enqueue(()=>search(handle,other,k))});
        handles.set(handle,{state,generation:state.generation,output,batchSize});
        if(!download)return handle;
        const out=new Float32Array(await read(output,staging,outputBytes));
        session.lastTiming={pack_upload_submit_ms:submitted-before,read_wait_copy_ms:performance.now()-submitted,
          total_ms:performance.now()-before,dispatches:schedule==='fused'?1:3,upload_bytes:packed.byteLength,readback_bytes:outputBytes};
        return out;
      });}
      function dispose(){if(state.closed)return;state.closed=true;owned.forEach(release);[scoreBuffer,resultBuffer,resultRead,shape].forEach(release);sessions.delete(session);}
      const session={backend:'gpu-experimental',mode,schedule,batchSize,
        encodeBatch:queries=>encode(queries,true),encodeBatchResident:queries=>encode(queries,false),
        finish:()=>enqueue(()=>{live();return device.queue.onSubmittedWorkDone();}),
        close:()=>state.closed?Promise.resolve():enqueue(dispose,true)};
      sessions.set(session,dispose);return session;
    });},
    close(){
      if(closePromise)return closePromise;closing=true;
      closePromise=pending.then(()=>{for(const dispose of [...sessions.values()])dispose();release(table);closed=true;});
      pending=closePromise.catch(()=>{});return closePromise;
    },
    get liveBytes(){return liveBytes;}};
  return model;
}
