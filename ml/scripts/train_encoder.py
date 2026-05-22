#!/usr/bin/env python3
"""Fine-tune SKU encoder with ArcFace head.

Usage:
    python scripts/train_encoder.py \
        --train-dir data/train/ \
        --backbone dinov2_vitb14 \
        --epochs 30 \
        --batch-size 32 \
        --lr 1e-4 \
        --out models/encoder_finetuned.pt

Directory structure:
    data/train/
        SKU001/
            img1.jpg
            img2.jpg
        SKU002/
            img1.jpg
        ...
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("shelf_reco.scripts.train_encoder")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune SKU encoder")
    parser.add_argument("--train-dir", type=Path, required=True)
    parser.add_argument("--backbone", default="dinov2_vitb14")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--out", type=Path, default=Path("models/encoder_finetuned.pt"))
    args = parser.parse_args()

    logger.info("Fine-tuning encoder: backbone=%s, epochs=%d", args.backbone, args.epochs)
    logger.info("Training data: %s", args.train_dir)

    # Count classes
    sku_dirs = sorted([d for d in args.train_dir.iterdir() if d.is_dir()])
    num_classes = len(sku_dirs)
    logger.info("Found %d SKU classes", num_classes)

    if num_classes < 2:
        logger.error("Need at least 2 SKU classes for training")
        return

    from shelf_reco.config import resolve_device
    from shelf_reco.embed.backbone import EmbeddingBackbone
    from shelf_reco.embed.finetune import FineTuner

    device = resolve_device(args.device)
    backbone = EmbeddingBackbone.from_config(args.backbone, device=device)

    finetuner = FineTuner(
        backbone=backbone,
        num_classes=num_classes,
        device=device,
        lr=args.lr,
    )

    logger.info("Training not fully automated — see embed/finetune.py for the training loop.")
    logger.info("This script provides the scaffold. Implement your DataLoader and training loop.")

    # Save initial checkpoint
    args.out.parent.mkdir(parents=True, exist_ok=True)
    finetuner.save_checkpoint(args.out)
    logger.info("Initial checkpoint saved to %s", args.out)


if __name__ == "__main__":
    main()
