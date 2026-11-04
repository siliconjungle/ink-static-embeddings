# Typed input codec phases

Codec phase only: pack, owned capture + GPU/CPU transport materialization, or owned capture + native JS carrier (F32 Array or the existing U32 typed carrier). All output bits checked after every timed batch; outputs retained until checked. Three fresh Node processes rotate mode order. Adaptive warmup counts retained per case. Same frozen descriptor and changed finite input arrays; no inference, uploads or readback timed. These medians must not be added to GPU medians.

| Carrier | Elements | Phase | Before µs | After µs | Before/after |
| --- | ---: | --- | ---: | ---: | ---: |
| typed | 0 | pack | 0.418 | 0.428 | 0.98× |
| typed | 0 | capture-gpu | 0.551 | 0.624 | 0.88× |
| typed | 0 | capture-js | 0.165 | 0.220 | 0.75× |
| typed | 8 | pack | 0.470 | 0.574 | 0.82× |
| typed | 8 | capture-gpu | 0.514 | 0.693 | 0.74× |
| typed | 8 | capture-js | 0.082 | 0.204 | 0.40× |
| typed | 64 | pack | 1.201 | 0.352 | 3.41× |
| typed | 64 | capture-gpu | 1.487 | 3.419 | 0.43× |
| typed | 64 | capture-js | 0.322 | 0.551 | 0.58× |
| typed | 512 | pack | 8.115 | 0.716 | 11.33× |
| typed | 512 | capture-gpu | 12.658 | 0.928 | 13.63× |
| typed | 512 | capture-js | 2.678 | 1.396 | 1.92× |
| typed | 4096 | pack | 67.021 | 3.740 | 17.92× |
| typed | 4096 | capture-gpu | 80.240 | 3.896 | 20.60× |
| typed | 4096 | capture-js | 21.719 | 7.312 | 2.97× |
| typed | 65536 | pack | 973.896 | 58.625 | 16.61× |
| typed | 65536 | capture-gpu | 1392.000 | 61.500 | 22.63× |
| typed | 65536 | capture-js | 431.854 | 142.605 | 3.03× |
| typed | 1889792 | pack | 29206.750 | 1910.666 | 15.29× |
| typed | 1889792 | capture-gpu | 43795.041 | 1903.083 | 23.01× |
| typed | 1889792 | capture-js | 12346.458 | 4823.833 | 2.56× |
| array | 8 | pack | 0.391 | 0.393 | 0.99× |
| array | 8 | capture-gpu | 0.591 | 0.730 | 0.81× |
| array | 8 | capture-js | 0.198 | 0.375 | 0.53× |
| array | 512 | pack | 7.262 | 7.083 | 1.03× |
| array | 512 | capture-gpu | 11.241 | 12.341 | 0.91× |
| array | 512 | capture-js | 3.473 | 4.893 | 0.71× |
| array | 4096 | pack | 57.604 | 54.802 | 1.05× |
| array | 4096 | capture-gpu | 81.323 | 87.729 | 0.93× |
| array | 4096 | capture-js | 27.667 | 39.834 | 0.69× |
| u32 | 8 | pack | 0.177 | 0.178 | 0.99× |
| u32 | 8 | capture-gpu | 0.230 | 0.233 | 0.99× |
| u32 | 8 | capture-js | 0.233 | 0.234 | 0.99× |
| u32 | 512 | pack | 0.426 | 0.440 | 0.97× |
| u32 | 512 | capture-gpu | 0.362 | 0.323 | 1.12× |
| u32 | 512 | capture-js | 0.344 | 0.340 | 1.01× |
| u32 | 4096 | pack | 1.698 | 1.562 | 1.09× |
| u32 | 4096 | capture-gpu | 1.458 | 1.417 | 1.03× |
| u32 | 4096 | capture-js | 1.542 | 1.469 | 1.05× |
