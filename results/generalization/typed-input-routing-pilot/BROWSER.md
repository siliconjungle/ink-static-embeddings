# Typed input complete GPU calls

Matched old host/ABI, new host + old ABI control (one captureTransport=capture export alias), and new host/ABI on actual Chrome hardware. Identical emitted source and shaders; output ABI unchanged. Known CPU/GPU preparations may prefer packed capture, while unknown/JS choices retain ordinary native capture. Each version has its exact aggregate host fingerprint. Ordinary/prepared calls return complete owned Arrays; resident sessions return fresh typed destinations. Three fresh processes rotate label/mode order; twelve warmups, seven rounds, four calls/round. Setup, first runs and repeated ready-session opens retained separately, never added to warm medians. Every timed output checked outside timers and mutated to check detachment. Transfer/dispatch counters isolate unchanged volume. No handwritten or approximate kernels.

| Program | Items / lanes | Boundary | Before µs | New host / old codec µs | After µs | Before/after |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| matrix-columns | 64 / 16 | ordinary | 750.000 | 800.000 | 575.000 | 1.30× |
| matrix-columns | 64 / 16 | prepared | 550.000 | 550.000 | 550.000 | 1.00× |
| matrix-columns | 64 / 16 | resident | 450.000 | 450.000 | 475.000 | 0.95× |
| matrix-columns | 64 / 64 | ordinary | 825.000 | 850.000 | 650.000 | 1.27× |
| matrix-columns | 64 / 64 | prepared | 550.000 | 525.000 | 575.000 | 0.96× |
| matrix-columns | 64 / 64 | resident | 450.000 | 475.000 | 450.000 | 1.00× |
| matrix-columns | 512 / 16 | ordinary | 925.000 | 925.000 | 725.000 | 1.28× |
| matrix-columns | 512 / 16 | prepared | 675.000 | 700.000 | 650.000 | 1.04× |
| matrix-columns | 512 / 16 | resident | 575.000 | 600.000 | 575.000 | 1.00× |
| matrix-columns | 512 / 64 | ordinary | 900.000 | 975.000 | 800.000 | 1.13× |
| matrix-columns | 512 / 64 | prepared | 725.000 | 700.000 | 675.000 | 1.07× |
| matrix-columns | 512 / 64 | resident | 625.000 | 575.000 | 600.000 | 1.04× |
| filter-bank | 64 / 16 | ordinary | 600.000 | 575.000 | 525.000 | 1.14× |
| filter-bank | 64 / 16 | prepared | 575.000 | 475.000 | 525.000 | 1.10× |
| filter-bank | 64 / 16 | resident | 425.000 | 475.000 | 400.000 | 1.06× |
| filter-bank | 64 / 64 | ordinary | 500.000 | 525.000 | 550.000 | 0.91× |
| filter-bank | 64 / 64 | prepared | 525.000 | 450.000 | 475.000 | 1.11× |
| filter-bank | 64 / 64 | resident | 425.000 | 425.000 | 425.000 | 1.00× |
| filter-bank | 512 / 16 | ordinary | 750.000 | 775.000 | 750.000 | 1.00× |
| filter-bank | 512 / 16 | prepared | 725.000 | 700.000 | 700.000 | 1.04× |
| filter-bank | 512 / 16 | resident | 675.000 | 675.000 | 625.000 | 1.08× |
| filter-bank | 512 / 64 | ordinary | 750.000 | 750.000 | 725.000 | 1.03× |
| filter-bank | 512 / 64 | prepared | 675.000 | 700.000 | 700.000 | 0.96× |
| filter-bank | 512 / 64 | resident | 675.000 | 675.000 | 650.000 | 1.04× |
| channel-energy | 64 / 16 | ordinary | 575.000 | 550.000 | 625.000 | 0.92× |
| channel-energy | 64 / 16 | prepared | 550.000 | 525.000 | 550.000 | 1.00× |
| channel-energy | 64 / 16 | resident | 475.000 | 500.000 | 525.000 | 0.90× |
| channel-energy | 64 / 64 | ordinary | 575.000 | 550.000 | 600.000 | 0.96× |
| channel-energy | 64 / 64 | prepared | 525.000 | 550.000 | 550.000 | 0.95× |
| channel-energy | 64 / 64 | resident | 500.000 | 500.000 | 500.000 | 1.00× |
| channel-energy | 512 / 16 | ordinary | 700.000 | 725.000 | 750.000 | 0.93× |
| channel-energy | 512 / 16 | prepared | 600.000 | 625.000 | 600.000 | 1.00× |
| channel-energy | 512 / 16 | resident | 650.000 | 650.000 | 650.000 | 1.00× |
| channel-energy | 512 / 64 | ordinary | 725.000 | 700.000 | 700.000 | 1.04× |
| channel-energy | 512 / 64 | prepared | 575.000 | 600.000 | 600.000 | 0.96× |
| channel-energy | 512 / 64 | resident | 625.000 | 600.000 | 625.000 | 1.00× |

## Public Potion 2M, batch 16

| Boundary | Before | New host / old codec | After | Before/after |
| --- | ---: | ---: | ---: | ---: |
| Ready session open, ms | 28.100 | 36.100 | 4.000 | 7.03× |
| Warm encode, µs/embedding | 43.750 | 39.063 | 42.188 | 1.04× |
