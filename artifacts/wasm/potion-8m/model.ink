// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63]))).concat([64,65,66,67,68,69,70,71].concat([72,73,74,75,76,77,78,79]).concat([80,81,82,83,84,85,86,87].concat([88,89,90,91,92,93,94,95])).concat([96,97,98,99,100,101,102,103].concat([104,105,106,107,108,109,110,111]).concat([112,113,114,115,116,117,118,119].concat([120,121,122,123,124,125,126,127])))).concat([128,129,130,131,132,133,134,135].concat([136,137,138,139,140,141,142,143]).concat([144,145,146,147,148,149,150,151].concat([152,153,154,155,156,157,158,159])).concat([160,161,162,163,164,165,166,167].concat([168,169,170,171,172,173,174,175]).concat([176,177,178,179,180,181,182,183].concat([184,185,186,187,188,189,190,191]))).concat([192,193,194,195,196,197,198,199].concat([200,201,202,203,204,205,206,207]).concat([208,209,210,211,212,213,214,215].concat([216,217,218,219,220,221,222,223])).concat([224,225,226,227,228,229,230,231].concat([232,233,234,235,236,237,238,239]).concat([240,241,242,243,244,245,246,247].concat([248,249,250,251,252,253,254,255])))));}
fn lookup(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,position:u32)->f32 {return choose(position<3996000,choose(position<1998000,choose(position<999000,weight_0.at_or(position-0,0.0),weight_1.at_or(position-999000,0.0)),choose(position<2997000,weight_2.at_or(position-1998000,0.0),weight_3.at_or(position-2997000,0.0))),choose(position<5994000,choose(position<4995000,weight_4.at_or(position-3996000,0.0),weight_5.at_or(position-4995000,0.0)),choose(position<6993000,weight_6.at_or(position-5994000,0.0),weight_7.at_or(position-6993000,0.0))));}
fn coordinate(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,id*256+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,ids,d));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}

fn quad_mean(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,ids:List<u32>,base:u32)->Vec4<f32>{
 let acc=foldl(ids,vec4(0.0,0.0,0.0,0.0),fn(id)=>fn(acc)=>vec4(acc.x+choose(base+0<256,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,id*256+base+0),0.0),acc.y+choose(base+1<256,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,id*256+base+1),0.0),acc.z+choose(base+2<256,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,id*256+base+2),0.0),acc.w+choose(base+3<256,lookup(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,id*256+base+3),0.0)));
 return vec4(acc.x/f32_from_u32(length(ids)),acc.y/f32_from_u32(length(ids)),acc.z/f32_from_u32(length(ids)),acc.w/f32_from_u32(length(ids)));
}
fn quad_lane(q:Vec4<f32>,lane:u32)->f32{return choose(lane==0,q.x,choose(lane==1,q.y,choose(lane==2,q.z,q.w)));}
fn encode_quads(weight_0:List<f32>,weight_1:List<f32>,weight_2:List<f32>,weight_3:List<f32>,weight_4:List<f32>,weight_5:List<f32>,weight_6:List<f32>,weight_7:List<f32>,ids:List<u32>)->List<f32>{
 if length(ids)==0{return coordinates().map(fn(d)=>0.0);}
 let groups:List<u32>=[0,4,8,12,16,20,24,28].concat([32,36,40,44,48,52,56,60]).concat([64,68,72,76,80,84,88,92].concat([96,100,104,108,112,116,120,124])).concat([128,132,136,140,144,148,152,156].concat([160,164,168,172,176,180,184,188]).concat([192,196,200,204,208,212,216,220].concat([224,228,232,236,240,244,248,252])));
 let quads=groups.map(fn(base)=>quad_mean(weight_0,weight_1,weight_2,weight_3,weight_4,weight_5,weight_6,weight_7,ids,base));
 let mean=coordinates().map(fn(d)=>quad_lane(quads.at_or(quot_or(d,4,0),vec4(0.0,0.0,0.0,0.0)),rem_or(d,4,0)));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}
