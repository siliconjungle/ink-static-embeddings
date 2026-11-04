// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6];}
fn lookup(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,weight_8:List<f32>,weight_9:List<f32>,weight_10:List<f32>,weight_11:List<f32>,weight_12:List<f32>,position:u32)->f32 {return choose(position<66,choose(position<33,choose(position<11,weight_0.at_or(position-0,0.0),choose(position<22,weight_1.at_or(position-11,0.0),weight_2.at_or(position-22,0.0))),choose(position<44,weight_3.at_or(position-33,0.0),choose(position<55,weight_4.at_or(position-44,0.0),weight_5.at_or(position-55,0.0)))),choose(position<99,choose(position<77,weight_6.at_or(position-66,0.0),choose(position<88,weight_7.at_or(position-77,0.0),weight_8.at_or(position-88,0.0))),choose(position<121,choose(position<110,weight_9.at_or(position-99,0.0),weight_10.at_or(position-110,0.0)),choose(position<132,weight_11.at_or(position-121,0.0),weight_12.at_or(position-132,0.0)))));}
fn coordinate(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,weight_8:List<f32>,weight_9:List<f32>,weight_10:List<f32>,weight_11:List<f32>,weight_12:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,weight_8,weight_9,weight_10,weight_11,weight_12,id*7+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,weight_8:List<f32>,weight_9:List<f32>,weight_10:List<f32>,weight_11:List<f32>,weight_12:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,weight_8,weight_9,weight_10,weight_11,weight_12,ids,d));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}

fn quad_mean(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,weight_8:List<f32>,weight_9:List<f32>,weight_10:List<f32>,weight_11:List<f32>,weight_12:List<f32>,ids:List<u32>,base:u32)->Vec4<f32>{
 let acc=foldl(ids,vec4(0.0,0.0,0.0,0.0),fn(id)=>fn(acc)=>vec4(acc.x+choose(base+0<7,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,weight_8,weight_9,weight_10,weight_11,weight_12,id*7+base+0),0.0),acc.y+choose(base+1<7,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,weight_8,weight_9,weight_10,weight_11,weight_12,id*7+base+1),0.0),acc.z+choose(base+2<7,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,weight_8,weight_9,weight_10,weight_11,weight_12,id*7+base+2),0.0),acc.w+choose(base+3<7,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,weight_8,weight_9,weight_10,weight_11,weight_12,id*7+base+3),0.0)));
 return vec4(acc.x/f32_from_u32(length(ids)),acc.y/f32_from_u32(length(ids)),acc.z/f32_from_u32(length(ids)),acc.w/f32_from_u32(length(ids)));
}
fn quad_lane(q:Vec4<f32>,lane:u32)->f32{return choose(lane==0,q.x,choose(lane==1,q.y,choose(lane==2,q.z,q.w)));}
fn encode_quads(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,weight_8:List<f32>,weight_9:List<f32>,weight_10:List<f32>,weight_11:List<f32>,weight_12:List<f32>,ids:List<u32>)->List<f32>{
 if length(ids)==0{return coordinates().map(fn(d)=>0.0);}
 let groups:List<u32>=[0,4];
 let quads=groups.map(fn(base)=>quad_mean(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,weight_8,weight_9,weight_10,weight_11,weight_12,ids,base));
 let mean=coordinates().map(fn(d)=>quad_lane(quads.at_or(quot_or(d,4,0),vec4(0.0,0.0,0.0,0.0)),rem_or(d,4,0)));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}
