# JavaScript row-layout latency

Potion 2M, Apple M4 Pro CPU. Public encode API, fresh IDs and detached complete outputs; all dimensions consumed. Loading/tokenization/one-time weight capture excluded, setup retained separately. Six fresh process groups, nine rounds of 100 repetitions. Median of process medians; µs/query.

| Input | NumPy | Previous JS | Current host, reference | Rows, old array storage | Rows, dense storage | Previous / new |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 8.723 | 17.342 | 17.505 | 16.819 | 9.896 | 1.75× |
| empty | 0.790 | 1.614 | 1.720 | 1.764 | 1.674 | 0.96× |
| short | 4.931 | 2.103 | 2.178 | 2.116 | 2.094 | 1.00× |
| medium | 7.599 | 11.584 | 11.792 | 11.942 | 7.839 | 1.48× |
| long | 17.184 | 50.955 | 50.942 | 47.263 | 25.774 | 1.98× |

Short = 1–16 tokens; medium = 17–128; long = 129–512. The row source explicitly prefetches rows and uses coordinate accumulators for <=16 tokens; longer inputs visit adjacent dimensions in a dense F32 Buffer. Every dimension retains token order and the norm retains its right fold. This is an authored Ink layout, not a newly proof-selected rewrite.

Rows old/new use the identical Ink source with different literal JS Buffer carriers. The current host/reference control separates the F32 output-boundary correction from the source/storage improvements. Tagged F32 outputs convert through a word view so overflow infinities and NaNs survive the Float32Array boundary.

All 64 generated outputs match the independent ordered-F32 oracle bit for bit. NumPy uses its ordinary reduction order and is checked with rtol=2e-6, atol=2e-7. Cross-runtime comparisons are implementation measurements, not an isolated compiler effect.

One-time weight capture/preparation (ms): previous: 37.59, reference: 37.28, rows-array: 37.08, rows: 36.70. Row packing preserves the original F32 values but creates one captured typed array per token row; setup/memory costs can outweigh gains for short-lived models.
