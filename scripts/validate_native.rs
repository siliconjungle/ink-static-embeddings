use compiled_state::State;
use serde_json::Value;
use std::{env,fs};

fn main(){
    let args:Vec<String>=env::args().collect();let directory=&args[1];
    let bytes=fs::read(format!("{directory}/weights.f32")).unwrap();
    let weights:Vec<f32>=bytes.chunks_exact(4).map(|b|f32::from_le_bytes(b.try_into().unwrap())).collect();
    let fixture:Value=serde_json::from_slice(&fs::read(format!("{directory}/validation.json")).unwrap()).unwrap();
    let queries:Vec<Vec<u32>>=fixture["queries"].as_array().unwrap().iter().map(|q|q.as_array().unwrap().iter().map(|id|id.as_u64().unwrap().try_into().unwrap()).collect()).collect();
    let output=State::new().function_l_native_batch(weights,queries);
    println!("{}",serde_json::to_string(&output).unwrap());
}
