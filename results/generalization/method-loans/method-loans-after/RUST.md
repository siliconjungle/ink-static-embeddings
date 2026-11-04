# Rust independent-fold experiment

Same checked source/plan candidates, generated Rust typed owning API. Input vector clones and detached complete output consumption included; JSON parsing, build and validation excluded. No borrowed/prepared Rust claim. Each target owns a fresh executable/process; their order rotates between groups.

| Workload | Candidate | Literal mean µs | Candidate mean µs | Literal/candidate |
| --- | --- | ---: | ---: | ---: |
| matrix-columns | batched_0 | 8.428 | 2.586 | 3.26× |
| matrix-columns | batched_1 | 8.428 | 2.593 | 3.25× |
| filter-bank | batched_0 | 16.684 | 2.226 | 7.50× |
| filter-bank | batched_1 | 16.684 | 2.200 | 7.58× |
| channel-energy | batched_0 | 7.949 | 3.075 | 2.59× |
| channel-energy | batched_1 | 7.949 | 3.039 | 2.62× |
| channel-energy | batched_2 | 7.949 | 3.059 | 2.60× |
| channel-energy | batched_3 | 7.949 | 3.056 | 2.60× |
