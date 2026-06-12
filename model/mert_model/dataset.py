import os
import torch
import numpy as np
from torch.utils.data import Dataset
from tqdm import tqdm


class MERTDataset(Dataset):
    def __init__(self, df):
        self.df = df

        self.meta_cols = ['TRACK_ID', 'PATH', 'DURATION']
        self.label_cols = [col for col in self.df.columns if col not in self.meta_cols]

        print(f"Loading {len(df)} vectors into RAM...")

        self.X_data = []
        self.Y_data = []

        labels_matrix = self.df[self.label_cols].values.astype('float32')
        paths = self.df['PATH'].values

        found_count = 0
        missing_count = 0

        for idx in tqdm(range(len(self.df)), desc="Caching Data"):
            final_path = paths[idx]

            if isinstance(final_path, str) and os.path.exists(final_path):
                try:
                    embedding = np.load(final_path)

                    if embedding.ndim > 1:
                        embedding = embedding.squeeze()
                    if embedding.ndim > 1:
                        embedding = embedding.mean(axis=0)

                    self.X_data.append(embedding)
                    self.Y_data.append(labels_matrix[idx])
                    found_count += 1
                except Exception:
                    missing_count += 1
            else:
                missing_count += 1

        self.X_data = torch.tensor(np.array(self.X_data), dtype=torch.float32)
        self.Y_data = torch.tensor(np.array(self.Y_data), dtype=torch.float32)

        print(f"Caching complete: Found {found_count}, Missing/Error {missing_count}")

    def __len__(self):
        return len(self.X_data)

    def __getitem__(self, idx):
        return self.X_data[idx], self.Y_data[idx]