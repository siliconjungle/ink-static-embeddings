# General typed GPU result boundary

Same Ink sources and byte-identical emitted entry shaders. All modes include common query validation, packing, three uploads/dispatches and detached complete output. New read control isolates host version from typed destination API. Actual Chrome hardware, 20 warmups, alternating IDs, process/mode order rotation. Setup/loading and correctness checking excluded. No handwritten GPU kernel or approximate arithmetic.

| Batch | Before µs/embedding | New host, legacy read | Typed readInto | Before/typed |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 600.000 | 587.500 | 600.000 | 1.00× |
| 16 | 42.187 | 41.406 | 38.281 | 1.10× |
| 64 | 16.992 | 16.406 | 15.625 | 1.09× |
| 256 | 5.664 | 5.566 | 4.053 | 1.40× |
| 1024 | 3.503 | 3.442 | 1.697 | 2.06× |
