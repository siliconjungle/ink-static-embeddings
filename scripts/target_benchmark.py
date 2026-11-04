"""Compare matched batches across fresh processes and retain adverse variants."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import numpy as np


def main():
 p=argparse.ArgumentParser();p.add_argument('--processes',type=int,default=3)
 p.add_argument('--reuse-gpu',action='store_true',help='reuse measured GPU data only when its harness and manifest hashes match')
 p.add_argument('--summarize-only',action='store_true',help='aggregate the retained validated raw files without measuring again')
 args=p.parse_args()
 dest=Path('results/targets');dest.mkdir(exist_ok=True,parents=True)
 expected=np.array(json.load(open('results/raw-0-upstream.json'))['ordered_outputs'],dtype=np.float32)
 env={**os.environ,'OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1','TOKENIZERS_PARALLELISM':'false'}
 all_rows=[]
 if args.reuse_gpu or args.summarize_only:
  old=json.load(open(dest/'report.json'))
  for f in ('scripts/gpu_benchmark.py','build/batch-model.ink','build/gpu-batch/manifest.json'):
   assert old['source_sha256'][f]==hashlib.sha256(Path(f).read_bytes()).hexdigest(),f
 for process in range(args.processes):
  modes=['upstream','native-column','native-row','gpu']
  if process%2:modes.reverse()
  for mode in modes:
   if mode=='gpu':
    out=dest/f'gpu-{process}.json'
    cmd=[sys.executable,'scripts/gpu_benchmark.py','--rounds','7','--output',str(out)]
   elif mode=='upstream':cmd=[sys.executable,'scripts/upstream_batch_bench.py']
   else:cmd=['build/rust-owned/target/release/native-batch','build','9','row' if mode=='native-row' else 'column']
   if not(args.summarize_only or mode=='gpu'and args.reuse_gpu):
    r=subprocess.run(cmd,text=True,capture_output=True,env=env,timeout=240)
    if r.returncode:raise RuntimeError(r.stderr[-3000:])
   data=json.loads((dest/f'{mode}-{process}.json').read_text())if args.summarize_only or mode=='gpu' else json.loads(r.stdout)
   for row in data['reports']:
    if 'output'in row:
     output=np.array(row.pop('output'),dtype=np.float32).reshape(-1,64)
     np.testing.assert_array_equal(output.view(np.uint32),expected[np.arange(len(output))%len(expected)].view(np.uint32))
     row['output_sha256']=hashlib.sha256(output.tobytes()).hexdigest();row['all_outputs_bit_exact']=True
    if 'output_b'in row:
     output=np.array(row.pop('output_b'),dtype=np.float32).reshape(-1,64)
     np.testing.assert_array_equal(output.view(np.uint32),expected[(np.arange(len(output))+1)%len(expected)].view(np.uint32))
     row['output_b_sha256']=hashlib.sha256(output.tobytes()).hexdigest()
    if mode=='gpu':
     all_rows.append({'process':process,'mode':'gpu-compute','batch':row['batch'],'samples_ns_per_embedding':row['compute_ns_per_embedding']})
     samples=row['new_query_ns_per_embedding']
    else:samples=row['samples_ns_per_embedding']
    all_rows.append({'process':process,'mode':mode,'batch':row['batch'],'samples_ns_per_embedding':samples})
   (dest/f'{mode}-{process}.json').write_text(json.dumps(data,indent=2)+'\n')
   print('process',process+1,mode,'validated',flush=True)
 summary=[]
 for batch in (1,16,64,256,1024):
  for mode in ('upstream','native-column','native-row','gpu','gpu-compute'):
   values=[statistics.median(r['samples_ns_per_embedding'])for r in all_rows if r['batch']==batch and r['mode']==mode]
   summary.append({'batch':batch,'mode':mode,'median_ns_per_embedding':statistics.median(values),'process_medians_ns':values})
 paths=['scripts/target_variants.py','scripts/native_bench.rs','scripts/native_batch_bench.rs',
  'scripts/gpu_benchmark.py','scripts/upstream_batch_bench.py','scripts/target_benchmark.py',
  'build/native-owned-model.ink','build/batch-model.ink','build/rust-owned/src/lib.rs','build/gpu-batch/manifest.json']
 report={'schema':1,'processes':args.processes,'platform':platform.platform(),
  'corpus_sha256':hashlib.sha256(Path('build/corpus.json').read_bytes()).hexdigest(),
  'adapter':json.load(open('results/targets/adapter.json')),'summary':summary,
  'source_sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest()for p in paths},
  'scope':'Importer variants compiled with unchanged Ink; these source layout/ownership changes are authored transformations, not newly discovered/proof-admitted Ink optimizer rewrites. Native includes full model copy-in once per batch. GPU keeps model resident and includes changing query uploads, three completed dispatches and decoded output. Startup/loading excluded and GPU session upload/open recorded separately. NumPy runs on CPU; there is no upstream GPU baseline in this experiment, so GPU gains are not an isolated compiler effect. Batched per-embedding times are amortized throughput, not single-request latency.'}
 (dest/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 rows=['# Rust and GPU target experiment','',report['scope'],'',
  '| Batch | NumPy batch µs / embedding | Rust column µs | Rust row µs | GPU complete query µs | GPU compute only µs |',
  '| ---: | ---: | ---: | ---: | ---: | ---: |']
 for batch in (1,16,64,256,1024):
  v={x['mode']:x['median_ns_per_embedding']/1000 for x in summary if x['batch']==batch}
  rows.append('| '+str(batch)+' | '+' | '.join(f'{v[m]:.3f}'for m in ('upstream','native-column','native-row','gpu','gpu-compute'))+' |')
 rows+=['',f"GPU adapter: {report['adapter']['name']} / {report['adapter']['backend']}.",
  '', 'Native and GPU variant outputs match the independent ordered F32 oracle bit for bit. The upstream batch path is checked with explicit tolerance because its reduction strategy and empty-row promotion differ.',
  '', 'The original unmodified helper-heavy Rust probe is retained separately: it copies full weight vectors inside per-coordinate/per-token helper calls. Its latency is not represented by the ownership-friendly variants in this table.',
  '', 'All paths alternate the same two fixture offsets. Batch 1 starts at the first eight-token text. Batch 16 starts with the first sixteen fixtures; batches 64, 256 and 1024 use the complete 64-case corpus, repeated as needed. Compare columns within a row. Per-round/process data and GPU startup/upload costs are adjacent. No GPU CPU fallback is permitted.']
 (dest/'REPORT.md').write_text('\n'.join(rows)+'\n');print('\n'.join(rows))


if __name__=='__main__':main()
