// Generated from a Model2Vec static embedding architecture.
// Tokenization stays in the pinned upstream tokenizer. Every table lookup,
// mean-pooling operation and L2 normalization below executes inside Ink.
// No reassociation or fast-math permissions are introduced.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63])));}
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
