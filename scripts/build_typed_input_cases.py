"""Emit unmodified frozen/model sources; the browser ablates only ABI source."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--compiler',type=Path,required=True);parser.add_argument('--abi-source',type=Path,required=True);args=parser.parse_args()
    compiler_hash=hashlib.sha256(args.compiler.read_bytes()).hexdigest()
    destination=Path('build/generalization/typed-input');destination.mkdir(parents=True,exist_ok=True);rows=[]
    names=['matrix-columns','filter-bank','channel-energy','potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']
    for name in names:
        source=Path('experiments/generalization/sources')/(name+'.ink')if name in names[:3]else Path('build/general')/name/'gpu-model.ink'
        result=subprocess.run([str(args.compiler.resolve()),'build',str(source),'--target','webgpu','-o',str(destination/name)],capture_output=True,text=True,timeout=300)
        if result.returncode:raise RuntimeError(result.stderr[-4000:])
        if (destination/name/'ink-abi.mjs').read_bytes()!=args.abi_source.read_bytes():raise ValueError('emitted ABI differs from the measured candidate: '+name)
        rows.append({'name':name,'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'manifest_sha256':hashlib.sha256((destination/name/'manifest.json').read_bytes()).hexdigest()});print('built',name,flush=True)
    if hashlib.sha256(args.compiler.read_bytes()).hexdigest()!=compiler_hash:raise ValueError('compiler changed during build')
    (destination/'build.json').write_text(json.dumps({'compiler_sha256':compiler_hash,'programs':rows},indent=2)+'\n')


if __name__=='__main__':main()
