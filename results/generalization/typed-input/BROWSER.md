# Typed input complete GPU calls

Matched old host/ABI, new host + old ABI control (one captureTransport=capture export alias), and new host/ABI on actual Chrome hardware. Identical emitted source and shaders; output ABI unchanged. Known CPU/GPU preparations may prefer packed capture, while unknown/JS choices retain ordinary native capture. Each version has its exact aggregate host fingerprint. Ordinary/prepared calls return complete owned Arrays; resident sessions return fresh typed destinations. Three fresh processes rotate label/mode order; twelve warmups, seven rounds, four calls/round. Setup, first runs and repeated ready-session opens retained separately, never added to warm medians. Every timed output checked outside timers and mutated to check detachment. Transfer/dispatch counters isolate unchanged volume. No handwritten or approximate kernels.

| Program | Items / lanes | Boundary | Before µs | New host / old codec µs | After µs | Before/after |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| matrix-columns | 64 / 16 | ordinary | 700.000 | 725.000 | 550.000 | 1.27× |
| matrix-columns | 64 / 16 | prepared | 525.000 | 550.000 | 500.000 | 1.05× |
| matrix-columns | 64 / 16 | resident | 425.000 | 400.000 | 400.000 | 1.06× |
| matrix-columns | 64 / 64 | ordinary | 675.000 | 700.000 | 550.000 | 1.23× |
| matrix-columns | 64 / 64 | prepared | 525.000 | 525.000 | 475.000 | 1.11× |
| matrix-columns | 64 / 64 | resident | 425.000 | 425.000 | 400.000 | 1.06× |
| matrix-columns | 512 / 16 | ordinary | 825.000 | 850.000 | 650.000 | 1.27× |
| matrix-columns | 512 / 16 | prepared | 650.000 | 675.000 | 650.000 | 1.00× |
| matrix-columns | 512 / 16 | resident | 575.000 | 550.000 | 550.000 | 1.05× |
| matrix-columns | 512 / 64 | ordinary | 850.000 | 850.000 | 675.000 | 1.26× |
| matrix-columns | 512 / 64 | prepared | 650.000 | 650.000 | 650.000 | 1.00× |
| matrix-columns | 512 / 64 | resident | 575.000 | 575.000 | 575.000 | 1.00× |
| filter-bank | 64 / 16 | ordinary | 475.000 | 475.000 | 475.000 | 1.00× |
| filter-bank | 64 / 16 | prepared | 450.000 | 475.000 | 450.000 | 1.00× |
| filter-bank | 64 / 16 | resident | 400.000 | 400.000 | 400.000 | 1.00× |
| filter-bank | 64 / 64 | ordinary | 475.000 | 500.000 | 475.000 | 1.00× |
| filter-bank | 64 / 64 | prepared | 450.000 | 450.000 | 450.000 | 1.00× |
| filter-bank | 64 / 64 | resident | 400.000 | 400.000 | 425.000 | 0.94× |
| filter-bank | 512 / 16 | ordinary | 675.000 | 675.000 | 675.000 | 1.00× |
| filter-bank | 512 / 16 | prepared | 650.000 | 650.000 | 650.000 | 1.00× |
| filter-bank | 512 / 16 | resident | 600.000 | 625.000 | 600.000 | 1.00× |
| filter-bank | 512 / 64 | ordinary | 700.000 | 700.000 | 700.000 | 1.00× |
| filter-bank | 512 / 64 | prepared | 675.000 | 675.000 | 675.000 | 1.00× |
| filter-bank | 512 / 64 | resident | 650.000 | 625.000 | 625.000 | 1.04× |
| channel-energy | 64 / 16 | ordinary | 525.000 | 500.000 | 525.000 | 1.00× |
| channel-energy | 64 / 16 | prepared | 475.000 | 475.000 | 475.000 | 1.00× |
| channel-energy | 64 / 16 | resident | 450.000 | 450.000 | 450.000 | 1.00× |
| channel-energy | 64 / 64 | ordinary | 525.000 | 525.000 | 550.000 | 0.95× |
| channel-energy | 64 / 64 | prepared | 475.000 | 500.000 | 475.000 | 1.00× |
| channel-energy | 64 / 64 | resident | 450.000 | 450.000 | 450.000 | 1.00× |
| channel-energy | 512 / 16 | ordinary | 700.000 | 700.000 | 700.000 | 1.00× |
| channel-energy | 512 / 16 | prepared | 600.000 | 575.000 | 600.000 | 1.00× |
| channel-energy | 512 / 16 | resident | 625.000 | 625.000 | 625.000 | 1.00× |
| channel-energy | 512 / 64 | ordinary | 750.000 | 700.000 | 700.000 | 1.07× |
| channel-energy | 512 / 64 | prepared | 600.000 | 600.000 | 575.000 | 1.04× |
| channel-energy | 512 / 64 | resident | 650.000 | 650.000 | 650.000 | 1.00× |

## Public Potion 2M, batch 16

| Boundary | Before | New host / old codec | After | Before/after |
| --- | ---: | ---: | ---: | ---: |
| Ready session open, ms | 27.600 | 27.900 | 4.400 | 6.27× |
| Warm encode, µs/embedding | 43.750 | 45.312 | 40.625 | 1.08× |
