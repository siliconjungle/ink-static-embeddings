module packed_static;
fn coordinates()->List<u32>{return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63])));}
fn row(rows_0:List<List<f32>>,rows_1:List<List<f32>>,id:u32)->List<f32>{return choose(id<15369,rows_0.at_or(id-0,[]),rows_1.at_or(id-15369,[]));}
fn add(sum:List<f32>,values:List<f32>)->List<f32>{return sum.map_indexed(fn(d)=>fn(x)=>x+values.at_or(d,0.0));}
fn encode(rows_0:List<List<f32>>,rows_1:List<List<f32>>,ids:List<u32>)->List<f32>{
 if length(ids)==0{return coordinates().map(fn(d)=>0.0);}
 let sum=foldl(ids,coordinates().map(fn(d)=>0.0),fn(id)=>fn(a)=>add(a,row(rows_0,rows_1,id)));
 let mean=sum.map(fn(x)=>x/f32_from_u32(length(ids)));
 let norm=sqrt(foldr(mean.map(fn(x)=>x*x),0.0,fn(value)=>fn(accumulator)=>value+accumulator))+1.0e-32;return mean.map(fn(x)=>x/norm);
}
