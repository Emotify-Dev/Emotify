"""
ml/api.py
────────────────────────────────────────────────────────────────────────────
Python Flask micro-service: mood inference via MERT + MoodClassifier.

Endpoints
  POST /api/analyze/batch   download previews → MERT → classify → cache
  GET  /health              liveness check

SQLite cache: ml/analysis_cache.db
Temp audio:   ml/tmp_audio/

Run from project root:
    python ml/api.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

load_dotenv()

ML_DIR = Path(__file__).parent
sys.path.insert(0, str(ML_DIR / 'models'))

from inference import MoodPredictor   # noqa: E402

# ── app setup ──────────────────────────────────────────────────────────────
app = Flask(__name__)

DB_PATH = ML_DIR / 'analysis_cache.db'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

CORS(app, origins=['http://localhost:3000', 'http://127.0.0.1:3000'])

TMP_DIR = ML_DIR / 'tmp_audio'
TMP_DIR.mkdir(exist_ok=True)


# ── database model ─────────────────────────────────────────────────────────
class TrackAnalysis(db.Model):
    id     = db.Column(db.String(128), primary_key=True)   # Spotify track ID
    result = db.Column(db.Text,        nullable=False)      # JSON: {mood, confidence, scores}


with app.app_context():
    db.create_all()


# ── lazy-loaded predictor ──────────────────────────────────────────────────
_predictor: MoodPredictor | None = None


def get_predictor() -> MoodPredictor:
    global _predictor
    if _predictor is None:
        _predictor = MoodPredictor()
    return _predictor


# ── helpers ────────────────────────────────────────────────────────────────
def _norm(s: str) -> str:
    return re.sub(r'[^\w\s]', '', s.lower()).strip()


def _deezer_preview(name: str, artist: str) -> str | None:
    q = f'{_norm(artist)} {_norm(name)}'
    try:
        data = requests.get(
            'https://api.deezer.com/search', params={'q': q}, timeout=5
        ).json()
        if data.get('data'):
            return data['data'][0].get('preview') or None
    except Exception:
        pass
    return None


def _download(url: str, track_id: str) -> Path:
    filepath = TMP_DIR / f'{track_id}.mp3'
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    filepath.write_bytes(r.content)
    return filepath


def _resolve_preview(track: dict, token: str | None) -> str | None:
    """Try Spotify preview → Deezer fallback → Spotify API → Deezer again."""
    url    = track.get('preview_url') or None
    name   = track.get('name', '')
    artist = track.get('artist', '')

    if url:
        return url

    # Deezer with info we already have
    url = _deezer_preview(name, artist)
    if url:
        return url

    # Spotify API for authoritative data + second Deezer attempt
    if token:
        try:
            import spotipy
            sp   = spotipy.Spotify(auth=token)
            info = sp.track(track['id'])
            url  = info.get('preview_url') or None
            if not url:
                url = _deezer_preview(
                    info.get('name', name),
                    info['artists'][0]['name'] if info.get('artists') else artist,
                )
        except Exception as e:
            print(f"[api] Spotify API error for {track.get('id')}: {e}")

    return url


# ── routes ─────────────────────────────────────────────────────────────────
@app.route('/api/analyze/batch', methods=['POST'])
def analyze_batch():
    data   = request.json or {}
    tracks = data.get('tracks', [])
    token  = data.get('token')

    if not tracks:
        return jsonify({'error': 'No tracks provided'}), 400

    results: dict = {}
    pred = get_predictor()

    for track in tracks:
        tid = track.get('id')
        if not tid:
            continue

        # cache hit
        cached = TrackAnalysis.query.filter_by(id=tid).first()
        if cached:
            results[tid] = {**json.loads(cached.result), 'cached': True}
            continue

        preview_url = _resolve_preview(track, token)

        if not preview_url:
            print(f"[api] no preview for \"{track.get('name', tid)}\" — marking Undefined")
            results[tid] = {'mood': 'Undefined', 'confidence': None, 'scores': {}, 'no_preview': True}
            continue

        filepath = None
        try:
            filepath = _download(preview_url, tid)
            result   = pred.predict(filepath)

            db.session.add(TrackAnalysis(id=tid, result=json.dumps(result)))
            db.session.commit()

            results[tid] = {**result, 'cached': False}

        except Exception as e:
            db.session.rollback()
            print(f'[api] inference error for {tid}: {e} — marking Undefined')
            results[tid] = {'mood': 'Undefined', 'confidence': None, 'scores': {}, 'inference_error': True}

        finally:
            if filepath and filepath.exists():
                filepath.unlink()

    return jsonify({'results': results})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True})


# ── entry point ────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('[api] Starting Emotify ML service on http://127.0.0.1:5001')
    app.run(debug=False, host='127.0.0.1', port=5001)
