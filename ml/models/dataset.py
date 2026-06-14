"""
dataset.py
──────────────────────────────────────────────────────────────────────────────
PyTorch Dataset for Emotify mood classification.

Each sample:
  - Input  : MERT embedding (.npy, shape 25×1024) → mean-pooled to (1024,)
  - Label  : integer class index  0=Joy  1=Anger  2=Pleasure  3=Sadness
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

LABEL_COLS = ['mood_Joy', 'mood_Anger', 'mood_Pleasure', 'mood_Sadness']
CLASS_NAMES = ['Joy', 'Anger', 'Pleasure', 'Sadness']


class MoodDataset(Dataset):
    def __init__(self, df: pd.DataFrame) -> None:
        """Store the dataframe, resetting its index."""
        self.df = df.reset_index(drop=True)

    def __len__(self) -> int:
        """Return number of samples in the dataset."""
        return len(self.df)

    def __getitem__(self, idx: int):
        """Load a .npy embedding, mean-pool it across layers, and return (tensor, class_index)."""
        row = self.df.iloc[idx]

        emb = np.load(row['file_path'])      # (25, 1024)
        emb = emb.mean(axis=0).astype(np.float32)  # mean-pool layers → (1024,)
        x   = torch.from_numpy(emb)

        label = int(np.argmax(row[LABEL_COLS].values))
        y = torch.tensor(label, dtype=torch.long)

        return x, y


def load_splits(
    csv_path: str,
    val_fraction: float = 0.15,
    test_fraction: float = 0.10,
    seed: int = 42,
) -> tuple[MoodDataset, MoodDataset, MoodDataset]:
    """
    Read OHE CSV, stratified-split into train / val / test, return three datasets.
    Stratified split keeps class proportions consistent across splits.
    """
    from sklearn.model_selection import train_test_split

    df = pd.read_csv(csv_path)
    labels = df[LABEL_COLS].values.argmax(axis=1)

    # first cut off test set
    df_train_val, df_test, y_tv, _ = train_test_split(
        df, labels, test_size=test_fraction, stratify=labels, random_state=seed
    )
    # then split remainder into train / val
    relative_val = val_fraction / (1.0 - test_fraction)
    df_train, df_val = train_test_split(
        df_train_val, test_size=relative_val, stratify=y_tv, random_state=seed
    )

    return MoodDataset(df_train), MoodDataset(df_val), MoodDataset(df_test)


def compute_class_weights(dataset: MoodDataset) -> torch.Tensor:
    """
    Inverse-frequency weights for CrossEntropyLoss.
    Rare classes (Anger, Pleasure) get higher weight so the model pays more
    attention to them during training.
    """
    labels = dataset.df[LABEL_COLS].values.argmax(axis=1)
    counts = np.bincount(labels, minlength=len(CLASS_NAMES)).astype(float)
    weights = counts.sum() / (len(CLASS_NAMES) * counts)
    return torch.tensor(weights, dtype=torch.float32)
