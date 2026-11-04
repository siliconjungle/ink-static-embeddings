# General independent-fold experiment

Frozen unrelated source, existing checked general independent-fold knowledge, same compiler. All results bit-exact to independent ordered F32, including edge cases and changed query order. Complete detached output consumed. Ordinary versus prepared modes retain different ingress/setup contracts and are compared within their own kind. Warm capture/preparation excluded and reported separately. No source rewrite is automatically profitable.

| Workload | Boundary | Mean latency across nonempty frozen cases, literal µs | Batched µs | Literal/batched |
| --- | --- | ---: | ---: | ---: |
| matrix-columns | batched-0/ordinary | 173.945 | 183.927 | 0.95× |
| matrix-columns | batched-0/prepared | 13.438 | 21.186 | 0.63× |
| matrix-columns | batched-1/ordinary | 173.945 | 183.262 | 0.95× |
| matrix-columns | batched-1/prepared | 13.438 | 21.137 | 0.64× |
| filter-bank | batched-0/ordinary | 27.891 | 28.983 | 0.96× |
| filter-bank | batched-0/prepared | 24.136 | 25.522 | 0.95× |
| filter-bank | batched-1/ordinary | 27.891 | 27.930 | 1.00× |
| filter-bank | batched-1/prepared | 24.136 | 25.038 | 0.96× |
| channel-energy | batched-0/ordinary | 13.361 | 29.742 | 0.45× |
| channel-energy | batched-0/prepared | 22.531 | 63.770 | 0.35× |
| channel-energy | batched-1/ordinary | 13.361 | 29.848 | 0.45× |
| channel-energy | batched-1/prepared | 22.531 | 64.637 | 0.35× |
| channel-energy | batched-2/ordinary | 13.361 | 61.269 | 0.22× |
| channel-energy | batched-2/prepared | 22.531 | 82.583 | 0.27× |
| channel-energy | batched-3/ordinary | 13.361 | 61.215 | 0.22× |
| channel-energy | batched-3/prepared | 22.531 | 83.877 | 0.27× |
