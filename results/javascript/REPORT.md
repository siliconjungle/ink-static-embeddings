# JavaScript CPU latency

Fresh-process CPU comparison on the retained 64-query, 64-dimension fixture.

Tokenization, loading and immutable-weight preparation are outside steady state.
Each timed call consumes all output dimensions. This measures single-query
latency, not batch throughput. NumPy retains its own reduction order; generated
JavaScript must match the independent ordered-F32 oracle exactly.

Median of process medians; times in microseconds per embedding. Before/after use the same Ink source, checked selection and weights.

| Input length | NumPy | JS before | JS after | Before / after | NumPy / JS after |
| --- | ---: | ---: | ---: | ---: | ---: |
| all | 8.767 | 17.692 | 16.841 | 1.05× | 0.52× |
| empty | 0.775 | 1.616 | 1.469 | 1.10× | 0.53× |
| short | 4.848 | 2.417 | 1.844 | 1.31× | 2.63× |
| medium | 7.388 | 12.133 | 11.104 | 1.09× | 0.67× |
| long | 17.126 | 50.304 | 49.247 | 1.02× | 0.35× |

Short = 1–16 tokens; medium = 17–128; long = 129–512. Empty is reported separately. All generated outputs are bit-exact against the independent oracle; NumPy is checked with rtol=2e-6, atol=2e-7.

Each JavaScript call captures changing IDs and writes a reused caller destination. NumPy allocates its ordinary result. Both consume every output using their runtime’s ordinary sum/iteration. These are CPU latency comparisons across runtimes, not identical machine-code kernels or GPU/batch measurements. Raw files retain loading/preparation costs.

One-time JavaScript weight capture/preparation increases from 17.56 to 29.05 ms. Dense storage adds a private conversion after ordinary validation; this cost is excluded from the warm latency table.
