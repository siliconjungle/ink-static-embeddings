# JavaScript rows in Chrome

Installed visible Chrome, CPU only, public encode API; complete detached output consumed, loading/tokenization/model preparation excluded. The same row Ink source is compiled with old slot-array versus new dense F32 storage. Row source is authored, not a proof-selected rewrite.

Chrome 156.0.8078.80; Apple M4 Pro; 3 fresh browsers, nine rounds, 100 repetitions. µs/query; median of process medians.

| Input | Previous JS | Rows, array storage | Rows, dense storage | Previous / new |
| --- | ---: | ---: | ---: | ---: |
| all | 16.775 | 9.466 | 9.306 | 1.80× |
| empty | 1.200 | 0.900 | 0.950 | 1.26× |
| short | 1.825 | 1.783 | 1.740 | 1.05× |
| medium | 10.998 | 7.043 | 7.480 | 1.47× |
| long | 49.566 | 26.687 | 25.787 | 1.92× |

All 64 benchmark outputs and all 16 retained cases for each of the five model/fixtures match the ordered F32 oracle bit for bit. The actual public loader is tested. Changing/reordered queries, detached results and ID rejection are checked. The NumPy CPU comparison is in the separate matched Node/Python study; no browser NumPy or GPU speedup is claimed here.
