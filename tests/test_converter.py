import json
import os
from pathlib import Path
import subprocess
import numpy as np
import pytest
from safetensors.numpy import save_file
from tokenizers import Tokenizer, models
from neural_to_ink.converter import convert, emit_source


def test_complete_weights_are_preserved(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    weights = np.array([[0.0, -0.0], [1.25, -2.0], [3.0, 4.0]], dtype=np.float32)
    save_file({"embeddings": weights}, source / "model.safetensors")
    (source / "config.json").write_text(json.dumps({"model_type": "model2vec", "normalize": True, "hidden_dim": 2}))
    Tokenizer(models.WordLevel({'[UNK]':0,'a':1,'b':2},unk_token='[UNK]')).save(str(source / 'tokenizer.json'))
    result = convert(source, tmp_path / "out", "test", "0" * 40)
    actual = np.fromfile(tmp_path / "out/weights.f32", dtype="<f4")
    assert actual.tobytes() == weights.tobytes()
    assert result["parameters"] == 6
    assert "id*2+dimension" in (tmp_path / "out/model.ink").read_text()


@pytest.mark.parametrize("dimensions", [0, -1, 4097])
def test_rejects_unsupported_shapes(dimensions):
    with pytest.raises(ValueError):
        emit_source(dimensions)


def test_rejects_wrong_architecture(tmp_path):
    (tmp_path / 'config.json').write_text('{"model_type":"bert","normalize":true}')
    with pytest.raises(ValueError,match='unsupported architecture'):
        convert(tmp_path,tmp_path/'out','test','test')


def test_generated_source_runs_in_unmodified_ink(tmp_path):
    ink=os.environ.get('INK')
    if not ink:pytest.skip('set INK to run compiler integration')
    source=tmp_path/'model.ink';source.write_text(emit_source(2,4))
    module=tmp_path/'model.mjs'
    subprocess.run([ink,'build',str(source),'--target','javascript','-o',str(module)],check=True,capture_output=True)
    harness=tmp_path/'test.mjs'
    harness.write_text('''import * as m from './model.mjs';
const c=m.compiledValues.encode;
const p=m.prepareCompiled('encode',[[0,c.params[0].capture([0,0,1.25,-2])],[1,c.params[1].capture([3,4])]]);
const outputs=[[],[1],[2],[1,2]].map(ids=>{const out=[];m.callPreparedCompiledInto(p,[c.params[2].capture(ids)],out);return out;});
console.log(JSON.stringify(outputs));''')
    r=subprocess.run(['node',str(harness)],text=True,capture_output=True,check=True)
    actual=np.array(json.loads(r.stdout),dtype=np.float32)
    expected=np.array([[0,0],[1.25,-2],[3,4],[2.125,1]],dtype=np.float32)
    for row in expected:
        if np.any(row):row/=np.sqrt(np.float32(row[0]*row[0]+row[1]*row[1]))
    np.testing.assert_allclose(actual,expected,rtol=1e-6,atol=1e-7)
