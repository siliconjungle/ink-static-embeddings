# Finite typed input transport

This is a shared Ink ABI/runtime improvement, measured through this application
and three previously frozen unrelated programs. It changes the preparation of
ordinary finite Float32Array inputs, not embedding weights, arithmetic, generated
shaders or model quality.

On this Mac M4 Pro, three fresh headed Chrome processes measured public Potion
2M batch-16 ready-session opening at **27.6 ms before, 27.9 ms with the new host
and old codec, and 4.4 ms after**: **6.27× faster setup**. We do not claim a 7×
embedding throughput gain. Warm complete encoding was 43.75 / 45.31 / 40.63
microseconds per embedding; the small difference does not establish a robust
warm inference improvement.

The shared ABI snapshots eligible typed floats straight into owned packed words,
validates nonfinite exponents, and preserves all finite bits. Explicit
transport-preferred capture can lazily materialize a JavaScript Array from the
private snapshot. Preparation requests that preference only for a known CPU/GPU
consumer. Ordinary native capture retains its existing eager implementation.
No caller identity caches a validation or changes the required fresh-input check.

The three-way hardware ablation holds emitted source, shaders, uploads,
dispatches, readback volume and output boundaries fixed. Every label has its own
matching aggregate host fingerprint, which already includes the codec. No cost
profile is installed and no backend decision policy changes. All 36 unrelated
hardware case/process combinations were exact, retained prepared snapshots after
caller mutation, and rejected invalid fresh writes without changing prior state.
The actual public loader passed exact full-output checks on Potion 2M, Potion
8M, st-retrieval, unseen-weighted and unseen-clamp for all three labels.

Frozen matrix-columns ordinary complete GPU calls improve 1.23–1.27×. Prepared
and resident calls, plus mixed-record filter-bank/channel-energy controls, are
mostly unchanged; individual ratios range from 0.94× to 1.11×. See
[BROWSER.md](BROWSER.md), including all timing boundaries and raw samples.

The separate Node codec microbenchmark gives 12.1–19.9× faster packing at
512–65,536 typed floats and 16.9× at the Potion table size. These are conversion
phase gains, not end-to-end speedups. Large ordinary Array controls and native
JavaScript capture are essentially unchanged. Small controls have absolute
sub-microsecond regressions: Array-8 native capture is 0.173→0.339 microseconds
and typed-8 transport capture 0.491→0.574. Native capture code is identical, but
we retain these adverse measurements rather than asserting universal improvement.
See [CODEC.md](CODEC.md). Phase medians are never added to hardware medians.

Earlier pilots are retained in adjacent `typed-input-*` directories. The first
universal lazy-capture design regressed ordinary Array capture and was rejected.
The routing pilot retained unnecessary small/ordinary carrier probes; the final
host gates them by consumer and carrier. `typed-input-browser-pilot` predates the
correct per-label host fingerprint and is exploratory evidence only. None of
these pilots is the shipping result.

`artifacts.json` binds the measured source/host/shader snapshots. `validation.json`
records local package/integration checks; `packages.json` records published pins
and full-CI status separately. No knowledge rule changed in this experiment.
