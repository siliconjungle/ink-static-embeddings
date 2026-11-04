// Authored row-oriented Ink; unchanged F32 weights and token-sum order.
module row_static_embedding;
fn coordinates()->List<u32>{return [0,1,2,3,4,5,6];}
fn row(rows_0:List<List<f32>>,id:u32)->List<f32>{return rows_0.at_or(id-0,[]);}
fn add(values:List<f32>,sums:Buffer<f32>)->Buffer<f32>{
 return sums.map_indexed(fn(d)=>fn(total)=>total+values.at_or(d,0.0));
}
fn short_mean(rows_0:List<List<f32>>,ids:List<u32>)->List<f32>{
 let selected=ids.map(fn(id)=>row(rows_0,id));
 let count=f32_from_u32(length(ids));
 return coordinates().map(fn(d)=>foldl(selected,0.0,fn(values)=>fn(total)=>total+values.at_or(d,0.0))/count);
}
fn long_mean(rows_0:List<List<f32>>,ids:List<u32>)->List<f32>{
 let sums=foldl(ids,buffer_fill(7,0.0),fn(id)=>fn(sums)=>add(row(rows_0,id),sums));
 let count=f32_from_u32(length(ids));
 return sums.freeze().map(fn(x)=>x/count);
}
fn encode(rows_0:List<List<f32>>,ids:List<u32>)->List<f32>{
 if length(ids)==0{return coordinates().map(fn(d)=>0.0);}
 let mean=choose(length(ids)<=16,short_mean(rows_0,ids),long_mean(rows_0,ids));
 let magnitude=sqrt(foldr(mean,0.0,fn(x)=>fn(total)=>x*x+total));let divisor=magnitude+1.0e-32;return mean.map(fn(x)=>x/divisor);
}
