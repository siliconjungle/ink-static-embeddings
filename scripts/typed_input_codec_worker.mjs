// Codec-only phase measurements; never added to GPU complete-call medians.
import fs from 'node:fs/promises';import {pathToFileURL}from'node:url';import path from'node:path';import {createHash}from'node:crypto';
const group=Number(process.argv[2]??0),folder=process.argv[3]??'results/generalization/typed-input',root=process.cwd();
const codecs=Object.fromEntries(await Promise.all(['before','after'].map(async name=>[name,await import(pathToFileURL(path.join(root,'artifacts/generalization/typed-input/'+name+'.mjs')))])));
const floatType=Object.freeze({kind:'list',element:Object.freeze({kind:'f32'})}),wordType=Object.freeze({kind:'list',element:Object.freeze({kind:'u32'})}),records=[];
for(const [carrier,count]of [...[0,8,64,512,4096,65536,1889792].map(n=>['typed',n]),...[8,512,4096].map(n=>['array',n]),...[8,512,4096].map(n=>['u32',n])]){
 const word=carrier==='u32',type=word?wordType:floatType;
 const base=word?Uint32Array.from({length:count},(_,i)=>(i*7919)>>>0):Float32Array.from({length:count},(_,i)=>i===0?-0:Math.fround((i%251-125)/127)),other=base.slice();if(count)other[count-1]=word?0xf0000000:Math.fround(.125);
 const inputs=carrier==='array'?[Array.from(base),Array.from(other)]:[base,other],expected=[base,other].map(v=>new Uint32Array(v.buffer));
 const modes=['pack','capture-gpu','capture-js'],order=Object.keys(codecs).flatMap(label=>modes.map(mode=>({label,mode})));if(group%2)order.reverse();
 const samples=Object.fromEntries(order.map(x=>[x.label+'/'+x.mode,[]])),repetitions=count>65536?1:count>4096?2:count>512?4:32;
 function invoke({label,mode},input){const codec=codecs[label];if(mode==='pack')return codec.pack(input,type);const preferred=mode==='capture-gpu'&&codec.captureTransport&&ArrayBuffer.isView(input)&&!word;const c=(preferred?codec.captureTransport:codec.capture)(input,type);return mode==='capture-gpu'?{words:c.words??codec.pack(c.javascript,type).words,count:c.count,finite:c.finite}:{javascript:c.javascript,count:c.count,finite:c.finite};}
 function check(out,which){if(out.count!==count||!out.finite)throw Error('metadata');const words=out.words??(word?Uint32Array.from(out.javascript):new Uint32Array(Float32Array.from(out.javascript).buffer));if(words.length!==count||words.some((x,i)=>x!==expected[which][i]))throw Error('input bits differ');if(out.javascript&&!Array.isArray(out.javascript)&&!(word&&out.javascript instanceof Uint32Array))throw Error('public native carrier changed');}
 const warmups=count<=64?1000:count<=512?256:count<=65536?12:3;
 for(const mode of order)for(let i=0;i<warmups;i++)check(invoke(mode,inputs[i%2]),i%2);
 for(let round=0;round<7;round++){
  for(const mode of order){const output=[];const start=process.hrtime.bigint();for(let i=0;i<repetitions;i++)output.push(invoke(mode,inputs[(round+i)%2]));samples[mode.label+'/'+mode.mode].push(Number(process.hrtime.bigint()-start)/repetitions);for(let i=0;i<output.length;i++)check(output[i],(round+i)%2);}
  order.push(order.shift());
 }
 records.push({carrier,count,repetitions,warmups,samples_ns:samples,all_bits_exact:true});
}
const hashes={};for(const name of ['before','after'])hashes[name]=createHash('sha256').update(await fs.readFile('artifacts/generalization/typed-input/'+name+'.mjs')).digest('hex');
console.log(JSON.stringify({group,node:process.version,records,codec_sha256:hashes}));
