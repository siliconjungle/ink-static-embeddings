"""Exercise generated layouts and the public F32 output bridge, including overflow."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

import numpy as np
import pytest

from ink_static_embeddings.javascript import emit_rows, row_layout
from ink_static_embeddings.static_model import emit_model
from scripts.validate_model import ordered


@pytest.mark.parametrize('dimensions,policy',[
    (1,{'kind':'none'}),
    (7,{'kind':'l2-add-epsilon','epsilon':'1.0e-32'}),
    (17,{'kind':'l2-clamp','epsilon':'1.0e-12'}),
])
def test_row_layout_preserves_float_bits_and_input_boundaries(tmp_path,dimensions,policy):
    ink=os.environ.get('INK')
    if not ink:pytest.skip('set INK for compiler integration')
    rng=np.random.default_rng(5191);weights=rng.normal(size=(7,dimensions)).astype(np.float32)
    weights[0]=-np.float32(0);weights[1]=np.finfo(np.float32).max;weights[2]=-np.finfo(np.float32).max
    weights[3]=np.nextafter(np.float32(0),np.float32(1))
    parameters=weights.size
    shards=[{'name':f'weight_{i}','offset':start,'elements':min(9,parameters-start)} for i,start in enumerate(range(0,parameters,9))]
    source=emit_model(dimensions,shards,policy)
    manifest={'schema':2,'architecture':'static-embedding-mean','dtype':'float32-le','dimensions':dimensions,
              'vocabulary_size':7,'parameters':parameters,'shards':shards,'normalization':policy,
              'source_sha256':hashlib.sha256(source.encode()).hexdigest(),
              'weights_sha256':hashlib.sha256(weights.tobytes()).hexdigest()}
    layout=row_layout(manifest)
    for name,code in [('reference',source),('rows',emit_rows(manifest,layout))]:
        path=tmp_path/f'{name}.ink';path.write_text(code)
        r=subprocess.run([ink,'build',str(path),'--target','javascript','-o',str(path.with_suffix('.mjs'))],capture_output=True,text=True)
        assert r.returncode==0,r.stderr
    queries=[[],[0],[1]*16,[2]*16,[1,2,1,2],[6,1,6,2],[3]*31,[4,5,6]*3]
    with np.errstate(all='ignore'):expected=np.stack([ordered(weights,q,policy) for q in queries])
    bits=expected.view(np.uint32);bits[np.isnan(expected)]=0x7fc00000
    host=(Path(__file__).resolve().parents[1]/'runtime/static-embedding.mjs').as_uri()
    script=f'''import assert from 'node:assert/strict';import * as reference from './reference.mjs';import * as rows from './rows.mjs';
import {{createJavascriptEncoder}} from {json.dumps(host)};
const manifest={json.dumps(manifest)},layout={json.dumps(layout)},weights=Float32Array.from({json.dumps(weights.flatten().tolist())});
const queries={json.dumps(queries)},expected={json.dumps(bits.flatten().tolist())};
for(const [module,options] of [[reference,{{}}],[rows,{{layout}}]]){{
 const e=createJavascriptEncoder(module,manifest,weights,options);
 for(let repeat=0;repeat<3;repeat++){{
  const out=e.encodeBatch(queries);assert.deepEqual(Array.from(new Uint32Array(out.buffer)),expected);out.fill(99);
 }}
 const old=weights[0];weights[0]=100;assert.deepEqual(Array.from(new Uint32Array(e.encodeBatch(queries).buffer)),expected);weights[0]=old;
 for(const ids of [[-1],[7],[NaN],[1.5]])assert.throws(()=>e.encode(ids));
}}
assert.throws(()=>createJavascriptEncoder(rows,manifest,weights,{{layout:{{...layout,base_source_sha256:'wrong'}}}}),/mismatch/);
assert.throws(()=>createJavascriptEncoder(rows,manifest,weights,{{layout:{{...layout,shards:[{{...layout.shards[0],row_offset:1}}]}}}}),/shard/);
'''
    (tmp_path/'test.mjs').write_text(script)
    result=subprocess.run(['node',str(tmp_path/'test.mjs')],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
