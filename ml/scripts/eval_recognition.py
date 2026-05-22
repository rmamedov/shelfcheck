#!/usr/bin/env python3
"""Evaluate the recognition pipeline on a test set.

Usage:
    python scripts/eval_recognition.py \
        --test-dir tests/fixtures/ \
        --gallery models/gallery_v1.faiss \
        --ground-truth tests/fixtures/ground_truth.json
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("shelf_reco.scripts.eval")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate recognition pipeline")
    parser.add_argument("--test-dir", type=Path, required=True)
    parser.add_argument("--gallery", type=Path, required=True)
    parser.add_argument("--ground-truth", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    from shelf_reco.config import AppConfig, get_config, resolve_device

    config = get_config(args.config) if args.config else AppConfig()
    config.gallery.index_path = args.gallery
    config.gallery.metadata_path = args.gallery.with_suffix(".meta.json")
    config = config.model_copy(update={"device": resolve_device(args.device)})

    from shelf_reco.recognize.pipeline import ShelfRecognizer

    recognizer = ShelfRecognizer(config=config)

    with open(args.ground_truth) as f:
        ground_truth = json.load(f)

    total_images = 0
    total_correct = 0
    total_detections = 0
    total_gt_facings = 0

    for image_name, gt_data in ground_truth.items():
        image_path = args.test_dir / image_name
        if not image_path.exists():
            logger.warning("Image not found: %s", image_path)
            continue

        result = recognizer.recognize(image_path)
        total_images += 1
        total_detections += len(result.facings)
        total_gt_facings += gt_data.get("expected_facings", 0)

        recognized_skus = {
            f.match.sku_id for f in result.facings if f.match is not None
        }
        expected_skus = set(gt_data.get("expected_skus", []))
        correct = len(recognized_skus & expected_skus)
        total_correct += correct

        logger.info(
            "%s: detected=%d, recognized=%d/%d SKUs",
            image_name,
            len(result.facings),
            correct,
            len(expected_skus),
        )

    logger.info("=" * 60)
    logger.info("Total images: %d", total_images)
    logger.info("Total detections: %d (GT: %d)", total_detections, total_gt_facings)
    logger.info(
        "SKU accuracy: %d/%d = %.1f%%",
        total_correct,
        total_gt_facings,
        (total_correct / max(total_gt_facings, 1)) * 100,
    )


if __name__ == "__main__":
    main()
