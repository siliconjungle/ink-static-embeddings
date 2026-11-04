# Tested models and available evidence

We tested **three real pretrained models**, plus **two deterministic synthetic
fixtures**. All five pass JavaScript, native Rust, browser Rust/Wasm and actual
hardware WebGPU correctness checks. Performance measurements currently cover
**Potion 2M only**.

## Pretrained models

| Model | Architecture / export | Vocabulary rows | Dimensions | Imported F32 table values | Evidence |
| --- | --- | ---: | ---: | ---: | --- |
| [minishlab/potion-base-2M](https://huggingface.co/minishlab/potion-base-2M) | Model2Vec; token lookup → mean → L2 with epsilon | 29,528 | 64 | 1,889,792 | [Correctness](results/general/potion-2m/validation-report.json), [JS CPU](results/javascript/REPORT.md), [Rust CPU](results/compiler/REPORT.md), [native GPU](results/targets/REPORT.md), [browser WebGPU](results/browser/REPORT.md) |
| [minishlab/potion-base-8M](https://huggingface.co/minishlab/potion-base-8M) | Model2Vec; token lookup → mean → L2 with epsilon | 29,528 | 256 | 7,559,168 | [Correctness](results/general/potion-8m/validation-report.json) |
| [sentence-transformers/static-retrieval-mrl-en-v1](https://huggingface.co/sentence-transformers/static-retrieval-mrl-en-v1) | Sentence Transformers StaticEmbedding; token lookup → mean; no Normalize module in this export | 30,522 | 1,024 | 31,254,528 | [Correctness](results/general/st-retrieval/validation-report.json) |

Table values count the complete effective imported embedding table. They are not
an estimate of model quality, training compute or total tokenizer/package size.
We import the full dimensions shown above; no dimensional truncation is used.

Exact downloaded revisions:

| Model | Pinned revision |
| --- | --- |
| Potion 2M | [`389b9f64be5aa4ae7a6bc6fe95ef20ce485ae5da`](https://huggingface.co/minishlab/potion-base-2M/tree/389b9f64be5aa4ae7a6bc6fe95ef20ce485ae5da) |
| Potion 8M | [`bf8b056651a2c21b8d2565580b8569da283cab23`](https://huggingface.co/minishlab/potion-base-8M/tree/bf8b056651a2c21b8d2565580b8569da283cab23) |
| Static retrieval | [`f60985c706f192d45d218078e49e5a8b6f15283a`](https://huggingface.co/sentence-transformers/static-retrieval-mrl-en-v1/tree/f60985c706f192d45d218078e49e5a8b6f15283a) |

Source file hashes, normalization settings and emitted-source identities are
retained in the manifests for [Potion 2M](results/general/potion-2m/model.json),
[Potion 8M](results/general/potion-8m/model.json), and
[static retrieval](results/general/st-retrieval/model.json). Weights stay out of
Git and are downloaded from these immutable revisions.

## Synthetic fixtures

| Fixture | Shape | What it tests | Evidence |
| --- | --- | --- | --- |
| `fixture/unseen-weighted` | 19 effective vocabulary rows × 7 dimensions; 5 underlying vector rows | Model2Vec's actual serialization, vocabulary remapping, F32 token weights, normalization, 13 non-row-aligned weight shards | [Correctness](results/general/unseen-weighted/validation-report.json) |
| `fixture/unseen-clamp` | 17 rows × 5 dimensions | StaticEmbedding + Normalize, zero/tiny rows, epsilon clamp, 7 non-row-aligned weight shards | [Correctness](results/general/unseen-clamp/validation-report.json) |

Both are generated reproducibly with seed `91837` by
[`prepare_validation_models.py`](scripts/prepare_validation_models.py). These
unfamiliar shapes test metadata-driven import without a model-name allowlist.
They are not pretrained quality benchmarks.

## What “correctness tested” means

Each of the five models has 16 cases covering text, empty/Unicode/unknown-token
inputs, vocabulary endpoints, repeated IDs and seeded sequences up to 512 tokens.
Hardware WebGPU additionally runs three changing permutations of every case.
The suite checks rejection of invalid IDs, overlong documents and oversized
allocation requests.

Generated JavaScript, Rust and WebGPU must match the independent ordered F32
oracle **bit for bit**. The upstream comparison uses `rtol=2e-5, atol=2e-6`, since
its reduction order can differ. Model2Vec is checked against upstream 0.7.0;
Sentence Transformers exports are checked against their PyTorch 2.10.0
EmbeddingBag(mean) and optional normalization operations. The complete Sentence
Transformers SDK is not imported. The [validation report](results/general/REPORT.md)
links retained reference outputs, target checks and browser/device identities.

These tests cover inference compatibility. We have not run an MTEB/retrieval
quality evaluation, a transformer/LLM importer or a universal equivalence proof.

The [packed-row JS loader](results/javascript-rows/validation.json) also passes
all five model/fixture suites in installed Chrome. It reshapes the original
weight data into captured rows and runs an authored row-oriented Ink variant.
Tiny 1/7/17-dimensional integration cases additionally check overflow and the
Float32Array infinity/NaN output boundary.

The later [Rust/Wasm validation](results/wasm/validation.json) additionally checks
the original and authored four-dimension Ink layouts in installed Chrome on all
five models/fixtures. It checks every ordered-oracle case, repeated/reordered
queries, detached results, caller mutations, capacity/ID errors and lifecycle
boundaries. Source/plan/binary artifacts are retained in [artifacts/wasm](artifacts/wasm).

## Performance evidence

All performance results below use **Potion 2M, 64 dimensions, on an Apple M4 Pro**.
The numeric paths exclude tokenization and model loading. Reports retain complete
measurement boundaries and raw process/round samples, including slower results.

| Study | Measured result | Interpretation |
| --- | --- | --- |
| [Latest packed-row JS, Node](results/javascript-rows/REPORT.md) | Previous JS 17.34 → packed rows 9.90 µs/query over the mixed corpus | **1.75× faster than previous JS**, still about 13% slower than matched NumPy at 8.72 µs. Short queries: JS 2.09 vs NumPy 4.93 µs (**2.35× faster**). Public API with freshly allocated, detached output. |
| [Latest packed-row JS, Chrome](results/javascript-rows/browser/REPORT.md) | Previous JS 16.78 → packed rows 9.31 µs/query over the mixed corpus | **1.80× faster** in the same browser. This is not a NumPy comparison. The source layout gives most of the gain in Chrome; the compiler storage change is engine/workload dependent. |
| [Experimental GPU adapter, batch 1,024](results/gpu-fusion/REPORT.md) | Previous browser Ink GPU 3.61 → strict adapter 1.30 µs/embedding; native float 0.82 µs | **2.77× / 4.39×** versus the previous GPU path in the same study. Authored WGSL/host adapter, not an Ink compiler optimization. Large process variation; fusion alone adds about 1% against matched controls. Native float is approximate and changes some top-k IDs. No matched upstream GPU or NumPy measurement in this study. |
| [Current JS CPU, 1–16 tokens](results/javascript/REPORT.md) | Ink 1.84 µs/query; NumPy 4.85 µs/query | **2.63× faster** than NumPy; 1.31× faster than the previous checked JS compilation. |
| [Current JS CPU, mixed corpus](results/javascript/REPORT.md) | Ink 16.84 µs/query; NumPy 8.77 µs/query | **1.92× slower** than NumPy; 1.05× faster than the previous checked JS compilation. One-time JS weight capture/preparation increases from 17.56 to 29.05 ms. |
| [Browser Rust/Wasm, mixed corpus](results/wasm/REPORT.md) | Optimized Ink JS 22.43 µs/query; original Ink → Rust/Wasm 11.55 µs; authored quads → Rust/Wasm 9.29 µs | Quads is **2.41× faster than optimized JS in the same Chrome benchmark**. Both Wasm paths keep weights resident. This is not a NumPy comparison. |
| [Checked compiler follow-up](results/compiler/REPORT.md) | JS 32.18 → 18.94 µs/embedding; Rust borrowed entrypoint 10.97 µs | JS improves 1.70× against the previous JS compilation. Both remain slower than the historical NumPy CPU result of 8.51 µs on the mixed corpus. |
| [Native GPU, batch 1,024](results/targets/REPORT.md) | Ink GPU 3.77 µs/embedding; NumPy CPU 6.87 µs/embedding | About 1.82× the CPU baseline's throughput, including new-query uploads and decoded readback. CPU versus GPU; no upstream GPU baseline. |
| [Browser WebGPU, batch 1,024](results/browser/REPORT.md) | 4.10 µs/embedding; about 4.20 ms for the batch | Hardware WebGPU with resident weights in installed Chrome. About 1.68× the separately measured NumPy CPU batch baseline; not a matched browser/GPU comparison. |
| [Browser WebGPU, batch 1](results/browser/REPORT.md) | About 710 µs/request | GPU dispatch/readback overhead dominates single-query latency. |

Large-batch values describe **amortized throughput**, not individual request
latency. No speedup is claimed for Potion 8M or static retrieval: we validated
their outputs but have not benchmarked them.
