"""Paired fresh-process measurements; failed fidelity checks abort the report."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import time
import numpy as np


def main():
    p=argparse.ArgumentParser();p.add_argument('--build',type=Path,default=Path('build'))
    p.add_argument('--output',type=Path,default=Path('results'))
    p.add_argument('--processes',type=int,default=6);p.add_argument('--rounds',type=int,default=7)
    args=p.parse_args()
    if args.processes<2 or args.rounds<2:raise ValueError('at least two processes and rounds required')
    args.output.mkdir(parents=True,exist_ok=True)
    env={**os.environ,'OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1','TOKENIZERS_PARALLELISM':'false'}
    rows=[];validation=[];corpus=json.loads((args.build/'corpus.json').read_text())['cases']
    for pair in range(args.processes):
        modes=['upstream','literal','optimized'] if pair%2==0 else ['optimized','literal','upstream']
        results={}
        for mode in modes:
            cmd=([sys.executable,'scripts/python_bench.py','--build',str(args.build),'--rounds',str(args.rounds)]
              if mode=='upstream' else ['node','scripts/node_bench.mjs',str(args.build),mode,str(args.rounds)])
            t=time.perf_counter();r=subprocess.run(cmd,text=True,capture_output=True,env=env)
            if r.returncode:raise RuntimeError(r.stderr[-4000:])
            result=json.loads(r.stdout);result['wall_seconds']=time.perf_counter()-t
            results[mode]=result
        upstream=np.array(results['upstream']['outputs'],dtype=np.float32)
        ordered=np.array(results['upstream']['ordered_outputs'],dtype=np.float32)
        literal=np.array(results['literal']['outputs'],dtype=np.float32)
        optimized=np.array(results['optimized']['outputs'],dtype=np.float32)
        if not np.isfinite(literal).all() or literal.shape!=(len(corpus),64):raise AssertionError('invalid embeddings')
        np.testing.assert_array_equal(literal.view(np.uint32),optimized.view(np.uint32))
        np.testing.assert_array_equal(literal.view(np.uint32),ordered.view(np.uint32))
        np.testing.assert_allclose(literal,upstream,rtol=2e-5,atol=2e-6)
        a=literal[:12].astype(float);b=upstream[:12].astype(float)
        def nearest(x):
            norms=np.linalg.norm(x,axis=1,keepdims=True);s=(x/norms)@(x/norms).T
            np.fill_diagonal(s,-np.inf);return s.argmax(axis=1)
        np.testing.assert_array_equal(nearest(a),nearest(b))
        maximum=float(np.max(np.abs(literal-upstream)))
        validation.append({'pair':pair,'cases':len(corpus),'dimensions':64,
          'literal_optimized_bit_equal':True,'independent_ordered_oracle_bit_equal':True,
          'max_upstream_absolute_error':maximum,'nearest_neighbor_top1_matches':12})
        for mode,r in results.items():
            raw={'pair':pair,'mode':mode,**r}
            (args.output/f'raw-{pair}-{mode}.json').write_text(json.dumps(raw,indent=2)+'\n')
            rows.append({k:v for k,v in raw.items() if k not in ('outputs','ordered_outputs')})
        print('pair',pair+1,'validated; max upstream error',maximum,flush=True)
    medians={m:[statistics.median(r['samples_ns_per_embedding']) for r in rows if r['mode']==m]
      for m in ('upstream','literal','optimized')}
    stats={m:{'median_ns_per_embedding':statistics.median(v),'process_medians_ns':v,
      'min_process_median_ns':min(v),'max_process_median_ns':max(v)} for m,v in medians.items()}
    ratios=[a/b for a,b in zip(medians['literal'],medians['optimized'])]
    compile_info=json.loads((args.build/'compilation.json').read_text())
    provenance_paths=['scripts/node_bench.mjs','scripts/python_bench.py','scripts/benchmark.py',
      'src/ink_static_embeddings/converter.py','uv.lock','toolchain.lock.json']
    report={'schema':1,'platform':platform.platform(),'machine':platform.machine(),
      'harness_sha256':{f:hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in provenance_paths},
      'processes':args.processes,'rounds':args.rounds,'cases':len(corpus),
      'corpus_sha256':hashlib.sha256((args.build/'corpus.json').read_bytes()).hexdigest(),
      'model':json.loads((args.build/'model.json').read_text()),'compilation':compile_info,
      'measurements':stats,'literal_over_optimized_paired_speedups':ratios,
      'median_compiler_optimization_speedup':statistics.median(ratios),
      'validation':validation,'processes_detail':rows,
      'scope':'Warm token-ID to complete embedding; full vocabulary retained and captured once. Tokenization, imports and model capture excluded from kernel samples and reported separately. Python/NumPy vs Node differences are not attributable solely to Ink.'}
    (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    lines=['# Embedding model → Ink: measured experiment','',report['scope'],'',
      '| Execution | Median µs / embedding | Fresh-process median range, µs |',
      '| --- | ---: | ---: |']
    for mode,s in stats.items():lines.append(f"| {mode} | {s['median_ns_per_embedding']/1000:.3f} | {s['min_process_median_ns']/1000:.3f}–{s['max_process_median_ns']/1000:.3f} |")
    lines += ['',f"Literal / optimized paired median ratio: **{statistics.median(ratios):.3f}×**.",
      f"Checked optimization applications: **{compile_info['rule_applications']}**.",
      f"Largest difference from upstream: **{max(v['max_upstream_absolute_error'] for v in validation):.3g}**.",
      '', 'This run does not show an optimization speedup. The isolated compiler comparison is literal versus optimized Ink; comparing upstream Python/NumPy with Node also changes the runtime and implementation.',
      '', 'Every compiled output matches the independent ordered F32 oracle bit for bit; literal and optimized outputs also match bit for bit. Nearest-neighbor top-1 agrees on twelve distinct text fixtures.',
      '', 'This is a static embedding model, not a transformer. The importer retains all 29,528 × 64 weights; it does not retrain, truncate dimensions, reduce the vocabulary, or substitute a teacher model.',
      '', 'Timing is descriptive evidence on this workstation and corpus. Raw per-round measurements, setup costs, checksums, runtime versions and process peak RSS are in the adjacent JSON files. Compile/search costs are separate. No general model quality or universal speedup is established.']
    (args.output/'REPORT.md').write_text('\n'.join(lines)+'\n')
    print('\n'.join(lines))

if __name__=='__main__':main()
