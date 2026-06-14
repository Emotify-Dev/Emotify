import os
import re
import requests
import json  # ДОБАВЛЕНО для работы с JSON
import hashlib  # ДОБАВЛЕНО для создания уникального хэша файлов
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy  # ДОБАВЛЕНО
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from model.mert_model.predict_audio import AudioPredictor

load_dotenv()
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///analysis_cache.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class TrackAnalysis(db.Model):
    id = db.Column(db.String(128), primary_key=True)
    emotions = db.Column(db.Text, nullable=False)
    source = db.Column(db.String(20), nullable=False)

with app.app_context():
    db.create_all()

CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"], supports_credentials=True)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'ogg'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

predictor = AudioPredictor()

sp_oauth = SpotifyOAuth(
    client_id=os.getenv('SPOTIFY_CLIENT_ID'),
    client_secret=os.getenv('SPOTIFY_CLIENT_SECRET'),
    redirect_uri=os.getenv('SPOTIFY_REDIRECT_URI'),
    scope='user-library-read user-top-read user-read-recently-played',
    cache_handler=None
)

def allowed_file(filename):
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def normalize_string(s):
    s = s.lower()
    s = re.sub(r'[^\w\s]', '', s)
    return s.strip()

def calculate_file_hash(filepath):
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()

@app.route('/api/analyze/upload', methods=['POST'])
@limiter.limit("5 per minute")
def analyze_upload():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Wrong file format (use: mp3, wav, ogg)"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        file.save(filepath)
        file_hash = calculate_file_hash(filepath)
        cached_result = TrackAnalysis.query.filter_by(id=file_hash).first()

        if cached_result:
            os.remove(filepath)
            return jsonify({
                "emotions": json.loads(cached_result.emotions),
                "cached": True
            })

        emotions = predictor.predict(filepath)

        new_analysis = TrackAnalysis(
            id=file_hash,
            emotions=json.dumps(emotions),
            source='upload'
        )
        db.session.add(new_analysis)
        db.session.commit()

        return jsonify({"emotions": emotions, "cached": False})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


@app.route('/api/analyze/spotify', methods=['POST'])
@limiter.limit("10 per minute")
def analyze_spotify():
    data = request.json
    track_id = data.get('id')
    preview_url = data.get('url')

    if not track_id:
        return jsonify({"error": "No track ID provided"}), 400

    cached_result = TrackAnalysis.query.filter_by(id=track_id).first()

    if cached_result:
        return jsonify({
            "emotions": json.loads(cached_result.emotions),
            "cached": True
        })

    auth_header = request.headers.get('Authorization')
    token = auth_header.split(" ")[1] if auth_header else None

    track_name, artist_name = None, None

    if token and track_id:
        try:
            sp = spotipy.Spotify(auth=token)
            track_info = sp.track(track_id)
            track_name = track_info.get('name')
            artist_name = track_info['artists'][0]['name']

            if not preview_url:
                preview_url = track_info.get('preview_url')
        except Exception as e:
            print(f"Spotify Detail Error: {e}")

    if not preview_url and track_name and artist_name:
        try:
            print(f"Searching Deezer for: {artist_name} - {track_name}")
            query = f"{normalize_string(artist_name)} {normalize_string(track_name)}"
            deezer_res = requests.get(
                "https://api.deezer.com/search",
                params={'q': query},
                timeout=5
            ).json()

            if deezer_res.get('data') and len(deezer_res['data']) > 0:
                preview_url = deezer_res['data'][0].get('preview')
                print(f"Found on Deezer: {preview_url}")
        except Exception as e:
            print(f"Deezer Fallback Error: {e}")

    if not preview_url:
        return jsonify({
            "error": f"No audio preview available for '{track_name}' on Spotify and Deezer."
        }), 400

    filename = f"spotify_{track_id}.mp3"
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        doc = requests.get(preview_url, timeout=10)
        if doc.status_code != 200:
            return jsonify({"error": "Failed to download audio file."}), 400

        with open(filepath, 'wb') as f:
            f.write(doc.content)

        emotions = predictor.predict(filepath)

        new_analysis = TrackAnalysis(
            id=track_id,
            emotions=json.dumps(emotions),
            source='spotify'
        )
        db.session.add(new_analysis)
        db.session.commit()

        return jsonify({"emotions": emotions, "cached": False})

    except Exception as e:
        db.session.rollback()  # Откат базы в случае ошибки
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({"error": "File too large (Max 16MB)"}), 413

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)