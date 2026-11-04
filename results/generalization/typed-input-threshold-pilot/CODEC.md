# Typed input codec phases

Codec phase only: pack, owned capture + GPU/CPU transport materialization, or owned capture + ordinary JS Array materialization. All output bits checked after every timed batch; outputs retained until checked. Three fresh Node processes rotate mode order. Same frozen descriptor and changed finite input arrays; no inference, uploads or readback timed. These medians must not be added to GPU medians.

| Carrier | F32 elements | Phase | Before µs | After µs | Before/after |
| --- | ---: | --- | ---: | ---: | ---: |
| typed | 0 | pack | 0.483 | 0.488 | 0.99× |
| typed | 0 | capture-gpu | 0.663 | 0.681 | 0.97× |
| typed | 0 | capture-js | 0.207 | 0.229 | 0.90× |
| typed | 8 | pack | 1.281 | 0.694 | 1.85× |
| typed | 8 | capture-gpu | 1.772 | 1.822 | 0.97× |
| typed | 8 | capture-js | 0.523 | 0.534 | 0.98× |
| typed | 64 | pack | 2.973 | 1.312 | 2.26× |
| typed | 64 | capture-gpu | 1.926 | 1.999 | 0.96× |
| typed | 64 | capture-js | 0.439 | 0.646 | 0.68× |
| typed | 512 | pack | 9.158 | 0.867 | 10.56× |
| typed | 512 | capture-gpu | 11.943 | 0.943 | 12.67× |
| typed | 512 | capture-js | 2.736 | 1.510 | 1.81× |
| typed | 4096 | pack | 54.323 | 3.646 | 14.90× |
| typed | 4096 | capture-gpu | 72.542 | 3.771 | 19.24× |
| typed | 4096 | capture-js | 21.583 | 7.198 | 3.00× |
| typed | 65536 | pack | 911.729 | 49.625 | 18.37× |
| typed | 65536 | capture-gpu | 1443.917 | 62.438 | 23.13× |
| typed | 65536 | capture-js | 430.771 | 149.542 | 2.88× |
| typed | 1889792 | pack | 27460.917 | 1746.958 | 15.72× |
| typed | 1889792 | capture-gpu | 42064.542 | 1813.625 | 23.19× |
| typed | 1889792 | capture-js | 12220.625 | 4600.500 | 2.66× |
| array | 8 | pack | 1.163 | 1.191 | 0.98× |
| array | 8 | capture-gpu | 1.600 | 1.592 | 1.00× |
| array | 8 | capture-js | 0.385 | 0.398 | 0.97× |
| array | 512 | pack | 7.121 | 7.359 | 0.97× |
| array | 512 | capture-gpu | 10.372 | 10.689 | 0.97× |
| array | 512 | capture-js | 3.393 | 3.521 | 0.96× |
| array | 4096 | pack | 54.760 | 53.084 | 1.03× |
| array | 4096 | capture-gpu | 80.458 | 80.729 | 1.00× |
| array | 4096 | capture-js | 26.125 | 26.333 | 0.99× |
