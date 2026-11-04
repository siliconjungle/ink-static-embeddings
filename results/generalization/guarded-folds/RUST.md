# Rust independent-fold experiment

Same checked source/plan candidates, generated Rust typed owning API. Input vector clones and detached complete output consumption included; JSON parsing, build and validation excluded. No borrowed/prepared Rust claim. Each target owns a fresh executable/process; their order rotates between groups.

| Workload | Candidate | Literal mean µs | Candidate mean µs | Literal/candidate |
| --- | --- | ---: | ---: | ---: |
| matrix-columns | batched_0 | 7.854 | 2.589 | 3.03× |
| matrix-columns | batched_1 | 7.854 | 3.421 | 2.30× |
| filter-bank | batched_0 | 16.572 | 2.101 | 7.89× |
| filter-bank | batched_1 | 16.572 | 2.094 | 7.92× |
| channel-energy | batched_0 | 7.540 | 3.049 | 2.47× |
| channel-energy | batched_1 | 7.540 | 3.022 | 2.50× |
| channel-energy | batched_2 | 7.540 | 3.042 | 2.48× |
| channel-energy | batched_3 | 7.540 | 3.051 | 2.47× |
