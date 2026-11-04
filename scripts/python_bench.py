"""Upstream numeric kernel and full-library timing in one fresh process."""
import argparse
import json
from pathlib import Path
import resource
import sys
import time
import numpy as np
from model2vec import StaticModel


def main():
    p=argparse.ArgumentParser();p.add_argument('--build',type=Path,default=Path('build'))
    p.add_argument('--model',type=Path,default=Path('work/model'));p.add_argument('--rounds',type=int,default=7)
    args=p.parse_args();start=time.perf_counter()
    model=StaticModel.from_pretrained(args.model)
    loaded=time.perf_counter();corpus=json.loads((args.build/'corpus.json').read_text())['cases']
    def numeric(ids):
        if not ids:return np.zeros(model.dim,dtype=np.float32)
        mean=model._encode_helper(ids).mean(axis=0)
        return mean/(np.linalg.norm(mean)+np.float32(1e-32))
    outputs=[numeric(c['ids']).tolist() for c in corpus]
    texts=[c['text'] for c in corpus if 'text' in c]
    full=model.encode(texts,use_multiprocessing=False,max_length=512)
    np.testing.assert_allclose(np.array(outputs[:len(texts)]),full,rtol=2e-6,atol=2e-7)
    checksum=0.0
    for _ in range(3):
        for c in corpus:checksum+=float(numeric(c['ids'])[0])
    samples=[]
    for _ in range(args.rounds):
        t=time.perf_counter_ns()
        for c in corpus:checksum+=float(numeric(c['ids']).sum(dtype=np.float64))
        samples.append((time.perf_counter_ns()-t)/len(corpus))
    e2e=[]
    for _ in range(args.rounds):
        t=time.perf_counter_ns();result=model.encode(texts,use_multiprocessing=False,max_length=512)
        checksum+=float(result.sum(dtype=np.float64))
        e2e.append((time.perf_counter_ns()-t)/len(texts))
    # Independent explicit F32 oracle matching the authored Ink order, including
    # the right-fold norm. It does not call generated code or the Ink evaluator.
    ordered=[]
    for c in corpus:
        acc=np.zeros(model.dim,dtype=np.float32)
        if c['ids']:
            for i in c['ids']:acc=np.add(acc,model.embedding[i],dtype=np.float32)
            acc=np.divide(acc,np.float32(len(c['ids'])),dtype=np.float32)
            squares=np.multiply(acc,acc,dtype=np.float32)
            norm=np.float32(0)
            for x in squares[::-1]:norm=np.float32(x+norm)
            norm=np.float32(np.sqrt(norm)+np.float32(1e-32))
            acc=np.divide(acc,norm,dtype=np.float32)
        ordered.append(acc.tolist())
    rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(json.dumps({'python':sys.version,'numpy':np.__version__,
      'model_load_ms':(loaded-start)*1000,'samples_ns_per_embedding':samples,
      'upstream_text_batch_ns_per_embedding':e2e,'outputs':outputs,'ordered_outputs':ordered,
      'checksum':checksum,'peak_rss_bytes':rss if sys.platform=='darwin' else rss*1024}))

if __name__=='__main__':main()
