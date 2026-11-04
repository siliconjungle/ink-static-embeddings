// Same public encode API, fresh queries and complete output consumption.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createJavascriptEncoder} from '../runtime/static-embedding.mjs';
import {createJavascriptEncoder as previous} from '../artifacts/javascript-rows/runtime-before.mjs';

const [mode,roundsText='9',repeatText='100']=process.argv.slice(2),rounds=Number(roundsText),repeat=Number(repeatText);
const dir='build/general/potion-2m',row=dir+'/javascript/packed-rows';
const m=JSON.parse(fs.readFileSync(dir+'/model.json')),bytes=fs.readFileSync(dir+'/weights.f32');
if(createHash('sha256').update(bytes).digest('hex')!==m.weights_sha256)throw Error('Changed weights');
const weights=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),cases=JSON.parse(fs.readFileSync('build/corpus.json')).cases;
const filename=mode==='rows'?row+'/model.mjs':mode==='rows-array'?row+'/array-reference.mjs':dir+'/optimized.mjs';
const module=await import(pathToFileURL(process.cwd()+'/'+filename));
const layout=mode.startsWith('rows')?JSON.parse(fs.readFileSync(row+'/layout.json')):null;
const start=performance.now();
const encoder=(mode==='previous'?previous:createJavascriptEncoder)(module,m,weights,{layout});
const capture_prepare_ms=performance.now()-start;
const outputs=cases.map(c=>Array.from(encoder.encode(c.ids)));
let checksum=0;
for(let k=0;k<150;k++)for(const c of cases)for(const x of encoder.encode(c.ids))checksum+=x;
const buckets={all:cases,empty:cases.filter(c=>!c.ids.length),short:cases.filter(c=>c.ids.length>0&&c.ids.length<=16),
  medium:cases.filter(c=>c.ids.length>16&&c.ids.length<=128),long:cases.filter(c=>c.ids.length>128)};
const samples={};
for(const [bucket,group] of Object.entries(buckets)){
  const times=[];
  for(let round=0;round<rounds;round++){
    const t=performance.now();
    for(let k=0;k<repeat;k++)for(const c of group)for(const x of encoder.encode(c.ids))checksum+=x;
    times.push((performance.now()-t)*1e6/(repeat*group.length));
  }
  samples[bucket]={cases:group.length,samples_ns_per_embedding:times};
}
process.stdout.write(JSON.stringify({mode,node:process.version,capture_prepare_ms,checksum,outputs,samples}));
