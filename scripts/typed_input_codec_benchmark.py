"""Retain fresh-process input codec measurements separately from GPU execution."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import subprocess


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('results/generalization/typed-input'));args=parser.parse_args()
    root=args.output;root.mkdir(parents=True,exist_ok=True);runs=[]
    for group in range(3):
        result=subprocess.run(['node','scripts/typed_input_codec_worker.mjs',str(group),str(root)],capture_output=True,text=True,timeout=300)
        if result.returncode:raise RuntimeError(result.stderr[-4000:])
        run=json.loads(result.stdout);runs.append(run);(root/f'codec-{group}.json').write_text(json.dumps(run,indent=2)+'\n');print('codec process',group,flush=True)
    summary=[]
    for i,case in enumerate(runs[0]['records']):
        summary.append({k:case[k]for k in ['carrier','count']}|{'median_ns':{mode:statistics.median(statistics.median(p['records'][i]['samples_ns'][mode])for p in runs)for mode in case['samples_ns']}})
    report={'schema':1,'scope':'Codec phase only: pack, owned capture + GPU/CPU transport materialization, or owned capture + native JS carrier (F32 Array or the existing U32 typed carrier). All output bits checked after every timed batch; outputs retained until checked. Three fresh Node processes rotate mode order. Adaptive warmup counts retained per case. Same frozen descriptor and changed finite input arrays; no inference, uploads or readback timed. These medians must not be added to GPU medians.','codec_sha256':runs[0]['codec_sha256'],'source_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in [Path('scripts/typed_input_codec_worker.mjs'),Path('scripts/typed_input_codec_benchmark.py')]},'summary':summary}
    (root/'codec-report.json').write_text(json.dumps(report,indent=2)+'\n')
    rows=['# Typed input codec phases','',report['scope'],'','| Carrier | Elements | Phase | Before µs | After µs | Before/after |','| --- | ---: | --- | ---: | ---: | ---: |']
    for c in summary:
        for mode in ['pack','capture-gpu','capture-js']:
            a=c['median_ns']['before/'+mode];b=c['median_ns']['after/'+mode];rows.append(f"| {c['carrier']} | {c['count']} | {mode} | {a/1000:.3f} | {b/1000:.3f} | {a/b:.2f}× |")
    (root/'CODEC.md').write_text('\n'.join(rows)+'\n');print('\n'.join(rows))


if __name__=='__main__':main()
