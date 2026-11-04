import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';

const [build, mode, roundsText='5'] = process.argv.slice(2);
const rounds=Number(roundsText);
const start=performance.now();
const module=await import(pathToFileURL(`${build}/${mode}.mjs`));
const imported=performance.now();
const manifest=JSON.parse(fs.readFileSync(`${build}/model.json`));
const bytes=fs.readFileSync(`${build}/weights.f32`);
if(createHash('sha256').update(bytes).digest('hex')!==manifest.weights_sha256)throw Error('changed model weights');
const weights=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const corpus=JSON.parse(fs.readFileSync(`${build}/corpus.json`));
const codec=module.compiledValues.encode;
const first=codec.params[0].capture(weights.subarray(0,manifest.shard_elements));
const second=codec.params[1].capture(weights.subarray(manifest.shard_elements));
const prepared=module.prepareCompiled('encode',[[0,first],[1,second]]);
const loaded=performance.now();
const output=new Float32Array(manifest.dimensions);
const encode=ids=>{
  const value=codec.params[2].capture(ids);
  const n=module.callPreparedCompiledInto(prepared,[value],output);
  if(n!==output.length)throw Error('unexpected output length');
  return output;
};
const outputs=corpus.cases.map(c=>Array.from(encode(c.ids)));
let checksum=0;
for(let r=0;r<3;r++)for(const c of corpus.cases)checksum+=encode(c.ids)[r%output.length];
const samples=[];
for(let r=0;r<rounds;r++){
  const t=performance.now();
  for(const c of corpus.cases){const result=encode(c.ids);for(const x of result)checksum+=x;}
  samples.push((performance.now()-t)*1e6/corpus.cases.length);
}
process.stdout.write(JSON.stringify({mode,node:process.version,import_ms:imported-start,
  weight_capture_prepare_ms:loaded-imported,samples_ns_per_embedding:samples,
  checksum,outputs,peak_rss_bytes:process.resourceUsage().maxRSS*1024}));
