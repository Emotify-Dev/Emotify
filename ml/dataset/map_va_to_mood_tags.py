"""
map_va_to_mood_tags.py
────────────────────────────────────────────────────────────────────────────
Maps Valence/Arousal float values (DEAM scale 1–9, midpoint = 5) to
discrete mood tags used by Emotify:

    High V + High A  → Joy
    Low  V + High A  → Anger
    High V + Low  A  → Pleasure
    Low  V + Low  A  → Sadness
    V < 0 or A < 0   → Undefined  (failed prediction marker)

Can be imported as a module or run standalone to add a mood column to a CSV.

Usage (standalone):
    python map_va_to_mood_tags.py --input output/music2emo_dataset.csv
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
from pathlib import Path
import argparse
import pandas as pd

MIDPOINT = 5.0


def va_to_mood(valence: float, arousal: float) -> str:
    """
        Return mood tag for a given (valence, arousal) pair.
    """
    if valence < 0 or arousal < 0:
        return "Undefined"
    high_v = valence >= MIDPOINT
    high_a = arousal >= MIDPOINT
    if high_v and high_a:
        return "Joy"
    if not high_v and high_a:
        return "Anger"
    if high_v and not high_a:
        return "Pleasure"
    return "Sadness"


def tag_csv(input_csv: Path, output_csv: Path | None = None) -> None:
    """
        Read a CSV with valence/arousal columns, write back with a mood column.
    """
    df = pd.read_csv(input_csv)
    df["mood"] = df.apply(lambda r: va_to_mood(float(r["valence"]), float(r["arousal"])), axis=1)
    dest = output_csv or input_csv
    df.to_csv(dest, index=False)
    print(f"Saved {len(df)} rows → {dest}")
    print(df["mood"].value_counts().to_string())


def main() -> None:
    """
        CLI entry point: parses arguments and calls tag_csv.
    """
    parser = argparse.ArgumentParser(description="Add mood column to a V/A CSV")
    parser.add_argument("--input",  required=True, help="Input CSV path")
    parser.add_argument("--output", default=None,  help="Output CSV path (default: overwrite input)")
    args = parser.parse_args()
    tag_csv(Path(args.input), Path(args.output) if args.output else None)


if __name__ == "__main__":
    main()
