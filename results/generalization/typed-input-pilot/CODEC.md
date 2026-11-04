# Typed input codec phases

Codec phase only: pack, owned capture + GPU/CPU transport materialization, or owned capture + ordinary JS Array materialization. All output bits checked after every timed batch; outputs retained until checked. Three fresh Node processes rotate mode order. Same frozen descriptor and changed finite input arrays; no inference, uploads or readback timed. These medians must not be added to GPU medians.

| Carrier | F32 elements | Phase | Before µs | After µs | Before/after |
| --- | ---: | --- | ---: | ---: | ---: |
| typed | 0 | pack | 0.469 | 0.562 | 0.83× |
| typed | 0 | capture-gpu | 0.643 | 0.668 | 0.96× |
| typed | 0 | capture-js | 0.204 | 0.724 | 0.28× |
| typed | 8 | pack | 1.289 | 0.681 | 1.89× |
| typed | 8 | capture-gpu | 1.874 | 0.746 | 2.51× |
| typed | 8 | capture-js | 0.620 | 0.932 | 0.66× |
| typed | 64 | pack | 1.457 | 1.189 | 1.23× |
| typed | 64 | capture-gpu | 2.510 | 1.284 | 1.96× |
| typed | 64 | capture-js | 0.535 | 1.391 | 0.38× |
| typed | 512 | pack | 9.323 | 0.831 | 11.22× |
| typed | 512 | capture-gpu | 11.572 | 0.956 | 12.11× |
| typed | 512 | capture-js | 3.504 | 1.445 | 2.42× |
| typed | 4096 | pack | 52.000 | 3.781 | 13.75× |
| typed | 4096 | capture-gpu | 86.875 | 3.677 | 23.63× |
| typed | 4096 | capture-js | 21.438 | 7.271 | 2.95× |
| typed | 65536 | pack | 1034.583 | 48.521 | 21.32× |
| typed | 65536 | capture-gpu | 1393.729 | 55.396 | 25.16× |
| typed | 65536 | capture-js | 453.834 | 133.917 | 3.39× |
| typed | 1889792 | pack | 27838.458 | 1739.792 | 16.00× |
| typed | 1889792 | capture-gpu | 42646.958 | 1731.166 | 24.63× |
| typed | 1889792 | capture-js | 12604.709 | 4697.334 | 2.68× |
| array | 8 | pack | 1.206 | 1.201 | 1.00× |
| array | 8 | capture-gpu | 1.551 | 1.714 | 0.91× |
| array | 8 | capture-js | 0.387 | 0.508 | 0.76× |
| array | 512 | pack | 7.167 | 5.185 | 1.38× |
| array | 512 | capture-gpu | 10.948 | 6.845 | 1.60× |
| array | 512 | capture-js | 3.479 | 1.659 | 2.10× |
| array | 4096 | pack | 55.188 | 37.625 | 1.47× |
| array | 4096 | capture-gpu | 77.719 | 52.010 | 1.49× |
| array | 4096 | capture-js | 26.573 | 12.635 | 2.10× |
