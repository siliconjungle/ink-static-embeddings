# Planning corpus report

Target `javascript`, effort `quick`, compiler `5e64707e9b7b`, knowledge snapshot `84cc9d047fcf`.

| Measure | Value |
|---|---:|
| Programs compiled | 3 / 3 |
| With an admitted rewrite alternative | 3 |
| With any knowledge-backed alternative | 3 |
| Selecting an alternative under defaults | 0 |
| Stopped by the time budget | 2 |
| Median planning seconds | 38.685 |
| Laws admitted (in 2+ programs) | 7 (0) |
| Representations admitted | 0 |

## Programs

| Program | Seconds | Stop | Matched | Admitted | Rejected | Unchecked | Rewrite alts | Last gate |
|---|---:|---|---:|---:|---:|---:|---:|---|
| sequence-every | 38 | states | 0 | 0 | 0 | 0 | 30 | measurement_budget |
| ast-ancestor | 39 | time | 438 | 30 | 408 | 0 | 12 | measurement_budget |
| text-lines | 39 | time | 0 | 0 | 0 | 0 | 29 | measurement_budget |

## Near misses

Checker rejection gates: closure 204, premise 204

| Failed premise shape | Rejections | Programs |
|---|---:|---|
| `binary:==(field:key(_), _) = Bool:False` | 80 | ast-ancestor |
| `binary:==(field:key(_), _) = Bool:True` | 80 | ast-ancestor |
| `apply(fn.binary:==(..), _) = Bool:False` | 22 | ast-ancestor |
| `apply(fn.binary:==(..), _) = Bool:True` | 22 | ast-ancestor |

| Failed premise as instantiated in the program | Rejections | Programs |
|---|---:|---|
| `binary:==(field:key(bound), free) = Bool:False` | 80 | ast-ancestor |
| `binary:==(field:key(bound), free) = Bool:True` | 80 | ast-ancestor |
| `apply(fn.binary:==(field:key(..), free), bound) = Bool:False` | 22 | ast-ancestor |
| `apply(fn.binary:==(field:key(..), free), bound) = Bool:True` | 22 | ast-ancestor |

## Where planning time went

| Recipe | Seconds | Share |
|---|---:|---:|
| semantic-laws | 1.58 | 10% |
| modular-semantic-laws | 1.51 | 10% |
| boundary-readers | 0.84 | 5% |
| whole-state-protocols | 0.76 | 5% |
| proved-capacities | 0.64 | 4% |
| private-sum-spines | 0.63 | 4% |
| private-record-elision | 0.61 | 4% |
| string-key-dictionaries | 0.6 | 4% |
| literal-physical-alternatives | 0.33 | 2% |
| proved-observations | 0.33 | 2% |
| contextual-properties | 0.32 | 2% |
| pure-routing | 0.3 | 2% |
| maintained-folds | 0.28 | 2% |
| database-source-algorithms | 0.27 | 2% |
| all-published-packages | 0.26 | 2% |

## Admitted knowledge by program

| Entry | Kind | Programs |
|---|---|---|
| 67945ed9ba849de3 | law | sequence-every |
| 85e3e0c622235b10 | law | text-lines |
| 8c2dc4e9d4ed881c | law | text-lines |
| b0de50753ae48f24 | law | ast-ancestor |
| b4bdd6f06eb1fac4 | law | ast-ancestor |
| b912e8d070f87a10 | law | text-lines |
| d772b42ab196c507 | law | ast-ancestor |

Observed default planning on a fixed corpus; no proof, applicability or profitability authority.
