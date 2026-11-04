"""Build ordinary Ink producer/consumer programs; never patch emitted shaders."""
import argparse
import json
from pathlib import Path
import subprocess


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--compiler',type=Path,required=True);args=parser.parse_args()
    directory=Path('build/generalization/resident');directory.mkdir(parents=True,exist_ok=True)
    consumers=Path('experiments/generalization/sources/resident-consumers.ink').read_text().split('\n',1)[1]
    records=[]
    for name in ['potion-2m','matrix-columns','filter-bank','channel-energy']:
        original=Path('build/general/potion-2m/gpu-model.ink') if name=='potion-2m' else Path('experiments/generalization/sources')/(name+'.ink')
        source=directory/(name+'.ink');source.write_text(original.read_text()+'\n'+consumers)
        result=subprocess.run([str(args.compiler.resolve()),'build',str(source),'--target','webgpu','-o',str(directory/name)],capture_output=True,text=True,timeout=180)
        if result.returncode:raise RuntimeError(result.stderr[-3000:])
        m=json.loads((directory/name/'manifest.json').read_text());records.append({'name':name,'functions':[{k:f.get(k)for k in ['name','shader','graph_required','fallback_reason']}for f in m['functions']if f['name']in ['run','pool_batch','norm_batch','normalize_batch','similarity','postprocess']]})
        print(name,records[-1],flush=True)
    (directory/'build.json').write_text(json.dumps(records,indent=2)+'\n')


if __name__=='__main__':main()
