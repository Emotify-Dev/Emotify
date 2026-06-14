"""
model.py
──────────────────────────────────────────────────────────────────────────────
MLP classifier on top of mean-pooled MERT embeddings.

Architecture:
  Linear(1024 → 512) → BN → ReLU → Dropout
  Linear(512  → 256) → BN → ReLU → Dropout
  Linear(256  → 128) → BN → ReLU → Dropout
  Linear(128  →   4)                          ← logits (no softmax here)

CrossEntropyLoss expects raw logits.
"""

from __future__ import annotations

import torch
import torch.nn as nn

class MoodClassifier(nn.Module):
    def __init__(
        self,
        input_dim:   int        = 1024,
        hidden_dims: list[int]  = (512, 256, 128),
        num_classes: int        = 4,
        dropout:     float      = 0.3,
    ) -> None:
        """Build the MLP stack: Linear → BN → ReLU → Dropout for each hidden dim, then a final Linear."""
        super().__init__()

        layers: list[nn.Module] = []
        in_dim = input_dim
        for h in hidden_dims:
            layers += [
                nn.Linear(in_dim, h),
                nn.BatchNorm1d(h),
                nn.ReLU(),
                nn.Dropout(dropout),
            ]
            in_dim = h
        layers.append(nn.Linear(in_dim, num_classes))

        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Pass input through the MLP and return raw logits."""
        return self.net(x)
