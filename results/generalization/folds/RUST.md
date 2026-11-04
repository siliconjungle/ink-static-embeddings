# Rust independent-fold experiment

Same checked source/plan candidates, generated Rust typed owning API. Input vector clones and detached complete output consumption included; JSON parsing, build and validation excluded. No borrowed/prepared Rust claim. Each target owns a fresh executable/process; their order rotates between groups.

| Workload | Candidate | Literal mean µs | Candidate mean µs | Literal/candidate |
| --- | --- | ---: | ---: | ---: |
| matrix-columns | batched_0 | 7.863 | 2.596 | 3.03× |
| matrix-columns | batched_1 | 7.863 | 2.580 | 3.05× |
| filter-bank | batched_0 | 16.679 | 2.078 | 8.03× |
| filter-bank | batched_1 | 16.679 | 2.426 | 6.87× |
| channel-energy | batched_0 | 7.579 | 3.058 | 2.48× |
| channel-energy | batched_1 | 7.579 | 3.040 | 2.49× |
| channel-energy | batched_2 | 7.579 | 3.315 | 2.29× |
| channel-energy | batched_3 | 7.579 | 3.276 | 2.31× |
