# Browser WebGPU experiment

Headed installed Chrome, isolated fresh profiles, actual hardware WebGPU required. Warm resident model; alternating token queries. Complete query includes input packing/uploads, three completed dispatches and complete decoded output readback. Excludes tokenization, model download/loading, session/pipeline creation and correctness checking. Large batch values describe amortized throughput, not individual request latency. Exact F32 shaders emitted by unchanged Ink; no upstream browser GPU baseline.

Chrome 156.0.8078.80; GPU {"vendor":"apple","architecture":"metal-3","device":"","description":"","isFallbackAdapter":false}. Three warmups, 9 measured queries in each of 3 fresh browser process groups. Every output bit matches the ordered F32 oracle.

| Batch | Complete query µs / embedding | Compute + finish µs / embedding | Read + decode µs / embedding |
| ---: | ---: | ---: | ---: |
| 1 | 710.000 | 235.000 | 265.000 |
| 16 | 52.813 | 16.875 | 18.125 |
| 64 | 20.156 | 9.219 | 6.016 |
| 256 | 6.738 | 2.441 | 2.578 |
| 1024 | 4.097 | 1.250 | 1.787 |
