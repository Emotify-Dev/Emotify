# Project Emotify

## Team Members
* **Myroslav Natalchenko**
* **Kiryl Sankouski**
* **Michał Zach**

## Project Structure

```
Emotify/
├── ml/
│   ├── dataset/              # Dataset creation pipeline (own code)
│   │   ├── raw_datasets/     # Raw V/A predictions from Music2Emo and Essentia
│   │   ├── clean_datasets/   # Filtered and OHE-ready CSVs used for training
│   │   └── data_engineering/ # EDA notebook
│   │
│   ├── models/               # MLP mood classifier (own code)
│   │   └── trained_models/   # Saved .pt checkpoints + loss curves, confusion matrices
│   │
│   ├── inference/            # Inference layer
│   │   ├── model/            # Music2Emo model architecture ¹
│   │   ├── utils/            # MERT feature extraction, BTC chord recognition, etc. ¹
│   │   ├── config/           # Hydra config files ¹
│   │   ├── data/             # Chord dictionaries and mood tag list ¹
│   │   ├── music2emo.py      # Music2Emo inference wrapper (adapted from ¹)
│   │   └── consensus.py      # Ensemble consensus + entropy scoring (own code)
│   │
│   ├── saved_models/         # Pre-trained weights (not committed to git)
│   │   ├── *.ckpt            # Music2Emo emotion/regression checkpoints ¹
│   │   ├── btc_model*.pt     # BTC chord recognition weights ¹
│   │   └── *.pb              # Essentia VGGish + DEAM models ²
│   │
│   └── experiments/          # Scratch notebooks and one-off analyses
│
└── docs/                     # Architecture notes and research write-ups
```

> ¹ Code and weights from [AMAAI-Lab/Music2Emotion](https://github.com/AMAAI-Lab/Music2Emotion) / [HuggingFace](https://huggingface.co/amaai-lab/music2emo)
>
> ² Weights from [MTG Essentia models](https://essentia.upf.edu/models.html) (Music emotion section)

## Core Stack

| Layer | Technology |
|-------|-----------|
| Audio embeddings | [MERT-v1-95M](https://huggingface.co/m-a-p/MERT-v1-95M) (music-domain Wav2Vec2) |
| Chord recognition | BTC (Bidirectional Transformer for Chord recognition) |
| Emotion inference | Music2Emo — multi-task valence/arousal + mood classification |
| Essentia pipeline | MTG Essentia · VGGish + DEAM regression |
| Mood classifier | Custom MLP trained on V/A → Joy / Anger / Sadness / Pleasure |
| Deep learning | PyTorch 2.3 · torchaudio · pytorch-lightning |
| Training | scikit-learn · matplotlib · torchmetrics |
| Config | Hydra · OmegaConf |
| Spotify | spotipy |
| UI / demo | Gradio |
| Python | 3.10 · conda |

## Setup

```bash
bash initiate_project.sh
```

The script creates a `conda` environment named `Emotify`, installs all dependencies from `requirements.txt`, pulls LFS model files, and downloads pre-trained weights from HuggingFace.
