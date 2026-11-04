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
