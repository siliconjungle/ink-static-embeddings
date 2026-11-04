"""Same-source GPU bundles for boundary ablations and unrelated capability checks."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--compiler',type=Path,required=True);args=parser.parse_args()
    compiler=args.compiler.resolve();destination=Path('build/generalization/gpu');destination.mkdir(parents=True,exist_ok=True)
    reports=[]
    for name in ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']:
        original=Path('build/general')/name;output=destination/name
        command=[str(compiler),'build',str(original/'gpu-model.ink'),'--target','webgpu','-o',str(output)]
        result=subprocess.run(command,capture_output=True,text=True,timeout=180)
        if result.returncode:raise RuntimeError(result.stderr[-3000:])
        before=json.loads((original/'webgpu/manifest.json').read_text());after=json.loads((output/'manifest.json').read_text())
        names=['pool_batch','norm_batch','normalize_batch']
        bound=[]
        for function in names:
            old=next(f for f in before['functions']if f['name']==function);new=next(f for f in after['functions']if f['name']==function)
            a=(original/'webgpu'/old['shader']).read_bytes();b=(output/new['shader']).read_bytes()
            if a!=b:raise ValueError('Boundary study changed shader '+name+'/'+function)
            bound.append({'function':function,'sha256':hashlib.sha256(a).hexdigest()})
        reports.append(dict(name=name,shader_identity=bound,same_source=True,same_entry_shaders=True));print(name,'same Ink shaders',flush=True)
    for name in ['matrix-columns','filter-bank','channel-energy']:
        source=Path('experiments/generalization/sources')/(name+'.ink');output=destination/name
        r=subprocess.run([str(compiler),'build',str(source),'--target','webgpu','-o',str(output)],capture_output=True,text=True,timeout=180)
        if r.returncode:raise RuntimeError(r.stderr[-3000:])
        m=json.loads((output/'manifest.json').read_text());f=next(f for f in m['functions']if f['name']=='run')
        reports.append(dict(name=name,fallback_reason=f.get('fallback_reason'),graph_required=f.get('graph_required'),shader=f.get('shader')));print(name,reports[-1],flush=True)
    report=dict(schema=1,compiler_sha256=hashlib.sha256(compiler.read_bytes()).hexdigest(),workloads=reports)
    folder=Path('results/generalization/gpu-boundary');folder.mkdir(parents=True,exist_ok=True)
    (folder/'build.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__':main()
