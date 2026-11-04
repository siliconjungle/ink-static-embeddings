// Authored row-oriented Ink; unchanged F32 weights and token-sum order.
module row_static_embedding;
fn coordinates()->List<u32>{return [0,1,2,3,4,5,6,7].concat([8,9,10,11,12,13,14,15]).concat([16,17,18,19,20,21,22,23].concat([24,25,26,27,28,29,30,31])).concat([32,33,34,35,36,37,38,39].concat([40,41,42,43,44,45,46,47]).concat([48,49,50,51,52,53,54,55].concat([56,57,58,59,60,61,62,63]))).concat([64,65,66,67,68,69,70,71].concat([72,73,74,75,76,77,78,79]).concat([80,81,82,83,84,85,86,87].concat([88,89,90,91,92,93,94,95])).concat([96,97,98,99,100,101,102,103].concat([104,105,106,107,108,109,110,111]).concat([112,113,114,115,116,117,118,119].concat([120,121,122,123,124,125,126,127])))).concat([128,129,130,131,132,133,134,135].concat([136,137,138,139,140,141,142,143]).concat([144,145,146,147,148,149,150,151].concat([152,153,154,155,156,157,158,159])).concat([160,161,162,163,164,165,166,167].concat([168,169,170,171,172,173,174,175]).concat([176,177,178,179,180,181,182,183].concat([184,185,186,187,188,189,190,191]))).concat([192,193,194,195,196,197,198,199].concat([200,201,202,203,204,205,206,207]).concat([208,209,210,211,212,213,214,215].concat([216,217,218,219,220,221,222,223])).concat([224,225,226,227,228,229,230,231].concat([232,233,234,235,236,237,238,239]).concat([240,241,242,243,244,245,246,247].concat([248,249,250,251,252,253,254,255])))));}
fn row(rows_0:List<List<f32>>,rows_1:List<List<f32>>,rows_2:List<List<f32>>,rows_3:List<List<f32>>,rows_4:List<List<f32>>,rows_5:List<List<f32>>,rows_6:List<List<f32>>,rows_7:List<List<f32>>,id:u32)->List<f32>{return choose(id<15548,choose(id<7774,choose(id<3887,rows_0.at_or(id-0,[]),rows_1.at_or(id-3887,[])),choose(id<11661,rows_2.at_or(id-7774,[]),rows_3.at_or(id-11661,[]))),choose(id<23322,choose(id<19435,rows_4.at_or(id-15548,[]),rows_5.at_or(id-19435,[])),choose(id<27209,rows_6.at_or(id-23322,[]),rows_7.at_or(id-27209,[]))));}
fn add(values:List<f32>,sums:Buffer<f32>)->Buffer<f32>{
 return sums.map_indexed(fn(d)=>fn(total)=>total+values.at_or(d,0.0));
}
fn short_mean(rows_0:List<List<f32>>,rows_1:List<List<f32>>,rows_2:List<List<f32>>,rows_3:List<List<f32>>,rows_4:List<List<f32>>,rows_5:List<List<f32>>,rows_6:List<List<f32>>,rows_7:List<List<f32>>,ids:List<u32>)->List<f32>{
 let selected=ids.map(fn(id)=>row(rows_0,rows_1,rows_2,rows_3,rows_4,rows_5,rows_6,rows_7,id));
 let count=f32_from_u32(length(ids));
 return coordinates().map(fn(d)=>foldl(selected,0.0,fn(values)=>fn(total)=>total+values.at_or(d,0.0))/count);
}
fn long_mean(rows_0:List<List<f32>>,rows_1:List<List<f32>>,rows_2:List<List<f32>>,rows_3:List<List<f32>>,rows_4:List<List<f32>>,rows_5:List<List<f32>>,rows_6:List<List<f32>>,rows_7:List<List<f32>>,ids:List<u32>)->List<f32>{
 let sums=foldl(ids,buffer_fill(256,0.0),fn(id)=>fn(sums)=>add(row(rows_0,rows_1,rows_2,rows_3,rows_4,rows_5,rows_6,rows_7,id),sums));
 let count=f32_from_u32(length(ids));
 return sums.freeze().map(fn(x)=>x/count);
}
fn encode(rows_0:List<List<f32>>,rows_1:List<List<f32>>,rows_2:List<List<f32>>,rows_3:List<List<f32>>,rows_4:List<List<f32>>,rows_5:List<List<f32>>,rows_6:List<List<f32>>,rows_7:List<List<f32>>,ids:List<u32>)->List<f32>{
 if length(ids)==0{return coordinates().map(fn(d)=>0.0);}
 let mean=choose(length(ids)<=16,short_mean(rows_0,rows_1,rows_2,rows_3,rows_4,rows_5,rows_6,rows_7,ids),long_mean(rows_0,rows_1,rows_2,rows_3,rows_4,rows_5,rows_6,rows_7,ids));
 let magnitude=sqrt(foldr(mean,0.0,fn(x)=>fn(total)=>x*x+total));let divisor=magnitude+1.0e-32;return mean.map(fn(x)=>x/divisor);
}
