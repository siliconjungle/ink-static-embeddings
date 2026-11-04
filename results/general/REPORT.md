# General static architecture validation

Architecture compatibility validation, not a general performance benchmark or universal equivalence proof.

| Model / fixture | Dimensions | F32 table values | JS shards | JS / Rust / hardware WebGPU |
| --- | ---: | ---: | ---: | --- |
| minishlab/potion-base-2M | 64 | 1,889,792 | 2 | Bit-exact ordered F32 |
| minishlab/potion-base-8M | 256 | 7,559,168 | 8 | Bit-exact ordered F32 |
| sentence-transformers/static-retrieval-mrl-en-v1 | 1024 | 31,254,528 | 32 | Bit-exact ordered F32 |
| fixture/unseen-weighted | 7 | 133 | 13 | Bit-exact ordered F32 |
| fixture/unseen-clamp | 5 | 85 | 7 | Bit-exact ordered F32 |

Each model has 16 cases: text/empty/Unicode/unknown-token inputs, vocabulary endpoints, repeated IDs and seeded sequences up to 512 tokens. WebGPU checks three changing permutations of every case, with actual hardware execution required. Invalid IDs, overlong documents and oversized allocation requests are rejected.

Model2Vec tokenization/inference is checked against upstream 0.7.0. Sentence Transformers exports are checked against the PyTorch EmbeddingBag(mean) and optional normalize operations used by its StaticEmbedding pipeline; the complete Sentence Transformers SDK is not imported. Upstream tolerance is rtol=2e-5, atol=2e-6. Generated targets must match the independent ordered binary32 oracle bit for bit.

The two generated fixtures exercise unfamiliar five/seven-dimensional shapes, non-row-aligned sharding, clustered vocabulary remapping, F32 token weights, zero/tiny rows and clamped normalization. They are deterministic test models, not pretrained quality benchmarks. The generated weighted fixture is serialized by upstream Model2Vec itself.

Potion 2M additionally runs the unchanged proof-checked optimizer and validates its selected output. Only that model has an optimized JS result in this matrix. This upgrade does not claim a new compiler optimization speedup.

Imported model IDs/revisions, source files, emitted sources, compiler hashes, reference outputs, browser/device identity and output hashes are retained beside this report. Learned model tables are redownloaded from pinned revisions, rather than committed. Larger tables can exceed existing Ink/device GPU budgets even though CPU import succeeds.
