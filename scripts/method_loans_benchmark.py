"""Matched compiler comparison on identical checked, frozen fold plans."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import statistics
import subprocess
import sys


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--before',type=Path,required=True)
    parser.add_argument('--after',type=Path,required=True)
    args=parser.parse_args()
    root=Path('results/generalization/method-loans');root.mkdir(parents=True,exist_ok=True)
    original=Path('results/generalization/guarded-folds')
    binaries={}
    for label,compiler in [('before',args.before),('after',args.after)]:
        study=root/('method-loans-'+label);study.mkdir(exist_ok=True)
        for name in ['discovery.json','profile.json','matrix-columns','filter-bank','channel-energy']:
            source=original/name;destination=study/name
            if source.is_dir():shutil.copytree(source,destination,dirs_exist_ok=True)
            else:shutil.copyfile(source,destination)
        result=subprocess.run([sys.executable,'-m','scripts.generalization_rust_benchmark','--compiler',str(compiler),'--study',str(study)],capture_output=True,text=True,timeout=600)
        (root/(label+'-build.log')).write_text(result.stdout+result.stderr)
        if result.returncode:raise RuntimeError(result.stderr[-4000:])
        report=json.loads((study/'rust-report.json').read_text())
        folder=Path('work/generalization')/(study.name+'-rust-bench')
        for ident in report['driver_sha256']:
            binaries[(label,ident)]=folder/'target/release'/ident
        print('built',label,flush=True)
    runs=[];variants=list(binaries)
    for group in range(3):
        order=variants[group%len(variants):]+variants[:group%len(variants)]
        if group%2:order.reverse()
        rows={}
        for label,ident in order:
            result=subprocess.run([str(binaries[(label,ident)])],capture_output=True,text=True,timeout=300)
            if result.returncode:raise RuntimeError(result.stderr[-4000:])
            for row in json.loads(result.stdout)['rows']:
                key=row['index']
                if key not in rows:rows[key]={k:v for k,v in row.items()if k!='modes'}|{'modes':[]}
                for mode in row['modes']:rows[key]['modes'].append(mode|{'mode':label+'/'+mode['mode']})
        run={'group':group,'order':[list(x)for x in order],'rows':[rows[k]for k in sorted(rows)]}
        runs.append(run);(root/f'paired-{group}.json').write_text(json.dumps(run,indent=2)+'\n')
        print('paired process group',group,flush=True)
    summary=[]
    for i,c in enumerate(runs[0]['rows']):
        if c['edge']:continue
        modes={m['mode']:statistics.median(statistics.median(next(x for x in run['rows'][i]['modes']if x['mode']==m['mode'])['samples_ns'])for run in runs)for m in c['modes']}
        summary.append({k:c[k]for k in ['name','length','lanes','width']}|{'median_ns':modes})
    report={'schema':1,'scope':'Matched old/new compiler, identical frozen source, checked plans, Rust toolchain and typed owning boundary. Input clones and complete detached output consumption included. Three fresh groups rotate compiler/variant executable order; each executable validates all output bits, including edge cases. Build, JSON parsing and validation excluded. The guard and source algorithms are unchanged.','compilers':{k:hashlib.sha256(p.read_bytes()).hexdigest()for k,p in [('before',args.before),('after',args.after)]},'summary':summary}
    (root/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    rows=['# Synchronous callback loan comparison','',report['scope'],'','| Program | Variant | Before mean µs | After mean µs | Before/after |','| --- | --- | ---: | ---: | ---: |']
    for name in ['matrix-columns','filter-bank','channel-energy']:
        selected=[c for c in summary if c['name']==name and c['length']and c['lanes']]
        for mode in selected[0]['median_ns']:
            if not mode.startswith('before/'):continue
            variant=mode.split('/')[1]
            before=statistics.mean(c['median_ns'][mode]for c in selected)
            after=statistics.mean(c['median_ns']['after/'+variant]for c in selected)
            rows.append(f'| {name} | {variant} | {before/1000:.3f} | {after/1000:.3f} | {before/after:.2f}× |')
    (root/'REPORT.md').write_text('\n'.join(rows)+'\n');print('\n'.join(rows))


if __name__=='__main__':main()
