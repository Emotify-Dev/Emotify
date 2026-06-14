import gc

import torch
import numpy as np
import os
import math
from utils import logger


def get_inference_device() -> torch.device:
    """cuda → mps (Apple Silicon) → cpu. On Mac without NVIDIA, MPS is used when available."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def checkpoint_map_location(device: torch.device) -> torch.device:
    """PyTorch recommends loading checkpoints on CPU, then moving the model to MPS."""
    return torch.device("cpu") if device.type == "mps" else device


def release_ml_memory() -> None:
    """After each track: gc + flush MPS cache. Useful for batch processing on Apple Silicon."""
    gc.collect()
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        torch.mps.empty_cache()


use_cuda = torch.cuda.is_available()


# optimization
# reference: http://pytorch.org/docs/master/_modules/torch/optim/lr_scheduler.html#ReduceLROnPlateau
def adjusting_learning_rate(optimizer, factor=.5, min_lr=0.00001):
    for i, param_group in enumerate(optimizer.param_groups):
        old_lr = float(param_group['lr'])
        new_lr = max(old_lr * factor, min_lr)
        param_group['lr'] = new_lr
        logger.info('adjusting learning rate from %.6f to %.6f' % (old_lr, new_lr))


# model save and loading
def load_model(asset_path, model, optimizer, restore_epoch=0):
    if os.path.isfile(os.path.join(asset_path, 'model', 'checkpoint_%d.pth.tar' % restore_epoch), map_location=lambda storage, loc: storage):
        checkpoint = torch.load(os.path.join(asset_path, 'model', 'checkpoint_%d.pth.tar' % restore_epoch))
        model.load_state_dict(checkpoint['model'])
        optimizer.load_state_dict(checkpoint['optimizer'])
        current_step = checkpoint['current_step']
        logger.info("restore model with %d epoch" % restore_epoch)
    else:
        logger.info("no checkpoint with %d epoch" % restore_epoch)
        current_step = 0

    return model, optimizer, current_step
