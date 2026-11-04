use compiled_state::State;
use serde_json::{json, Value};
use std::{env, fs, hint::black_box, time::Instant};

fn main() {
    let args: Vec<String> = env::args().collect();
    let build = &args[1];
    let repeats: usize = args.get(2).map(|x| x.parse().unwrap()).unwrap_or(1);
    let limit: usize = args.get(3).map(|x| x.parse().unwrap()).unwrap_or(usize::MAX);
    let bytes = fs::read(format!("{build}/weights.f32")).unwrap();
    let weights: Vec<f32> = bytes.chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap())).collect();
    let manifest: Value = serde_json::from_slice(&fs::read(format!("{build}/model.json")).unwrap()).unwrap();
    let split = manifest["shard_elements"].as_u64().unwrap() as usize;
    let first = weights[..split].to_vec();
    let second = weights[split..].to_vec();
    let corpus: Value = serde_json::from_slice(&fs::read(format!("{build}/corpus.json")).unwrap()).unwrap();
    let state = State::new();
    let mut results = Vec::new();
    let mut checksum = 0.0f64;
    for case in corpus["cases"].as_array().unwrap().iter().take(limit) {
        let ids: Vec<u32> = case["ids"].as_array().unwrap().iter().map(|x| x.as_u64().unwrap() as u32).collect();
        let start = Instant::now();
        let output = state.function_l_encode(black_box(first.clone()), black_box(second.clone()), black_box(ids.clone()));
        let first_ns = start.elapsed().as_nanos() as f64;
        let mut samples = Vec::new();
        for _ in 0..repeats {
            let start = Instant::now();
            let out = state.function_l_encode(black_box(first.clone()), black_box(second.clone()), black_box(ids.clone()));
            checksum += out.iter().map(|x| *x as f64).sum::<f64>();
            black_box(&out);
            samples.push(start.elapsed().as_nanos() as f64);
        }
        eprintln!("{}: {} tokens, {:.3} ms",case["id"],ids.len(),first_ns/1e6);
        results.push(json!({"id":case["id"],"tokens":ids.len(),"first_ns":first_ns,"samples_ns":samples,"output":output}));
    }
    println!("{}",json!({"results":results,"checksum":checksum,"scope":"Unmodified emitted typed Rust function, persistent weights cloned into its by-value API; file loading and JSON parsing excluded."}));
}
