// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59].concat([60,61,62,63,64]))));}
fn lookup(weight_0:List<f32>,position:u32)->f32 {return weight_0.at_or(position-0,0.0);}
fn coordinate(weight_0:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weight_0,id*65+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weight_0:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weight_0,ids,d));
 let magnitude=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator));let norm=choose(magnitude<1e-12,1e-12,magnitude);return mean.map(fn(x)=>x/norm);
}
