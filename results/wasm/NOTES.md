# Interpreting the Wasm result

The main comparison is **optimized Ink JavaScript versus Ink Rust/Wasm in the
same installed Chrome**, on the same 64 Potion 2M queries with complete outputs.
It is not a Wasm-versus-NumPy comparison.

On the mixed corpus, ordinary Ink/Rust/Wasm is 11.55 µs/query versus JS 22.43 µs
(about 1.94× faster). The authored four-dimension Ink variant is 9.29 µs (2.41×
faster than JS). On short inputs the ordinary Wasm layout wins over the quads
layout, 1.23 versus 1.40 µs. The quad layout is not an automatic universal win.

Both Wasm layouts retain the weight shards in linear memory and borrow them
across invocations. Loading/splitting happens once. IDs still copy into Wasm and
the complete embedding copies out into a detached caller result. This avoids
copying megabytes of model weights per call; it does not eliminate all copies or
allocations. Batch currently invokes Wasm once per document.

The quads source groups four independent dimension accumulators in `Vec4<f32>`.
Each dimension visits tokens in its original order, and the norm's right-fold
order is unchanged. The compiler/LLVM emits SIMD division but no `f32x4.add` in
any tested module. We have not isolated the contributions of loop layout, memory
access and vectorized division; the measured gain is not a claim of SIMD pooling
or a new proof-selected compiler optimization.

Median one-time capture/preparation in the main run is 61.10 ms for JS, 18.37 ms
for ordinary Wasm, and 17.22 ms for the quad Wasm instance. This includes the
factory's validation, capture and Wasm instantiation, but excludes fetching files.
The second Wasm instance can benefit from the browser's compilation cache. Raw
per-process costs and linear-memory high-water sizes are retained in report.json.

The [initial probe](literal-probe/README.md) used literal JS and produced a larger
4.18× JS/quads ratio. We retained that data, then repeated the main study against
checked-optimized JS. **2.41×** is the appropriate mixed-corpus headline for this
browser study. Node/NumPy and GPU studies remain separate.
