# General independent-fold experiment

Frozen unrelated source, existing checked general independent-fold knowledge, same compiler. All results bit-exact to independent ordered F32, including edge cases and changed query order. Complete detached output consumed. Ordinary versus prepared modes retain different ingress/setup contracts and are compared within their own kind. Warm capture/preparation excluded and reported separately. No source rewrite is automatically profitable.

| Workload | Boundary | Mean latency across nonempty frozen cases, literal µs | Batched µs | Literal/batched |
| --- | --- | ---: | ---: | ---: |
| matrix-columns | batched-0/ordinary | 168.563 | 177.098 | 0.95× |
| matrix-columns | batched-0/prepared | 12.910 | 20.101 | 0.64× |
| filter-bank | batched-0/ordinary | 26.488 | 28.179 | 0.94× |
| filter-bank | batched-0/prepared | 23.356 | 24.640 | 0.95× |
| channel-energy | batched-0/ordinary | 13.464 | 29.243 | 0.46× |
| channel-energy | batched-0/prepared | 23.010 | 57.566 | 0.40× |
| channel-energy | batched-1/ordinary | 13.464 | 29.331 | 0.46× |
| channel-energy | batched-1/prepared | 23.010 | 64.768 | 0.36× |
