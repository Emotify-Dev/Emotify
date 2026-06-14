# Saved Models

Pre-trained weights are **not committed to git** (large binary files).

## Music2Emo checkpoints (`*.ckpt`)

| File | Description |
|------|-------------|
| `J_all.ckpt` | Emotion classifier — Joy |
| `D_all.ckpt` | Emotion classifier — Depression/Sadness |
| `E_all.ckpt` | Emotion classifier — Energy/Anger |
| `P_all.ckpt` | Emotion classifier — Pleasure |
| `deam_best.ckpt` | Best DEAM regression checkpoint |
| `emomusic_best.ckpt` | Best EmoMusic regression checkpoint |
| `jamendo_best.ckpt` | Best Jamendo regression checkpoint |
| `pmemo_best.ckpt` | Best PMEmo regression checkpoint |

Download from the [Music2Emotion HuggingFace repo](https://huggingface.co/AMAAI-Lab/Music2Emotion) or run `scripts/download_models.sh`.

## BTC chord model (`*.pt`)

| File | Description |
|------|-------------|
| `btc_model.pt` | BTC chord recognition (small vocabulary) |
| `btc_model_large_voca.pt` | BTC chord recognition (large vocabulary, 170 chords) |

## Essentia models (`*.pb`)

| File | Description |
|------|-------------|
| `audioset-vggish-3.pb` | VGGish audio embeddings |
| `deam-audioset-vggish-2.pb` | DEAM valence/arousal regression |

Download from <https://essentia.upf.edu/models.html> (Music emotion section).
