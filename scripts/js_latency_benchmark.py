"""Fresh-process CPU comparison on the retained 64-query, 64-dimension fixture.

Tokenization, loading and immutable-weight preparation are outside steady state.
Each timed call consumes all output dimensions. This measures single-query
latency, not batch throughput. NumPy retains its own reduction order; generated
JavaScript must match the independent ordered-F32 oracle exactly.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import time

import numpy as np


def numpy_worker(rounds, repetitions):
    from model2vec import StaticModel
    start=time.perf_counter()
    model=StaticModel.from_pretrained('work/model')
    loaded=time.perf_counter()
    cases=json.loads(Path('build/corpus.json').read_text())['cases']
    def encode(ids):
        if not ids:return np.zeros(model.dim,dtype=np.float32)
        mean=model._encode_helper(ids).mean(axis=0)
        return mean/(np.linalg.norm(mean)+np.float32(1e-32))
    outputs=[encode(c['ids']).tolist() for c in cases]
    checksum=0.0
    for _ in range(150):
        for c in cases:checksum+=float(encode(c['ids']).sum(dtype=np.float64))
    buckets={'all':cases,'empty':[c for c in cases if not c['ids']],
             'short':[c for c in cases if 0<len(c['ids'])<=16],
             'medium':[c for c in cases if 16<len(c['ids'])<=128],
             'long':[c for c in cases if len(c['ids'])>128]}
    samples={}
    for name,group in buckets.items():
        times=[]
        for _ in range(rounds):
            t=time.perf_counter_ns()
            for _ in range(repetitions):
                for c in group:checksum+=float(encode(c['ids']).sum(dtype=np.float64))
            times.append((time.perf_counter_ns()-t)/(len(group)*repetitions))
        samples[name]={'cases':len(group),'samples_ns_per_embedding':times}
    return {'numpy':np.__version__,'python':sys.version,'model_load_ms':(loaded-start)*1000,
            'checksum':checksum,'outputs':outputs,'samples':samples}


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--worker',action='store_true')
    p.add_argument('--rounds',type=int,default=9)
    p.add_argument('--repetitions',type=int,default=100)
    p.add_argument('--groups',type=int,default=6)
    p.add_argument('--before',type=Path,default=Path('build/compiler-optimized.mjs'))
    p.add_argument('--after',type=Path,default=Path('build/js-dense-inline.mjs'))
    p.add_argument('--output',type=Path,default=Path('results/javascript'))
    args=p.parse_args()
    if args.worker:
        print(json.dumps(numpy_worker(args.rounds,args.repetitions)));return
    dest=args.output;dest.mkdir(parents=True,exist_ok=True)
    oracle=np.array(json.loads(Path('results/raw-0-upstream.json').read_text())['ordered_outputs'],np.float32)
    processes=[]
    for group in range(args.groups):
        modes=['numpy','before','after']
        # Rotate and reverse execution order across otherwise independent processes.
        modes=modes[group%3:]+modes[:group%3]
        if group%2:modes.reverse()
        for mode in modes:
            if mode=='numpy':
                command=[sys.executable,__file__,'--worker','--rounds',str(args.rounds),'--repetitions',str(args.repetitions)]
            else:
                command=['node','scripts/js_latency_worker.mjs',str(getattr(args,mode).resolve()),str(args.rounds),str(args.repetitions)]
            data=json.loads(subprocess.check_output(command,text=True,timeout=180))
            outputs=np.array(data.pop('outputs'),np.float32)
            if mode=='numpy':np.testing.assert_allclose(outputs,oracle,rtol=2e-6,atol=2e-7)
            else:np.testing.assert_array_equal(outputs.view(np.uint32),oracle.view(np.uint32))
            data.update(group=group,mode=mode,output_sha256=hashlib.sha256(outputs.tobytes()).hexdigest(),
                        output_check='tolerance' if mode=='numpy' else 'bit-exact')
            (dest/f'{group}-{mode}.json').write_text(json.dumps(data,indent=2)+'\n')
            processes.append(data)
            print(f'{group} {mode}: {statistics.median(data["samples"]["all"]["samples_ns_per_embedding"])/1000:.3f} us',flush=True)
    aggregate={bucket:{mode:statistics.median(statistics.median(d['samples'][bucket]['samples_ns_per_embedding'])
                    for d in processes if d['mode']==mode) for mode in ['numpy','before','after']}
               for bucket in ['all','empty','short','medium','long']}
    files=[args.before,args.after,Path('build/model.ink'),Path('build/model.json'),Path('build/weights.f32'),
           Path('build/corpus.json'),Path('results/compiler/selection.json'),Path(__file__),Path('scripts/js_latency_worker.mjs')]
    setup={mode:statistics.median(d['weight_capture_prepare_ms'] for d in processes if d['mode']==mode)
           for mode in ['before','after']}
    report={'scope':__doc__,'platform':platform.platform(),'processor':platform.processor(),
            'groups':args.groups,'rounds':args.rounds,'repetitions':args.repetitions,
            'median_ns_per_embedding':aggregate,'javascript_weight_capture_prepare_ms':setup,
            'file_sha256':{str(f.resolve().relative_to(Path.cwd())):sha(f) for f in files}}
    (dest/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    lines=['# JavaScript CPU latency','',__doc__.strip(),'',
           'Median of process medians; times in microseconds per embedding. Before/after use the same Ink source, checked selection and weights.',
           '', '| Input length | NumPy | JS before | JS after | Before / after | NumPy / JS after |',
           '| --- | ---: | ---: | ---: | ---: | ---: |']
    for name,v in aggregate.items():
        lines.append(f'| {name} | {v["numpy"]/1000:.3f} | {v["before"]/1000:.3f} | {v["after"]/1000:.3f} | {v["before"]/v["after"]:.2f}× | {v["numpy"]/v["after"]:.2f}× |')
    lines+=['', 'Short = 1–16 tokens; medium = 17–128; long = 129–512. Empty is reported separately. All generated outputs are bit-exact against the independent oracle; NumPy is checked with rtol=2e-6, atol=2e-7.',
            '', 'Each JavaScript call captures changing IDs and writes a reused caller destination. NumPy allocates its ordinary result. Both consume every output using their runtime’s ordinary sum/iteration. These are CPU latency comparisons across runtimes, not identical machine-code kernels or GPU/batch measurements. Raw files retain loading/preparation costs.',
            '', f'One-time JavaScript weight capture/preparation increases from {setup["before"]:.2f} to {setup["after"]:.2f} ms. Dense storage adds a private conversion after ordinary validation; this cost is excluded from the warm latency table.']
    (dest/'REPORT.md').write_text('\n'.join(lines)+'\n')
    print('\n'.join(lines))


if __name__=='__main__':main()
