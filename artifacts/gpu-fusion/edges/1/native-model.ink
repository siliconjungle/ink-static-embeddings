// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0];}
fn lookup(weights:List<f32>,position:u32)->f32 {return weights.at_or(position,0.0);}
fn coordinate(weights:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weights,id*1+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weights:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weights,ids,d));
 return mean;
}

record RetainedEmbedding { weights:Buffer<f32>,embedding:List<f32>, }
fn encode_owned(weights:Buffer<f32>,ids:List<u32>)->RetainedEmbedding {
 let mean=coordinates().map(fn(d)=>choose(length(ids)==0,0.0,
  foldl(ids,0.0,fn(id)=>fn(accumulator)=>accumulator+weights.at_or(id*1+d,0.0))/f32_from_u32(length(ids))));
 let embedding=mean;
 return RetainedEmbedding{weights:weights,embedding:embedding};
}
record NativeBatch { weights:Buffer<f32>,output:Buffer<f32>, }
fn native_advance(state:NativeBatch,ids:List<u32>)->NativeBatch {
 let encoded=encode_owned(state.weights,ids);
 return NativeBatch{weights:encoded.weights,output:state.output.append(buffer(encoded.embedding))};
}
fn native_batch(weights:List<f32>,requests:List<List<u32>>)->List<f32> {
 let initial=NativeBatch{weights:buffer(weights),output:Buffer.empty()};
 let final=foldl(requests,initial,fn(ids)=>fn(state)=>native_advance(state,ids));
 return final.output.freeze();
}
