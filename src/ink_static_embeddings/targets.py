"""Generate target layouts from the architecture manifest, never a model ID."""
import json
from pathlib import Path

from .static_model import digest, emit_model, normalization_source


def prepare_targets(directory: Path, max_tokens: int = 4096) -> dict:
    manifest = json.loads((directory / 'model.json').read_text())
    if manifest['schema'] != 2:
        raise ValueError('general target generation requires schema 2; historical experiment uses scripts/build_targets.py')
    if not 1 <= max_tokens <= 1_000_000:
        raise ValueError('max_tokens must be 1..1000000')
    d = manifest['dimensions']
    normalization = manifest['normalization']
    flat = emit_model(d, manifest['shards'], normalization, flat=True)
    if normalization['kind'] == 'none':
        norm = '1.0'
    elif normalization['kind'] == 'l2-add-epsilon':
        norm = f"sqrt(squared)+{normalization['epsilon']}"
    else:
        norm = f"choose(sqrt(squared)<{normalization['epsilon']},{normalization['epsilon']},sqrt(squared))"
    gpu = flat + f'''
record Accumulator {{ index:u32,total:f32, }}
fn pool_one(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,position:u32)->f32 {{
 let document=quot_or(position,{d},0);let dimension=rem_or(position,{d},0);
 let count=lengths.at_or(document,0);let start=starts.at_or(document,0);
 let accumulator=repeat_until({max_tokens},Accumulator{{index:0,total:0.0}},fn(a)=>a.index>=count,
  fn(i)=>fn(a)=>Accumulator{{index:a.index+1,total:a.total+weights.at_or(tokens.at_or(start+i,0)*{d}+dimension,0.0)}});
 return choose(count==0,0.0,accumulator.total/f32_from_u32(count));
}}
fn pool_batch(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,positions:List<u32>)->List<f32> {{
 return positions.map(fn(position)=>pool_one(weights,tokens,starts,lengths,position));
}}
fn norm_one(means:List<f32>,document:u32)->f32 {{
 let squared=repeat({d},0.0,fn(i)=>fn(accumulator)=>means.at_or(document*{d}+{d-1}-i,0.0)*means.at_or(document*{d}+{d-1}-i,0.0)+accumulator);
 return {norm};
}}
fn norm_batch(means:List<f32>,documents:List<u32>)->List<f32> {{
 return documents.map(fn(document)=>norm_one(means,document));
}}
fn normalize_batch(means:List<f32>,norms:List<f32>,positions:List<u32>)->List<f32> {{
 return positions.map(fn(position)=>means.at_or(position,0.0)/norms.at_or(quot_or(position,{d},0),1.0));
}}
'''
    embedding = normalization_source(normalization).replace('return ', 'let embedding=')
    native = flat + f'''
record RetainedEmbedding {{ weights:Buffer<f32>,embedding:List<f32>, }}
fn encode_owned(weights:Buffer<f32>,ids:List<u32>)->RetainedEmbedding {{
 let mean=coordinates().map(fn(d)=>choose(length(ids)==0,0.0,
  foldl(ids,0.0,fn(id)=>fn(accumulator)=>accumulator+weights.at_or(id*{d}+d,0.0))/f32_from_u32(length(ids))));
 {embedding}
 return RetainedEmbedding{{weights:weights,embedding:embedding}};
}}
record NativeBatch {{ weights:Buffer<f32>,output:Buffer<f32>, }}
fn native_advance(state:NativeBatch,ids:List<u32>)->NativeBatch {{
 let encoded=encode_owned(state.weights,ids);
 return NativeBatch{{weights:encoded.weights,output:state.output.append(buffer(encoded.embedding))}};
}}
fn native_batch(weights:List<f32>,requests:List<List<u32>>)->List<f32> {{
 let initial=NativeBatch{{weights:buffer(weights),output:Buffer.empty()}};
 let final=foldl(requests,initial,fn(ids)=>fn(state)=>native_advance(state,ids));
 return final.output.freeze();
}}
'''
    (directory / 'gpu-model.ink').write_text(gpu)
    (directory / 'native-model.ink').write_text(native)
    record = {'schema': 2, 'dimensions': d, 'max_tokens': max_tokens,
              'normalization': normalization, 'gpu_weight_layout': 'one-flat-F32-buffer',
              'gpu_limits': 'Existing Ink 256 MiB live allocation budget and actual device binding/buffer limits apply; unsupported sizes fail explicitly.',
              'sources': {name: digest(directory / name) for name in ['model.ink', 'gpu-model.ink', 'native-model.ink']}}
    (directory / 'targets.json').write_text(json.dumps(record, indent=2) + '\n')
    return record
