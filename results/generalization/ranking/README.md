# Ranking proof groundwork

`experiments/generalization/ranking-laws.ink` and its proof file derive exact integer separation from enclosing intervals, including intervals around approximate estimates. The ordinary `emit-laws --proofs` kernel replay admits both laws; separation-laws.json retains the checked objects.

This does not certify a numerical error bound for a GPU dot product, implement top-k pruning or measure a refinement speedup. Those remain required work. Observed maximum errors cannot establish the interval assumptions. No ranking optimization or new knowledge entry is published from these laws alone.
