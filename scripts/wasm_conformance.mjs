// Shared browser/Node conformance for the public resident-Wasm host.
import {createWasmEncoder} from '../runtime/static-embedding-wasm.mjs';

function equalBits(actual,expected){
  const a=new Uint32Array(actual.buffer,actual.byteOffset,actual.length);
  const b=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);
  if(a.length!==b.length)throw Error('Output length differs');
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(`Float bits differ at ${i}: ${a[i]} != ${b[i]}`);
}
function rejects(fn){let rejected=false;try{fn();}catch{rejected=true;}if(!rejected)throw Error('Invalid call accepted');}

export async function checkWasm({binary,manifest,weights,fixture}){
  const expected=Float32Array.from(fixture.ordered_outputs.flat()),reports=[];
  for(const variant of ['ink','ink-quads']){
    const e=await createWasmEncoder(binary,manifest,weights,{variant,maxTokens:512});
    const actual=e.encodeBatch(fixture.queries);equalBits(actual,expected);
    // Reordered changing requests exercise input length/capture state repeatedly.
    for(let turn=0;turn<3;turn++)for(let i=fixture.queries.length-1;i>=0;i--){
      const ids=fixture.queries[i],out=e.encode(ids),want=Float32Array.from(fixture.ordered_outputs[i]);
      equalBits(out,want);out.fill(99);equalBits(e.encode(ids),want);
      const destination=new Float32Array(manifest.dimensions+2).fill(123);
      e.encodeInto(ids,destination);equalBits(destination.subarray(0,manifest.dimensions),want);
      if(destination.at(-1)!==123||destination.at(-2)!==123)throw Error('Destination tail overwritten');
    }
    for(const ids of [[-1],[manifest.vocabulary_size],[NaN],[1.5],[2**32],new Array(513).fill(0)])rejects(()=>e.encode(ids));
    rejects(()=>e.encodeInto([],new Float32Array(manifest.dimensions-1)));
    const probe=e.encode([0]),previous=weights[0];weights[0]=Math.fround(previous+1);
    equalBits(e.encode([0]),probe);weights[0]=previous;
    const oldDim=manifest.dimensions;manifest.dimensions=1;equalBits(e.encode([0]),probe);manifest.dimensions=oldDim;
    reports.push({variant,cases:fixture.queries.length,all_outputs_bit_exact:true,
      reordered_calls:fixture.queries.length*3,invalid_calls_rejected:true,
      outputs_detached:true,weights_captured_once:true,manifest_captured:true,statistics:e.statistics()});
    e.close();e.close();rejects(()=>e.encode([]));rejects(()=>e.encodeBatch([]));
  }
  let rejected=false;
  try{await createWasmEncoder(binary,{...manifest,source_sha256:'0'.repeat(64)},weights);}catch{rejected=true;}
  if(!rejected)throw Error('Wrong source accepted');
  return {model_id:manifest.model_id,revision:manifest.revision,dimensions:manifest.dimensions,reports,source_mismatch_rejected:true};
}
