# Resident composition lifecycle observations

The warm complete-call report excludes setup. These raw process records retain runtime load, session opens, corpus encoding and initial corpus transfers separately. Session opens execute sequentially in one runtime and share pipeline caches; these are not independently cold alternatives. Do not add their phase medians to a warm latency or infer an automatic placement policy. Values below are medians across three fresh Chrome processes, in milliseconds. Module import, browser launch and model file download are outside these timers. `shared runtime load` is the same module load reused by multiple shapes, not a fresh cost for each row. Corpus encode/copy timers wait for the device queue; session-open timers follow the public API completion contract.

| Program | Items / lanes | Shared runtime load | Producer open | Consumer open | Combined open |
| --- | --- | ---: | ---: | ---: | ---: |
| matrix-columns | 64 / 16 | 8.300 | 6.100 | 4.000 | 1.100 |
| matrix-columns | 64 / 64 | 8.300 | 0.900 | 0.100 | 0.600 |
| matrix-columns | 512 / 16 | 8.300 | 0.700 | 0.100 | 0.500 |
| matrix-columns | 512 / 64 | 8.300 | 0.500 | 0.100 | 0.900 |
| filter-bank | 64 / 16 | 6.500 | 4.700 | 1.300 | 0.200 |
| filter-bank | 64 / 64 | 6.500 | 0.300 | 0.200 | 0.300 |
| filter-bank | 512 / 16 | 6.500 | 0.300 | 0.100 | 0.200 |
| filter-bank | 512 / 64 | 6.500 | 0.300 | 0.100 | 0.200 |
| channel-energy | 64 / 16 | 6.600 | 5.000 | 1.500 | 0.300 |
| channel-energy | 64 / 64 | 6.600 | 0.300 | 0.200 | 0.300 |
| channel-energy | 512 / 16 | 6.600 | 0.400 | 0.200 | 0.300 |
| channel-energy | 512 / 64 | 6.600 | 0.300 | 0.100 | 0.300 |

## Potion embedding -> exact similarity

The 7,559,168-byte weight table is resident per producer; the corpus is encoded once. Both separate-session modes share the same prepared producer and consumer. Cold setup does not become faster because the intermediate transfer changes. The combined control has its own session and retains its own producer weights. Corpus-copy preparation below measures both consumer copies together, not one per query.

| Queries / documents | Runtime load | Producer open | Corpus open | Corpus upload / encode | Consumer open | Combined open | Two corpus copies |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 / 64 | 7.600 | 57.700 | 40.700 | 2.000 | 4.500 | 46.100 | 0.800 |
| 16 / 256 | 7.600 | 35.200 | 34.000 | 2.000 | 0.500 | 34.700 | 0.500 |
| 64 / 256 | 7.600 | 36.300 | 34.300 | 1.400 | 0.500 | 33.100 | 0.700 |
