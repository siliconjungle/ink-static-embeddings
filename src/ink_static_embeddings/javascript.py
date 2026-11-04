"""Authored row-oriented Ink layout; weights remain bit-identical table data.

Each token selects a row once, then visits adjacent dimensions. Every dimension
still adds tokens in source order. The compiler implements the numeric Buffer;
this adapter supplies no target-code rewrite or equality/profitability proof.
"""
from .static_model import MAX_SHARD_ELEMENTS, literal_tree


def row_layout(manifest: dict) -> dict:
    d=manifest['dimensions'];v=manifest['vocabulary_size']
    if not 1<=d<=4096 or v<1 or manifest['parameters']!=d*v:raise ValueError('Invalid static model shape')
    if manifest['normalization']['kind'] not in {'none','l2-add-epsilon','l2-clamp'}:raise ValueError('Unsupported normalization')
    rows_per_shard=MAX_SHARD_ELEMENTS//(d+1)
    shards=[{'name':f'rows_{i}','row_offset':start,'rows':min(rows_per_shard,v-start)}
            for i,start in enumerate(range(0,v,rows_per_shard))]
    return {'schema':1,'kind':'row-packed-f32','base_source_sha256':manifest['source_sha256'],
            'weights_sha256':manifest['weights_sha256'],'dimensions':d,'vocabulary_size':v,
            'shards':shards,'scope':__doc__}


def emit_rows(manifest: dict, layout: dict) -> str:
    d=manifest['dimensions'];parts=layout['shards']
    params=','.join(f'{s["name"]}:List<List<f32>>' for s in parts)
    names=','.join(s['name'] for s in parts)
    def lookup(shards):
        if len(shards)==1:
            s=shards[0];return f"{s['name']}.at_or(id-{s['row_offset']},[])"
        middle=len(shards)//2
        return f"choose(id<{shards[middle]['row_offset']},{lookup(shards[:middle])},{lookup(shards[middle:])})"
    policy=manifest['normalization']
    if policy['kind']=='none':finish='return mean;'
    else:
        magnitude='sqrt(foldr(mean,0.0,fn(x)=>fn(total)=>x*x+total))'
        divisor=(f"magnitude+{policy['epsilon']}" if policy['kind']=='l2-add-epsilon'
                 else f"choose(magnitude<{policy['epsilon']},{policy['epsilon']},magnitude)")
        finish=f'let magnitude={magnitude};let divisor={divisor};return mean.map(fn(x)=>x/divisor);'
    return f'''// Authored row-oriented Ink; unchanged F32 weights and token-sum order.
module row_static_embedding;
fn coordinates()->List<u32>{{return {literal_tree(list(range(d)))};}}
fn row({params},id:u32)->List<f32>{{return {lookup(parts)};}}
fn add(values:List<f32>,sums:Buffer<f32>)->Buffer<f32>{{
 return sums.map_indexed(fn(d)=>fn(total)=>total+values.at_or(d,0.0));
}}
fn short_mean({params},ids:List<u32>)->List<f32>{{
 let selected=ids.map(fn(id)=>row({names},id));
 let count=f32_from_u32(length(ids));
 return coordinates().map(fn(d)=>foldl(selected,0.0,fn(values)=>fn(total)=>total+values.at_or(d,0.0))/count);
}}
fn long_mean({params},ids:List<u32>)->List<f32>{{
 let sums=foldl(ids,buffer_fill({d},0.0),fn(id)=>fn(sums)=>add(row({names},id),sums));
 let count=f32_from_u32(length(ids));
 return sums.freeze().map(fn(x)=>x/count);
}}
fn encode({params},ids:List<u32>)->List<f32>{{
 if length(ids)==0{{return coordinates().map(fn(d)=>0.0);}}
 let mean=choose(length(ids)<=16,short_mean({names},ids),long_mean({names},ids));
 {finish}
}}
'''
