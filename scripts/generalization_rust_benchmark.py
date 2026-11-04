"""Measure the same replayed fold candidates through typed owning Rust calls."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import statistics
import subprocess


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--compiler',type=Path,required=True);parser.add_argument('--processes',type=int,default=3);parser.add_argument('--study',type=Path,default=Path('results/generalization/folds'));args=parser.parse_args()
    compiler=str(args.compiler.resolve());destination=args.study;project=Path('work/generalization')/(destination.name+'-rust-bench');project.mkdir(exist_ok=True)
    discovery=json.loads((destination/'discovery.json').read_text());declarations=[];functions=[];variants=[]
    def invoke(*command):
        result=subprocess.run(list(map(str,command)),capture_output=True,text=True,timeout=300)
        if result.returncode:raise RuntimeError(result.stderr[-4000:])
        return result.stdout
    for w in discovery['workloads']:
        source=Path('experiments/generalization/sources')/(w['name']+'.ink');name=w['name'].replace('-','_')
        folder=project/'src'/name
        invoke(compiler,'build',source,'--target','rust','-o',project/('seed-'+name))
        seed=project/('seed-'+name)
        folder.mkdir(parents=True,exist_ok=True)
        for p in (seed/'src').glob('*.rs'):shutil.copyfile(p,folder/p.name)
        if not (project/'Cargo.toml').exists():shutil.copyfile(seed/'Cargo.toml',project/'Cargo.toml')
        for variant,index in [('literal',None)]+[(f'batched_{i}',i)for i in w['accepted']]:
            ident=name+'_'+variant;output=folder/(variant+'.rs')
            if index is None:shutil.copyfile(seed/'src/lib.rs',output)
            else:
                plan=destination/w['name']/f'candidate-{index}.json'
                invoke(compiler,'check-plan',source,plan,'--target','rust')
                invoke(compiler,'compile',source,'--plan',plan,'--target','rust','-o',output)
            declarations.append(f'#[path="{name}/{variant}.rs"] mod {ident};')
            types={'matrix-columns':['Vec<f32>','Vec<u32>','Vec<u32>','u32'],'filter-bank':['Vec<f32>','Vec<f32>'],'channel-energy':[f'Vec<{ident}::l_Pixel>','Vec<u32>']}[w['name']]
            bindings='\n'.join(f'let a{i}:Vec<{ty}>=case["args"].as_array().unwrap().iter().map(|args|<{ty} as {ident}::Wire>::from_json(&args[{i}]).unwrap()).collect();'for i,ty in enumerate(types))
            call=f'state.function_l_run('+','.join(f'black_box(a{i}[which].clone())'for i in range(len(types)))+')'
            functions.append(f'''fn bench_{ident}(case:&Value)->Value{{
let state={ident}::State::new();{bindings}
let invoke=|which:usize|{call};
let check=|values:&[f32],which:usize|{{let expected=case["expected_bits"][which].as_array().unwrap();assert_eq!(values.len(),expected.len());for(i,x)in values.iter().enumerate(){{assert_eq!(x.to_bits(),expected[i].as_u64().unwrap()as u32,"case {{:?}} index {{}}",case["name"],i);}}}};
for i in 0..20{{check(&invoke(i%2),i%2);}}
let mut samples=Vec::new();let mut sink=0u32;
if !case["edge"].as_bool().unwrap(){{for round in 0..9{{let start=Instant::now();for repeat in 0..100{{for value in invoke((round+repeat)%2){{sink=sink.wrapping_add(black_box(value.to_bits()));}}}}samples.push(start.elapsed().as_nanos()as f64/100.0);}}}}
check(&invoke(0),0);json!({{"mode":"{variant}","samples_ns":samples,"sink":sink,"all_bits_exact":true}})
}}''')
            variants.append((w['name'],ident))
    choices='\n'.join(f'"{name}"=>{{let mut modes:Vec<fn(&Value)->Value>=vec!['+','.join(f'bench_{ident}'for n,ident in variants if n==name)+'];let count=modes.len();modes.rotate_left(group%count);if group%2==1{modes.reverse();}modes.into_iter().map(|f|f(case)).collect::<Vec<_>>()},'for name in dict.fromkeys(n for n,_ in variants))
    drivers={};bindir=project/'src/bin';bindir.mkdir(exist_ok=True)
    for (name,ident),declaration,function in zip(variants,declarations,functions):
        driver='use std::{fs,hint::black_box,time::Instant};use serde_json::{Value,json};\n'+declaration.replace('#[path="','#[path="../')+'\n'+function+'''
fn main(){let cases:Value=serde_json::from_slice(&fs::read("work/generalization/inputs.json").unwrap()).unwrap();let rows:Vec<Value>=cases.as_array().unwrap().iter().enumerate().filter(|(_,case)|case["name"]=="'''+name+'''").map(|(index,case)|{let value=bench_'''+ident+'''(case);json!({"index":index,"name":case["name"],"length":case["length"],"lanes":case["lanes"],"width":case["width"],"edge":case["edge"],"modes":[value]})}).collect();println!("{}",json!({"rows":rows}));}
'''
        (bindir/(ident+'.rs')).write_text(driver);drivers[ident]=hashlib.sha256(driver.encode()).hexdigest()
    (project/'src/main.rs').write_text('fn main(){}\n')
    # The generated template package has its own library/main declarations;
    # this driver is the only needed crate entry for these typed calls.
    (project/'src/lib.rs').write_text('// Benchmark driver owns its generated modules.\n')
    invoke('cargo','build','--release','--bins','--jobs','2','--manifest-path',project/'Cargo.toml')
    runs=[]
    for group in range(args.processes):
        ordered=variants[group%len(variants):]+variants[:group%len(variants)]
        if group%2:ordered=list(reversed(ordered))
        rows={}
        for _,ident in ordered:
            data=json.loads(invoke(project/'target/release'/ident))
            for row in data['rows']:
                if row['index'] not in rows:rows[row['index']]=row
                else:rows[row['index']]['modes']+=row['modes']
        run=dict(group=group,rows=[rows[k]for k in sorted(rows)])
        runs.append(run);(destination/f'rust-{group}.json').write_text(json.dumps(run,indent=2)+'\n');print('Rust process',group,flush=True)
    summary=[]
    for index,row in enumerate(runs[0]['rows']):
        if row['edge']:continue
        modes={m['mode']:statistics.median(statistics.median(next(x for x in r['rows'][index]['modes']if x['mode']==m['mode'])['samples_ns'])for r in runs)for m in row['modes']}
        summary.append({k:row[k]for k in ['name','length','lanes','width']}|{'median_ns':modes})
    report={'scope':'Same checked source/plan candidates, generated Rust typed owning API. Input vector clones and detached complete output consumption included; JSON parsing, build and validation excluded. No borrowed/prepared Rust claim. Each target owns a fresh executable/process; their order rotates between groups.','processes':args.processes,'rustc':invoke('rustc','--version').strip(),'driver_sha256':drivers,'summary':summary}
    (destination/'rust-report.json').write_text(json.dumps(report,indent=2)+'\n')
    rows=['# Rust independent-fold experiment','',report['scope'],'','| Workload | Candidate | Literal mean µs | Candidate mean µs | Literal/candidate |','| --- | --- | ---: | ---: | ---: |']
    for name in dict.fromkeys(r['name']for r in summary):
        selected=[r for r in summary if r['name']==name and r['length']and r['lanes']]
        for mode in selected[0]['median_ns']:
            if mode=='literal':continue
            base=statistics.mean(r['median_ns']['literal']for r in selected);candidate=statistics.mean(r['median_ns'][mode]for r in selected)
            rows.append(f'| {name} | {mode} | {base/1000:.3f} | {candidate/1000:.3f} | {base/candidate:.2f}× |')
    (destination/'RUST.md').write_text('\n'.join(rows)+'\n');print('\n'.join(rows))


if __name__=='__main__':main()
