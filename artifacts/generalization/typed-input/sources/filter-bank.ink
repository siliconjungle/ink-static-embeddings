module filter_bank;
pub fn run(samples:List<f32>,coefficients:List<f32>)->List<f32>{
 return coefficients.map(fn(coefficient)=>foldl(samples,0.0,fn(sample,acc)=>acc*coefficient+sample));
}
