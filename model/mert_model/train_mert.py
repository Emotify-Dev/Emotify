import os
import torch
import torch.nn as nn
import torch.optim as optim
import pandas as pd
import numpy as np
from torch.utils.data import DataLoader
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, average_precision_score, f1_score
from tqdm import tqdm

from model import MERTClassifier
from dataset import MERTDataset

CSV_FILE = '../../datasets/MTG/moodtheme_mertspecs_low_npy.csv'
MODEL_SAVE_DIR = "../trained_model"
MODEL_SAVE_PATH = os.path.join(MODEL_SAVE_DIR, "mert_model_best_2.pth")

BATCH_SIZE = 64
LEARNING_RATE = 1e-3
EPOCHS = 50
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def get_dataloaders(csv_path, batch_size):
    """
    Loads CSV, splits data, and returns train/val dataloaders and class count.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found at {csv_path}")

    df = pd.read_csv(csv_path)

    meta_cols = ['TRACK_ID', 'PATH', 'DURATION']
    label_cols = [c for c in df.columns if c not in meta_cols]
    num_classes = len(label_cols)
    print(f"Number of classes: {num_classes}")

    train_df, val_df = train_test_split(df, test_size=0.1, random_state=42)

    print("Preparing Train Dataset...")
    train_ds = MERTDataset(train_df)
    print("Preparing Validation Dataset...")
    val_ds = MERTDataset(val_df)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)

    return train_loader, val_loader, num_classes


def train_one_epoch(model, loader, optimizer, criterion, device, epoch_idx, total_epochs):
    """
    Runs a single training epoch and returns the accumulated loss.
    """
    model.train()
    total_loss = 0
    loop = tqdm(loader, desc=f"Epoch {epoch_idx + 1}/{total_epochs}")

    for vecs, labels in loop:
        vecs, labels = vecs.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(vecs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item()
        loop.set_postfix(loss=loss.item())

    return total_loss / len(loader)


def evaluate(model, loader, criterion, device):
    """
    Evaluates the model on validation data, returning loss, targets, and probabilities.
    """
    model.eval()
    total_loss = 0
    all_targets = []
    all_probs = []

    with torch.no_grad():
        for vecs, labels in loader:
            vecs, labels = vecs.to(device), labels.to(device)

            logits = model(vecs)
            loss = criterion(logits, labels)
            total_loss += loss.item()

            probs = torch.sigmoid(logits)
            all_targets.append(labels.cpu().numpy())
            all_probs.append(probs.cpu().numpy())

    avg_loss = total_loss / len(loader)
    all_targets = np.concatenate(all_targets)
    all_probs = np.concatenate(all_probs)

    return avg_loss, all_targets, all_probs


def compute_metrics(targets, probs, threshold=0.4):
    """
    Calculates ROC-AUC, PR-AUC, and F1 score (Macro average).
    """
    try:
        roc_auc = roc_auc_score(targets, probs, average='macro')
        pr_auc = average_precision_score(targets, probs, average='macro')

        predicted_labels = (probs > threshold).astype(int)
        f1 = f1_score(targets, predicted_labels, average='macro')
    except ValueError:
        return 0.0, 0.0, 0.0

    return roc_auc, pr_auc, f1


def run_training():
    """
    Main function to orchestrate data loading, model initialization, and training loop.
    """
    print(f"Device: {DEVICE}")

    try:
        # EMB_DIR больше не передается
        train_loader, val_loader, num_classes = get_dataloaders(CSV_FILE, BATCH_SIZE)
    except Exception as e:
        print(e)
        return

    model = MERTClassifier(num_classes=num_classes).to(DEVICE)
    optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
    criterion = nn.BCEWithLogitsLoss()
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', factor=0.5, patience=5)

    best_pr_auc = 0.0

    print("Start Training")
    for epoch in range(EPOCHS):

        train_one_epoch(model, train_loader, optimizer, criterion, DEVICE, epoch, EPOCHS)

        val_loss, targets, probs = evaluate(model, val_loader, criterion, DEVICE)

        roc_auc, pr_auc, f1 = compute_metrics(targets, probs)

        scheduler.step(pr_auc)

        print(f"Val Loss: {val_loss:.4f} | ROC-AUC: {roc_auc:.4f} | PR-AUC: {pr_auc:.4f} | F1: {f1:.4f}")

        if pr_auc > best_pr_auc:
            best_pr_auc = pr_auc
            if not os.path.exists(MODEL_SAVE_DIR):
                os.makedirs(MODEL_SAVE_DIR)
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            print(f"Saved Best Model! PR-AUC: {best_pr_auc:.4f}")

        print("-" * 30)

if __name__ == "__main__":
    run_training()