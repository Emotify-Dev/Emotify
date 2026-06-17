"""
inference.py
────────────────────────────────────────────────────────────────────────────
Wraps MERT feature extraction + MoodClassifier into a single predictor.

Usage:
    from inference import MoodPredictor
    pred   = MoodPredictor()                  # loads models once
    result = pred.predict('audio.mp3')
    # {'mood': 'Joy', 'confidence': 0.92, 'scores': {Joy:0.92, ...}}
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import torchaudio
from transformers import AutoModel, Wav2Vec2FeatureExtractor

sys.path.insert(0, str(Path(__file__).parent))
from model import MoodClassifier

CLASS_NAMES = ['Joy', 'Anger', 'Pleasure', 'Sadness']
MODEL_PATH  = Path(__file__).parent / 'trained_models' / 'music2emo_2026-05-09.pt'
MERT_NAME   = 'm-a-p/MERT-v1-330M'
TARGET_SR   = 24000


def _device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    mps = getattr(torch.backends, 'mps', None)
    if mps and mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


class MoodPredictor:
    """Loads MERT + MoodClassifier once; runs inference on audio files."""

    def __init__(self, model_path: str | Path | None = None) -> None:
        self.device    = _device()
        model_path     = Path(model_path or MODEL_PATH)

        print(f'[MoodPredictor] device={self.device}')
        print('[MoodPredictor] loading MERT …')
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(
            MERT_NAME, trust_remote_code=True
        )
        self.mert = AutoModel.from_pretrained(
            MERT_NAME, trust_remote_code=True
        ).to(self.device)
        self.mert.eval()

        print('[MoodPredictor] loading MoodClassifier …')
        ckpt = torch.load(model_path, map_location='cpu')
        self.classifier = MoodClassifier().to(self.device)
        self.classifier.load_state_dict(ckpt['state_dict'])
        self.classifier.eval()
        print('[MoodPredictor] ready.')

    # ── audio loading ──────────────────────────────────────────────────────

    def _load_audio(self, path: str | Path) -> torch.Tensor:
        waveform, sr = torchaudio.load(str(path))
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        if sr != TARGET_SR:
            waveform = torchaudio.functional.resample(waveform, sr, TARGET_SR)
        return waveform.squeeze(0)      # (samples,)

    # ── MERT embedding ─────────────────────────────────────────────────────

    def _embed(self, audio: torch.Tensor) -> np.ndarray:
        """Returns mean-pooled MERT embedding of shape (1024,)."""
        inputs = self.processor(
            audio.numpy(), sampling_rate=TARGET_SR, return_tensors='pt'
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            out = self.mert(**inputs, output_hidden_states=True)

        # hidden_states: tuple of 25 tensors (1, time, 1024)
        # skip index 0 (raw embedding), keep 24 transformer layers
        stacked    = torch.stack(out.hidden_states).squeeze(1)   # (25, time, 1024)
        layer_embs = stacked[1:].mean(dim=1)                     # (24, 1024) — mean over time
        return layer_embs.cpu().numpy().mean(axis=0).astype(np.float32)  # (1024,)

    # ── public API ─────────────────────────────────────────────────────────

    def predict(self, audio_path: str | Path) -> dict:
        """
        Returns:
            {
                'mood':       str,           # 'Joy' | 'Anger' | 'Pleasure' | 'Sadness'
                'confidence': float,         # softmax prob of winning class
                'scores':     dict[str,float],
            }
        """
        audio = self._load_audio(audio_path)
        emb   = self._embed(audio)
        x     = torch.from_numpy(emb).unsqueeze(0).to(self.device)   # (1, 1024)

        with torch.no_grad():
            probs = F.softmax(self.classifier(x), dim=-1).squeeze(0).cpu().tolist()

        idx = int(np.argmax(probs))
        return {
            'mood':       CLASS_NAMES[idx],
            'confidence': round(probs[idx], 4),
            'scores':     {n: round(p, 4) for n, p in zip(CLASS_NAMES, probs)},
        }
