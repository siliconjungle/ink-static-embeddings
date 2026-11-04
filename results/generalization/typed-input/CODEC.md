# Typed input codec phases

Codec phase only: pack, owned capture + GPU/CPU transport materialization, or owned capture + native JS carrier (F32 Array or the existing U32 typed carrier). All output bits checked after every timed batch; outputs retained until checked. Three fresh Node processes rotate mode order. Adaptive warmup counts retained per case. Same frozen descriptor and changed finite input arrays; no inference, uploads or readback timed. These medians must not be added to GPU medians.

| Carrier | Elements | Phase | Before µs | After µs | Before/after |
| --- | ---: | --- | ---: | ---: | ---: |
| typed | 0 | pack | 0.434 | 0.436 | 0.99× |
| typed | 0 | capture-gpu | 0.600 | 0.658 | 0.91× |
| typed | 0 | capture-js | 0.198 | 0.194 | 1.02× |
| typed | 8 | pack | 0.474 | 0.467 | 1.01× |
| typed | 8 | capture-gpu | 0.491 | 0.574 | 0.85× |
| typed | 8 | capture-js | 0.077 | 0.074 | 1.04× |
| typed | 64 | pack | 1.238 | 0.408 | 3.04× |
| typed | 64 | capture-gpu | 1.500 | 1.542 | 0.97× |
| typed | 64 | capture-js | 0.315 | 0.312 | 1.01× |
| typed | 512 | pack | 8.318 | 0.685 | 12.14× |
| typed | 512 | capture-gpu | 10.943 | 0.921 | 11.89× |
| typed | 512 | capture-js | 2.539 | 2.540 | 1.00× |
| typed | 4096 | pack | 60.354 | 3.292 | 18.34× |
| typed | 4096 | capture-gpu | 82.635 | 3.698 | 22.35× |
| typed | 4096 | capture-js | 20.291 | 20.469 | 0.99× |
| typed | 65536 | pack | 944.521 | 47.520 | 19.88× |
| typed | 65536 | capture-gpu | 1349.583 | 51.938 | 25.98× |
| typed | 65536 | capture-js | 413.958 | 410.854 | 1.01× |
| typed | 1889792 | pack | 28338.542 | 1682.000 | 16.85× |
| typed | 1889792 | capture-gpu | 39687.042 | 1723.541 | 23.03× |
| typed | 1889792 | capture-js | 11940.792 | 11886.583 | 1.00× |
| array | 8 | pack | 0.346 | 0.348 | 1.00× |
| array | 8 | capture-gpu | 0.516 | 0.684 | 0.75× |
| array | 8 | capture-js | 0.173 | 0.339 | 0.51× |
| array | 512 | pack | 6.910 | 6.900 | 1.00× |
| array | 512 | capture-gpu | 10.025 | 10.118 | 0.99× |
| array | 512 | capture-js | 3.251 | 3.253 | 1.00× |
| array | 4096 | pack | 53.375 | 53.719 | 0.99× |
| array | 4096 | capture-gpu | 77.365 | 77.615 | 1.00× |
| array | 4096 | capture-js | 25.854 | 25.771 | 1.00× |
| u32 | 8 | pack | 0.199 | 0.199 | 1.00× |
| u32 | 8 | capture-gpu | 0.271 | 0.276 | 0.98× |
| u32 | 8 | capture-js | 0.270 | 0.264 | 1.02× |
| u32 | 512 | pack | 0.440 | 0.438 | 1.01× |
| u32 | 512 | capture-gpu | 0.362 | 0.366 | 0.99× |
| u32 | 512 | capture-js | 0.340 | 0.359 | 0.95× |
| u32 | 4096 | pack | 1.500 | 1.479 | 1.01× |
| u32 | 4096 | capture-gpu | 1.302 | 1.417 | 0.92× |
| u32 | 4096 | capture-js | 1.385 | 1.354 | 1.02× |
