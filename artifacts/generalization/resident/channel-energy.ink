module channel_energy;
record Pixel{red:f32,green:f32,blue:f32,}
fn channel(pixel:Pixel,index:u32)->f32{
 return choose(index==0,pixel.red,choose(index==1,pixel.green,pixel.blue));
}
pub fn run(pixels:List<Pixel>,channels:List<u32>)->List<f32>{
 let totals=channels.map(fn(index)=>foldl(pixels,0.0,fn(pixel,acc)=>acc+channel(pixel,index)*channel(pixel,index)));
 return totals.map(fn(total)=>total/f32_from_u32(length(pixels)+1));
}

record DotState{index:u32,total:f32,}
// Numeric contract: callers declare dimensions <= 4096. The explicit bound
// remains visible in source; model metadata already enforces that limit.
fn bounded_dot(left:List<f32>,right:List<f32>,a:u32,b:u32,dimensions:u32)->f32{
 let result=repeat_until(4096,DotState{index:0,total:0.0},fn(state)=>state.index>=dimensions,
  fn(i,state)=>DotState{index:state.index+1,total:state.total+left.at_or(a+i,0.0)*right.at_or(b+i,0.0)});
 return result.total;
}
pub fn similarity(queries:List<f32>,corpus:List<f32>,documents:u32,dimensions:u32,positions:List<u32>)->List<f32>{
 return positions.map(fn(position)=>bounded_dot(queries,corpus,quot_or(position,documents,0)*dimensions,rem_or(position,documents,0)*dimensions,dimensions));
}
pub fn postprocess(values:List<f32>)->List<f32>{return values.map(fn(value)=>value*0.5+0.25);}
