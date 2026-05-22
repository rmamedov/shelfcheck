#!/usr/bin/env python3
"""Build a SKU gallery from a directory of reference crop images.

Usage:
    python scripts/build_gallery.py --raw-dir gallery_raw/ --out models/gallery_v1.faiss

Directory structure expected:
    gallery_raw/
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
logger = logging.getLogger("shelf_reco.scripts.build_gallery")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build SKU gallery from reference images")
    parser.add_argument("--raw-dir", type=Path, required=True, help="Directory with SKU subfolders")
    parser.add_argument("--out", type=Path, default=Path("models/gallery_v1.faiss"))
    parser.add_argument("--backbone", default="dinov2_vitb14", choices=["dinov2_vitb14", "openclip_vitl14"])
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    from shelf_reco.config import AppConfig, EncoderConfig, GalleryConfig, resolve_device
    from shelf_reco.embed.encoder import SkuEncoder
    from shelf_reco.gallery.builder import GalleryBuilder

    device = resolve_device(args.device)
    encoder_config = EncoderConfig(backbone=args.backbone)
    gallery_config = GalleryConfig(
        index_path=args.out,
        metadata_path=args.out.with_suffix(".meta.json"),
    )

    encoder = SkuEncoder(config=encoder_config, device=device)
    builder = GalleryBuilder(encoder=encoder, config=gallery_config)

    logger.info("Building gallery from %s", args.raw_dir)
    gallery = builder.build_from_directory(args.raw_dir)
    logger.info("Gallery built: %d vectors, saved to %s", gallery.size, args.out)


if __name__ == "__main__":
    main()
