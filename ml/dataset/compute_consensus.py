"""
compute_consensus.py
────────────────────────────────────────────────────────────────────────────
Reads music2emo_dataset.csv and essentia_dataset.csv from output/, computes
consensus entropy between models using the mood column.

USAGE (from project root):
    python ml/dataset/compute_consensus.py

OUTPUT:
    ml/dataset/output/consensus_dataset.csv
    Columns: file_path | mood_music2emo | mood_essentia |
             consensus_mood | entropy | votes_Joy | votes_Anger |
             votes_Pleasure | votes_Sadness
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
import sys
from pathlib import Path

import pandas as pd

# ml/inference/ → consensus
sys.path.insert(0, str(Path(__file__).parent.parent / "inference"))
from consensus import compute_consensus_from_moods

# settings
OUTPUT_DIR = Path(__file__).parent / "raw_datasets"
SOURCES = {
    "music2emo": OUTPUT_DIR / "music2emo_dataset.csv",
    "essentia": OUTPUT_DIR / "essentia_dataset.csv",
}
OUT_CSV = OUTPUT_DIR / "consensus_dataset.csv"


def load_source(name: str, path: Path) -> pd.DataFrame | None:
    """
        Load a single source CSV and rename the mood column to mood_{name}.
        Returns None if file is missing.
    """
    if not path.exists():
        print(f"  [!] {path.name} not found — source '{name}' skipped.")
        return None
    df = pd.read_csv(path, usecols=["file_path", "mood"])
    df = df.rename(columns={"mood": f"mood_{name}"})
    print(f"  {name:<12} {len(df):>6} tracks  ← {path}")
    return df


def main() -> None:
    """
        Merge source datasets, compute consensus mood and entropy for each track,
        save result to CSV.
    """
    print("\n  Loading datasets...")
    frames: list[pd.DataFrame] = []
    for name, path in SOURCES.items():
        df = load_source(name, path)
        if df is not None:
            frames.append(df)

    if not frames:
        print("\n  [!] No datasets available. Run create_dataset_*.py first.")
        sys.exit(1)

    # Merge on file_path (outer join: include all tracks from at least one source)
    merged = frames[0]
    for df in frames[1:]:
        merged = merged.merge(df, on="file_path", how="outer")
    merged = merged.fillna("Undefined")

    mood_cols = [c for c in merged.columns if c.startswith("mood_")]
    source_names = [c.replace("mood_", "") for c in mood_cols]

    print(f"\n  Total tracks (union): {len(merged)}")
    in_all = merged[(merged[mood_cols] != "Undefined").all(axis=1)]
    print(f"  Tracks in both sources: {len(in_all)}")

    # ── Consensus computation ──────────────────────────────────────────────────
    rows: list[dict] = []
    for _, row in merged.iterrows():
        moods = [row[c] for c in mood_cols]
        result = compute_consensus_from_moods(moods)
        rows.append({
            "file_path":      row["file_path"],
            **{c: row[c] for c in mood_cols},
            "consensus_mood": result["mood"],
            "entropy":        round(result["entropy"], 4),
            "votes_Joy":      result["votes"]["Joy"],
            "votes_Anger":    result["votes"]["Anger"],
            "votes_Pleasure": result["votes"]["Pleasure"],
            "votes_Sadness":  result["votes"]["Sadness"],
        })

    out_df = pd.DataFrame(rows)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(OUT_CSV, index=False)

    # ── Statistics ────────────────────────────────────────────────────────────
    valid = out_df[out_df["consensus_mood"] != "Undefined"]
    print(f"\n  ── Entropy statistics ───────────────────────────────")
    print(f"  Mean entropy:    {out_df['entropy'].mean():.4f}")
    print(f"  Median entropy:  {out_df['entropy'].median():.4f}")
    low  = (out_df["entropy"] < 0.3).sum()
    mid  = ((out_df["entropy"] >= 0.3) & (out_df["entropy"] < 0.7)).sum()
    high = (out_df["entropy"] >= 0.7).sum()
    print(f"  Low entropy    (<0.3, high consensus): {low:>6} tracks")
    print(f"  Medium entropy (0.3–0.7):              {mid:>6} tracks")
    print(f"  High entropy   (≥0.7, low consensus):  {high:>6} tracks")

    print(f"\n  ── Consensus mood distribution ──────────────────────")
    print(valid["consensus_mood"].value_counts().to_string())

    if len(source_names) >= 2:
        print(f"\n  ── Agreement between sources ────────────────────────")
        for s in source_names:
            col = f"mood_{s}"
            agree = (out_df[col] == out_df["consensus_mood"]).sum()
            total = len(out_df)
            print(f"  {s:<12} agrees with consensus: {agree}/{total}  ({agree/total*100:.1f}%)")

    print(f"\n  Output → {OUT_CSV}\n")


if __name__ == "__main__":
    main()
