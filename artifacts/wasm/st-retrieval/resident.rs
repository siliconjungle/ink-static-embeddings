//! A thin, invocation-local host for the unchanged Ink-emitted Rust functions.
//! Weight shards live in this Wasm instance; each call only supplies new IDs.
use std::cell::RefCell;

const PARAMETERS: usize = 31254528;
const DIMENSIONS: usize = 1024;
const VOCABULARY: u32 = 30522;
const ENDS: &[usize] = &[999000,1998000,2997000,3996000,4995000,5994000,6993000,7992000,8991000,9990000,10989000,11988000,12987000,13986000,14985000,15984000,16983000,17982000,18981000,19980000,20979000,21978000,22977000,23976000,24975000,25974000,26973000,27972000,28971000,29970000,30969000,31254528];
const SOURCE: &[u32] = &[3778428799,57591930,1668011107,1776327278,2820095782,781104983,2565894992,4130440587];

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
            m.state.ink_borrowed_function_l_encode(&m.shards[0],&m.shards[1],&m.shards[2],&m.shards[3],&m.shards[4],&m.shards[5],&m.shards[6],&m.shards[7],&m.shards[8],&m.shards[9],&m.shards[10],&m.shards[11],&m.shards[12],&m.shards[13],&m.shards[14],&m.shards[15],&m.shards[16],&m.shards[17],&m.shards[18],&m.shards[19],&m.shards[20],&m.shards[21],&m.shards[22],&m.shards[23],&m.shards[24],&m.shards[25],&m.shards[26],&m.shards[27],&m.shards[28],&m.shards[29],&m.shards[30],&m.shards[31],&m.input)
        } else {
            m.state.ink_borrowed_function_l_encode_quads(&m.shards[0],&m.shards[1],&m.shards[2],&m.shards[3],&m.shards[4],&m.shards[5],&m.shards[6],&m.shards[7],&m.shards[8],&m.shards[9],&m.shards[10],&m.shards[11],&m.shards[12],&m.shards[13],&m.shards[14],&m.shards[15],&m.shards[16],&m.shards[17],&m.shards[18],&m.shards[19],&m.shards[20],&m.shards[21],&m.shards[22],&m.shards[23],&m.shards[24],&m.shards[25],&m.shards[26],&m.shards[27],&m.shards[28],&m.shards[29],&m.shards[30],&m.shards[31],&m.input)
        };
        0
    })
}

#[no_mangle]
pub extern "C" fn model_close() {MODEL.with_borrow_mut(|slot|*slot=None);}
