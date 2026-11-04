"""Compile literal and checked-optimized variants without modifying Ink."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--toolchain',type=Path,required=True,help='directory containing ink, planner/, knowledge/')
    parser.add_argument('--build',type=Path,default=Path('build'))
    parser.add_argument('--catalogue',type=Path,default=Path('knowledge/laws.json'))
    args=parser.parse_args()
    tc=args.toolchain.resolve();build=args.build.resolve();build.mkdir(exist_ok=True,parents=True)
    sys.path[:0]=[str(tc/'knowledge'),str(tc/'planner')]
    from ink_knowledge import Store, identity
    bundle=json.loads(args.catalogue.read_text())
    for ident,obj in bundle['objects'].items():
        if identity(obj)!=ident:raise ValueError('changed vendored law')
    catalogue=build/'catalogue'
    Store.publish(catalogue,bundle['objects'].values(),bundle['names'])
    env=os.environ.copy()
    env['PYTHONPATH']=os.pathsep.join([str(tc/'knowledge'),str(tc/'planner')])
    ink=str(tc/'ink');source=str(build/'model.ink');core=str(build/'model.core.json')
    commands=[
      ('literal',[ink,'build',source,'--target','javascript','-o',str(build/'literal.mjs')]),
      ('core',[ink,'emit-core',source,'-o',core]),
      ('search',[sys.executable,str(tc/'planner/plan.py'),'--compiler',ink,'--core',core,
        '--snapshot',str(catalogue/'store/snapshot.json'),'--knowledge-root',str(catalogue),
        '--budget','256','--rounds','8','--time-seconds','40','--compact-output',
        '--diagnostics',str(build/'diagnostics.json'),'-o',str(build/'selection.json')]),
      ('check-selection',[ink,'check-selection',core,str(build/'selection.json')]),
      ('optimized',[ink,'build',source,'--selection',str(build/'selection.json'),
        '--target','javascript','-o',str(build/'optimized.mjs')]),
    ]
    phases=[]
    for name,command in commands:
        start=time.perf_counter();result=subprocess.run(command,env=env,text=True,capture_output=True)
        elapsed=time.perf_counter()-start
        (build/f'{name}.log').write_text(result.stdout+result.stderr)
        phases.append({'name':name,'seconds':elapsed,'exit_code':result.returncode})
        print(name,round(elapsed,4),'seconds',flush=True)
        if result.returncode:raise RuntimeError(f'{name} failed: {result.stderr[-3000:]}')
    selection=json.loads((build/'selection.json').read_text())
    result={'schema':1,'phases':phases,'rule_applications':len(selection['applications']),
      'compiler_sha256':hashlib.sha256((tc/'ink').read_bytes()).hexdigest(),
      'source_sha256':hashlib.sha256((build/'model.ink').read_bytes()).hexdigest(),
      'selection_sha256':hashlib.sha256((build/'selection.json').read_bytes()).hexdigest(),
      'literal_bytes':(build/'literal.mjs').stat().st_size,
      'optimized_bytes':(build/'optimized.mjs').stat().st_size,
      'scope':'Existing Ink compiler/planner and vendored existing laws; no Ink modifications.'}
    (build/'compilation.json').write_text(json.dumps(result,indent=2)+'\n')
    print('checked rule applications:',result['rule_applications'])

if __name__=='__main__':main()
