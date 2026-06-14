"""
create_dataset_essentia.py
────────────────────────────────────────────────────────────────────────────
Batch processing of MP3 files via MTG Essentia (VGGish + DEAM),
generates a CSV with V/A and mood.

USAGE (from project root):
    python ml/dataset/create_dataset_essentia.py

MODELS (place in ml/saved_models/ or set MODEL_DIR):
    - audioset-vggish-3.pb
    - deam-audioset-vggish-2.pb
    Download: https://essentia.upf.edu/models.html → Music emotion

OUTPUT:
    ml/dataset/output/essentia_dataset.csv
    Columns: file_path | valence | arousal | mood

RETRY LOGIC:
    On error — 3 attempts, then valence=-1 / arousal=-1 / mood=Undefined.
    On next run, tracks with -1 are updated in-place (no duplicates).
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
import csv
import os
import sys
import time
import traceback
from pathlib import Path

try:
    import essentia
    essentia.log.warningActive = False
    essentia.log.infoActive    = False
    from essentia.standard import MonoLoader, TensorflowPredictVGGish, TensorflowPredict2D
except ImportError:
    print("Error: essentia-tensorflow is not installed.")
    print("Install with: pip install essentia-tensorflow")
    sys.exit(1)

# ml/dataset/ → map_va_to_mood_tags
sys.path.insert(0, str(Path(__file__).parent))
from map_va_to_mood_tags import va_to_mood

# settings
AUDIO_ROOT = Path("/Volumes/T7 Shield/Emotify/MTG_Full")
OUTPUT_DIR = Path(__file__).parent / "raw_datasets"
OUTPUT_CSV = OUTPUT_DIR / "essentia_dataset.csv"
MAX_RETRIES = 3
FLUSH_EVERY = 50  # write CSV every N processed tracks
COLUMNS = ["file_path", "valence", "arousal", "mood"]

_default_model_dir = str(Path(__file__).parent.parent / "saved_models")
MODEL_DIR = os.environ.get("MODEL_DIR", _default_model_dir)
EMBEDDING_MODEL_PATH = os.path.join(MODEL_DIR, "audioset-vggish-3.pb")
DEAM_MODEL_PATH = os.path.join(MODEL_DIR, "deam-audioset-vggish-2.pb")


def choose_mode() -> str:
    """Prompt the user to select test or full processing mode, return '1' or '2'."""
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║         Essentia  —  batch emotion tagger            ║")
    print("╠══════════════════════════════════════════════════════╣")
    print("║  [1]  TEST — first 10 MP3s from folder 00/            ║")
    print("║  [2]  FULL — all MP3s in all folders (00/ … 99/)     ║")
    print("╚══════════════════════════════════════════════════════╝")
    while True:
        choice = input("  Select mode [1/2]: ").strip()
        if choice in ("1", "2"):
            return choice
        print("  Enter 1 or 2.")


def is_real_mp3(path: Path) -> bool:
    """Return True if the file is not a macOS metadata stub (._prefix)."""
    return not path.name.startswith("._")


def collect_files(mode: str) -> list[Path]:
    """Collect MP3 file paths based on the selected mode (test: first 10 from 00/, full: all folders)."""
    if mode == "1":
        folder = AUDIO_ROOT / "00"
        files = [f for f in sorted(folder.glob("*.mp3")) if is_real_mp3(f)][:10]
        print(f"\n  Files for test: {len(files)}  ({folder})")
    else:
        files = [f for f in sorted(AUDIO_ROOT.rglob("*.mp3")) if is_real_mp3(f)]
        print(f"\n  Total MP3 files: {len(files)}")
    return files


def load_records(csv_path: Path) -> tuple[list[dict], dict[str, int]]:
    """
    Loads CSV into memory.
    Returns:
        records      — ordered list of rows (dict per column)
        path_to_idx  — {file_path: index in records}
    """
    if not csv_path.exists():
        return [], {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        records = list(csv.DictReader(f))
    path_to_idx = {r["file_path"]: i for i, r in enumerate(records)}
    return records, path_to_idx


def is_failed(record: dict) -> bool:
    """Return True if the record has a negative valence, indicating a failed prediction."""
    try:
        return float(record.get("valence", 0)) < 0
    except ValueError:
        return True


def flush(csv_path: Path, records: list[dict]) -> None:
    """Atomically writes all records to CSV."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(records)


_embedding_model: TensorflowPredictVGGish | None = None
_deam_model: TensorflowPredict2D | None = None


def get_models() -> tuple[TensorflowPredictVGGish, TensorflowPredict2D]:
    """Lazily load and return the VGGish embedding model and DEAM regression model."""
    global _embedding_model, _deam_model
    if _embedding_model is None:
        _embedding_model = TensorflowPredictVGGish(
            graphFilename=EMBEDDING_MODEL_PATH,
            output="model/vggish/embeddings",
        )
    if _deam_model is None:
        _deam_model = TensorflowPredict2D(
            graphFilename=DEAM_MODEL_PATH,
            input="model/Placeholder",
            output="model/Identity",
        )
    return _embedding_model, _deam_model


def _predict_once(audio_path: str) -> tuple[float, float]:
    """Run a single inference pass and return mean valence and arousal over all frames."""
    audio = MonoLoader(filename=audio_path, sampleRate=16000)()
    embedding_model, deam_model = get_models()
    embeddings = embedding_model(audio)
    predictions = deam_model(embeddings)  # (N, 2): [valence, arousal], scale 1–9
    return float(predictions[:, 0].mean()), float(predictions[:, 1].mean())


def predict_with_retry(audio_path: str) -> tuple[float, float]:
    """Try to predict valence/arousal up to MAX_RETRIES times; return -1/-1 on persistent failure."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return _predict_once(audio_path)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            if attempt == 1:
                print(f"    FULL ERROR:\n{traceback.format_exc()}")
            if attempt < MAX_RETRIES:
                print(f"    attempt {attempt}/{MAX_RETRIES} failed: {e} — retrying...")
    return -1.0, -1.0


def check_models() -> None:
    """Exit with an error message if any required model file is missing."""
    for path, name in [
        (EMBEDDING_MODEL_PATH, "audioset-vggish-3.pb"),
        (DEAM_MODEL_PATH,      "deam-audioset-vggish-2.pb"),
    ]:
        if not os.path.isfile(path):
            print(f"\n  [!] Model file not found: {path}")
            print(f"      Download '{name}' from https://essentia.upf.edu/models.html")
            print(f"      and place it in: {MODEL_DIR}")
            sys.exit(1)


def main() -> None:
    """Run batch emotion tagging: collect MP3s, predict V/A via Essentia, write results to CSV."""
    check_models()

    mode  = choose_mode()
    files = collect_files(mode)

    if not files:
        print("\n  [!] No files found. Check AUDIO_ROOT.")
        sys.exit(1)

    # ── Load CSV state ─────────────────────────────────────────────────────────
    records, path_to_idx = load_records(OUTPUT_CSV)
    ok_paths   = {r["file_path"] for r in records if not is_failed(r)}
    failed_cnt = sum(1 for r in records if is_failed(r))
    if failed_cnt:
        print(f"  Found {failed_cnt} failed records — will be updated in-place.")
    if ok_paths:
        print(f"  Already processed successfully: {len(ok_paths)} tracks — skipping.")

    # ── Main loop ──────────────────────────────────────────────────────────────
    total   = len(files)
    n_done  = 0
    n_skip  = 0
    n_err   = 0
    n_since_flush = 0
    t_start = time.time()

    print(f"\n  {'#':>5}  {'File':<50}  {'Valence':>8}  {'Arousal':>8}  {'Mood':<10}")
    print("  " + "─" * 92)

    try:
        for idx, mp3 in enumerate(files, 1):
            abs_path = str(mp3.resolve())

            # Already processed successfully — skip
            if abs_path in ok_paths:
                n_skip += 1
                print(f"  {idx:>5}  {mp3.name:<50}  {'─':>8}  {'─':>8}  skipped")
                continue

            valence, arousal = predict_with_retry(abs_path)
            mood = va_to_mood(valence, arousal)

            new_row = {
                "file_path": abs_path,
                "valence":   f"{valence:.6f}",
                "arousal":   f"{arousal:.6f}",
                "mood":      mood,
            }

            if abs_path in path_to_idx:
                # In-place update (was previously failed)
                records[path_to_idx[abs_path]] = new_row
            else:
                # New track — append to end
                path_to_idx[abs_path] = len(records)
                records.append(new_row)

            n_since_flush += 1
            if n_since_flush >= FLUSH_EVERY:
                flush(OUTPUT_CSV, records)
                n_since_flush = 0

            if valence < 0:
                n_err += 1
                print(f"  {idx:>5}  {mp3.name:<50}  {'ERROR':>17}  {'Undefined':<10}")
            else:
                n_done += 1
                elapsed   = time.time() - t_start
                avg       = elapsed / n_done
                remaining = avg * (total - idx)
                eta       = f"ETA ~{remaining/60:.1f} min" if n_done > 1 else ""
                print(f"  {idx:>5}  {mp3.name:<50}  {valence:>8.4f}  {arousal:>8.4f}  {mood:<10}  ✓  {eta}")

    except KeyboardInterrupt:
        print("\n\n  Interrupted. Saving progress...")

    finally:
        flush(OUTPUT_CSV, records)

    # ── Summary ────────────────────────────────────────────────────────────────
    print("\n  " + "═" * 60)
    print(f"  Processed: {n_done}  |  Skipped: {n_skip}  |  Errors: {n_err}")
    print(f"  CSV: {OUTPUT_CSV}")
    print("  " + "═" * 60 + "\n")


if __name__ == "__main__":
    main()
