use compiled_state::State;
use serde_json::{json, Value};
use std::{env,fs,hint::black_box,time::Instant};

fn main(){
 let args:Vec<String>=env::args().collect();let build=&args[1];
 let rounds:usize=args.get(2).map(|s|s.parse().unwrap()).unwrap_or(7);
 let row_mode=args.get(3).is_some_and(|s|s=="row");
 let bytes=fs::read(format!("{build}/weights.f32")).unwrap();
 let weights:Vec<f32>=bytes.chunks_exact(4).map(|b|f32::from_le_bytes(b.try_into().unwrap())).collect();
 let manifest:Value=serde_json::from_slice(&fs::read(format!("{build}/model.json")).unwrap()).unwrap();
 let split=manifest["shard_elements"].as_u64().unwrap()as usize;
 let first=weights[..split].to_vec();let second=weights[split..].to_vec();
 let corpus:Value=serde_json::from_slice(&fs::read(format!("{build}/corpus.json")).unwrap()).unwrap();
 let all:Vec<Vec<u32>>=corpus["cases"].as_array().unwrap().iter().map(|c|c["ids"].as_array().unwrap().iter().map(|x|x.as_u64().unwrap()as u32).collect()).collect();
 let state=State::new();let mut reports=Vec::new();let mut checksum=0.0f64;
 let run=|a,b,c|if row_mode{state.function_l_native_row_batch(a,b,c)}else{state.function_l_native_batch(a,b,c)};
 for batch in [1usize,16,64,256,1024]{
  let requests:Vec<Vec<u32>>=(0..batch).map(|i|all[i%all.len()].clone()).collect();
  let requests_b:Vec<Vec<u32>>=(0..batch).map(|i|all[(i+1)%all.len()].clone()).collect();
  let output=run(first.clone(),second.clone(),requests.clone());
  let output_b=run(first.clone(),second.clone(),requests_b.clone());
  for _ in 0..3{black_box(run(first.clone(),second.clone(),requests.clone()));}
  let mut samples=Vec::new();
  for round in 0..rounds{
   let start=Instant::now();
   let inputs=if round%2==0{&requests}else{&requests_b};
   let result=run(black_box(first.clone()),black_box(second.clone()),black_box(inputs.clone()));
   checksum+=result.iter().map(|v|*v as f64).sum::<f64>();black_box(result);
   samples.push(start.elapsed().as_nanos()as f64/batch as f64);
  }
  reports.push(json!({"batch":batch,"samples_ns_per_embedding":samples,"output":output,"output_b":output_b}));
 }
 println!("{}",json!({"reports":reports,"row_mode":row_mode,"checksum":checksum,"scope":"Public generated batch function; existing owned buffers are internal to one pure call; complete model copy-in and all output computation included, parsing/loading excluded."}));
}
