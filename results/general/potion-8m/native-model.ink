// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63]))).concat([64,65,66,67,68,69,70,71].concat([72,73,74,75,76,77,78,79]).concat([80,81,82,83,84,85,86,87].concat([88,89,90,91,92,93,94,95])).concat([96,97,98,99,100,101,102,103].concat([104,105,106,107,108,109,110,111]).concat([112,113,114,115,116,117,118,119].concat([120,121,122,123,124,125,126,127])))).concat([128,129,130,131,132,133,134,135].concat([136,137,138,139,140,141,142,143]).concat([144,145,146,147,148,149,150,151].concat([152,153,154,155,156,157,158,159])).concat([160,161,162,163,164,165,166,167].concat([168,169,170,171,172,173,174,175]).concat([176,177,178,179,180,181,182,183].concat([184,185,186,187,188,189,190,191]))).concat([192,193,194,195,196,197,198,199].concat([200,201,202,203,204,205,206,207]).concat([208,209,210,211,212,213,214,215].concat([216,217,218,219,220,221,222,223])).concat([224,225,226,227,228,229,230,231].concat([232,233,234,235,236,237,238,239]).concat([240,241,242,243,244,245,246,247].concat([248,249,250,251,252,253,254,255])))));}
fn lookup(weights:List<f32>,position:u32)->f32 {return weights.at_or(position,0.0);}
fn coordinate(weights:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weights,id*256+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weights:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weights,ids,d));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}

record RetainedEmbedding { weights:Buffer<f32>,embedding:List<f32>, }
fn encode_owned(weights:Buffer<f32>,ids:List<u32>)->RetainedEmbedding {
 let mean=coordinates().map(fn(d)=>choose(length(ids)==0,0.0,
  foldl(ids,0.0,fn(id)=>fn(accumulator)=>accumulator+weights.at_or(id*256+d,0.0))/f32_from_u32(length(ids))));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;let embedding=mean.map(fn(x)=>x/norm);
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
