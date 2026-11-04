// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4];}
fn lookup(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,position:u32)->f32 {return choose(position<39,choose(position<13,weight_0.at_or(position-0,0.0),choose(position<26,weight_1.at_or(position-13,0.0),weight_2.at_or(position-26,0.0))),choose(position<65,choose(position<52,weight_3.at_or(position-39,0.0),weight_4.at_or(position-52,0.0)),choose(position<78,weight_5.at_or(position-65,0.0),weight_6.at_or(position-78,0.0))));}
fn coordinate(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,id*5+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,ids,d));
 let magnitude=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator));let norm=choose(magnitude<1.0e-12,1.0e-12,magnitude);return mean.map(fn(x)=>x/norm);
}
