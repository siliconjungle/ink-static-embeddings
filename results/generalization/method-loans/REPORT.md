# Synchronous callback loan comparison

Matched old/new compiler, identical frozen source, checked plans, Rust toolchain and typed owning boundary. Input clones and complete detached output consumption included. Three fresh groups rotate compiler/variant executable order; each executable validates all output bits, including edge cases. Build, JSON parsing and validation excluded. The guard and source algorithms are unchanged.

| Program | Variant | Before mean µs | After mean µs | Before/after |
| --- | --- | ---: | ---: | ---: |
| matrix-columns | literal | 8.282 | 8.280 | 1.00× |
| matrix-columns | batched_0 | 2.620 | 2.593 | 1.01× |
| matrix-columns | batched_1 | 3.429 | 2.562 | 1.34× |
| filter-bank | literal | 16.692 | 16.653 | 1.00× |
| filter-bank | batched_0 | 2.175 | 2.192 | 0.99× |
| filter-bank | batched_1 | 2.180 | 2.186 | 1.00× |
| channel-energy | literal | 7.776 | 7.742 | 1.00× |
| channel-energy | batched_0 | 3.049 | 3.071 | 0.99× |
| channel-energy | batched_1 | 3.074 | 3.070 | 1.00× |
| channel-energy | batched_2 | 3.053 | 3.056 | 1.00× |
| channel-energy | batched_3 | 3.048 | 3.046 | 1.00× |
