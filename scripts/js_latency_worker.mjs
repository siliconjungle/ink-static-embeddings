// Complete-result CPU latency, with immutable weights prepared outside timing.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';

const [filename, roundsText='9', repetitionsText='100'] = process.argv.slice(2);
const rounds=Number(roundsText), repetitions=Number(repetitionsText);
const start=performance.now();
const module=await import(pathToFileURL(filename));
const imported=performance.now();
const manifest=JSON.parse(fs.readFileSync('build/model.json'));
const bytes=fs.readFileSync('build/weights.f32');
if(createHash('sha256').update(bytes).digest('hex')!==manifest.weights_sha256)throw Error('weight hash');
const weights=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const cases=JSON.parse(fs.readFileSync('build/corpus.json')).cases;
const codec=module.compiledValues.encode;
const prepared=module.prepareCompiled('encode',[
  [0,codec.params[0].capture(weights.subarray(0,manifest.shard_elements))],
  [1,codec.params[1].capture(weights.subarray(manifest.shard_elements))],
]);
const loaded=performance.now();
const destination=new Float32Array(manifest.dimensions);
const encode=ids=>{
  const input=codec.params[2].capture(ids);
  if(module.callPreparedCompiledInto(prepared,[input],destination)!==destination.length)throw Error('output length');
  return destination;
};
const outputs=cases.map(c=>Array.from(encode(c.ids)));
let checksum=0;
for(let r=0;r<150;r++)for(const c of cases)for(const x of encode(c.ids))checksum+=x;
const buckets={all:cases,empty:cases.filter(c=>!c.ids.length),
  short:cases.filter(c=>c.ids.length>0&&c.ids.length<=16),
  medium:cases.filter(c=>c.ids.length>16&&c.ids.length<=128),
  long:cases.filter(c=>c.ids.length>128)};
const samples={};
for(const [name,group] of Object.entries(buckets)){
  const times=[];
  for(let r=0;r<rounds;r++){
    const t=performance.now();
    for(let k=0;k<repetitions;k++)for(const c of group)for(const x of encode(c.ids))checksum+=x;
    times.push((performance.now()-t)*1e6/(group.length*repetitions));
  }
  samples[name]={cases:group.length,samples_ns_per_embedding:times};
}
process.stdout.write(JSON.stringify({node:process.version,import_ms:imported-start,
  weight_capture_prepare_ms:loaded-imported,checksum,outputs,samples}));
