// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4];}
fn lookup(weights:List<f32>,position:u32)->f32 {return weights.at_or(position,0.0);}
fn coordinate(weights:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weights,id*5+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weights:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weights,ids,d));
 let magnitude=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator));let norm=choose(magnitude<1.0e-12,1.0e-12,magnitude);return mean.map(fn(x)=>x/norm);
}

record Accumulator { index:u32,total:f32, }
fn pool_one(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,position:u32)->f32 {
 let document=quot_or(position,5,0);let dimension=rem_or(position,5,0);
 let count=lengths.at_or(document,0);let start=starts.at_or(document,0);
 let accumulator=repeat_until(4096,Accumulator{index:0,total:0.0},fn(a)=>a.index>=count,
  fn(i)=>fn(a)=>Accumulator{index:a.index+1,total:a.total+weights.at_or(tokens.at_or(start+i,0)*5+dimension,0.0)});
 return choose(count==0,0.0,accumulator.total/f32_from_u32(count));
}
fn pool_batch(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,positions:List<u32>)->List<f32> {
 return positions.map(fn(position)=>pool_one(weights,tokens,starts,lengths,position));
}
fn norm_one(means:List<f32>,document:u32)->f32 {
 let squared=repeat(5,0.0,fn(i)=>fn(accumulator)=>means.at_or(document*5+4-i,0.0)*means.at_or(document*5+4-i,0.0)+accumulator);
 return choose(sqrt(squared)<1.0e-12,1.0e-12,sqrt(squared));
}
fn norm_batch(means:List<f32>,documents:List<u32>)->List<f32> {
 return documents.map(fn(document)=>norm_one(means,document));
}
fn normalize_batch(means:List<f32>,norms:List<f32>,positions:List<u32>)->List<f32> {
 return positions.map(fn(position)=>means.at_or(position,0.0)/norms.at_or(quot_or(position,5,0),1.0));
}
