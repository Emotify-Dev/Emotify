# Project Emotify

## Table of Contents
- [Team Members](#team-members)
- [Development Workflow](#development-workflow-on-github)
- [Setup & Running](#setup--running)
- [Data Strategy & Model Training](#data-strategy--model-training)
  - [Baseline Feature Extraction (MTG-Jamendo + MERT)](#baseline-feature-extraction-mtg-jamendo--mert)
  - [Key Resources & Technologies](#key-resources--technologies)
- [Frontend Application](#frontend-application)

## Team Members
* **Myroslav Natalchenko**
* **Kiryl Sankouski**
* **Michał Zach**

## Development Workflow on GitHub

To ensure code stability and minimize merge conflicts, we will strictly follow a Fork & Branch workflow.

1.  Each team member must fork the main Emotify repository to their personal GitHub account
2.  Create a specific branch in your fork for your tasks
3.  Once task is complete, open a Pull Request (PR) from your fork's branch to the upstream repository's `main` branch

## Setup & Running

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file in the project root with your Spotify credentials:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5000/callback
```

```bash
# Start the Flask server — http://127.0.0.1:5000
python app.py
```

> On first run the backend downloads the MERT model from HuggingFace (~375 MB).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## Data Strategy & Model Training

To achieve accurate and scalable emotion recognition in music, **Emotify** adopts a feature-based, two-step pipeline:

1. **High-level audio representation extraction** using a large pretrained music model  
2. **Supervised training** of a lightweight emotion classifier on extracted embeddings  

This approach allows us to decouple heavy audio processing from model training, significantly reducing training cost and improving experimentation speed.

### Baseline Feature Extraction (MTG-Jamendo + MERT)

As a foundation for emotion modeling, we use the **MTG-Jamendo Dataset**, specifically the subset annotated with **`mood/theme`** tags.

To transform raw audio into meaningful numerical representations, we employ the pretrained **MERT (Music Embedding Representation from Transformers)** `m-a-p/MERT-v1-95M` from HuggingFace model.
Each track is converted into a fixed-size **embedding tensor**, which is stored as a `.npy` file. 

#### Model Training
Our emotion prediction model is trained **directly on the extracted MERT embeddings**, rather than raw audio or spectrograms.

This design provides:
- Faster training cycles
- Lower hardware requirements
- Strong generalization thanks to MERT pretraining

### Key Resources & Technologies

**Datasets**
- [MTG-Jamendo Dataset](https://github.com/MTG/mtg-jamendo-dataset/tree/master) (mood/theme subset)

**Pretrained Models**
- MERT: https://huggingface.co/m-a-p/MERT-v1-95M

**Core Stack**
- Python 3.10+, PyTorch, NumPy, librosa
- Hugging Face Transformers (`m-a-p/MERT-v1-95M`)
- Flask + Flask-SQLAlchemy (REST API + SQLite analysis cache)
- Next.js 16 / React 19, Tailwind CSS, Recharts (frontend)

## Frontend Application
The **Emotify frontend** is implemented as a modern web application using **Next.js**.
