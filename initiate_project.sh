#!/usr/bin/env bash
# initiate_project.sh
# ─────────────────────────────────────────────────────────────────────────────
# Full initialization of the Emotify project after git clone:
#   1. Creates the Emotify conda environment (Python 3.10)
#   2. Installs all dependencies from ml/requirements.txt
#   3. Installs essentia-tensorflow
#   4. Pulls LFS files (*.pb Essentia models)
#   5. Downloads Music2Emotion (.ckpt) and BTC (.pt) models from HuggingFace
#
# RUN (from project root):
#   bash initiate_project.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_NAME="Emotify"
PYTHON_VERSION="3.10"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/ml/saved_models"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "${YELLOW}! $*${RESET}"; }
die()   { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

# ── 0. Checks ────────────────────────────────────────────────────────────────
step "Checking dependencies"

command -v conda >/dev/null 2>&1 || die "conda not found. Please install Anaconda/Miniconda."
command -v git   >/dev/null 2>&1 || die "git not found."
ok "conda and git are available"

# Initialize conda for the current shell session
eval "$(conda shell.bash hook)"

# ── 1. Conda Environment ─────────────────────────────────────────────────────
step "Conda environment '$ENV_NAME'"

if conda env list | grep -qE "^${ENV_NAME}\s"; then
    warn "Environment '$ENV_NAME' already exists — skipping creation"
else
    conda create -y -n "$ENV_NAME" python="$PYTHON_VERSION"
    ok "Environment '$ENV_NAME' created"
fi

conda activate "$ENV_NAME"
ok "Activated: $ENV_NAME ($(python --version))"

# ── 2. Dependencies from requirements.txt ────────────────────────────────────
step "Installing dependencies (ml/requirements.txt)"

pip install --upgrade pip --quiet

# mir_eval is installed via git — requires git+https
pip install -r "$SCRIPT_DIR/ml/requirements.txt"
ok "ml/requirements.txt installed"

# ── 3. essentia-tensorflow ───────────────────────────────────────────────────
step "Installing essentia-tensorflow"

if python -c "import essentia" 2>/dev/null; then
    warn "essentia is already installed — skipping"
else
    pip install essentia-tensorflow
    ok "essentia-tensorflow installed"
fi

# ── 4. Git LFS — *.pb files ──────────────────────────────────────────────────
step "Git LFS — Essentia models (*.pb)"

if ! command -v git-lfs >/dev/null 2>&1; then
    warn "git-lfs not found. Installing via conda..."
    conda install -y -c conda-forge git-lfs
    git lfs install
fi

cd "$SCRIPT_DIR"

PB_VGGISH="$MODELS_DIR/audioset-vggish-3.pb"
PB_DEAM="$MODELS_DIR/deam-audioset-vggish-2.pb"

# Check that files are not LFS pointers (pointer < 200 bytes)
needs_lfs=false
for f in "$PB_VGGISH" "$PB_DEAM"; do
    if [ ! -f "$f" ] || [ "$(wc -c < "$f")" -lt 200 ]; then
        needs_lfs=true
        break
    fi
done

if $needs_lfs; then
    echo "  Downloading *.pb via git lfs pull..."
    git lfs pull --include="ml/saved_models/*.pb" || {
        warn "git lfs pull failed. Downloading directly from essentia.upf.edu..."
        mkdir -p "$MODELS_DIR"
        curl -L --progress-bar \
            "https://essentia.upf.edu/models/feature-extractors/vggish/audioset-vggish-3.pb" \
            -o "$PB_VGGISH"
        curl -L --progress-bar \
            "https://essentia.upf.edu/models/regression/deam/deam-audioset-vggish-2.pb" \
            -o "$PB_DEAM"
    }
    ok "Essentia models downloaded"
else
    ok "Essentia models are already present"
fi

step "Music2Emotion and BTC models"

HF_BASE="https://huggingface.co/AMAAI-Lab/Music2Emotion/resolve/main"

declare -A CKPT_FILES=(
    ["J_all.ckpt"]="$HF_BASE/J_all.ckpt"
    ["D_all.ckpt"]="$HF_BASE/D_all.ckpt"
    ["E_all.ckpt"]="$HF_BASE/E_all.ckpt"
    ["P_all.ckpt"]="$HF_BASE/P_all.ckpt"
    ["deam_best.ckpt"]="$HF_BASE/deam_best.ckpt"
    ["emomusic_best.ckpt"]="$HF_BASE/emomusic_best.ckpt"
    ["jamendo_best.ckpt"]="$HF_BASE/jamendo_best.ckpt"
    ["pmemo_best.ckpt"]="$HF_BASE/pmemo_best.ckpt"
    ["btc_model.pt"]="$HF_BASE/btc_model.pt"
    ["btc_model_large_voca.pt"]="$HF_BASE/btc_model_large_voca.pt"
)

mkdir -p "$MODELS_DIR"
any_downloaded=false

for filename in "${!CKPT_FILES[@]}"; do
    dest="$MODELS_DIR/$filename"
    if [ -f "$dest" ] && [ "$(wc -c < "$dest")" -gt 1000 ]; then
        ok "  $filename — already exists"
    else
        echo "  Downloading $filename..."
        curl -L --progress-bar "${CKPT_FILES[$filename]}" -o "$dest" || \
            warn "  Failed to download $filename — check the URL manually"
        any_downloaded=true
    fi
done

$any_downloaded && ok "Music2Emotion/BTC models downloaded" || true

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  The project is ready to go!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════${RESET}"
echo ""
echo -e "  Activate the environment:  ${CYAN}conda activate $ENV_NAME${RESET}"
echo ""