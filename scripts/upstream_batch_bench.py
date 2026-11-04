"""Model2Vec's numeric batch path, with its actual stacking/normalization order."""
import hashlib
import json
from pathlib import Path
import time
import numpy as np
from model2vec import StaticModel


def main():
 model=StaticModel.from_pretrained('work/model')
 corpus=json.load(open('build/corpus.json'))['cases']
 expected=np.array(json.load(open('results/raw-0-upstream.json'))['ordered_outputs'],dtype=np.float32)
 def run(requests):
  values=[model._encode_helper(ids).mean(axis=0) if ids else np.zeros(model.dim) for ids in requests]
  out=np.stack(values)
  return out/(np.linalg.norm(out,axis=1,keepdims=True)+1e-32)
 reports=[];checksum=0.0
 for batch in (1,16,64,256,1024):
  requests=[corpus[i%len(corpus)]['ids']for i in range(batch)]
  requests_b=[corpus[(i+1)%len(corpus)]['ids']for i in range(batch)]
  out=run(requests)
  np.testing.assert_allclose(out,expected[np.arange(batch)%len(expected)],rtol=2e-5,atol=2e-6)
  np.testing.assert_allclose(run(requests_b),expected[(np.arange(batch)+1)%len(expected)],rtol=2e-5,atol=2e-6)
  for _ in range(3):run(requests)
  samples=[]
  for r in range(9):
   t=time.perf_counter_ns();out=run(requests if r%2==0 else requests_b);checksum+=float(out.sum(dtype=np.float64))
   samples.append((time.perf_counter_ns()-t)/batch)
  reports.append({'batch':batch,'samples_ns_per_embedding':samples,
    'output_sha256':hashlib.sha256(out.astype('<f4').tobytes()).hexdigest(),
    'max_absolute_error':float(np.max(np.abs(out-expected[np.arange(batch)%len(expected)])))})
 print(json.dumps({'reports':reports,'checksum':checksum,'scope':'Matched token-ID batches, original Model2Vec lookup/mean, stack and vectorized batch normalization; tokenization and loading excluded.'}))


if __name__=='__main__':main()
