use std::{fs,hint::black_box,time::Instant};use serde_json::{Value,json};
#[path="../matrix_columns/batched_0.rs"] mod matrix_columns_batched_0;
fn bench_matrix_columns_batched_0(case:&Value)->Value{
let state=matrix_columns_batched_0::State::new();let a0:Vec<Vec<f32>>=case["args"].as_array().unwrap().iter().map(|args|<Vec<f32> as matrix_columns_batched_0::Wire>::from_json(&args[0]).unwrap()).collect();
let a1:Vec<Vec<u32>>=case["args"].as_array().unwrap().iter().map(|args|<Vec<u32> as matrix_columns_batched_0::Wire>::from_json(&args[1]).unwrap()).collect();
let a2:Vec<Vec<u32>>=case["args"].as_array().unwrap().iter().map(|args|<Vec<u32> as matrix_columns_batched_0::Wire>::from_json(&args[2]).unwrap()).collect();
let a3:Vec<u32>=case["args"].as_array().unwrap().iter().map(|args|<u32 as matrix_columns_batched_0::Wire>::from_json(&args[3]).unwrap()).collect();
let invoke=|which:usize|state.function_l_run(black_box(a0[which].clone()),black_box(a1[which].clone()),black_box(a2[which].clone()),black_box(a3[which].clone()));
let check=|values:&[f32],which:usize|{let expected=case["expected_bits"][which].as_array().unwrap();assert_eq!(values.len(),expected.len());for(i,x)in values.iter().enumerate(){assert_eq!(x.to_bits(),expected[i].as_u64().unwrap()as u32,"case {:?} index {}",case["name"],i);}};
for i in 0..20{check(&invoke(i%2),i%2);}
let mut samples=Vec::new();let mut sink=0u32;
if !case["edge"].as_bool().unwrap(){for round in 0..9{let start=Instant::now();for repeat in 0..100{for value in invoke((round+repeat)%2){sink=sink.wrapping_add(black_box(value.to_bits()));}}samples.push(start.elapsed().as_nanos()as f64/100.0);}}
check(&invoke(0),0);json!({"mode":"batched_0","samples_ns":samples,"sink":sink,"all_bits_exact":true})
}
fn main(){let cases:Value=serde_json::from_slice(&fs::read("work/generalization/inputs.json").unwrap()).unwrap();let rows:Vec<Value>=cases.as_array().unwrap().iter().enumerate().filter(|(_,case)|case["name"]=="matrix-columns").map(|(index,case)|{let value=bench_matrix_columns_batched_0(case);json!({"index":index,"name":case["name"],"length":case["length"],"lanes":case["lanes"],"width":case["width"],"edge":case["edge"],"modes":[value]})}).collect();println!("{}",json!({"rows":rows}));}
