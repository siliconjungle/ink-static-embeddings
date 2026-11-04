"""Generate real-model reference cases and verify emitted JavaScript and Rust.

Model2Vec is checked against the installed upstream implementation. The other
adapter is checked against the PyTorch EmbeddingBag/Normalize operations used
by Sentence Transformers StaticEmbedding, without importing its transformer SDK.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

import numpy as np

from neural_to_ink.static_model import digest, load_model


TEXTS = ['', '   ', 'A cat sleeps on the sofa.', 'The kitten naps on a couch.',
         'A compiler transforms source programs into executable code.',
         'café naïve résumé', '東京の電車 🚆', '[UNK]', 'x' * 257]


def ordered(table, ids, normalization):
    if not ids:
        return np.zeros(table.shape[1], dtype=np.float32)
    total = np.zeros(table.shape[1], dtype=np.float32)
    for token in ids:
        total = np.float32(total + table[token])
    mean = np.float32(total / np.float32(len(ids)))
    if normalization['kind'] == 'none':
        return mean
    squared = np.float32(0)
    for value in mean[::-1]:
        squared = np.float32(np.float32(value * value) + squared)
    norm = np.float32(np.sqrt(squared))
    epsilon = np.float32(normalization['epsilon'])
    norm = np.float32(norm + epsilon) if normalization['kind'] == 'l2-add-epsilon' else max(norm, epsilon)
    return np.float32(mean / norm)


def check_bits(actual, expected):
    np.testing.assert_array_equal(np.asarray(actual, np.float32).view(np.uint32), expected.view(np.uint32))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--rust', action='store_true')
    args = parser.parse_args()
    build = args.build.resolve()
    manifest = json.loads((build / 'model.json').read_text())
    spec = load_model(args.model_dir, manifest['source_format'])
    ids = spec.tokenize(TEXTS)
    rng = np.random.default_rng(20261104)
    queries = ids + [[0], [len(spec.weights)-1], [0, len(spec.weights)-1, 0]]
    queries += [rng.integers(0, len(spec.weights), size=n).tolist() for n in (1, 7, 64, 512)]
    expected = np.array([ordered(spec.weights, q, spec.normalization) for q in queries])
    if spec.source_format == 'model2vec':
        from model2vec import StaticModel
        upstream = StaticModel.from_pretrained(args.model_dir, force_download=False)
        assert upstream.tokenize(TEXTS) == ids, 'adapter tokenization differs from Model2Vec'
        raw = np.stack([upstream._encode_helper(q).mean(axis=0) if q else np.zeros(upstream.dim) for q in queries])
        reference = raw / (np.linalg.norm(raw, axis=1, keepdims=True) + 1e-32) if upstream.normalize else raw
        np.testing.assert_allclose(upstream.encode(TEXTS), reference[:len(TEXTS)], rtol=2e-5, atol=2e-6)
        reference_kind = 'upstream Model2Vec 0.7.0 tokenize/encode and numeric helper'
    else:
        import torch
        torch.set_num_threads(1)
        embedding = torch.nn.EmbeddingBag.from_pretrained(torch.from_numpy(spec.weights), mode='mean')
        starts = np.cumsum([0] + [len(q) for q in queries[:-1]])
        reference_tensor = embedding(torch.tensor([t for q in queries for t in q], dtype=torch.int64), torch.tensor(starts))
        if spec.normalization['kind'] != 'none':
            reference_tensor = torch.nn.functional.normalize(reference_tensor, p=2, dim=1, eps=1e-12)
        reference = reference_tensor.detach().numpy()
        reference_kind = f'PyTorch {torch.__version__} EmbeddingBag(mean), optional functional.normalize; official StaticEmbedding operations'
    np.testing.assert_allclose(expected, reference, rtol=2e-5, atol=2e-6)
    fixture = {'schema': 2, 'queries': queries, 'ordered_outputs': expected.tolist(),
               'upstream_outputs': reference.tolist()}
    (build / 'validation.json').write_text(json.dumps(fixture, indent=2) + '\n')
    script = '''import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {createJavascriptEncoder} from './runtime/static-embedding.mjs';
const dir=process.argv[1],m=JSON.parse(fs.readFileSync(dir+'/model.json'));
const b=fs.readFileSync(dir+'/weights.f32'),weights=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const fixture=JSON.parse(fs.readFileSync(dir+'/validation.json'));
const outputs={};for(const mode of ['literal','optimized']){if(!fs.existsSync(dir+'/'+mode+'.mjs'))continue;
const module=await import(pathToFileURL(dir+'/'+mode+'.mjs'));
const encoder=createJavascriptEncoder(module,m,weights);outputs[mode]=Array.from(encoder.encodeBatch(fixture.queries));}
console.log(JSON.stringify(outputs));'''
    result = subprocess.run(['node', '--input-type=module', '-e', script, str(build)], check=True, text=True, capture_output=True)
    for mode, actual in json.loads(result.stdout).items():
        check_bits(np.array(actual, np.float32).reshape(expected.shape), expected)
    backends = {mode: 'bit-exact ordered F32 oracle' for mode in json.loads(result.stdout)}
    if args.rust:
        bindir = build / 'rust/src/bin'
        bindir.mkdir(exist_ok=True)
        shutil.copyfile('scripts/validate_native.rs', bindir / 'validate-model.rs')
        subprocess.run(['cargo', 'build', '--release', '--manifest-path', str(build / 'rust/Cargo.toml'), '--bin', 'validate-model'], check=True, capture_output=True)
        result = subprocess.run([str(build / 'rust/target/release/validate-model'), str(build)], check=True, text=True, capture_output=True)
        check_bits(np.array(json.loads(result.stdout), np.float32).reshape(expected.shape), expected)
        backends['rust'] = 'bit-exact ordered F32 oracle'
    report = {'schema': 2, 'model_id': manifest['model_id'], 'revision': manifest['revision'],
              'source_format': manifest['source_format'], 'dimensions': manifest['dimensions'],
              'parameters': manifest['parameters'], 'shards': len(manifest['shards']),
              'normalization': manifest['normalization'], 'cases': len(queries),
              'upstream_reference': reference_kind, 'upstream_max_abs_error': float(np.max(np.abs(expected-reference))),
              'rtol': 2e-5, 'atol': 2e-6, 'backends': backends,
              'identities': {name: digest(build / name) for name in ['model.json', 'model.ink', 'weights.f32', 'validation.json']}}
    (build / 'validation-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
