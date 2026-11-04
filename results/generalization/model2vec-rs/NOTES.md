# model2vec-rs source review

Reviewed upstream commit `768bdf398c1885a088b9841720ff69d229b12dec` (0.4.0),
especially [src/model.rs](https://github.com/MinishLab/model2vec-rs/blob/768bdf398c1885a088b9841720ff69d229b12dec/src/model.rs),
`tests/test_pooling.rs` and the benchmark definitions. The upstream crate itself
has not been benchmarked here.

Reusable mechanisms observed:

* Shared immutable model data, borrowed table rows, one flat output allocation
  and disjoint output slices avoid repeated model/output copies.
* IDs-only tokenization and reusable thread-local scratch remove unused work;
  unsupported tokenizer capabilities retain a checked fallback.
* Mapping/weight/row-scale cases are selected outside the token loop. Fixed
  dimensions have specialized implementations with a dynamic fallback.
* Eight-row blocking holds an accumulator lane in a register across eight
  additions, retaining token order. It does not require F32 associativity.
* Mean scaling and ordered squared-norm accumulation share a traversal.

Ink already has some relevant ownership, staging and specialization machinery.
The typed transport experiment addresses repeated boundary conversion, not the
eight-row pooling algorithm. Do not attribute its setup gain to a Rust-inspired
arithmetic optimization.

`experiments/generalization/model2vec-rs-laws.ink` checks general fold
unswitching, concatenation and ordered-chunk equivalence. `laws.json` contains
the successful proof output. These are proof groundwork only: no new knowledge
entry, profitable blocked-fold implementation or automatic selection has been
published yet. Existing append/fold and guarded-specialization machinery should
be reused before adding duplicates. Any knowledge change must also be evaluated
against Ink's frozen planning corpus, with new development examples identified
as development examples.

Int8 quantization, approximate arithmetic and different normalization epsilon
contracts are separate numerical changes. They cannot become exact rewrites
merely because they improve upstream throughput.
