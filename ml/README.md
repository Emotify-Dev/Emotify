# ML — Emotify

All machine-learning code lives here.

## Layout

| Path | Purpose |
|------|---------|
| `dataset/` | Scripts for building labelled datasets (V/A labels via Music2Emo and Essentia) |
| `models/` | Trained model checkpoints and training code (work in progress) |
| `inference/` | Inference pipelines + consensus logic |
| `saved_models/` | Pre-trained weights (`.ckpt`, `.pt`, `.pb`) — see `saved_models/README.md` for download links |
| `experiments/` | Scratch notebooks and one-off analyses |
| `requirements.txt` | Python dependencies for all ML code |

## Quickstart

```bash
# 1. Create venv and install dependencies
bash ../scripts/setup_env.sh

# 2. Download pre-trained model checkpoints
bash ../scripts/download_models.sh

# 3. Generate V/A dataset via Music2Emo
python dataset/create_dataset_music2emo.py

# 4. Generate V/A dataset via Essentia
python dataset/create_dataset_essentia.py <path/to/audio.mp3>
```
