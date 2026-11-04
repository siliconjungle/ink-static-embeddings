"""Reproduce strict GPU edge fixtures against the independent ordered oracle."""
import json
from pathlib import Path

import numpy as np

from ink_static_embeddings.gpu import shaders
from ink_static_embeddings.static_model import emit_model, digest
from ink_static_embeddings.targets import prepare_targets
from scripts.validate_model import ordered


def main():
    base = Path('build/general/potion-2m')
    compiled = json.loads((base / 'webgpu/manifest.json').read_text())
    pool = next(f for f in compiled['functions'] if f['name'] == 'pool_batch')
    helpers = (base / 'webgpu' / pool['shader']).read_text().split('struct R_Accumulator')[0]
    for d, kind in [(1, 'none'), (7, 'l2-add-epsilon'), (65, 'l2-clamp'), (1025, 'none')]:
        out = Path('build/gpu-edges') / str(d)
        out.mkdir(parents=True, exist_ok=True)
        w = np.random.default_rng(182+d).normal(size=(8,d)).astype(np.float32)
        w[0] = -np.float32(0)
        w[1] = np.finfo(np.float32).max
        w[2] = -np.finfo(np.float32).max
        w[3] = np.nextafter(np.float32(0),np.float32(1))
        w[4] = np.float32(1e-20)
        normalization = {'kind': kind, **({'epsilon': '1e-32' if kind == 'l2-add-epsilon' else '1e-12'} if kind != 'none' else {})}
        shards = [{'name': 'weight_0', 'offset': 0, 'elements': w.size}]
        (out / 'model.ink').write_text(emit_model(d,shards,normalization))
        (out / 'weights.f32').write_bytes(w.tobytes())
        m = {'schema': 2, 'architecture': 'static-embedding-mean', 'dtype': 'float32-le',
             'dimensions': d, 'vocabulary_size': 8, 'parameters': w.size, 'shards': shards,
             'normalization': normalization, 'source_sha256': digest(out / 'model.ink'),
             'weights_sha256': digest(out / 'weights.f32')}
        (out / 'model.json').write_text(json.dumps(m,indent=2)+'\n')
        prepare_targets(out,4096)
        queries = [[],[0],[1]*17,[2]*31,[1,2,1,2],[3]*17,[4],[7,6]*33,[5]*4096]
        with np.errstate(all='ignore'):
            expected = np.stack([ordered(w,q,normalization) for q in queries])
        words = expected.view(np.uint32)
        words[np.isnan(expected)] = 0x7fc00000
        (out / 'validation.json').write_text(json.dumps({'queries':queries,'ordered_bits':words.tolist()},indent=2)+'\n')
        target = out / 'gpu-experimental'
        target.mkdir(exist_ok=True)
        records = {}
        for native in (False,True):
            for name,shader in shaders(m,helpers,native).items():
                p = target / (('native' if native else 'strict')+'-'+name+'.wgsl')
                p.write_text(shader)
                records[p.name] = digest(p)
        receipt = {'schema':1,'kind':'authored-cooperative-static-embedding-gpu',
                   'model_source_sha256':m['source_sha256'],'weights_sha256':m['weights_sha256'],
                   'dimensions':d,'normalization':normalization,'shaders':records,
                   'strict_contract':compiled['float_contract'],'native_contract':'approximate',
                   'scope':'Adversarial generated fixture, not an Ink compilation',
                   'ink_manifest_sha256':digest(base / 'webgpu/manifest.json'),
                   'ink_pool_shader_sha256':digest(base / 'webgpu' / pool['shader'])}
        (target / 'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print(out)


if __name__ == '__main__':
    main()
