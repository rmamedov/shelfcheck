"""SKU encoder: crop detections, embed via backbone, cache in SQLite.

This is the main public interface for the embedding module.  Given a shelf
image and a list of detections, it produces an L2-normalized embedding matrix
suitable for gallery matching or ArcFace fine-tuning.

Example::

    encoder = SkuEncoder(config=encoder_cfg, device="cuda")
    embeddings = encoder.encode_crops(image, detections)
    # embeddings.shape == (len(detections), 768)
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from shelf_reco.config import EncoderConfig
from shelf_reco.embed.backbone import EmbeddingBackbone
from shelf_reco.schemas import BBox, Detection

logger = logging.getLogger("shelf_reco.embed.encoder")

# Minimum crop dimension (pixels) to avoid degenerate inputs
_MIN_CROP_PIXELS = 4


class SkuEncoder:
    """Crop detections from shelf images, encode, and L2-normalize.

    Features:
        - Backbone-agnostic via ``EmbeddingBackbone.from_config``
        - Batch-friendly: encodes crops in configurable batch sizes
        - SQLite embedding cache keyed by ``Detection.crop_id``
        - All returned embeddings are L2-normalized (unit vectors)

    Args:
        config: Encoder configuration (backbone name, batch size, cache path).
        device: Torch device string (``"cpu"`` or ``"cuda"``).
    """

    def __init__(self, config: EncoderConfig, device: str = "cpu") -> None:
        self._config = config
        self._device = device
        self._backbone = EmbeddingBackbone.from_config(config.backbone, device)
        self._dim = self._backbone.dim

        # Ensure the configured embedding_dim matches the backbone
        if config.embedding_dim != self._dim:
            logger.warning(
                "Config embedding_dim=%d but backbone dim=%d; "
                "using backbone dim",
                config.embedding_dim,
                self._dim,
            )

        # Initialize SQLite cache
        self._cache_path = Path(config.cache_path)
        self._cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(self._cache_path))
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS embedding_cache (
                crop_id   TEXT PRIMARY KEY,
                embedding BLOB NOT NULL
            )
            """
        )
        self._db.commit()
        logger.info(
            "SkuEncoder ready: backbone=%s, dim=%d, cache=%s",
            config.backbone,
            self._dim,
            self._cache_path,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def encode_crops(
        self,
        image: np.ndarray,
        detections: list[Detection],
    ) -> np.ndarray:
        """Crop detections from *image*, encode, and return embeddings.

        Cached embeddings (keyed by ``Detection.crop_id``) are reused.
        All embeddings are L2-normalized before return.

        Args:
            image: Full shelf image, ``(H, W, C)`` BGR ``np.ndarray``.
            detections: List of detections whose bboxes reference *image*.

        Returns:
            ``np.ndarray`` of shape ``(N, dim)`` with dtype ``float32``,
            where ``N = len(detections)``.  Each row is an L2-normalized
            embedding.  Row order matches *detections* order.
        """
        n = len(detections)
        if n == 0:
            return np.empty((0, self._dim), dtype=np.float32)

        embeddings = np.empty((n, self._dim), dtype=np.float32)
        uncached_indices: list[int] = []
        uncached_crops: list[np.ndarray] = []

        # --- Phase 1: check cache, crop uncached detections ---------------
        for idx, det in enumerate(detections):
            cached = self._cache_get(det.crop_id)
            if cached is not None:
                embeddings[idx] = cached
            else:
                crop = self._extract_crop(image, det.bbox)
                if crop is None:
                    logger.warning(
                        "Degenerate crop for %s, using zero vector", det.crop_id
                    )
                    embeddings[idx] = np.zeros(self._dim, dtype=np.float32)
                    continue
                uncached_indices.append(idx)
                uncached_crops.append(crop)

        cache_hits = n - len(uncached_indices)
        if cache_hits > 0:
            logger.debug("Cache hits: %d / %d", cache_hits, n)

        # --- Phase 2: batch-encode uncached crops -------------------------
        if uncached_crops:
            encoded = self._batch_encode(uncached_crops)
            for i, idx in enumerate(uncached_indices):
                embeddings[idx] = encoded[i]
                # Persist to cache
                crop_id = detections[idx].crop_id
                self._cache_put(crop_id, encoded[i])

        return embeddings

    def encode_single(self, crop: np.ndarray) -> np.ndarray:
        """Encode a single BGR crop image.

        Args:
            crop: Image as ``(H, W, C)`` BGR ``np.ndarray``.

        Returns:
            L2-normalized embedding, shape ``(dim,)``, dtype ``float32``.
        """
        tensor = self._backbone.preprocess(crop).unsqueeze(0)
        embedding = self._backbone.encode(tensor)
        embedding = F.normalize(embedding, p=2, dim=1)
        return embedding.squeeze(0).cpu().numpy().astype(np.float32)

    def encode_images(self, images: list[np.ndarray]) -> np.ndarray:
        """Encode a list of crop images (used by GalleryBuilder).

        Args:
            images: List of images as ``(H, W, C)`` ``np.ndarray``.
                Can be BGR (OpenCV convention) — backbone handles conversion.

        Returns:
            ``np.ndarray`` of shape ``(N, dim)`` with dtype ``float32``.
            Each row is L2-normalized.
        """
        if not images:
            return np.empty((0, self._dim), dtype=np.float32)
        return self._batch_encode(images)

    @property
    def dim(self) -> int:
        """Embedding dimensionality."""
        return self._dim

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_crop(self, image: np.ndarray, bbox: BBox) -> np.ndarray | None:
        """Extract a bbox crop from the image.

        Returns ``None`` if the crop is degenerate (too small).
        """
        h, w = image.shape[:2]

        # Clamp to image bounds and convert to int
        x1 = max(0, int(round(bbox.x1)))
        y1 = max(0, int(round(bbox.y1)))
        x2 = min(w, int(round(bbox.x2)))
        y2 = min(h, int(round(bbox.y2)))

        crop_w = x2 - x1
        crop_h = y2 - y1
        if crop_w < _MIN_CROP_PIXELS or crop_h < _MIN_CROP_PIXELS:
            return None

        return image[y1:y2, x1:x2].copy()

    def _batch_encode(self, crops: list[np.ndarray]) -> np.ndarray:
        """Preprocess and encode a list of crops in batches.

        Returns:
            ``(N, dim)`` L2-normalized embeddings as ``np.float32``.
        """
        # Preprocess all crops
        tensors = [self._backbone.preprocess(c) for c in crops]

        all_embeddings: list[torch.Tensor] = []
        batch_size = self._config.batch_size

        for start in range(0, len(tensors), batch_size):
            batch = torch.stack(tensors[start : start + batch_size])
            emb = self._backbone.encode(batch)
            # L2-normalize each embedding
            emb = F.normalize(emb, p=2, dim=1)
            all_embeddings.append(emb.cpu())

        result = torch.cat(all_embeddings, dim=0)
        return result.numpy().astype(np.float32)

    # ------------------------------------------------------------------
    # SQLite cache
    # ------------------------------------------------------------------

    def _cache_get(self, crop_id: str) -> np.ndarray | None:
        """Retrieve a cached embedding by crop_id.

        Returns:
            ``(dim,)`` float32 array, or ``None`` on cache miss.
        """
        row = self._db.execute(
            "SELECT embedding FROM embedding_cache WHERE crop_id = ?",
            (crop_id,),
        ).fetchone()
        if row is None:
            return None
        blob: bytes = row[0]
        return np.frombuffer(blob, dtype=np.float32).copy()

    def _cache_put(self, crop_id: str, embedding: np.ndarray) -> None:
        """Store an embedding in the cache."""
        blob = embedding.astype(np.float32).tobytes()
        self._db.execute(
            "INSERT OR REPLACE INTO embedding_cache (crop_id, embedding) VALUES (?, ?)",
            (crop_id, blob),
        )
        self._db.commit()

    def clear_cache(self) -> int:
        """Delete all cached embeddings.

        Returns:
            Number of entries removed.
        """
        cursor = self._db.execute("DELETE FROM embedding_cache")
        self._db.commit()
        count = cursor.rowcount
        logger.info("Cleared %d entries from embedding cache", count)
        return count

    def close(self) -> None:
        """Close the SQLite connection."""
        self._db.close()
        logger.debug("Embedding cache connection closed")

    def __del__(self) -> None:
        try:
            self._db.close()
        except Exception:  # noqa: BLE001
            pass
