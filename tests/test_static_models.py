import json
import os
from pathlib import Path
import subprocess

import numpy as np
import pytest
from safetensors.numpy import save_file
from tokenizers import Tokenizer, models, pre_tokenizers

from ink_static_embeddings.converter import convert
from ink_static_embeddings.static_model import load_model
from ink_static_embeddings.targets import prepare_targets


def model(directory, *, dimensions=3, normalize=True, st=False, tensors=None):
    directory.mkdir(parents=True, exist_ok=True)
    if st:
        modules=[{'type':'sentence_transformers.models.StaticEmbedding','path':'0_StaticEmbedding'}]
        if normalize:modules.append({'type':'sentence_transformers.models.Normalize','path':'1_Normalize'})
        (directory/'modules.json').write_text(json.dumps(modules))
        base=directory/'0_StaticEmbedding';base.mkdir()
    else:
        base=directory
        (base/'config.json').write_text(json.dumps({'model_type':'model2vec','normalize':normalize,'hidden_dim':dimensions}))
    tokenizer=Tokenizer(models.WordLevel({'[UNK]':0,'a':1,'b':2,'c':3},unk_token='[UNK]'))
    tokenizer.pre_tokenizer=pre_tokenizers.Whitespace();tokenizer.save(str(base/'tokenizer.json'))
    values=np.arange(4*dimensions,dtype=np.float32).reshape(4,dimensions)/np.float32(7)
    save_file(tensors or {('embedding.weight' if st else 'embeddings'):values},base/'model.safetensors')
    return values


@pytest.mark.parametrize('dimensions',[1,3,17,256,1024])
@pytest.mark.parametrize('normalize',[False,True])
def test_metadata_shards_and_normalization(tmp_path,dimensions,normalize):
    source=tmp_path/'source';weights=model(source,dimensions=dimensions,normalize=normalize)
    result=convert(source,tmp_path/'out','fixture','local',shard_elements=11)
    assert result['dimensions']==dimensions
    assert sum(s['elements'] for s in result['shards'])==weights.size
    assert result['normalization']['kind']==('l2-add-epsilon' if normalize else 'none')
    assert np.fromfile(tmp_path/'out/weights.f32',dtype='<f4').tobytes()==weights.tobytes()
    prepare_targets(tmp_path/'out',max_tokens=73)
    gpu=(tmp_path/'out/gpu-model.ink').read_text()
    assert 'repeat_until(73,' in gpu
    assert f'quot_or(position,{dimensions},0)' in gpu


def test_format_preserves_unknown_tokens_and_normalization_policy(tmp_path):
    source=tmp_path/'model2vec';model(source)
    st=tmp_path/'st';model(st,st=True)
    assert load_model(source).tokenize(['a unseen'])==[[1]]
    assert load_model(st).tokenize(['a unseen'])==[[1,0]]
    assert load_model(st).normalization=={'kind':'l2-clamp','epsilon':'1.0e-12'}


def test_weighted_remapped_rows_are_materialized(tmp_path):
    table=np.array([[1,2],[3,4]],dtype=np.float32)
    mapping=np.array([1,0,1,0],dtype=np.int64)
    weights=np.array([.5,2,3,0],dtype=np.float32)
    model(tmp_path/'source',dimensions=2,tensors={'embeddings':table,'mapping':mapping,'weights':weights})
    m=convert(tmp_path/'source',tmp_path/'out','fixture','local')
    actual=np.fromfile(tmp_path/'out/weights.f32',dtype='<f4').reshape(4,2)
    np.testing.assert_array_equal(actual,table[mapping]*weights[:,None])
    assert len(m['transformations'])==2


def test_rejects_unsupported_modules_and_invalid_tables(tmp_path):
    source=tmp_path/'source';model(source,st=True)
    modules=json.loads((source/'modules.json').read_text());modules.append({'type':'sentence_transformers.models.Dense','path':'dense'})
    (source/'modules.json').write_text(json.dumps(modules))
    with pytest.raises(ValueError,match='only StaticEmbedding'):
        convert(source,tmp_path/'out','fixture','local')
    model(tmp_path/'bad',dimensions=2,tensors={'embeddings':np.zeros((3,2),np.float32)})
    with pytest.raises(ValueError,match='row count'):
        convert(tmp_path/'bad',tmp_path/'out','fixture','local')


def test_gpu_budget_fails_before_fetching_large_weights(tmp_path):
    host=Path(__file__).resolve().parents[1]/'runtime/static-embedding.mjs'
    parameters=300000*256
    shards=[{'name':f'weight_{i}','offset':offset,'elements':min(999000,parameters-offset)}
            for i,offset in enumerate(range(0,parameters,999000))]
    manifest={'schema':2,'architecture':'static-embedding-mean','dtype':'float32-le',
              'dimensions':256,'vocabulary_size':300000,'parameters':parameters,
              'shards':shards,'normalization':{'kind':'none'}}
    script=f'''import {{loadStaticEmbedding}} from {json.dumps(host.as_uri())};
globalThis.fetch=async url=>{{if(!url.pathname.endsWith('model.json'))throw Error('Unexpected weight download');return new Response({json.dumps(json.dumps(manifest))});}};
let rejected=false;try{{await loadStaticEmbedding('http://model.test/',{{backend:'gpu'}});}}catch(error){{rejected=/GPU buffer budget/.test(error.message);}}
if(!rejected)throw Error('Did not fail before downloading weights');'''
    result=subprocess.run(['node','--input-type=module','-e',script],capture_output=True,text=True)
    assert result.returncode==0,result.stderr


@pytest.mark.parametrize('st,normalize',[(False,False),(False,True),(True,True)])
def test_generated_sharded_and_batch_programs_agree(tmp_path,st,normalize):
    ink=os.environ.get('INK')
    if not ink:pytest.skip('set INK to run unmodified compiler integration')
    weights=model(tmp_path/'source',dimensions=3,st=st,normalize=normalize)
    out=tmp_path/'out';manifest=convert(tmp_path/'source',out,'fixture','local',shard_elements=5)
    prepare_targets(out,max_tokens=9)
    for source,destination in [('model.ink','literal.mjs'),('gpu-model.ink','batch.mjs')]:
        r=subprocess.run([ink,'build',str(out/source),'--target','javascript','-o',str(out/destination)],capture_output=True,text=True)
        assert r.returncode==0,r.stderr
    host=Path(__file__).resolve().parents[1]/'runtime/static-embedding.mjs'
    script=out/'check.mjs'
    script.write_text(f'''import * as m from './literal.mjs';import * as b from './batch.mjs';
import {{createJavascriptEncoder}} from {json.dumps(host.as_uri())};
const manifest={json.dumps(manifest)},weights=Float32Array.from({json.dumps(weights.flatten().tolist())});
const encoder=createJavascriptEncoder(m,manifest,weights),queries=[[],[1],[2,1,3],[0,0]];
const individual=Array.from(encoder.encodeBatch(queries));
const means=b.functions.pool_batch(weights,[1,2,1,3,0,0],[0,0,1,4],[0,1,3,2],Array.from({{length:12}},(_,i)=>i));
const norms=b.functions.norm_batch(means,[0,1,2,3]);
const batch=Array.from(b.functions.normalize_batch(means,norms,Array.from({{length:12}},(_,i)=>i)));
for(const ids of [[-1],[4],[1.5]]){{let rejected=false;try{{encoder.encode(ids)}}catch{{rejected=true}}if(!rejected)throw Error('bad ID accepted');}}
console.log(JSON.stringify({{individual,batch}}));''')
    r=subprocess.run(['node',str(script)],capture_output=True,text=True)
    assert r.returncode==0,r.stderr
    result=json.loads(r.stdout)
    np.testing.assert_array_equal(np.array(result['individual'],np.float32).view(np.uint32),np.array(result['batch'],np.float32).view(np.uint32))
