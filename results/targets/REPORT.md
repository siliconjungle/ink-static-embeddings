# Rust and GPU target experiment

Importer variants compiled with unchanged Ink; these source layout/ownership changes are authored transformations, not newly discovered/proof-admitted Ink optimizer rewrites. Native includes full model copy-in once per batch. GPU keeps model resident and includes changing query uploads, three completed dispatches and decoded output. Startup/loading excluded and GPU session upload/open recorded separately. NumPy runs on CPU; there is no upstream GPU baseline in this experiment, so GPU gains are not an isolated compiler effect. Batched per-embedding times are amortized throughput, not single-request latency.

| Batch | NumPy batch µs / embedding | Rust column µs | Rust row µs | GPU complete query µs | GPU compute only µs |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.583 | 550.083 | 482.708 | 477.709 | 235.542 |
| 16 | 4.224 | 32.086 | 32.516 | 31.667 | 17.964 |
| 64 | 7.040 | 18.350 | 30.160 | 19.120 | 12.273 |
| 256 | 6.947 | 13.179 | 25.176 | 6.493 | 3.464 |
| 1024 | 6.869 | 11.759 | 23.738 | 3.767 | 1.265 |

GPU adapter: Apple M4 Pro / Metal.

Native and GPU variant outputs match the independent ordered F32 oracle bit for bit. The upstream batch path is checked with explicit tolerance because its reduction strategy and empty-row promotion differ.

The original unmodified helper-heavy Rust probe is retained separately: it copies full weight vectors inside per-coordinate/per-token helper calls. Its latency is not represented by the ownership-friendly variants in this table.

All paths alternate the same two fixture offsets. Batch 1 starts at the first eight-token text. Batch 16 starts with the first sixteen fixtures; batches 64, 256 and 1024 use the complete 64-case corpus, repeated as needed. Compare columns within a row. Per-round/process data and GPU startup/upload costs are adjacent. No GPU CPU fallback is permitted.
