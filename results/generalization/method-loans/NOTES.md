# Callback lifetime follow-up

The conditional fold experiment exposed a general ownership issue: a capture in one branch prevented a value from moving in an alternative branch, even after a fixed synchronous method had finished. Ink now scopes direct callback loans to the operation for map, indexed map, filter, zip, parallel buffer map and variant error map. Captures remain shared while callbacks run, receiver/argument aliases remain protected, and earlier unknown closure loans are preserved. The source algorithms, guard thresholds and planner's profitability policy are unchanged.

The matched comparison uses exactly the same frozen source and checked plans with both compiler binaries. Input vector clones and complete detached output consumption are timed. Every executable checks independent ordered-F32 output bits, including edge cases. Three fresh groups rotate compiler and variant executable order. The guarded matrix variant improves 1.34x (3.429 to 2.562 µs mean across nonempty cases); individual group gains are 1.32–1.38x. Literal/unconditional controls and held-out filter/channel workloads remain essentially unchanged. No extra JavaScript speedup is claimed: recompiled JavaScript for all 11 variants is byte-identical.

Full generated Rust and benchmark drivers are retained under `artifacts/generalization/method-loans`, with hashes in rust-artifacts.json. Each old/new build also retains its ordinary benchmark report. The paired groups and report are the matched comparison; build logs are setup observations rather than timed inference.

validation.json and its raw logs retain private standalone-core verification, package tests, ownership/clone-count checks, cross-target execution and the final integrated GPU/numeric/storage checks. The unchanged core reproduces a default Mac test-thread stack overflow on the large staged-neural projection fixture. Full core checks therefore use `RUST_MIN_STACK=16777216`; the final-use depth-limit test also passes at the default stack. No test-stack failure is treated as a performance result.

```sh
python -m scripts.method_loans_benchmark --before PATH_TO_OLD_INK --after PATH_TO_NEW_INK
```

Run from the repository root with its virtual environment and Rust toolchain. Compiler binary hashes are retained in report.json. The measured binaries predate the final package-pin-only publication commit; the admitted core tree and final package revisions are bound in validation.json and packages.json. Rebuilding with another binary is a new measurement.
