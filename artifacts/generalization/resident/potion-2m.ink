// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63])));}
fn lookup(weights:List<f32>,position:u32)->f32 {return weights.at_or(position,0.0);}
fn coordinate(weights:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weights,id*64+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weights:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weights,ids,d));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}

record Accumulator { index:u32,total:f32, }
fn pool_one(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,position:u32)->f32 {
 let document=quot_or(position,64,0);let dimension=rem_or(position,64,0);
 let count=lengths.at_or(document,0);let start=starts.at_or(document,0);
 let accumulator=repeat_until(4096,Accumulator{index:0,total:0.0},fn(a)=>a.index>=count,
  fn(i)=>fn(a)=>Accumulator{index:a.index+1,total:a.total+weights.at_or(tokens.at_or(start+i,0)*64+dimension,0.0)});
 return choose(count==0,0.0,accumulator.total/f32_from_u32(count));
}
fn pool_batch(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,positions:List<u32>)->List<f32> {
 return positions.map(fn(position)=>pool_one(weights,tokens,starts,lengths,position));
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

record DotState{index:u32,total:f32,}
// Numeric contract: callers declare dimensions <= 4096. The explicit bound
// remains visible in source; model metadata already enforces that limit.
fn bounded_dot(left:List<f32>,right:List<f32>,a:u32,b:u32,dimensions:u32)->f32{
 let result=repeat_until(4096,DotState{index:0,total:0.0},fn(state)=>state.index>=dimensions,
  fn(i,state)=>DotState{index:state.index+1,total:state.total+left.at_or(a+i,0.0)*right.at_or(b+i,0.0)});
 return result.total;
}
pub fn similarity(queries:List<f32>,corpus:List<f32>,documents:u32,dimensions:u32,positions:List<u32>)->List<f32>{
 return positions.map(fn(position)=>bounded_dot(queries,corpus,quot_or(position,documents,0)*dimensions,rem_or(position,documents,0)*dimensions,dimensions));
}
pub fn postprocess(values:List<f32>)->List<f32>{return values.map(fn(value)=>value*0.5+0.25);}
