"""Require actual GPU execution; separate residency, compute and new-query costs."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import subprocess
import time
import numpy as np


def main():
 p=argparse.ArgumentParser();p.add_argument('--rounds',type=int,default=7)
 p.add_argument('--output',type=Path,default=Path('results/targets/gpu.json'));args=p.parse_args()
 build=Path('build');manifest=json.loads((build/'model.json').read_text())
 weights=np.fromfile(build/'weights.f32',dtype='<f4');split=manifest['shard_elements']
 corpus=json.loads((build/'corpus.json').read_text())['cases']
 expected=np.array(json.load(open('results/raw-0-upstream.json'))['ordered_outputs'],dtype=np.float32)
 binary=build/'gpu-batch/native/target/release/ink-gpu-program'
 reports=[]
 for batch in (1,16,64,256,1024):
  def inputs(shift):
   tokens=[];starts=[];lengths=[]
   for i in range(batch):
    ids=corpus[(i+shift)%len(corpus)]['ids'];starts.append(len(tokens));lengths.append(len(ids));tokens.extend(ids)
   return {'tokens':tokens,'starts':starts,'lengths':lengths}
  a,b=inputs(0),inputs(1);capacity=max(len(a['tokens']),len(b['tokens']))
  for v in (a,b):v['tokens'] += [0]*(capacity-len(v['tokens']))
  plan={'inputs':{'first':weights[:split].tolist(),'second':weights[split:].tolist(),**a,
    'positions':list(range(batch*64)),'documents':list(range(batch))},'steps':[
   {'id':'means','call':'pool_batch','args':[{'input':k}for k in ('first','second','tokens','starts','lengths','positions')]},
   {'id':'norms','call':'norm_batch','args':[{'step':'means'},{'input':'documents'}]},
   {'id':'embeddings','call':'normalize_batch','args':[{'step':'means'},{'step':'norms'},{'input':'positions'}]}],
   'outputs':['embeddings']}
  script=[{'open':plan,'as':'model','backend':'gpu-required'}];labels=[('open',0)]
  for _ in range(3):
   script.append({'session':'model','step':1,'wait':True});labels.append(('warmup',0))
  for r in range(args.rounds):
   shift=r%2;v=(a,b)[shift]
   for key in ('tokens','starts','lengths'):
    script.append({'session':'model','write':{'input':key,'value':v[key]}});labels.append(('write',shift))
   script.append({'session':'model','step':1,'wait':True});labels.append(('step',shift))
   script.append({'session':'model','read':{'outputs':['embeddings']}});labels.append(('read',shift))
  script.append({'session':'model','close':True});labels.append(('close',0))
  path=Path('work/gpu-benchmark-input.json');path.write_text(json.dumps(script,separators=(',',':')))
  t=time.perf_counter();run=subprocess.run([str(binary),'--script',str(path)],text=True,capture_output=True,timeout=180)
  if run.returncode:raise RuntimeError(run.stderr[-3000:])
  rows=[json.loads(line)for line in run.stdout.splitlines()]
  if len(rows)!=len(labels):raise AssertionError('incomplete GPU history')
  writes=0.0;calls=[];compute=[];reads=[];hashes=[];upload_bytes=[]
  for (kind,shift),row in zip(labels,rows):
   if 'error'in row:raise RuntimeError(row['error'])
   if kind in ('open','step','warmup') and row.get('backend')!='gpu':raise AssertionError('CPU fallback in GPU measurement')
   if kind=='write':writes+=row['seconds'];upload_bytes.append(row.get('counters',{}))
   if kind=='step':
    if row['counters']['dispatches']!=3:raise AssertionError('unexpected device work')
    compute.append(row['seconds']*1e9/batch)
   if kind=='read':
    out=np.array(row['values']['embeddings'],dtype=np.float32).reshape(-1,64)
    want=expected[(np.arange(batch)+shift)%len(corpus)]
    np.testing.assert_array_equal(out.view(np.uint32),want.view(np.uint32))
    hashes.append(hashlib.sha256(out.tobytes()).hexdigest())
    reads.append(row['seconds']*1e9/batch)
    calls.append(writes*1e9/batch+compute[-1]+reads[-1]);writes=0.0
  record={'batch':batch,'rounds':args.rounds,'open':rows[0],
    'compute_ns_per_embedding':compute,'read_ns_per_embedding':reads,
    'new_query_ns_per_embedding':calls,'output_sha256':hashes,'all_outputs_bit_exact':True,
    'wall_seconds':time.perf_counter()-t,'stderr':run.stderr[-2000:]}
  reports.append(record)
  print('GPU batch',batch,'compute',round(statistics.median(compute)/1000,3),'us; new-query + output',round(statistics.median(calls)/1000,3),'us',flush=True)
 args.output.parent.mkdir(exist_ok=True,parents=True)
 args.output.write_text(json.dumps({'reports':reports,'scope':'gpu-required; weights resident; three actual dispatches per query batch; new-query cost includes writes of token IDs/start/lengths plus completed GPU work and decoded complete output; device startup/model upload recorded separately.'},indent=2)+'\n')


if __name__=='__main__':main()
