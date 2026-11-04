# Rust/Wasm in the browser

Visible installed Chrome, single-query CPU latency, resident immutable weights. JavaScript uses the checked selection with ordered pooling/norm fusion. Public encode allocates detached F32 output; ID validation/upload and complete output consumption included. Loading, network, compilation and one-time capture/preparation excluded and setup recorded separately. Ink-quads is an authored Vec4 source layout, not a proof-selected optimizer rewrite. SIMD enabled; exact instruction coverage is recorded separately.

Chrome 156.0.8078.80; Apple M4 Pro. Median of medians over 6 fresh browsers, 9 rounds and 100 repetitions per corpus group.

| Input length | Ink → JS | Ink → Rust/Wasm | Ink quads → Rust/Wasm | JS / quads |
| --- | ---: | ---: | ---: | ---: |
| all | 22.428 | 11.555 | 9.289 | 2.41× |
| empty | 1.287 | 0.825 | 0.856 | 1.50× |
| short | 2.757 | 1.232 | 1.402 | 1.97× |
| medium | 15.484 | 6.586 | 6.506 | 2.38× |
| long | 64.747 | 35.906 | 26.805 | 2.42× |

Times are µs/query. Short = 1–16 tokens; medium = 17–128; long = 129–512. All 64 complete benchmark outputs match the ordered F32 oracle bit for bit. Each call changes input IDs; no result memoization. Weights are loaded once, split into resident Rust vectors once and borrowed on every invocation.

Both paths compile through the pinned Ink Rust lowering and the existing checked read-only physical plan. The quad source groups independent dimensions but preserves each dimension’s token order and the original right-fold norm. No weights, dimensions, quality target or compiler semantics change.

All five retained model/fixture suites pass both Wasm variants in actual Chrome, including 5/7-dimensional tails, 32 shards, non-row-aligned splits, normalization policies, reordered calls, detached outputs, host mutations, capacity limits, invalid IDs and close/source-mismatch rejection. Exact source/plan/target identities and all raw process samples are retained.

This report compares CPU implementations in the same browser. Historical NumPy and GPU measurements are separate studies; this is not a matched browser NumPy or GPU comparison. The API performs one Wasm inference call per document, including encodeBatch; it does not yet amortize the boundary across a Rust-native batch.
