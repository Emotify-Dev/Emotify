# Dataset

Scripts for generating labelled datasets from the MTG audio collection.

> **Note:** Raw MTG audio files are stored on an external SSD (`/Volumes/T7 Shield/Emotify/MTG_Full`).

## Scripts

| Script | Description |
|--------|-------------|
| `create_dataset_music2emo.py` | Runs Music2Emo on MTG MP3s → produces `music2emo_results.csv` with `file_path, valence, arousal` |
| `create_dataset_essentia.py` | Runs Essentia (VGGish + DEAM) on an audio file → prints valence/arousal/emotion |
| `map_va_to_mood_tags.py` | Maps V/A float values to discrete mood tags (Joy / Anger / Sadness / Pleasure) |
| `analyze_dataset.ipynb` | Exploratory data analysis notebook |
