from __future__ import annotations
import json
import time
from pathlib import Path
import argparse
from huggingface_hub import snapshot_download
from model2vec import StaticModel
from ink_static_embeddings.converter import convert

MODEL_ID='minishlab/potion-base-2M'
REVISION='389b9f64be5aa4ae7a6bc6fe95ef20ce485ae5da'

BASE=[
 'A cat is sleeping on the sofa.', 'The kitten naps on a couch.',
 'A dog runs through the park.', 'The puppy plays outside.',
 'A compiler transforms source programs into executable code.',
 'Neural networks can produce vector representations of text.',
 'The train departs from the station at noon.',
 'Fresh tomatoes and basil make a delicious pasta sauce.',
 'Astronomers study distant galaxies and bright stars.',
 'The gardener planted flowers beside the stone path.',
 'Music played softly while she read the book.',
 'A database index can accelerate repeated queries.',
]

def corpus(model):
    cases=[]
    for repeats in (1,8,32):
        for i,text in enumerate(BASE):
            s=' '.join([text]*repeats)
            cases.append({'id':f'text-{repeats}-{i}','text':s,'kind':f'text-repeat-{repeats}'})
    for i,text in enumerate(['','   ','Hello, world!','café naïve résumé','東京の電車 🚆','123 123 123','[UNK]','x'*2048]):
        cases.append({'id':f'edge-{i}','text':text,'kind':'edge'})
    ids=model.tokenize([c['text'] for c in cases],max_length=512)
    for c,tokens in zip(cases,ids):c['ids']=list(map(int,tokens))
    # Full-vocabulary held-out IDs exercise rows absent from the text fixtures.
    import numpy as np
    rng=np.random.default_rng(20261104)
    for n in (1,7,32,128,512):
        for i in range(4):
            cases.append({'id':f'ids-{n}-{i}','kind':'uniform-vocabulary-ids',
              'ids':rng.integers(0,len(model.embedding),size=n).tolist()})
    return {'schema':1,'seed':20261104,'max_text_length':512,'cases':cases}

def main():
    p=argparse.ArgumentParser();p.add_argument('--model-dir',type=Path,default=Path('work/model'))
    p.add_argument('--output',type=Path,default=Path('build'));args=p.parse_args()
    start=time.perf_counter()
    snapshot_download(MODEL_ID,revision=REVISION,allow_patterns=['model.safetensors','tokenizer.json','config.json','README.md'],local_dir=args.model_dir)
    metadata=convert(args.model_dir,args.output,MODEL_ID,REVISION,legacy=True)
    model=StaticModel.from_pretrained(args.model_dir)
    if model.weights is not None or model.token_mapping is not None:
        raise ValueError('this importer does not support runtime token weighting/remapping')
    (args.output/'corpus.json').write_text(json.dumps(corpus(model),indent=2)+'\n')
    metadata['preparation_seconds']=time.perf_counter()-start
    print(json.dumps(metadata,indent=2))

if __name__=='__main__':main()
