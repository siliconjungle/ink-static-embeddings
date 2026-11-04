//! A thin, invocation-local host for the unchanged Ink-emitted Rust functions.
//! Weight shards live in this Wasm instance; each call only supplies new IDs.
use std::cell::RefCell;

const PARAMETERS: usize = 7559168;
const DIMENSIONS: usize = 256;
const VOCABULARY: u32 = 29528;
const ENDS: &[usize] = &[999000,1998000,2997000,3996000,4995000,5994000,6993000,7559168];
const SOURCE: &[u32] = &[2860110483,3884393101,3205193581,2555859415,3476169753,3642147576,825469693,509767118];

struct Model {
    state: compiled_state::State,
    loading: Vec<f32>,
    shards: Vec<Vec<f32>>,
    input: Vec<u32>,
    output: Vec<f32>,
    capacity: usize,
    ready: bool,
}
thread_local! { static MODEL: RefCell<Option<Model>> = const { RefCell::new(None) }; }

#[no_mangle]
pub extern "C" fn source_word(index: usize) -> u32 { SOURCE.get(index).copied().unwrap_or(0) }
#[no_mangle]
pub extern "C" fn dimensions() -> usize { DIMENSIONS }
#[no_mangle]
pub extern "C" fn parameters() -> usize { PARAMETERS }

#[no_mangle]
pub extern "C" fn model_init(capacity: usize) -> u32 {
    if capacity > 1_000_000 || PARAMETERS.checked_mul(8).unwrap_or(usize::MAX) > 500_000_000 { return 1; }
    MODEL.with_borrow_mut(|slot| {
        *slot=Some(Model { state: compiled_state::State::new(), loading: vec![0.0;PARAMETERS],
            shards: Vec::new(), input: vec![0;capacity], output: vec![0.0;DIMENSIONS], capacity, ready:false });
    });
    0
}

#[no_mangle]
pub extern "C" fn weights_ptr() -> usize {
    MODEL.with_borrow(|slot|slot.as_ref().map_or(0,|m|m.loading.as_ptr() as usize))
}
#[no_mangle]
pub extern "C" fn model_commit() -> u32 {
    MODEL.with_borrow_mut(|slot| {
        let Some(m)=slot.as_mut() else {return 1};
        if m.ready || m.loading.iter().any(|x|!x.is_finite()) {return 2;}
        let mut start=0;
        for &end in ENDS {m.shards.push(m.loading[start..end].to_vec());start=end;}
        m.loading=Vec::new();m.ready=true;0
    })
}
#[no_mangle]
pub extern "C" fn input_ptr() -> usize {
    MODEL.with_borrow(|slot|slot.as_ref().map_or(0,|m|m.input.as_ptr() as usize))
}
#[no_mangle]
pub extern "C" fn output_ptr() -> usize {
    MODEL.with_borrow(|slot|slot.as_ref().map_or(0,|m|m.output.as_ptr() as usize))
}

#[no_mangle]
pub extern "C" fn encode(length:usize,variant:u32) -> u32 {
    MODEL.with_borrow_mut(|slot| {
        let Some(m)=slot.as_mut() else {return 1};
        if !m.ready || length>m.capacity || variant>1 {return 2;}
        // Every capacity slot was initialized by model_init. u32 has no drop;
        // resizing the logical input never reads uninitialized spare capacity.
        unsafe {m.input.set_len(length);}
        if m.input.iter().any(|id|*id>=VOCABULARY) {return 3;}
        m.output=if variant==0 {
            m.state.ink_borrowed_function_l_encode(&m.shards[0],&m.shards[1],&m.shards[2],&m.shards[3],&m.shards[4],&m.shards[5],&m.shards[6],&m.shards[7],&m.input)
        } else {
            m.state.ink_borrowed_function_l_encode_quads(&m.shards[0],&m.shards[1],&m.shards[2],&m.shards[3],&m.shards[4],&m.shards[5],&m.shards[6],&m.shards[7],&m.input)
        };
        0
    })
}

#[no_mangle]
pub extern "C" fn model_close() {MODEL.with_borrow_mut(|slot|*slot=None);}
