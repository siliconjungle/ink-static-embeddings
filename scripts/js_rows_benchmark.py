"""Matched CPU latency: NumPy, previous/current JS host and row-layout controls."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import statistics
import subprocess
import sys

import numpy as np


def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--groups',type=int,default=6)
    p.add_argument('--output',type=Path,default=Path('results/javascript-rows'));args=p.parse_args()
    args.output.mkdir(exist_ok=True,parents=True)
    oracle=np.array(json.loads(Path('results/raw-0-upstream.json').read_text())['ordered_outputs'],np.float32)
    runs=[];modes=['numpy','previous','reference','rows-array','rows']
    for group in range(args.groups):
        order=modes[group%len(modes):]+modes[:group%len(modes)]
        if group%2:order.reverse()
        for mode in order:
            command=([sys.executable,'scripts/js_latency_benchmark.py','--worker','--rounds','9','--repetitions','100'] if mode=='numpy'
                     else ['node','scripts/js_rows_worker.mjs',mode,'9','100'])
            data=json.loads(subprocess.check_output(command,text=True,timeout=180))
            out=np.asarray(data.pop('outputs'),np.float32)
            if mode=='numpy':np.testing.assert_allclose(out,oracle,rtol=2e-6,atol=2e-7)
            else:np.testing.assert_array_equal(out.view(np.uint32),oracle.view(np.uint32))
            data.update(mode=mode,group=group,output_sha256=hashlib.sha256(out.tobytes()).hexdigest(),output_check='tolerance' if mode=='numpy' else 'bit-exact')
            (args.output/f'{group}-{mode}.json').write_text(json.dumps(data,indent=2)+'\n');runs.append(data)
            print(group,mode,round(statistics.median(data['samples']['all']['samples_ns_per_embedding'])/1000,3),'us',flush=True)
    summary={bucket:{mode:statistics.median(statistics.median(r['samples'][bucket]['samples_ns_per_embedding'])
              for r in runs if r['mode']==mode) for mode in modes} for bucket in ['all','empty','short','medium','long']}
    setup={mode:statistics.median(r['capture_prepare_ms'] for r in runs if r['mode']==mode) for mode in modes if mode!='numpy'}
    base='build/general/potion-2m';row=base+'/javascript/packed-rows'
    files=['scripts/js_rows_worker.mjs','scripts/js_rows_benchmark.py','scripts/js_latency_benchmark.py','runtime/static-embedding.mjs',
           'src/ink_static_embeddings/javascript.py','artifacts/javascript-rows/runtime-before.mjs',base+'/optimized.mjs',
           row+'/model.ink',row+'/model.mjs',row+'/array-reference.mjs',row+'/layout.json','build/corpus.json',base+'/weights.f32']
    report={'schema':1,'scope':__doc__,'groups':args.groups,'rounds':9,'repetitions':100,'platform':platform.platform(),
            'summary_ns_per_embedding':summary,'capture_prepare_ms':setup,'source_sha256':{f:sha(f) for f in files}}
    (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    lines=['# JavaScript row-layout latency','',
       'Potion 2M, Apple M4 Pro CPU. Public encode API, fresh IDs and detached complete outputs; all dimensions consumed. Loading/tokenization/one-time weight capture excluded, setup retained separately. Six fresh process groups, nine rounds of 100 repetitions. Median of process medians; µs/query.',
       '', '| Input | NumPy | Previous JS | Current host, reference | Rows, old array storage | Rows, dense storage | Previous / new |',
       '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
    for bucket,v in summary.items():lines.append('| '+bucket+' | '+' | '.join(f'{v[m]/1000:.3f}' for m in modes)+f' | {v["previous"]/v["rows"]:.2f}× |')
    lines+=['', 'Short = 1–16 tokens; medium = 17–128; long = 129–512. The row source explicitly prefetches rows and uses coordinate accumulators for <=16 tokens; longer inputs visit adjacent dimensions in a dense F32 Buffer. Every dimension retains token order and the norm retains its right fold. This is an authored Ink layout, not a newly proof-selected rewrite.',
            '', 'Rows old/new use the identical Ink source with different literal JS Buffer carriers. The current host/reference control separates the F32 output-boundary correction from the source/storage improvements. Tagged F32 outputs convert through a word view so overflow infinities and NaNs survive the Float32Array boundary.',
            '', 'All 64 generated outputs match the independent ordered-F32 oracle bit for bit. NumPy uses its ordinary reduction order and is checked with rtol=2e-6, atol=2e-7. Cross-runtime comparisons are implementation measurements, not an isolated compiler effect.',
            '', 'One-time weight capture/preparation (ms): '+', '.join(f'{m}: {v:.2f}' for m,v in setup.items())+'. Row packing preserves the original F32 values but creates one captured typed array per token row; setup/memory costs can outweigh gains for short-lived models.']
    (args.output/'REPORT.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))


if __name__=='__main__':main()
