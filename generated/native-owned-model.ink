// Generated from a Model2Vec static embedding architecture.
// Tokenization stays in the pinned upstream tokenizer. Every table lookup,
// mean-pooling operation and L2 normalization below executes inside Ink.
// No reassociation or fast-math permissions are introduced.
module static_embedding;
fn coordinates()->List<u32> {
    let values:Buffer<u32>=repeat(64,Buffer.empty(),fn(i)=>fn(values)=>values.push(i));
    return values.freeze();
}
fn lookup(first:List<f32>,second:List<f32>,position:u32)->f32 {
    return choose(position<944896,first.at_or(position,0.0),second.at_or(position-944896,0.0));
}
fn coordinate(first:List<f32>,second:List<f32>,ids:List<u32>,dimension:u32)->f32 {
    let total=foldl(ids.map(fn(id)=>lookup(first,second,id*64+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
    return total/f32_from_u32(length(ids));
}
fn encode(first:List<f32>,second:List<f32>,ids:List<u32>)->List<f32> {
    let dimensions=coordinates();
    if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
    let mean=dimensions.map(fn(d)=>coordinate(first,second,ids,d));
    let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;
    return mean.map(fn(x)=>x/norm);
}

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
