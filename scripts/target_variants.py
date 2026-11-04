"""Equivalent source constructions for GPU eligibility; no compiler patches.

The original growing coordinate Buffer falls back to CPU. Fixed architecture
coordinates can instead be expressed as a balanced concatenation of literals.
The batch entrypoints expose independent embedding coordinates to the backend
while retaining each embedding's exact ordered F32 reductions.
"""
import hashlib
import json
from pathlib import Path


def literal_tree(xs):
    if len(xs)<=8:return '['+','.join(map(str,xs))+']'
    middle=len(xs)//2
    return literal_tree(xs[:middle])+'.concat('+literal_tree(xs[middle:])+')'


BATCH='''
record Accumulator { index:u32,total:f32, }
fn pool_one(first:List<f32>,second:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,position:u32)->f32 {
  let document=quot_or(position,64,0);let dimension=rem_or(position,64,0);
  let count=lengths.at_or(document,0);let start=starts.at_or(document,0);
  let accumulator=repeat_until(512,Accumulator{index:0,total:0.0},fn(a)=>a.index>=count,
   fn(i)=>fn(a)=>Accumulator{index:a.index+1,total:a.total+lookup(first,second,tokens.at_or(start+i,0)*64+dimension)});
  return choose(count==0,0.0,accumulator.total/f32_from_u32(count));
}
fn pool_batch(first:List<f32>,second:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,positions:List<u32>)->List<f32> {
 return positions.map(fn(position)=>pool_one(first,second,tokens,starts,lengths,position));
}
fn norm_one(means:List<f32>,document:u32)->f32 {
  let squared=repeat(64,0.0,fn(i)=>fn(accumulator)=>means.at_or(document*64+63-i,0.0)*means.at_or(document*64+63-i,0.0)+accumulator);
  return sqrt(squared)+1.0e-32;
}
fn norm_batch(means:List<f32>,documents:List<u32>)->List<f32> {
 return documents.map(fn(document)=>norm_one(means,document));
}
fn normalize_batch(means:List<f32>,norms:List<f32>,positions:List<u32>)->List<f32> {
 return positions.map(fn(position)=>means.at_or(position,0.0)/norms.at_or(quot_or(position,64,0),1.0));
}
'''

NATIVE='''
record RetainedEmbedding { first:Buffer<f32>,second:Buffer<f32>,embedding:List<f32>, }
fn encode_owned_model(first:Buffer<f32>,second:Buffer<f32>,ids:List<u32>)->RetainedEmbedding {
 let dimensions=coordinates();
 let mean=dimensions.map(fn(d)=>choose(length(ids)==0,0.0,
  foldl(ids,0.0,fn(id)=>fn(accumulator)=>accumulator+choose(id*64+d<944896,
   first.at_or(id*64+d,0.0),second.at_or(id*64+d-944896,0.0)))/f32_from_u32(length(ids))));
 let norm=sqrt(foldr(mean,0.0,fn(x)=>fn(accumulator)=>x*x+accumulator))+1.0e-32;
 let embedding=mean.map(fn(x)=>x/norm);
 return RetainedEmbedding{first:first,second:second,embedding:embedding};
}
record NativeBatch { first:Buffer<f32>,second:Buffer<f32>,output:Buffer<f32>, }
fn native_advance(state:NativeBatch,ids:List<u32>)->NativeBatch {
 let encoded=encode_owned_model(state.first,state.second,ids);
 return NativeBatch{first:encoded.first,second:encoded.second,output:state.output.append(buffer(encoded.embedding))};
}
fn native_batch(first:List<f32>,second:List<f32>,requests:List<List<u32>>)->List<f32> {
 let initial=NativeBatch{first:buffer(first),second:buffer(second),output:Buffer.empty()};
 let final=foldl(requests,initial,fn(ids)=>fn(state)=>native_advance(state,ids));
 return final.output.freeze();
}
record RowAccumulator { first:Buffer<f32>,second:Buffer<f32>,sums:Buffer<f32>, }
fn row_set(sums:Buffer<f32>,dimension:u32,value:f32)->Buffer<f32> {
 let old=sums.at_or(dimension,0.0);return sums.set(dimension,old+value);
}
fn row_accumulate(state:RowAccumulator,id:u32)->RowAccumulator {
 let first=state.first;let second=state.second;let initial=state.sums;
 let sums=repeat(64,initial,fn(d)=>fn(sums)=>row_set(sums,d,choose(id*64+d<944896,
  first.at_or(id*64+d,0.0),second.at_or(id*64+d-944896,0.0))));
 return RowAccumulator{first:first,second:second,sums:sums};
}
fn encode_owned_row_model(first:Buffer<f32>,second:Buffer<f32>,ids:List<u32>)->RetainedEmbedding {
 let initial=RowAccumulator{first:first,second:second,sums:buffer_fill(64,0.0)};
 let final=foldl(ids,initial,fn(id)=>fn(state)=>row_accumulate(state,id));
 let mean=final.sums.freeze().map(fn(x)=>choose(length(ids)==0,0.0,x/f32_from_u32(length(ids))));
 let norm=sqrt(foldr(mean,0.0,fn(x)=>fn(accumulator)=>x*x+accumulator))+1.0e-32;
 let embedding=mean.map(fn(x)=>x/norm);
 return RetainedEmbedding{first:final.first,second:final.second,embedding:embedding};
}
fn native_row_advance(state:NativeBatch,ids:List<u32>)->NativeBatch {
 let encoded=encode_owned_row_model(state.first,state.second,ids);
 return NativeBatch{first:encoded.first,second:encoded.second,output:state.output.append(buffer(encoded.embedding))};
}
fn native_row_batch(first:List<f32>,second:List<f32>,requests:List<List<u32>>)->List<f32> {
 let initial=NativeBatch{first:buffer(first),second:buffer(second),output:Buffer.empty()};
 let final=foldl(requests,initial,fn(ids)=>fn(state)=>native_row_advance(state,ids));
 return final.output.freeze();
}
'''


def main():
    build=Path('build');source=(build/'model.ink').read_text()
    manifest=json.loads((build/'model.json').read_text())
    if manifest['dimensions']!=64 or manifest['shard_elements']!=944896:
        raise ValueError('target variants currently support only the pinned Potion 2M shape')
    start=source.index('fn coordinates()');end=source.index('fn lookup(',start)
    gpu=source[:start]+'fn coordinates()->List<u32> {return '+literal_tree(list(range(64)))+';}\n'+source[end:]
    (build/'gpu-model.ink').write_text(gpu)
    (build/'batch-model.ink').write_text(gpu+BATCH)
    (build/'native-owned-model.ink').write_text(source+NATIVE)
    record={'schema':1,'original_sha256':hashlib.sha256(source.encode()).hexdigest(),
      'gpu_source_sha256':hashlib.sha256(gpu.encode()).hexdigest(),
      'batch_source_sha256':hashlib.sha256((gpu+BATCH).encode()).hexdigest(),
      'native_owned_source_sha256':hashlib.sha256((source+NATIVE).encode()).hexdigest(),
      'domain':'64 dimensions, valid model token IDs, at most 512 tokens per document; complete original F32 arithmetic order retained'}
    (build/'target-variants.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record,indent=2))


if __name__=='__main__':main()
