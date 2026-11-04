"""Compile two authored Ink layouts to Rust/Wasm with resident model storage.

The quads variant groups independent dimensions in Vec4 values. It is an
authored source variant, not a newly proof-selected compiler optimization.
Both variants use the existing checked read-only parameter plan.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from ink_static_embeddings.static_model import literal_tree, normalization_source


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def quad_source(manifest):
    d=manifest['dimensions'];shards=manifest['shards']
    params=','.join(f'{s["name"]}:List<f32>' for s in shards)
    names=','.join(s['name'] for s in shards)
    zero='vec4(0.0,0.0,0.0,0.0)'
    lanes=['x','y','z','w']
    sums=','.join(f'acc.{lane}+choose(base+{i}<{d},lookup({names},id*{d}+base+{i}),0.0)' for i,lane in enumerate(lanes))
    means=','.join(f'acc.{lane}/f32_from_u32(length(ids))' for lane in lanes)
    norm=normalization_source(manifest['normalization'])
    select='choose(lane==0,q.x,choose(lane==1,q.y,choose(lane==2,q.z,q.w)))'
    return f'''
fn quad_mean({params},ids:List<u32>,base:u32)->Vec4<f32>{{
 let acc=foldl(ids,{zero},fn(id)=>fn(acc)=>vec4({sums}));
 return vec4({means});
}}
fn quad_lane(q:Vec4<f32>,lane:u32)->f32{{return {select};}}
fn encode_quads({params},ids:List<u32>)->List<f32>{{
 if length(ids)==0{{return coordinates().map(fn(d)=>0.0);}}
 let groups:List<u32>={literal_tree(list(range(0,d,4)))};
 let quads=groups.map(fn(base)=>quad_mean({names},ids,base));
 let mean=coordinates().map(fn(d)=>quad_lane(quads.at_or(quot_or(d,4,0),{zero}),rem_or(d,4,0)));
 {norm}
}}
'''


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--build',type=Path,required=True)
    p.add_argument('--toolchain',type=Path,default=Path('work/js-toolchain'))
    args=p.parse_args();build=args.build.resolve();tc=args.toolchain.resolve();ink=tc/'ink'
    m=json.loads((build/'model.json').read_text())
    if m['schema']!=2:raise ValueError('Wasm generation requires a schema-2 import')
    dest=build/'wasm';dest.mkdir(exist_ok=True)
    source=dest/'model.ink';source.write_text((build/'model.ink').read_text()+quad_source(m))
    def run(command):
        r=subprocess.run(list(map(str,command)),capture_output=True,text=True)
        with (dest/'build.log').open('a') as log:log.write(r.stdout+r.stderr)
        if r.returncode:raise RuntimeError(r.stderr[-4000:])
        return r.stdout
    (dest/'build.log').write_text('')
    run([ink,'emit-core',source,'-o',dest/'model.core.json'])
    run([ink,'emit-semantic',dest/'model.core.json','--core','-o',dest/'subject.json'])
    sys.path[:0]=[str(tc/'knowledge')]
    from producers.readonly_borrows import scoped_candidates
    core=json.loads((dest/'model.core.json').read_text());subject=json.loads((dest/'subject.json').read_text())
    candidate=next(scoped_candidates({'core':core,'source':subject['input_core_sha256'],'emit_target':'rust'},strategies=['aggregate-observations']))
    plan={'schema':1,'semantics':'ink-compiled-plan-v1','input_core_sha256':subject['input_core_sha256'],'steps':[candidate['step']]}
    (dest/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
    run([ink,'check-plan',source,dest/'plan.json'])
    generated=dest/'ink-rust'
    run([ink,'build',source,'--target','rust','-o',generated])
    run([ink,'compile',source,'--plan',dest/'plan.json','--target','rust','-o',generated/'src/lib.rs'])
    rust=(generated/'src/lib.rs').read_text()
    for name in ['encode','encode_quads']:
        if f'pub fn ink_borrowed_function_l_{name}(' not in rust:raise ValueError(f'No checked borrowing entrypoint for {name}')
    (dest/'src').mkdir(exist_ok=True)
    template=Path('wasm/resident.rs').read_text()
    substitutions={'__PARAMETERS__':str(m['parameters']),'__DIMENSIONS__':str(m['dimensions']),
       '__VOCABULARY__':str(m['vocabulary_size']),
       '__SHARD_ENDS__':','.join(str(s['offset']+s['elements']) for s in m['shards']),
       '__SHARD_ARGUMENTS__':','.join(f'&m.shards[{i}]' for i in range(len(m['shards']))),
       '__SOURCE_WORDS__':','.join(str(int(m['source_sha256'][i:i+8],16)) for i in range(0,64,8))}
    for key,value in substitutions.items():template=template.replace(key,value)
    (dest/'src/lib.rs').write_text(template)
    (dest/'Cargo.toml').write_text('''[package]
name="ink-static-embedding-wasm"
version="0.1.0"
edition="2021"
[lib]
crate-type=["cdylib"]
[dependencies]
compiled-state={path="ink-rust"}
[workspace]
exclude=["ink-rust"]
[profile.release]
opt-level=3
lto="thin"
codegen-units=1
panic="abort"
strip=true
''')
    env=os.environ.copy();env['RUSTFLAGS']='-C target-feature=+simd128 -C link-arg=--max-memory=536870912'
    env['CARGO_TARGET_DIR']=str(Path('work/wasm-target').resolve())
    command=['cargo','build','--release','--target','wasm32-unknown-unknown','--manifest-path',str(dest/'Cargo.toml')]
    r=subprocess.run(command,env=env,capture_output=True,text=True)
    with (dest/'build.log').open('a') as log:log.write(r.stdout+r.stderr)
    if r.returncode:raise RuntimeError(r.stderr[-4000:])
    binary=Path(env['CARGO_TARGET_DIR'])/'wasm32-unknown-unknown/release/ink_static_embedding_wasm.wasm'
    import shutil
    shutil.copyfile(binary,dest/'model.wasm')
    receipt={'schema':1,'scope':__doc__,'model_id':m['model_id'],'source_sha256':m['source_sha256'],
       'quad_source_sha256':sha(source),'compiler_sha256':sha(ink),'wasm_sha256':sha(dest/'model.wasm'),
       'rust_sha256':sha(generated/'src/lib.rs'),'plan_sha256':sha(dest/'plan.json'),
       'rustc':subprocess.check_output(['rustc','-Vv'],text=True),'rustflags':env['RUSTFLAGS'],
       'wasm_bytes':binary.stat().st_size,'variants':['ink','ink-quads'],'simd_status':'Compile-time enabled; instruction coverage must be inspected separately.'}
    (dest/'build.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))


if __name__=='__main__':main()
