"""Validated adapters for static lookup/mean models and metadata-driven Ink.

Tokenization remains host-side. Model2Vec and Sentence Transformers differ in
unknown-token filtering and normalization; neither is inferred from model names.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
from safetensors.numpy import load_file
from tokenizers import Tokenizer

MAX_SHARD_ELEMENTS = 999_000  # Includes headroom under Ink's capture-node bound.


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def literal_tree(values: list[int]) -> str:
    if len(values) <= 8:
        return '[' + ','.join(map(str, values)) + ']'
    middle = len(values) // 2
    return literal_tree(values[:middle]) + '.concat(' + literal_tree(values[middle:]) + ')'


def normalization_source(normalization: dict, mean: str = 'mean') -> str:
    kind = normalization['kind']
    if kind == 'none':
        return f'return {mean};'
    norm = f'sqrt(foldr({mean}.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))'
    epsilon = normalization['epsilon']
    prefix = ''
    if kind == 'l2-add-epsilon':
        divisor = f'{norm}+{epsilon}'
    elif kind == 'l2-clamp':
        prefix = f'let magnitude={norm};'
        divisor = f'choose(magnitude<{epsilon},{epsilon},magnitude)'
    else:
        raise ValueError(f'unsupported normalization: {kind}')
    return f'{prefix}let norm={divisor};return {mean}.map(fn(x)=>x/norm);'


def emit_model(dimensions: int, shards: list[dict], normalization: dict, *, flat: bool = False) -> str:
    if not 1 <= dimensions <= 4096:
        raise ValueError('unsupported embedding dimensions: expected 1..4096')
    names = ['weights'] if flat else [s['name'] for s in shards]
    params = ','.join(f'{n}:List<f32>' for n in names)
    arguments = ','.join(names)
    if flat:
        lookup = 'weights.at_or(position,0.0)'
    else:
        def branch(parts):
            if len(parts) == 1:
                s = parts[0]
                return f"{s['name']}.at_or(position-{s['offset']},0.0)"
            middle = len(parts) // 2
            return f"choose(position<{parts[middle]['offset']},{branch(parts[:middle])},{branch(parts[middle:])})"
        lookup = branch(shards)
    return f'''// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {{return {literal_tree(list(range(dimensions)))};}}
fn lookup({params},position:u32)->f32 {{return {lookup};}}
fn coordinate({params},ids:List<u32>,dimension:u32)->f32 {{
 let total=foldl(ids.map(fn(id)=>lookup({arguments},id*{dimensions}+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}}
fn encode({params},ids:List<u32>)->List<f32> {{
 let dimensions=coordinates();
 if length(ids)==0 {{return dimensions.map(fn(d)=>0.0);}}
 let mean=dimensions.map(fn(d)=>coordinate({arguments},ids,d));
 {normalization_source(normalization)}
}}
'''


@dataclass
class StaticModelSpec:
    weights: np.ndarray
    tokenizer_path: Path
    source_format: str
    normalization: dict
    skip_unknown: bool
    source_files: list[Path]
    transformations: list[str]

    def tokenize(self, texts: list[str]) -> list[list[int]]:
        tokenizer = Tokenizer.from_file(str(self.tokenizer_path))
        unknown = getattr(tokenizer.model, 'unk_token', None)
        unknown_id = tokenizer.token_to_id(unknown) if unknown else None
        return [[i for i in e.ids if not self.skip_unknown or i != unknown_id]
                for e in tokenizer.encode_batch(texts, add_special_tokens=False)]


def load_model(directory: Path, source_format: str = 'auto') -> StaticModelSpec:
    directory = directory.resolve()
    config_path = directory / 'config.json'
    config = json.loads(config_path.read_text()) if config_path.exists() else {}
    if source_format == 'auto':
        source_format = 'model2vec' if config.get('model_type') == 'model2vec' else 'sentence-transformers'
    transformations = []
    if source_format == 'model2vec':
        if config.get('model_type') != 'model2vec' or not isinstance(config.get('normalize', False), bool):
            raise ValueError('expected Model2Vec configuration with boolean normalize')
        base = directory
        tensor_name = 'embeddings'
        normalization = {'kind': 'l2-add-epsilon', 'epsilon': '1.0e-32'} if config.get('normalize', False) else {'kind': 'none'}
        files = [config_path]
    elif source_format == 'sentence-transformers':
        modules_path = directory / 'modules.json'
        if not modules_path.exists():
            raise ValueError('unsupported architecture: expected Model2Vec or Sentence Transformers StaticEmbedding')
        modules = json.loads(modules_path.read_text())
        types = [m.get('type') for m in modules]
        static = 'sentence_transformers.models.StaticEmbedding'
        normalize = 'sentence_transformers.models.Normalize'
        if types not in ([static], [static, normalize]):
            raise ValueError('only StaticEmbedding followed by optional Normalize is supported')
        base = (directory / modules[0]['path']).resolve()
        if not base.is_relative_to(directory):
            raise ValueError('static module path escapes model directory')
        tensor_name = 'embedding.weight'
        normalization = {'kind': 'l2-clamp', 'epsilon': '1.0e-12'} if len(types) == 2 else {'kind': 'none'}
        files = [modules_path]
    else:
        raise ValueError(f'unsupported source format: {source_format}')
    tensors_path = base / 'model.safetensors'
    tensors = load_file(tensors_path)
    if tensor_name == 'embedding.weight' and tensor_name not in tensors:
        tensor_name = 'embeddings'  # Official StaticEmbedding loader supports both.
    allowed = {tensor_name, 'weights', 'mapping'} if source_format == 'model2vec' else {tensor_name}
    if tensor_name not in tensors or set(tensors) - allowed:
        raise ValueError(f'unsupported tensor set: {sorted(tensors)}')
    table = tensors[tensor_name]
    if table.ndim != 2 or table.dtype != np.float32 or not np.isfinite(table).all():
        raise ValueError('expected a finite, rank-two F32 embedding table; quantized tables are unsupported')
    if not 1 <= table.shape[1] <= 4096 or table.shape[0] == 0:
        raise ValueError('unsupported embedding shape')
    if source_format == 'model2vec' and config.get('hidden_dim', table.shape[1]) != table.shape[1]:
        raise ValueError('model configuration/tensor shape disagree')
    tokenizer_path = base / 'tokenizer.json'
    tokenizer = Tokenizer.from_file(str(tokenizer_path))
    vocabulary = tokenizer.get_vocab()
    if not vocabulary or set(vocabulary.values()) != set(range(len(vocabulary))):
        raise ValueError('tokenizer IDs must be contiguous from zero')
    mapping = tensors.get('mapping')
    if mapping is not None:
        if mapping.shape != (len(vocabulary),) or mapping.dtype.kind not in 'iu' or np.any(mapping < 0) or np.any(mapping >= len(table)):
            raise ValueError('invalid token mapping')
        table = table[mapping]
        transformations.append('expanded token_mapping into per-token rows')
    if len(table) != len(vocabulary):
        raise ValueError('tokenizer vocabulary/embedding row count disagree')
    token_weights = tensors.get('weights')
    if token_weights is not None:
        if token_weights.shape != (len(table),) or token_weights.dtype != np.float32 or not np.isfinite(token_weights).all():
            raise ValueError('expected finite per-token F32 weights')
        table = table * token_weights[:, None]
        if not np.isfinite(table).all():
            raise ValueError('effective per-token table overflows F32')
        transformations.append('folded per-token F32 weights into rows')
    if table.size > 0xFFFFFFFF:
        raise ValueError("table exceeds Ink's u32 indexing domain")
    return StaticModelSpec(table, tokenizer_path, source_format, normalization,
                           source_format == 'model2vec', files + [tensors_path, tokenizer_path], transformations)


def convert_static(model_dir: Path, output: Path, model_id: str, revision: str,
                   *, source_format: str = 'auto', shard_elements: int = MAX_SHARD_ELEMENTS) -> dict:
    if not 1 <= shard_elements <= MAX_SHARD_ELEMENTS:
        raise ValueError(f'shard_elements must be 1..{MAX_SHARD_ELEMENTS}')
    spec = load_model(model_dir, source_format)
    rows, dimensions = spec.weights.shape
    shards = [{'name': f'weight_{index}', 'offset': offset,
               'elements': min(shard_elements, spec.weights.size - offset)}
              for index, offset in enumerate(range(0, spec.weights.size, shard_elements))]
    source = emit_model(dimensions, shards, spec.normalization)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'model.ink').write_text(source)
    spec.weights.astype('<f4', copy=False).tofile(output / 'weights.f32')
    shutil.copyfile(spec.tokenizer_path, output / 'tokenizer.json')
    manifest = {
        'schema': 2, 'architecture': 'static-embedding-mean', 'source_format': spec.source_format,
        'model_id': model_id, 'revision': revision, 'vocabulary_size': rows,
        'dimensions': dimensions, 'parameters': spec.weights.size, 'dtype': 'float32-le',
        'normalization': spec.normalization, 'shards': shards,
        'tokenization': {'add_special_tokens': False, 'skip_unknown': spec.skip_unknown},
        'transformations': spec.transformations,
        'source_sha256': digest(output / 'model.ink'), 'weights_sha256': digest(output / 'weights.f32'),
        'tokenizer_sha256': digest(output / 'tokenizer.json'),
        'upstream_files': {str(p.relative_to(model_dir.resolve())): digest(p) for p in spec.source_files},
        'numerics': 'ordered binary32 pooling and right-fold norm; upstream reductions checked with explicit tolerance',
    }
    (output / 'model.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest
