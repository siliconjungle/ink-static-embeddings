"""Build standard native and GPU artifacts using existing Ink/Rust toolchains."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time


def main():
 p=argparse.ArgumentParser();p.add_argument('--toolchain',type=Path,default=Path('work/toolchain'))
 p.add_argument('--cargo',default='cargo');args=p.parse_args()
 root=Path.cwd();ink=str(args.toolchain.resolve()/'ink');dest=root/'results/targets';dest.mkdir(parents=True,exist_ok=True)
 phases=[]
 def run(name,cmd):
  start=time.perf_counter();r=subprocess.run(cmd,text=True,capture_output=True)
  (Path('work')/(name+'.log')).write_text(r.stdout+r.stderr)
  phases.append({'name':name,'seconds':time.perf_counter()-start,'exit_code':r.returncode})
  if r.returncode:raise RuntimeError(r.stderr[-3000:])
  print(name,round(phases[-1]['seconds'],3),'seconds',flush=True);return r.stdout
 run('target-sources',[sys.executable,'scripts/target_variants.py'])
 run('original-rust',[ink,'build','build/model.ink','--selection','build/selection.json','--target','rust','-o','build/rust'])
 run('original-gpu',[ink,'build','build/model.ink','--selection','build/selection.json','--target','webgpu','-o','build/gpu'])
 original=json.load(open('build/gpu/manifest.json'))
 (dest/'original-gpu-eligibility.json').write_text(json.dumps([
  {'function':f['name'],'fallback_reason':f.get('fallback_reason'),'device_graph':f.get('graph')is not None}
  for f in original['functions']],indent=2)+'\n')
 run('owned-rust',[ink,'build','build/native-owned-model.ink','--target','rust','-o','build/rust-owned'])
 run('batch-gpu',[ink,'build','build/batch-model.ink','--target','webgpu','-o','build/gpu-batch'])
 for directory,source,name in [('build/rust','scripts/native_bench.rs','embedding-bench'),
   ('build/rust-owned','scripts/native_batch_bench.rs','native-batch'),
   ('build/gpu-batch/native','scripts/adapter_info.rs','adapter-info')]:
  bindir=Path(directory)/'src/bin';bindir.mkdir(exist_ok=True)
  shutil.copy2(source,bindir/(name+'.rs'))
  lock=Path('artifacts/targets')/({'build/rust':'original-rust','build/rust-owned':'owned-rust','build/gpu-batch/native':'gpu'}[directory]+'.Cargo.lock')
  if lock.exists():shutil.copy2(lock,Path(directory)/'Cargo.lock')
  command=[args.cargo,'build','--release','--manifest-path',str(Path(directory)/'Cargo.toml'),'--bins']
  if lock.exists():command.append('--locked')
  run(name+'-build',command)
 adapter=run('adapter',['build/gpu-batch/native/target/release/adapter-info'])
 (dest/'adapter.json').write_text(adapter)
 original=run('original-rust-probe',['build/rust/target/release/embedding-bench','build','1','1'])
 (dest/'original-rust-probe.json').write_text(original)
 (dest/'build.json').write_text(json.dumps({'phases':phases,
  'compiler_sha256':hashlib.sha256(Path(ink).read_bytes()).hexdigest(),
  'rustc':subprocess.check_output(['rustc','--version'],text=True).strip()},indent=2)+'\n')


if __name__=='__main__':main()
