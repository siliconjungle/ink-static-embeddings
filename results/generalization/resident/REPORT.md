# Resident producer/consumer composition

Actual Chrome hardware; frozen unrelated producer programs plus the same literal Ink postprocess consumer, and Potion embedding -> exact similarity. Roundtrip uses typed readback and upload; resident uses GPU copy only; combined is the strong already-supported one-session pipeline control. Complete fresh final output included. Source/consumer numeric operations remain exact and identical. Cold setup and correctness checking excluded. Cross-backend CPU/GPU and source-close snapshots validated outside timing.

| Program | Input length | Lanes | Roundtrip µs | Resident copy µs | Combined pipeline µs | Roundtrip/resident |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| matrix-columns | 64 | 16 | 875.000 | 675.000 | 450.000 | 1.30× |
| matrix-columns | 64 | 64 | 875.000 | 650.000 | 425.000 | 1.35× |
| matrix-columns | 512 | 16 | 1000.000 | 625.000 | 575.000 | 1.60× |
| matrix-columns | 512 | 64 | 975.000 | 600.000 | 575.000 | 1.62× |
| filter-bank | 64 | 16 | 800.000 | 625.000 | 400.000 | 1.28× |
| filter-bank | 64 | 64 | 800.000 | 625.000 | 400.000 | 1.28× |
| filter-bank | 512 | 16 | 1025.000 | 600.000 | 625.000 | 1.71× |
| filter-bank | 512 | 64 | 1050.000 | 625.000 | 625.000 | 1.68× |
| channel-energy | 64 | 16 | 850.000 | 650.000 | 425.000 | 1.31× |
| channel-energy | 64 | 64 | 850.000 | 650.000 | 425.000 | 1.31× |
| channel-energy | 512 | 16 | 1000.000 | 700.000 | 625.000 | 1.43× |
| channel-energy | 512 | 64 | 975.000 | 700.000 | 625.000 | 1.39× |

## Potion embedding -> similarity

Corpus embeddings are prepared once outside timing and stay resident in all modes. Complete query encodes changing IDs and returns the full score matrix, not top-k. µs/query; batched throughput.

| Queries | Documents | Roundtrip | Resident copy | Combined pipeline | Roundtrip/resident |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 64 | 1025.000 | 775.000 | 700.000 | 1.32× |
| 16 | 256 | 62.500 | 48.437 | 40.625 | 1.29× |
| 64 | 256 | 21.484 | 15.234 | 16.016 | 1.41× |
