"""
train.py
──────────────────────────────────────────────────────────────────────────────
Train a MoodClassifier on Essentia or Music2Emo OHE dataset.

Usage:
    python ml/models/train.py --source essentia
    python ml/models/train.py --source music2emo
    python ml/models/train.py --source essentia --epochs 80 --lr 3e-4

Outputs (inside ml/models/trained_models/):
    <source>_YYYY-MM-DD.pt                      ← best model weights
    analysis/<source>_YYYY-MM-DD_curves.png     ← loss & accuracy curves
    analysis/<source>_YYYY-MM-DD_confusion.png  ← confusion matrix (test set)
    analysis/<source>_YYYY-MM-DD_report.txt     ← classification report
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import date
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset import CLASS_NAMES, compute_class_weights, load_splits
from model import MoodClassifier

# paths
ROOT = Path(__file__).parent
DATASET_DIR = ROOT.parent / 'dataset' / 'clean_datasets'
OUT_DIR = ROOT / 'trained_models'
ANALYSIS_DIR = OUT_DIR / 'analysis'

DATASET_MAP = {
    'essentia': DATASET_DIR / 'essentia_ohe.csv',
    'music2emo': DATASET_DIR / 'music2emo_ohe.csv',
}


# ── training helpers ──────────────────────────────────────────────────────────

def train_one_epoch(model, loader, criterion, optimizer, device, epoch_bar=None):
    """Run one full training epoch, return average loss and accuracy."""
    model.train()
    total_loss, correct, total = 0.0, 0, 0

    batch_bar = tqdm(loader, desc='  train', leave=False,
                     unit='batch', dynamic_ncols=True)
    for x, y in batch_bar:
        x, y = x.to(device), y.to(device)
        optimizer.zero_grad()
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * len(y)
        correct    += (logits.argmax(1) == y).sum().item()
        total      += len(y)

        batch_bar.set_postfix(loss=f'{total_loss/total:.4f}',
                              acc=f'{correct/total:.4f}')

    return total_loss / total, correct / total


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    """Evaluate the model on a dataloader, return loss, accuracy, predictions and ground-truth labels."""
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    all_preds, all_labels = [], []

    for x, y in tqdm(loader, desc='  val  ', leave=False,
                     unit='batch', dynamic_ncols=True):
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss = criterion(logits, y)

        total_loss += loss.item() * len(y)
        preds       = logits.argmax(1)
        correct    += (preds == y).sum().item()
        total      += len(y)
        all_preds.extend(preds.cpu().tolist())
        all_labels.extend(y.cpu().tolist())

    return total_loss / total, correct / total, all_preds, all_labels


# ── plots ─────────────────────────────────────────────────────────────────────

def save_curves(history: dict, out_path: Path) -> None:
    """Plot and save loss and accuracy curves for train/val splits."""
    epochs = range(1, len(history['train_loss']) + 1)
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    fig.suptitle('Training Curves', fontweight='bold')

    axes[0].plot(epochs, history['train_loss'], label='Train')
    axes[0].plot(epochs, history['val_loss'],   label='Val')
    if history.get('best_epoch'):
        axes[0].axvline(history['best_epoch'], color='red', ls='--', alpha=0.6, label=f'Best (ep {history["best_epoch"]})')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('Loss')
    axes[0].set_title('Cross-Entropy Loss')
    axes[0].legend()

    axes[1].plot(epochs, history['train_acc'], label='Train')
    axes[1].plot(epochs, history['val_acc'],   label='Val')
    if history.get('best_epoch'):
        axes[1].axvline(history['best_epoch'], color='red', ls='--', alpha=0.6)
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('Accuracy')
    axes[1].set_title('Accuracy')
    axes[1].legend()

    plt.tight_layout()
    plt.savefig(out_path, dpi=120)
    plt.close()
    print(f'  Curves saved → {out_path}')


def save_confusion(preds, labels, class_names, out_path: Path) -> None:
    """Plot and save a confusion matrix (raw counts and row-normalised) for the test set."""
    cm = confusion_matrix(labels, preds)
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)

    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    fig.suptitle('Confusion Matrix (Test Set)', fontweight='bold')

    for ax, data, title, fmt in zip(
        axes,
        [cm, cm_norm],
        ['Counts', 'Normalised (row %)'],
        ['d', '.2f'],
    ):
        im = ax.imshow(data, cmap='Blues')
        ax.set_xticks(range(len(class_names)))
        ax.set_yticks(range(len(class_names)))
        ax.set_xticklabels(class_names, rotation=30)
        ax.set_yticklabels(class_names)
        ax.set_xlabel('Predicted')
        ax.set_ylabel('Actual')
        ax.set_title(title)
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        for i in range(len(class_names)):
            for j in range(len(class_names)):
                val = data[i, j]
                color = 'white' if (cm_norm[i, j] > 0.5) else 'black'
                ax.text(j, i, format(val, fmt), ha='center', va='center',
                        color=color, fontsize=9)

    plt.tight_layout()
    plt.savefig(out_path, dpi=120)
    plt.close()
    print(f'  Confusion matrix saved → {out_path}')


# ── main ──────────────────────────────────────────────────────────────────────

def parse_args():
    """Parse command-line arguments for training configuration."""
    p = argparse.ArgumentParser()
    p.add_argument('--source',     required=True, choices=['essentia', 'music2emo'])
    p.add_argument('--epochs',     type=int,   default=20)
    p.add_argument('--batch_size', type=int,   default=256)
    p.add_argument('--lr',         type=float, default=1e-3)
    p.add_argument('--dropout',    type=float, default=0.3)
    p.add_argument('--patience',   type=int,   default=10,
                   help='Early stopping: stop if val_loss does not improve for N epochs')
    p.add_argument('--seed',       type=int,   default=42)
    p.add_argument('--val_split',  type=float, default=0.15)
    p.add_argument('--test_split', type=float, default=0.10)
    return p.parse_args()


def main():
    """Full training pipeline: load data, train with early stopping, evaluate on test set, save model and plots."""
    args   = parse_args()
    tag    = f'{args.source}_{date.today()}'
    device = torch.device('cuda' if torch.cuda.is_available() else 'mps'
                          if torch.backends.mps.is_available() else 'cpu')

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    OUT_DIR.mkdir(exist_ok=True)
    ANALYSIS_DIR.mkdir(exist_ok=True)

    print(f'\n{"="*60}')
    print(f'  Emotify — Training  [{args.source.upper()}]')
    print(f'  Device : {device}')
    print(f'  Tag    : {tag}')
    print(f'{"="*60}\n')

    # ── data ──────────────────────────────────────────────────────────────────
    csv_path = DATASET_MAP[args.source]
    train_ds, val_ds, test_ds = load_splits(
        csv_path, args.val_split, args.test_split, args.seed
    )
    print(f'  Train : {len(train_ds):,} samples')
    print(f'  Val   : {len(val_ds):,} samples')
    print(f'  Test  : {len(test_ds):,} samples')

    # class distribution in train set
    train_labels = train_ds.df[['mood_Joy','mood_Anger','mood_Pleasure','mood_Sadness']].values.argmax(1)
    for i, name in enumerate(CLASS_NAMES):
        print(f'    {name:<10} {(train_labels==i).sum():>6,}')

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,  num_workers=4, pin_memory=True)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch_size, shuffle=False, num_workers=4, pin_memory=True)
    test_loader  = DataLoader(test_ds,  batch_size=args.batch_size, shuffle=False, num_workers=4, pin_memory=True)

    # ── model + loss ──────────────────────────────────────────────────────────
    model     = MoodClassifier(dropout=args.dropout).to(device)
    weights   = compute_class_weights(train_ds).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.5, patience=5
    )

    print(f'\n  Class weights: { {n: f"{w:.3f}" for n, w in zip(CLASS_NAMES, weights.cpu().tolist())} }')
    print(f'  Params: {sum(p.numel() for p in model.parameters()):,}\n')

    # ── training loop ─────────────────────────────────────────────────────────
    history = {'train_loss': [], 'val_loss': [], 'train_acc': [], 'val_acc': []}
    best_val_loss = float('inf')
    best_epoch    = 0
    no_improve    = 0
    best_path     = OUT_DIR / f'{tag}.pt'

    t0 = time.time()
    epoch_bar = tqdm(range(1, args.epochs + 1), desc='Epochs',
                     unit='ep', dynamic_ncols=True)
    for epoch in epoch_bar:
        tr_loss, tr_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        vl_loss, vl_acc, _, _ = evaluate(model, val_loader, criterion, device)
        scheduler.step(vl_loss)

        history['train_loss'].append(tr_loss)
        history['val_loss'].append(vl_loss)
        history['train_acc'].append(tr_acc)
        history['val_acc'].append(vl_acc)

        improved = vl_loss < best_val_loss
        epoch_bar.set_postfix(
            tr_loss=f'{tr_loss:.4f}',
            tr_acc=f'{tr_acc:.3f}',
            vl_loss=f'{vl_loss:.4f}',
            vl_acc=f'{vl_acc:.3f}',
            best=f'ep{best_epoch}',
            patience=f'{no_improve}/{args.patience}',
        )

        if improved:
            best_val_loss = vl_loss
            best_epoch    = epoch
            no_improve    = 0
            torch.save({
                'epoch':      epoch,
                'state_dict': model.state_dict(),
                'val_loss':   vl_loss,
                'val_acc':    vl_acc,
                'args':       vars(args),
            }, best_path)
        else:
            no_improve += 1
            if no_improve >= args.patience:
                tqdm.write(f'\n  Early stopping at epoch {epoch} '
                           f'(no improvement for {args.patience} epochs)')
                break

    elapsed = time.time() - t0
    tqdm.write(f'\n  Training done in {elapsed/60:.1f} min | '
               f'best epoch: {best_epoch} | best val loss: {best_val_loss:.4f}')
    history['best_epoch'] = best_epoch

    # ── test evaluation ───────────────────────────────────────────────────────
    ckpt = torch.load(best_path, map_location=device)
    model.load_state_dict(ckpt['state_dict'])

    test_loss, test_acc, preds, labels = evaluate(model, test_loader, criterion, device)
    print(f'\n  Test loss: {test_loss:.4f} | Test accuracy: {test_acc:.4f}')

    report = classification_report(labels, preds, target_names=CLASS_NAMES, digits=4)
    print('\n' + report)

    report_path = ANALYSIS_DIR / f'{tag}_report.txt'
    report_path.write_text(
        f'Source    : {args.source}\n'
        f'Date      : {date.today()}\n'
        f'Best epoch: {best_epoch}\n'
        f'Val loss  : {best_val_loss:.6f}\n'
        f'Test loss : {test_loss:.6f}\n'
        f'Test acc  : {test_acc:.6f}\n\n'
        + report
    )
    print(f'  Report saved → {report_path}')

    # ── save plots ────────────────────────────────────────────────────────────
    save_curves(history, ANALYSIS_DIR / f'{tag}_curves.png')
    save_confusion(preds, labels, CLASS_NAMES, ANALYSIS_DIR / f'{tag}_confusion.png')

    print(f'\n  Model saved → {best_path}')
    print(f'  Done.\n')


if __name__ == '__main__':
    main()
