# Typed input complete GPU calls

ABI-only before/after comparison on actual Chrome hardware. Identical emitted source, shaders and host; only the compiler-package packed codec and its matching aggregate fingerprint differ. Ordinary and prepared calls return complete owned Arrays; resident sessions return complete fresh typed destinations. Stable model/context data versus changed inputs and prepared snapshots retain their separate lifetimes. Three fresh processes rotate label/mode order; twelve warmups, seven rounds, four calls/round. Setup, first runs and repeated ready-session opens are retained separately and never added to warm medians. Output validation is outside timers; every timed output is checked and mutated to check detachment. Upload/readback counters isolate unchanged transfer volume. No handwritten or approximate kernels.

| Program | Items / lanes | Boundary | Before µs | After µs | Before/after |
| --- | --- | --- | ---: | ---: | ---: |
| matrix-columns | 64 / 16 | ordinary | 700.000 | 550.000 | 1.27× |
| matrix-columns | 64 / 16 | prepared | 500.000 | 525.000 | 0.95× |
| matrix-columns | 64 / 16 | resident | 400.000 | 400.000 | 1.00× |
| matrix-columns | 64 / 64 | ordinary | 675.000 | 525.000 | 1.29× |
| matrix-columns | 64 / 64 | prepared | 475.000 | 500.000 | 0.95× |
| matrix-columns | 64 / 64 | resident | 400.000 | 400.000 | 1.00× |
| matrix-columns | 512 / 16 | ordinary | 825.000 | 650.000 | 1.27× |
| matrix-columns | 512 / 16 | prepared | 625.000 | 650.000 | 0.96× |
| matrix-columns | 512 / 16 | resident | 575.000 | 550.000 | 1.05× |
| matrix-columns | 512 / 64 | ordinary | 825.000 | 675.000 | 1.22× |
| matrix-columns | 512 / 64 | prepared | 650.000 | 650.000 | 1.00× |
| matrix-columns | 512 / 64 | resident | 575.000 | 575.000 | 1.00× |
| filter-bank | 64 / 16 | ordinary | 500.000 | 475.000 | 1.05× |
| filter-bank | 64 / 16 | prepared | 450.000 | 450.000 | 1.00× |
| filter-bank | 64 / 16 | resident | 400.000 | 400.000 | 1.00× |
| filter-bank | 64 / 64 | ordinary | 450.000 | 450.000 | 1.00× |
| filter-bank | 64 / 64 | prepared | 450.000 | 450.000 | 1.00× |
| filter-bank | 64 / 64 | resident | 400.000 | 400.000 | 1.00× |
| filter-bank | 512 / 16 | ordinary | 675.000 | 675.000 | 1.00× |
| filter-bank | 512 / 16 | prepared | 650.000 | 650.000 | 1.00× |
| filter-bank | 512 / 16 | resident | 600.000 | 600.000 | 1.00× |
| filter-bank | 512 / 64 | ordinary | 700.000 | 675.000 | 1.04× |
| filter-bank | 512 / 64 | prepared | 675.000 | 675.000 | 1.00× |
| filter-bank | 512 / 64 | resident | 625.000 | 625.000 | 1.00× |
| channel-energy | 64 / 16 | ordinary | 525.000 | 550.000 | 0.95× |
| channel-energy | 64 / 16 | prepared | 525.000 | 500.000 | 1.05× |
| channel-energy | 64 / 16 | resident | 475.000 | 475.000 | 1.00× |
| channel-energy | 64 / 64 | ordinary | 550.000 | 550.000 | 1.00× |
| channel-energy | 64 / 64 | prepared | 500.000 | 525.000 | 0.95× |
| channel-energy | 64 / 64 | resident | 475.000 | 475.000 | 1.00× |
| channel-energy | 512 / 16 | ordinary | 725.000 | 725.000 | 1.00× |
| channel-energy | 512 / 16 | prepared | 625.000 | 625.000 | 1.00× |
| channel-energy | 512 / 16 | resident | 650.000 | 625.000 | 1.04× |
| channel-energy | 512 / 64 | ordinary | 750.000 | 750.000 | 1.00× |
| channel-energy | 512 / 64 | prepared | 575.000 | 600.000 | 0.96× |
| channel-energy | 512 / 64 | resident | 600.000 | 625.000 | 0.96× |

## Public Potion 2M, batch 16

| Boundary | Before | After | Before/after |
| --- | ---: | ---: | ---: |
| Ready session open, ms | 33.600 | 4.000 | 8.40× |
| Warm encode, µs/embedding | 42.188 | 39.063 | 1.08× |
