# Typed input codec phases

Codec phase only: pack, owned capture + GPU/CPU transport materialization, or owned capture + native JS carrier (F32 Array or the existing U32 typed carrier). All output bits checked after every timed batch; outputs retained until checked. Three fresh Node processes rotate mode order. Adaptive warmup counts retained per case. Same frozen descriptor and changed finite input arrays; no inference, uploads or readback timed. These medians must not be added to GPU medians.

| Carrier | Elements | Phase | Before µs | After µs | Before/after |
| --- | ---: | --- | ---: | ---: | ---: |
| typed | 0 | pack | 0.449 | 0.447 | 1.01× |
| typed | 0 | capture-gpu | 0.622 | 0.658 | 0.95× |
| typed | 0 | capture-js | 0.197 | 0.197 | 1.00× |
| typed | 8 | pack | 0.462 | 0.682 | 0.68× |
| typed | 8 | capture-gpu | 0.480 | 0.605 | 0.79× |
| typed | 8 | capture-js | 0.078 | 0.077 | 1.02× |
| typed | 64 | pack | 1.193 | 0.431 | 2.77× |
| typed | 64 | capture-gpu | 1.543 | 1.691 | 0.91× |
| typed | 64 | capture-js | 0.318 | 0.310 | 1.03× |
| typed | 512 | pack | 8.137 | 0.695 | 11.70× |
| typed | 512 | capture-gpu | 10.908 | 0.917 | 11.90× |
| typed | 512 | capture-js | 2.839 | 2.578 | 1.10× |
| typed | 4096 | pack | 59.333 | 3.438 | 17.26× |
| typed | 4096 | capture-gpu | 81.771 | 3.875 | 21.10× |
| typed | 4096 | capture-js | 20.864 | 20.386 | 1.02× |
| typed | 65536 | pack | 906.021 | 52.021 | 17.42× |
| typed | 65536 | capture-gpu | 1390.875 | 50.979 | 27.28× |
| typed | 65536 | capture-js | 425.896 | 418.750 | 1.02× |
| typed | 1889792 | pack | 28276.958 | 1784.291 | 15.85× |
| typed | 1889792 | capture-gpu | 40049.333 | 1774.209 | 22.57× |
| typed | 1889792 | capture-js | 12011.458 | 12106.458 | 0.99× |
| array | 8 | pack | 0.349 | 0.367 | 0.95× |
| array | 8 | capture-gpu | 0.520 | 0.733 | 0.71× |
| array | 8 | capture-js | 0.174 | 0.340 | 0.51× |
| array | 512 | pack | 6.992 | 7.083 | 0.99× |
| array | 512 | capture-gpu | 10.380 | 11.329 | 0.92× |
| array | 512 | capture-js | 3.406 | 3.355 | 1.02× |
| array | 4096 | pack | 50.208 | 51.844 | 0.97× |
| array | 4096 | capture-gpu | 76.583 | 86.500 | 0.89× |
| array | 4096 | capture-js | 25.688 | 25.938 | 0.99× |
| u32 | 8 | pack | 0.199 | 0.193 | 1.03× |
| u32 | 8 | capture-gpu | 0.273 | 0.544 | 0.50× |
| u32 | 8 | capture-js | 0.263 | 0.268 | 0.98× |
| u32 | 512 | pack | 0.431 | 0.427 | 1.01× |
| u32 | 512 | capture-gpu | 0.344 | 0.430 | 0.80× |
| u32 | 512 | capture-js | 0.336 | 0.337 | 1.00× |
| u32 | 4096 | pack | 1.469 | 1.542 | 0.95× |
| u32 | 4096 | capture-gpu | 1.323 | 1.510 | 0.88× |
| u32 | 4096 | capture-js | 1.375 | 1.333 | 1.03× |
