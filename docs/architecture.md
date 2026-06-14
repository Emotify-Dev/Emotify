# Architecture

> Placeholder — fill in with system design and flow diagrams.

## High-level flow

```
Audio file
    │
    ▼
Feature extraction
    ├─ MERT embeddings (ml/inference/utils/mert.py)
    └─ Chord features  (ml/inference/utils/btc_model.py)
    │
    ▼
Model inference
    ├─ Music2Emo pipeline  (ml/inference/music2emo.py)
    └─ Essentia pipeline   (ml/dataset/create_dataset_essentia.py)
    │
    ▼
Valence / Arousal (1–9 DEAM scale)
    │
    ▼
Mood quadrant mapping   (ml/dataset/map_va_to_mood_tags.py)
    └─ Joy | Anger | Pleasure | Sadness
    │
    ▼
Consensus across models (ml/inference/consensus.py)
    └─ dominant mood + entropy score
```
