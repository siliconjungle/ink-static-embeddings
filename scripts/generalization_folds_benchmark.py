"""Matched ordinary/prepared controls on frozen unrelated workloads."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import subprocess

from scripts.generalization_inputs import cases


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--processes',type=int,default=3);parser.add_argument('--study',type=Path,default=Path('results/generalization/folds'));args=parser.parse_args()
    destination=args.study;inputs=Path('work/generalization/inputs.json')
    inputs.write_text(json.dumps(cases(),separators=(',',':'))+'\n')
    runs=[]
    for group in range(args.processes):
        result=subprocess.run(['node','scripts/generalization_folds_worker.mjs',str(group),str(destination)],capture_output=True,text=True,timeout=300)
        if result.returncode:raise RuntimeError(result.stderr[-4000:])
        run=json.loads(result.stdout);runs.append(run)
        (destination/f'measurement-{group}.json').write_text(json.dumps(run,indent=2)+'\n')
        print('completed process',group,flush=True)
    summary=[]
    first=runs[0]
    for index,case in enumerate(first['reports']):
        if case['edge']:continue
        metrics={mode:statistics.median(statistics.median(r['reports'][index]['measurements'][mode])for r in runs)for mode in case['measurements']}
        summary.append({k:case[k]for k in ['name','role','length','lanes','width']}|{'median_ns':metrics})
    report={'schema':1,'scope':'Frozen unrelated source, existing checked general independent-fold knowledge, same compiler. All results bit-exact to independent ordered F32, including edge cases and changed query order. Complete detached output consumed. Ordinary versus prepared modes retain different ingress/setup contracts and are compared within their own kind. Warm capture/preparation excluded and reported separately. No source rewrite is automatically profitable.','processes':args.processes,'summary':summary,'input_sha256':first['input_sha256'],'source_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in [Path('scripts/generalization_inputs.py'),Path('scripts/generalization_folds_worker.mjs'),Path('scripts/generalization_folds_benchmark.py')]}}
    (destination/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    rows=['# General independent-fold experiment','',report['scope'],'','| Workload | Boundary | Mean latency across nonempty frozen cases, literal µs | Batched µs | Literal/batched |','| --- | --- | ---: | ---: | ---: |']
    for name in ['matrix-columns','filter-bank','channel-energy']:
        selected=[r for r in summary if r['name']==name and r['length']and r['lanes']]
        modes=selected[0]['median_ns']
        for mode in modes:
            if mode.startswith('literal/'):continue
            kind=mode.split('/')[1];baseline=statistics.mean(r['median_ns']['literal/'+kind]for r in selected);candidate=statistics.mean(r['median_ns'][mode]for r in selected)
            rows.append(f'| {name} | {mode} | {baseline/1000:.3f} | {candidate/1000:.3f} | {baseline/candidate:.2f}× |')
    (destination/'REPORT.md').write_text('\n'.join(rows)+'\n');print('\n'.join(rows))


if __name__=='__main__':main()
