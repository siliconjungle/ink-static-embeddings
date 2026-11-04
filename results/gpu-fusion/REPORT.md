# Experimental GPU schedules

Same hardware/device in fresh headed Chrome profiles; modes interleaved and rotated. Public encodeBatch with changing token IDs, resident weights, complete fresh detached F32 readback. Excludes tokenizer/download/model/pipeline/session creation. Authored experimental kernels are not Ink compiler output. Strict split is a matched-host three-dispatch control. Native float is approximate; no semantic-quality gain or compiler proof claimed. Resident completion uses queue completion, not GPU timestamps.

Chrome 156.0.8078.80; {"vendor":"apple","architecture":"metal-3","description":"","isFallbackAdapter":false}. 3 fresh processes, 9 alternating-query rounds per batch, 8 complete calls per round; 20 warmups per mode and batch.

| Batch | Existing Ink µs/embedding | Matched strict split | Strict fused | Native split | Native fused | Ink/native speedup |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 558.125 | 220.625 | 215.000 | 186.250 | 176.250 | 3.17× |
| 16 | 37.266 | 15.625 | 14.609 | 12.227 | 11.992 | 3.11× |
| 64 | 15.859 | 8.760 | 8.770 | 5.420 | 5.078 | 3.12× |
| 256 | 5.564 | 2.666 | 2.595 | 1.792 | 1.672 | 3.33× |
| 1024 | 3.609 | 1.315 | 1.302 | 0.832 | 0.823 | 4.39× |

## Matched controls and variation

The baseline is the previous public Ink GPU loader, frozen at project commit `9b37148`. The experimental adapter packs query metadata into one upload, bypasses the general packed-value runtime and reuses staging storage. The matched strict split control uses the same experimental host and arithmetic as strict fusion, with three dispatches. These differences are retained separately; the full speedup is not evidence that dispatch fusion alone caused the gain.

| Mode, batch 1,024 | Median of process medians (µs/embedding) | Process-median range |
| --- | ---: | ---: |
| ink | 3.609 | 3.562–3.643 |
| split-strict | 1.315 | 1.129–2.068 |
| fused-strict | 1.302 | 1.152–2.095 |
| split-native | 0.832 | 0.685–1.657 |
| fused-native | 0.823 | 0.602–1.674 |

At batch 1,024 strict fusion is **2.77×** faster than the previous public Ink path, but only **1.01×** faster than the matched strict three-dispatch control. Native fusion versus native split is **1.01×**. Fusion is not a universal win; per-process and small-batch adverse outcomes are retained in the raw samples.

The existing Ink runtime already retains intermediate GPU buffers. The experimental fused path removes the means/norm storage, retains a single output buffer, and reuses readback staging. It never returns borrowed CPU results.

| Batch | Native fused, completed resident encode (µs/embedding) | Subsequent full read (µs/embedding) |
| ---: | ---: | ---: |
| 1 | 170.000 | 165.000 |
| 16 | 11.250 | 10.000 |
| 1024 | 0.601 | 0.190 |

These are separate wall-clock operations with an explicit queue completion before readback, not GPU timestamp measurements. Their medians must not be added to reconstruct the overlapped public API timing. Read includes GPU copy, map, detached CPU copy and unmap.

## Arithmetic and correctness

Strict split and fused shaders match the independent ordered F32 oracle bit-for-bit on all five model fixtures, each with 16 queries and three changed permutations, plus resident reads. Four additional generated shapes (1, 7, 65, 1,025 dimensions) cover signed zero, subnormals, cancellation, overflow/canonical NaNs, empty inputs and 4,096-token documents, in both strict schedules. This is finite test evidence, not a universal shader proof.

| Model / fixture | Native maximum absolute error vs ordered F32 |
| --- | ---: |
| potion-2m | 5.96046448e-08 |
| potion-8m | 5.96046448e-08 |
| st-retrieval | 1.90734863e-06 |
| unseen-weighted | 5.96046448e-08 |
| unseen-clamp | 5.96046448e-08 |

Native float is an explicit approximate contract, with `atol=2e-6, rtol=2e-5` checked on the model/query fixtures. It does not preserve exact Ink arithmetic. Device rounding/contraction, subnormals and sqrt/division can differ; these error tolerances are validation thresholds, not guarantees for unseen inputs. The loader rejects weights/epsilon outside its finite-intermediate input bounds. No model fine-tuning or semantic-quality improvement is claimed.

## Resident similarity search

Sixteen Potion queries search a resident 256-document corpus, using GPU dot products and GPU top-10 selection. Corpus embeddings are computed once outside timing. Each measured request encodes new query embeddings and reads only 1,280 bytes of IDs/scores. It does not read embeddings. The matched forced-read control adds a 4,096-byte query-embedding download before those same search kernels; both keep the corpus resident, and neither is an upstream search baseline.

| Mode | Resident encode + search (µs/query) | Same search with forced embedding read | Top-10 ID agreement with ordered dots of the same embeddings |
| --- | ---: | ---: | ---: |
| fused-strict | 40.312 | 54.375 | 100.0% |
| fused-native | 31.562 | 44.062 | 95.0% |

The native path changes some top-k IDs despite small embedding/score errors. This small repeated-corpus fixture measures numerical ranking agreement, not semantic retrieval quality or MTEB. Equal dot products use the lower document index; NaNs sort last.

Resident leases expire on the next encode in that session or on close. Cross-model/stale handles and invalid IDs/capacities/k are rejected. Focused hardware conformance also checks search cache growth/shrinkage, detached results, queued close and zero live bytes after close; the main experiment checks cleanup after device loss.

## Reproduction and retained artifacts

Prepare the five models using the repository validation instructions and build their existing WebGPU targets first. Then:

```sh
for name in potion-2m potion-8m st-retrieval unseen-weighted unseen-clamp; do
  uv run python scripts/build_gpu_fusion.py --build build/general/$name
done
uv run python -m scripts.prepare_gpu_edges
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/gpu_fusion_browser.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/gpu_fusion_conformance.mjs
uv run python -m scripts.retain_gpu_fusion
```

The source/hash receipts bind the measured inputs before and after the run. Experimental shaders, literal Ink control entry points, source/target metadata, small synthetic edge tables and the before/after host are retained under `artifacts/gpu-fusion/`. Pretrained weights remain external data at their pinned revisions. Historical compiler build identities remain in each `target-compilation.json`; this experiment adds no Ink compiler change. Three fresh browser groups × nine rounds × eight complete query calls, with 20 warmups per mode/batch. CPU tokenization, cold loading and session creation are excluded. Large-batch values describe amortized throughput, not single-request latency.

The existing published animation retains its original measurements; these experimental timings have not been substituted into it.
