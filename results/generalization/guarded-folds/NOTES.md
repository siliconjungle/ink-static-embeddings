# Conditional fold proposals

The guard was fitted using only the already frozen matrix-column Rust measurements. The two other programs were held out. `profile.json` is untrusted proposal data, not a profitability policy. The source-algorithm proof composes the existing checked captured-fold law with a conditional choice; both branches replay through the ordinary kernel. No associativity or floating-point reassociation is assumed. Input lengths outside the proposed range retain the original source.

The guard improves some small-input regressions, but it is not an overall improvement over the unconditional Rust candidate on the development program. Across all frozen matrix cases, mean latency is 4.576 µs literal, 1.621 µs unconditionally batched and 2.084 µs guarded. The nonempty-case comparison is in RUST.md. JavaScript still regresses, including on the held-out channel-energy program; see REPORT.md. These results do not justify installing this proposal in knowledge or changing the planner's selection policy.

Inspection of generated Rust found that the conditional version borrows the row iterator where the unconditional version consumes it. A callback capture in the alternative branch conservatively extends the shared lifetime across the branch. This is a potential general ownership-analysis improvement, not an implemented optimization in this study. The emitted source and plans are retained for further work.

Reproduction from the repository root:

```sh
.venv/bin/python -m scripts.fit_fold_guard
.venv/bin/python -m scripts.generalize_folds --ink-checkout PATH_TO_INK --compiler PATH_TO_INK_BINARY --guard-profile results/generalization/guarded-folds/profile.json --output results/generalization/guarded-folds
.venv/bin/python -m scripts.generalization_rust_benchmark --compiler PATH_TO_INK_BINARY --study results/generalization/guarded-folds
.venv/bin/python -m scripts.generalization_folds_benchmark --study results/generalization/guarded-folds
```

Use the Rust toolchain environment described for the other Rust studies. The original compiler binary hash is retained in discovery.json; rebuilding with a later compiler is a new experiment.
