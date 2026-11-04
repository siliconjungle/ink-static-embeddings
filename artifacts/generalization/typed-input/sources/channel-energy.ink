module channel_energy;
record Pixel{red:f32,green:f32,blue:f32,}
fn channel(pixel:Pixel,index:u32)->f32{
 return choose(index==0,pixel.red,choose(index==1,pixel.green,pixel.blue));
}
pub fn run(pixels:List<Pixel>,channels:List<u32>)->List<f32>{
 let totals=channels.map(fn(index)=>foldl(pixels,0.0,fn(pixel,acc)=>acc+channel(pixel,index)*channel(pixel,index)));
 return totals.map(fn(total)=>total/f32_from_u32(length(pixels)+1));
}
