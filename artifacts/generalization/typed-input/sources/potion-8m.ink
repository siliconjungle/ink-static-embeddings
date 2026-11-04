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

record Accumulator { index:u32,total:f32, }
fn pool_one(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,position:u32)->f32 {
 let document=quot_or(position,256,0);let dimension=rem_or(position,256,0);
 let count=lengths.at_or(document,0);let start=starts.at_or(document,0);
 let accumulator=repeat_until(4096,Accumulator{index:0,total:0.0},fn(a)=>a.index>=count,
  fn(i)=>fn(a)=>Accumulator{index:a.index+1,total:a.total+weights.at_or(tokens.at_or(start+i,0)*256+dimension,0.0)});
 return choose(count==0,0.0,accumulator.total/f32_from_u32(count));
}
fn pool_batch(weights:List<f32>,tokens:List<u32>,starts:List<u32>,lengths:List<u32>,positions:List<u32>)->List<f32> {
 return positions.map(fn(position)=>pool_one(weights,tokens,starts,lengths,position));
}
fn norm_one(means:List<f32>,document:u32)->f32 {
 let squared=repeat(256,0.0,fn(i)=>fn(accumulator)=>means.at_or(document*256+255-i,0.0)*means.at_or(document*256+255-i,0.0)+accumulator);
 return sqrt(squared)+1.0e-32;
}
fn norm_batch(means:List<f32>,documents:List<u32>)->List<f32> {
 return documents.map(fn(document)=>norm_one(means,document));
}
fn normalize_batch(means:List<f32>,norms:List<f32>,positions:List<u32>)->List<f32> {
 return positions.map(fn(position)=>means.at_or(position,0.0)/norms.at_or(quot_or(position,256,0),1.0));
}
