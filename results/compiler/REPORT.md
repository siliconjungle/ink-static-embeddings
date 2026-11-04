# Checked compiler pipeline improvements

JS paths include changing-ID capture and complete output consumption. Rust owning/borrowed differ at the caller boundary; both use the identical checked physical plan. Startup/loading excluded. NumPy is a separate runtime, not an isolated compiler comparison. Original unplanned Rust is retained in the earlier target report; it is deliberately not run over the full long-sequence corpus.

| CPU implementation | µs / embedding |
| --- | ---: |
| literal | 32.011 |
| optimized | 32.180 |
| compiler-optimized | 18.938 |
| rust-owning | 506.369 |
| rust-borrowed | 10.966 |

Same-source JavaScript improvement versus prior checked optimization: 1.70×.

Six fresh JS process groups and three fresh Rust groups; nine rounds per group/case. All 64 complete embeddings match the independent ordered F32 oracle bit for bit. The selected general laws remove both mapped pooling and norm-square intermediates. Rust uses the existing checked read-only parameter capabilities and generated borrowed entrypoint; no model-specific Rust rewrite or weight changes are made.

The historical NumPy CPU kernel measured 8.513 µs/embedding under its original harness. Fresh-process raw samples are adjacent; comparisons to that historical number are not simultaneous runtime-isolated speedups. Source, model, compiler and proof/physical packets are bound by hashes in report.json.

The updated default pinned toolchain also selected both fusions for Potion 8M (256 dimensions, eight shards); literal and optimized outputs matched the independent oracle bit for bit. The frozen planning-corpus check covered sequence-every, ast-ancestor and text-lines before/after: all compiled, seven laws were admitted, and measurement-budget gates retained the baseline in both runs. This bounded check shows no additional automatically selected speedup; full funnel records are in corpus/.
