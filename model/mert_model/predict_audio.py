import os
import torch
import librosa
import pandas as pd
import numpy as np
from transformers import Wav2Vec2FeatureExtractor, AutoModel
from model.mert_model.model import MERTClassifier

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSV_FILE = os.path.join(BASE_DIR, 'datasets', 'MTG', 'moodtheme_mertspecs_low_npy.csv')
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'trained_model', 'mert_model_best.pth')

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MERT_HF_ID = "m-a-p/MERT-v1-95M"

class AudioPredictor:
    """
    Handles audio loading, feature extraction using MERT, and mood/theme prediction.
    """
    def __init__(self):
        """
        Initializes the MERT feature extractor, loads the pre-trained classification model,
        and retrieves class labels from the dataset CSV.
        """
        print(f"Loading MERT ({MERT_HF_ID})...")
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(MERT_HF_ID, trust_remote_code=True)
        self.mert_model = AutoModel.from_pretrained(MERT_HF_ID, trust_remote_code=True).to(DEVICE)
        self.mert_model.eval()

        if os.path.exists(CSV_FILE):
            df = pd.read_csv(CSV_FILE, nrows=1)
            meta_cols = ['TRACK_ID', 'PATH', 'DURATION']
            self.labels = [col for col in df.columns if col not in meta_cols]
        else:
            print("Warning: CSV file not found. Labels will be missing.")
            self.labels = []

        self.classifier = MERTClassifier(num_classes=len(self.labels)).to(DEVICE)
        try:
            self.classifier.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
            self.classifier.eval()
            print("Classifier model loaded successfully.")
        except Exception as e:
            print(f"Error loading model weights: {e}")
            self.classifier.eval()

    def process_audio(self, audio_path):
        """
        Loads an audio file, resamples it to 24kHz, and extracts embeddings using the MERT model.

        Args:
            audio_path (str): Path to the audio file.

        Returns:
            torch.Tensor: The mean-pooled embedding of the audio track, or None if processing fails.
        """
        try:
            audio_array, _ = librosa.load(audio_path, sr=24000, mono=True)

            max_samples = 24000 * 30
            if len(audio_array) > max_samples:
                audio_array = audio_array[:max_samples]

            input_values = self.processor(
                audio_array,
                sampling_rate=24000,
                return_tensors="pt"
            ).input_values.to(DEVICE)

            with torch.no_grad():
                outputs = self.mert_model(input_values)
                embedding = outputs.last_hidden_state.mean(dim=1)

            return embedding

        except Exception as e:
            print(f"Librosa/Processing error: {e}")
            return None

    def predict(self, audio_path):
        """
        Predicts mood/theme tags for a given audio file and returns a list of results.

        Args:
            audio_path (str): Path to the audio file.

        Returns:
            list[dict]: A sorted list of dictionaries containing 'tag' and 'confidence'.
        """
        if not os.path.exists(audio_path):
            print("❌ File not found")
            return []

        if self.classifier is None:
            print("Error: Model not loaded")
            return []

        embedding = self.process_audio(audio_path)
        if embedding is None:
            return []

        with torch.no_grad():
            logits = self.classifier(embedding)
            probs = torch.sigmoid(logits)[0].cpu().numpy()

        results = []
        for idx, prob in enumerate(probs):
            if prob > 0.15:
                label = self.labels[idx] if idx < len(self.labels) else f"Class_{idx}"
                results.append({
                    "tag": label,
                    "confidence": float(prob)
                })

        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results

    def predict_cli(self, audio_path):
        """
        Runs prediction and prints the top 5 results to the console.
        Useful for command-line interaction.

        Args:
            audio_path (str): Path to the audio file.
        """
        if not os.path.exists(audio_path):
            print("❌ File not found")
            return

        print(f"Processing: {os.path.basename(audio_path)} ...")
        embedding = self.process_audio(audio_path)

        if embedding is None:
            return

        with torch.no_grad():
            logits = self.classifier(embedding)
            probs = torch.sigmoid(logits)[0].cpu().numpy()

        top_indices = probs.argsort()[::-1]
        print(f"\n🎧 Results:")
        for i in range(5):
            idx = top_indices[i]
            if probs[idx] > 0.05:
                label = self.labels[idx] if idx < len(self.labels) else f"Class_{idx}"
                print(f"{probs[idx]:.1%} | {label}")
        print("-" * 30)


if __name__ == "__main__":
    predictor = AudioPredictor()

    while True:
        user_input = input("\n>> Path to mp3/wav (or 'exit'): ").strip().strip('"')
        if user_input.lower() in ['exit', 'quit']:
            break
        predictor.predict_cli(user_input)