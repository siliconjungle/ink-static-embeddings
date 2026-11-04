import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const group=Number(process.argv[2]??0),root=process.argv[3]??'results/generalization/folds',rounds=9,repetitions=20;
const raw=await fs.readFile('work/generalization/inputs.json'),cases=JSON.parse(raw),discovery=JSON.parse(await fs.readFile(root+'/discovery.json','utf8'));
const modules={};
for(const w of discovery.workloads){
 modules[w.name]={literal:await import(pathToFileURL(`${process.cwd()}/${root}/${w.name}/literal.mjs`))};
 for(const index of w.accepted)modules[w.name]['batched-'+index]=await import(pathToFileURL(`${process.cwd()}/${root}/${w.name}/candidate-${index}.mjs`));
}
function output(values){const out=new Float32Array(values.length),words=new Uint32Array(out.buffer);for(let i=0;i<values.length;i++){const x=values[i];if(typeof x==='number')out[i]=x;else words[i]=x.F32Bits;}return out;}
function check(out,expected){const words=new Uint32Array(out.buffer);if(words.length!==expected.length||words.some((v,i)=>v!==expected[i]))throw Error('Output bits differ: '+JSON.stringify({actual:Array.from(words),expected}));}
let sink=0;const reports=[];
for(let index=0;index<cases.length;index++){
 const c=cases[index],measurements={},setup={};
 let modes=Object.entries(modules[c.name]).flatMap(([variant,module])=>[['ordinary',variant,module],['prepared',variant,module]]);
 modes=modes.slice(group%modes.length).concat(modes.slice(0,group%modes.length));if(group%2)modes.reverse();
 const invocations=[];
 for(const [kind,variant,module]of modes){
  const key=variant+'/'+kind,start=performance.now();let invoke;
  if(kind==='ordinary')invoke=args=>output(module.functions.run(...args));
  else{
   const codec=module.compiledValues.run,indices=codec.params.map((_,i)=>i).filter(i=>!c.stable_parameters.includes(i));
   const prepared=module.prepareCompiled('run',c.stable_parameters.map(i=>[i,codec.params[i].capture(c.args[0][i])]));
   invoke=args=>{const values=new Array(c.lanes);module.callPreparedCompiledInto(prepared,indices.map(i=>codec.params[i].capture(args[i])),values);return output(values);};
  }
  setup[key]=(performance.now()-start)*1e6;
  for(let warmup=0;warmup<20;warmup++)check(invoke(c.args[warmup%2]),c.expected_bits[warmup%2]);
  const held=invoke(c.args[0]);held.fill(123);check(invoke(c.args[0]),c.expected_bits[0]);
  invocations.push({key,invoke});measurements[key]=[];
 }
 if(!c.edge){
  for(let round=0;round<rounds;round++){
   const shift=(round+group)%invocations.length,order=invocations.slice(shift).concat(invocations.slice(0,shift));
   for(const {key,invoke}of order){
    const start=performance.now();
    for(let repeat=0;repeat<repetitions;repeat++){const out=invoke(c.args[(round+repeat)%2]);for(const word of new Uint32Array(out.buffer))sink=(sink+word)>>>0;}
    measurements[key].push((performance.now()-start)*1e6/repetitions);
   }
  }
 }
 reports.push({name:c.name,role:c.role,length:c.length,lanes:c.lanes,width:c.width,edge:c.edge,all_bits_exact:true,measurements,setup_ns:setup});
}
console.log(JSON.stringify({schema:1,group,rounds,repetitions,node:process.version,input_sha256:createHash('sha256').update(raw).digest('hex'),reports,sink}));
