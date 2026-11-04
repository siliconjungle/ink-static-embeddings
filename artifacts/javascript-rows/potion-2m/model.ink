// Authored row-oriented Ink; unchanged F32 weights and token-sum order.
module row_static_embedding;
fn coordinates()->List<u32>{return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63])));}
fn row(rows_0:List<List<f32>>,rows_1:List<List<f32>>,id:u32)->List<f32>{return choose(id<15369,rows_0.at_or(id-0,[]),rows_1.at_or(id-15369,[]));}
fn add(values:List<f32>,sums:Buffer<f32>)->Buffer<f32>{
 return sums.map_indexed(fn(d)=>fn(total)=>total+values.at_or(d,0.0));
}
fn short_mean(rows_0:List<List<f32>>,rows_1:List<List<f32>>,ids:List<u32>)->List<f32>{
 let selected=ids.map(fn(id)=>row(rows_0,rows_1,id));
 let count=f32_from_u32(length(ids));
 return coordinates().map(fn(d)=>foldl(selected,0.0,fn(values)=>fn(total)=>total+values.at_or(d,0.0))/count);
}
fn long_mean(rows_0:List<List<f32>>,rows_1:List<List<f32>>,ids:List<u32>)->List<f32>{
 let sums=foldl(ids,buffer_fill(64,0.0),fn(id)=>fn(sums)=>add(row(rows_0,rows_1,id),sums));
 let count=f32_from_u32(length(ids));
 return sums.freeze().map(fn(x)=>x/count);
}
fn encode(rows_0:List<List<f32>>,rows_1:List<List<f32>>,ids:List<u32>)->List<f32>{
 if length(ids)==0{return coordinates().map(fn(d)=>0.0);}
 let mean=choose(length(ids)<=16,short_mean(rows_0,rows_1,ids),long_mean(rows_0,rows_1,ids));
 let magnitude=sqrt(foldr(mean,0.0,fn(x)=>fn(total)=>x*x+total));let divisor=magnitude+1.0e-32;return mean.map(fn(x)=>x/divisor);
}
