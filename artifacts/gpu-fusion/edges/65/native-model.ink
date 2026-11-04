// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59].concat([60,61,62,63,64]))));}
fn lookup(weights:List<f32>,position:u32)->f32 {return weights.at_or(position,0.0);}
fn coordinate(weights:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weights,id*65+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weights:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weights,ids,d));
 let magnitude=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator));let norm=choose(magnitude<1e-12,1e-12,magnitude);return mean.map(fn(x)=>x/norm);
}

record RetainedEmbedding { weights:Buffer<f32>,embedding:List<f32>, }
fn encode_owned(weights:Buffer<f32>,ids:List<u32>)->RetainedEmbedding {
 let mean=coordinates().map(fn(d)=>choose(length(ids)==0,0.0,
  foldl(ids,0.0,fn(id)=>fn(accumulator)=>accumulator+weights.at_or(id*65+d,0.0))/f32_from_u32(length(ids))));
 let magnitude=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator));let norm=choose(magnitude<1e-12,1e-12,magnitude);let embedding=mean.map(fn(x)=>x/norm);
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
