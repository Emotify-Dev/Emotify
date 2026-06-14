"""
consensus.py
────────────────────────────────────────────────────────────────────────────
Computes consensus mood prediction across multiple models (Music2Emo,
Essentia) using entropy as an uncertainty measure.

A low entropy across model outputs means high consensus; high entropy
indicates disagreement between models.
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
import numpy as np

MOOD_TAGS = ["Joy", "Anger", "Pleasure", "Sadness"]
MIDPOINT = 5.0

def va_to_mood(valence: float, arousal: float) -> str:
    """Map a (valence, arousal) pair to a mood quadrant label."""
    high_v = valence >= MIDPOINT
    high_a = arousal >= MIDPOINT
    if high_v and high_a:
        return "Joy"
    if not high_v and high_a:
        return "Anger"
    if high_v and not high_a:
        return "Pleasure"
    return "Sadness"

def compute_consensus_from_moods(moods: list[str]) -> dict:
    """
    Given a list of mood tag strings (one per model), compute consensus.
    "Undefined" entries are excluded from the vote.

    Parameters
    ----------
    moods : list of mood tag strings (e.g. ["Joy", "Anger", "Joy"])

    Returns
    -------
    dict with keys:
        "mood"       – dominant mood tag (or "Undefined" if all failed)
        "entropy"    – normalised entropy in [0, 1] (0 = full consensus)
        "votes"      – dict mapping mood tag → vote count
    """
    valid = [m for m in moods if m != "Undefined"]
    if not valid:
        return {"mood": "Undefined", "entropy": 1.0, "votes": {t: 0 for t in MOOD_TAGS}}

    votes = {tag: valid.count(tag) for tag in MOOD_TAGS}
    n = len(valid)
    probs = np.array([votes[tag] / n for tag in MOOD_TAGS])
    with np.errstate(divide="ignore", invalid="ignore"):
        raw_entropy = -np.nansum(probs * np.log(probs + 1e-12))
    max_entropy = np.log(len(MOOD_TAGS))
    normalised_entropy = float(raw_entropy / max_entropy) if max_entropy > 0 else 0.0

    dominant_mood = max(votes, key=lambda k: votes[k])
    return {
        "mood": dominant_mood,
        "entropy": normalised_entropy,
        "votes": votes,
    }


def compute_consensus(predictions: list[dict]) -> dict:
    """
    Given a list of per-model predictions, compute the consensus mood
    and an entropy-based confidence score.

    Parameters
    ----------
    predictions : list of dicts with keys "valence" and "arousal"
        One dict per model.

    Returns
    -------
    dict with keys:
        "mood"       – most common predicted mood tag
        "entropy"    – normalised entropy in [0, 1] (0 = full consensus)
        "votes"      – dict mapping mood tag → vote count
    """
    moods = [va_to_mood(p["valence"], p["arousal"]) for p in predictions]
    votes = {tag: moods.count(tag) for tag in MOOD_TAGS}

    n = len(moods)
    probs = np.array([votes[tag] / n for tag in MOOD_TAGS])
    # Shannon entropy, normalised by log(num_classes)
    with np.errstate(divide="ignore", invalid="ignore"):
        raw_entropy = -np.nansum(probs * np.log(probs + 1e-12))
    max_entropy = np.log(len(MOOD_TAGS))
    normalised_entropy = float(raw_entropy / max_entropy) if max_entropy > 0 else 0.0

    dominant_mood = max(votes, key=lambda k: votes[k])

    return {
        "mood": dominant_mood,
        "entropy": normalised_entropy,
        "votes": votes,
    }
