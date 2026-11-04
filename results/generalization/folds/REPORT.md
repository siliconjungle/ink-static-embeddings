# General independent-fold experiment

Frozen unrelated source, existing checked general independent-fold knowledge, same compiler. All results bit-exact to independent ordered F32, including edge cases and changed query order. Complete detached output consumed. Ordinary versus prepared modes retain different ingress/setup contracts and are compared within their own kind. Warm capture/preparation excluded and reported separately. No source rewrite is automatically profitable.

| Workload | Boundary | Mean latency across nonempty frozen cases, literal µs | Batched µs | Literal/batched |
| --- | --- | ---: | ---: | ---: |
| matrix-columns | batched-0/ordinary | 168.454 | 176.223 | 0.96× |
| matrix-columns | batched-0/prepared | 12.878 | 19.694 | 0.65× |
| matrix-columns | batched-1/ordinary | 168.454 | 179.608 | 0.94× |
| matrix-columns | batched-1/prepared | 12.878 | 23.237 | 0.55× |
| filter-bank | batched-0/ordinary | 26.607 | 28.019 | 0.95× |
| filter-bank | batched-0/prepared | 23.449 | 24.463 | 0.96× |
| filter-bank | batched-1/ordinary | 26.607 | 27.708 | 0.96× |
| filter-bank | batched-1/prepared | 23.449 | 24.282 | 0.97× |
| channel-energy | batched-0/ordinary | 13.106 | 28.712 | 0.46× |
| channel-energy | batched-0/prepared | 21.977 | 63.008 | 0.35× |
| channel-energy | batched-1/ordinary | 13.106 | 28.820 | 0.45× |
| channel-energy | batched-1/prepared | 21.977 | 62.578 | 0.35× |
| channel-energy | batched-2/ordinary | 13.106 | 28.312 | 0.46× |
| channel-energy | batched-2/prepared | 21.977 | 63.439 | 0.35× |
| channel-energy | batched-3/ordinary | 13.106 | 28.791 | 0.46× |
| channel-energy | batched-3/prepared | 21.977 | 63.281 | 0.35× |
