// Metadata-driven static embedding model; exact source-order F32.
module static_embedding;
fn coordinates()->List<u32> {return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63])));}
fn lookup(weight_0:List<f32>,weight_1:List<f32>,position:u32)->f32 {return choose(position<999000,weight_0.at_or(position-0,0.0),weight_1.at_or(position-999000,0.0));}
fn coordinate(weight_0:List<f32>,weight_1:List<f32>,ids:List<u32>,dimension:u32)->f32 {
 let total=foldl(ids.map(fn(id)=>lookup(weight_0,weight_1,id*64+dimension)),0.0,fn(value)=>fn(accumulator)=>accumulator+value);
 return total/f32_from_u32(length(ids));
}
fn encode_reference(weight_0:List<f32>,weight_1:List<f32>,ids:List<u32>)->List<f32> {
 let dimensions=coordinates();
 if length(ids)==0 {return dimensions.map(fn(d)=>0.0);}
 let mean=dimensions.map(fn(d)=>coordinate(weight_0,weight_1,ids,d));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}

record Tile{v0:f32,v1:f32,v2:f32,v3:f32,}
fn tile(weight_0:List<f32>,weight_1:List<f32>,ids:List<u32>,base:u32)->Tile{
 let sum=foldl(ids,Tile{v0:0.0,v1:0.0,v2:0.0,v3:0.0},fn(id)=>fn(a)=>tile_step(weight_0,weight_1,id*64,base,a));
 return Tile{v0:sum.v0/f32_from_u32(length(ids)),v1:sum.v1/f32_from_u32(length(ids)),v2:sum.v2/f32_from_u32(length(ids)),v3:sum.v3/f32_from_u32(length(ids))};
}
fn tile_step(weight_0:List<f32>,weight_1:List<f32>,row:u32,base:u32,a:Tile)->Tile{return Tile{v0:a.v0+choose(base+0<64,lookup(weight_0,weight_1,row+base+0),0.0),v1:a.v1+choose(base+1<64,lookup(weight_0,weight_1,row+base+1),0.0),v2:a.v2+choose(base+2<64,lookup(weight_0,weight_1,row+base+2),0.0),v3:a.v3+choose(base+3<64,lookup(weight_0,weight_1,row+base+3),0.0)};}
fn lane(q:Tile,lane:u32)->f32{return choose(lane==0,q.v0,choose(lane==1,q.v1,choose(lane==2,q.v2,q.v3)));}
fn encode(weight_0:List<f32>,weight_1:List<f32>,ids:List<u32>)->List<f32>{
 if length(ids)==0{return coordinates().map(fn(d)=>0.0);}
 let groups:List<u32>=[0,4,8,12,16,20,24,28].concat([32,36,40,44,48,52,56,60]);
 let tiles=groups.map(fn(base)=>tile(weight_0,weight_1,ids,base));
 let mean=coordinates().map(fn(d)=>lane(tiles.at_or(quot_or(d,4,0),Tile{v0:0.0,v1:0.0,v2:0.0,v3:0.0}),rem_or(d,4,0)));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}
