"""Copy pinned, committed auxiliary tools and an existing compiler privately.

Build Ink normally before this step. No source, package pin, or knowledge store
in the supplied distribution is modified. Binary provenance is recorded rather
than assuming a reproducible Rust binary across machines.
"""
import argparse
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile


def main():
    p=argparse.ArgumentParser();p.add_argument('distribution',type=Path)
    p.add_argument('--lock',type=Path,default=Path('toolchain.lock.json'))
    p.add_argument('--output',type=Path,default=Path('work/toolchain'));args=p.parse_args()
    lock=json.loads(args.lock.read_text());root=args.distribution.resolve()
    for folder,expected in [('.',lock['ink_revision']),('planner',lock['planner_revision']),('knowledge',lock['knowledge_revision'])]:
        actual=subprocess.check_output(['git','-C',str(root/folder),'rev-parse','HEAD'],text=True).strip()
        if actual!=expected:raise ValueError(f'{folder}: expected {expected}, got {actual}')
    if args.output.exists():raise ValueError('choose a new toolchain directory')
    args.output.mkdir(parents=True)
    shutil.copy2(root/'target/release/ink',args.output/'ink')
    for folder,paths in [('planner',['ink_planner','plan.py','compile_plan.py']),
                         ('knowledge',['ink_knowledge','producers','libraries'])]:
        data=subprocess.check_output(['git','-C',str(root/folder),'archive','HEAD',*paths])
        destination=args.output/folder;destination.mkdir()
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:archive.extractall(destination,filter='data')
    print(args.output.resolve())

if __name__=='__main__':main()
