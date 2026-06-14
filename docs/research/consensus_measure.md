# Consensus Measure

> Placeholder — document how consensus between the 3 models is computed.

## Approach

Given N model predictions (each producing a mood tag), consensus is measured using **normalised Shannon entropy**:

- entropy = 0 → all models agree (full consensus)
- entropy = 1 → maximum disagreement

See implementation: `ml/inference/consensus.py`
