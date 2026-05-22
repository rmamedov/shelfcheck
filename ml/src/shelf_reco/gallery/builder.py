"""Build a SkuGallery from reference crop images or pre-encoded embeddings.

Typical usage::

    encoder = SkuEncoder(config.encoder, device=device)
    builder = GalleryBuilder(encoder, config.gallery)
    gallery = builder.build_from_directory(Path("data/reference_crops"))
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Protocol, runtime_checkable

import numpy as np

from shelf_reco.config import GalleryConfig
from shelf_reco.gallery.index import SkuGallery

logger = logging.getLogger("shelf_reco.gallery")

# Supported image extensions (case-insensitive).
_IMAGE_EXTENSIONS: frozenset[str] = frozenset(
    {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
)


@runtime_checkable
class _SupportsEncode(Protocol):
    """Minimal protocol that the encoder must satisfy.

    The concrete class is ``shelf_reco.embed.SkuEncoder``, but we
    depend on a protocol so the gallery module has no hard dependency
    on torch / vision backbones at import time.
    """

    @property
    def dim(self) -> int: ...

    def encode_images(self, images: list[np.ndarray]) -> np.ndarray:
        """Return an ``(n, dim)`` L2-normalised float32 array."""
        ...


class GalleryBuilder:
    """Construct a :class:`SkuGallery` from reference images.

    Parameters
    ----------
    encoder:
        An object satisfying :class:`_SupportsEncode` — typically a
        ``SkuEncoder`` instance that returns L2-normalised embeddings.
    config:
        Gallery configuration (paths, top_k, etc.).
    """

    def __init__(self, encoder: _SupportsEncode, config: GalleryConfig) -> None:
        self._encoder = encoder
        self._config = config

    # ------------------------------------------------------------------
    # Build from filesystem
    # ------------------------------------------------------------------

    def build_from_directory(self, raw_dir: Path) -> SkuGallery:
        """Scan *raw_dir* for per-SKU crop folders and build a gallery.

        Expected layout::

            raw_dir/
                sku_001/
                    front.jpg
                    angle.jpg
                sku_002/
                    ...

        Each sub-directory name is used as the ``sku_id``.  Every image
        file inside it is encoded and added to the gallery so that a
        single SKU can have multiple reference views.

        Parameters
        ----------
        raw_dir:
            Root directory containing one sub-folder per SKU.

        Returns
        -------
        SkuGallery
            Populated and saved gallery.

        Raises
        ------
        FileNotFoundError
            If *raw_dir* does not exist.
        ValueError
            If no valid SKU folders are found.
        """
        if not raw_dir.is_dir():
            raise FileNotFoundError(f"Reference directory not found: {raw_dir}")

        sku_folders = sorted(
            p for p in raw_dir.iterdir() if p.is_dir() and not p.name.startswith(".")
        )
        if not sku_folders:
            raise ValueError(f"No SKU sub-directories found in {raw_dir}")

        logger.info("Building gallery from %d SKU folders in %s", len(sku_folders), raw_dir)

        crops_by_sku: dict[str, list[np.ndarray]] = {}
        for folder in sku_folders:
            images = self._load_images_from_folder(folder)
            if images:
                crops_by_sku[folder.name] = images
            else:
                logger.warning("SKU folder %s contains no valid images — skipping", folder.name)

        if not crops_by_sku:
            raise ValueError(f"No valid images found under {raw_dir}")

        return self.build_from_crops(crops_by_sku)

    # ------------------------------------------------------------------
    # Build from pre-loaded crops
    # ------------------------------------------------------------------

    def build_from_crops(
        self, crops: dict[str, list[np.ndarray]]
    ) -> SkuGallery:
        """Build a gallery from a mapping of SKU IDs to crop images.

        Parameters
        ----------
        crops:
            ``{sku_id: [image_array, ...]}``.  Each image is a
            HWC uint8 or float numpy array.

        Returns
        -------
        SkuGallery
            Populated and saved gallery.

        Raises
        ------
        ValueError
            If *crops* is empty.
        """
        if not crops:
            raise ValueError("No crops provided — cannot build gallery")

        gallery = SkuGallery(dim=self._encoder.dim, config=self._config)

        total_images = sum(len(imgs) for imgs in crops.values())
        processed = 0

        for sku_id, images in crops.items():
            if not images:
                logger.warning("SKU %s has empty image list — skipping", sku_id)
                continue

            embeddings = self._encoder.encode_images(images)  # (n, dim)
            sku_ids = [sku_id] * embeddings.shape[0]
            gallery.add_batch(sku_ids, embeddings)

            processed += len(images)
            logger.info(
                "Encoded SKU %-20s  images=%d  progress=%d/%d",
                sku_id,
                len(images),
                processed,
                total_images,
            )

        gallery.save()
        logger.info(
            "Gallery built  total_vectors=%d  unique_skus=%d  version=%s",
            gallery.size,
            len(crops),
            gallery.version,
        )
        return gallery

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load_images_from_folder(folder: Path) -> list[np.ndarray]:
        """Read all supported images from *folder* as numpy arrays.

        Uses OpenCV (``cv2``) for I/O; falls back gracefully per file
        if a particular image is corrupt or unreadable.
        """
        import cv2

        images: list[np.ndarray] = []
        for img_path in sorted(folder.iterdir()):
            if img_path.suffix.lower() not in _IMAGE_EXTENSIONS:
                continue
            img = cv2.imread(str(img_path))
            if img is None:
                logger.warning("Failed to read image: %s", img_path)
                continue
            # Keep BGR — backbone.preprocess handles BGR->RGB internally.
            images.append(img)
        return images

    def __repr__(self) -> str:
        return (
            f"GalleryBuilder(encoder={self._encoder.__class__.__name__}, "
            f"config={self._config!r})"
        )
