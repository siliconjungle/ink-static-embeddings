# Embedding model → Ink: measured experiment

Warm token-ID to complete embedding; full vocabulary retained and captured once. Tokenization, imports and model capture excluded from kernel samples and reported separately. Python/NumPy vs Node differences are not attributable solely to Ink.

| Execution | Median µs / embedding | Fresh-process median range, µs |
| --- | ---: | ---: |
| upstream | 8.513 | 8.188–9.342 |
| literal | 31.846 | 31.620–32.143 |
| optimized | 31.891 | 31.605–32.751 |

Literal / optimized paired median ratio: **0.999×**.
Checked optimization applications: **1**.
Largest difference from upstream: **5.96e-08**.

This run does not show an optimization speedup. The isolated compiler comparison is literal versus optimized Ink; comparing upstream Python/NumPy with Node also changes the runtime and implementation.

Every compiled output matches the independent ordered F32 oracle bit for bit; literal and optimized outputs also match bit for bit. Nearest-neighbor top-1 agrees on twelve distinct text fixtures.

This is a static embedding model, not a transformer. The importer retains all 29,528 × 64 weights; it does not retrain, truncate dimensions, reduce the vocabulary, or substitute a teacher model.

Timing is descriptive evidence on this workstation and corpus. Raw per-round measurements, setup costs, checksums, runtime versions and process peak RSS are in the adjacent JSON files. Compile/search costs are separate. No general model quality or universal speedup is established.
