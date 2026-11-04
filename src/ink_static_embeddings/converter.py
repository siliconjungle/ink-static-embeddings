"""Lower Model2Vec static embeddings to ordinary Ink source plus F32 data.

This imports an existing architecture; it does not infer a symbolic algorithm
from opaque weights. The complete vocabulary is preserved outside source text.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from safetensors.numpy import load_file


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def emit_source(dimensions: int, shard_elements: int = 944896) -> str:
    if not 1 <= dimensions <= 4096:
        raise ValueError("unsupported embedding dimensions")
    return f'''// Generated from a Model2Vec static embedding architecture.
// Tokenization stays in the pinned upstream tokenizer. Every table lookup,
// mean-pooling operation and L2 normalization below executes inside Ink.
// No reassociation or fast-math permissions are introduced.
module static_embedding;
fn coordinates()->List<u32> {{
    let values:Buffer<u32>=repeat({dimensions},Buffer.empty(),fn(i)=>fn(values)=>values.push(i));
    return values.freeze();
}}
fn lookup(first:List<f32>,second:List<f32>,position:u32)->f32 {{
    return choose(position<{shard_elements},first.at_or(position,0.0),second.at_or(position-{shard_elements},0.0));
}}
fn coordinate(first:List<f32>,second:List<f32>,ids:List<u32>,dimension:u32)->f32 {{
    let total=foldl(ids.map(fn(id)=>lookup(first,second,id*{dimensions}+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
    return total/f32_from_u32(length(ids));
}}
fn encode(first:List<f32>,second:List<f32>,ids:List<u32>)->List<f32> {{
    let dimensions=coordinates();
    if length(ids)==0 {{return dimensions.map(fn(d)=>0.0);}}
    let mean=dimensions.map(fn(d)=>coordinate(first,second,ids,d));
    let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;
    return mean.map(fn(x)=>x/norm);
}}
'''


def convert(model_dir: Path, output: Path, model_id: str, revision: str, *, legacy: bool = False, **options) -> dict:
    if not legacy:
        from .static_model import convert_static
        return convert_static(model_dir, output, model_id, revision, **options)
    return _convert_legacy(model_dir, output, model_id, revision)


def _convert_legacy(model_dir: Path, output: Path, model_id: str, revision: str) -> dict:
    config = json.loads((model_dir / "config.json").read_text())
    if config.get("model_type") != "model2vec" or config.get("normalize") is not True:
        raise ValueError("only normalized Model2Vec static embeddings are supported")
    tensors = load_file(model_dir / "model.safetensors")
    if set(tensors) != {"embeddings"}:
        raise ValueError(f"unsupported tensor set: {sorted(tensors)}")
    weights = tensors["embeddings"]
    if weights.ndim != 2 or weights.dtype != np.float32 or not np.isfinite(weights).all():
        raise ValueError("expected a finite, rank-two F32 embedding table")
    rows, dims = weights.shape
    if rows * dims > 0xFFFFFFFF:
        raise ValueError("table exceeds Ink's u32 indexing domain")
    if dims != config.get("hidden_dim"):
        raise ValueError("model configuration/tensor shape disagree")
    output.mkdir(parents=True, exist_ok=True)
    shard_elements = ((rows + 1) // 2) * dims
    if max(shard_elements, rows * dims - shard_elements) >= 1_000_000:
        raise ValueError("model exceeds the current two-shard import domain")
    (output / "model.ink").write_text(emit_source(dims, shard_elements))
    weights.astype("<f4", copy=False).tofile(output / "weights.f32")
    manifest = {
        "schema": 1, "architecture": "model2vec-static-mean-l2", "model_id": model_id,
        "revision": revision, "vocabulary_size": rows, "dimensions": dims,
        "dtype": "float32-le", "parameters": rows * dims,
        "shard_elements": shard_elements,
        "source_sha256": sha256(output / "model.ink"),
        "weights_sha256": sha256(output / "weights.f32"),
        "upstream_safetensors_sha256": sha256(model_dir / "model.safetensors"),
        "tokenizer_sha256": sha256(model_dir / "tokenizer.json"),
        "numerics": "source-order F32; upstream NumPy reductions validated with explicit tolerance",
    }
    (output / "model.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
