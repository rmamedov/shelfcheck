"""FAISS-backed k-NN index for SKU embedding lookup.

Wraps a FAISS inner-product index (cosine similarity on L2-normalized
vectors) with vote-aggregation search, save/load, and automatic index
type selection based on gallery size.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import faiss
import numpy as np

from shelf_reco.config import GalleryConfig
from shelf_reco.schemas import SkuMatch

logger = logging.getLogger("shelf_reco.gallery")

# Threshold for switching from brute-force to IVF-PQ.
_LARGE_CATALOG_THRESHOLD = 100_000


class SkuGallery:
    """FAISS gallery that maps L2-normalized embeddings to SKU IDs.

    For catalogs up to 100 000 vectors a flat inner-product index is used
    (exact cosine similarity).  Larger catalogs automatically switch to
    an IVF-PQ index for sub-linear search at the cost of approximate
    results.

    Parameters
    ----------
    dim:
        Embedding dimensionality (e.g. 768 for DINOv2 ViT-B/14).
    config:
        Optional gallery configuration.  Uses defaults when *None*.
    """

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def __init__(self, dim: int, config: GalleryConfig | None = None) -> None:
        self._dim = dim
        self._config = config or GalleryConfig()
        self._sku_ids: list[str] = []
        self._index: faiss.Index = faiss.IndexFlatIP(dim)
        self._created_at: str = datetime.now(timezone.utc).isoformat()
        self._is_trained: bool = True  # Flat index needs no training
        logger.info("Created empty SkuGallery  dim=%d", dim)

    # ------------------------------------------------------------------
    # Public properties
    # ------------------------------------------------------------------

    @property
    def size(self) -> int:
        """Number of vectors currently stored."""
        return self._index.ntotal

    @property
    def dim(self) -> int:
        """Embedding dimensionality."""
        return self._dim

    @property
    def version(self) -> str:
        """Gallery version derived from a hash of the metadata content."""
        meta_bytes = json.dumps(self._build_metadata(), sort_keys=True).encode()
        digest = hashlib.sha256(meta_bytes).hexdigest()[:8]
        return f"v1_{digest}"

    # ------------------------------------------------------------------
    # Adding vectors
    # ------------------------------------------------------------------

    def add(self, sku_id: str, embedding: np.ndarray) -> None:
        """Add a single L2-normalized embedding for *sku_id*.

        Parameters
        ----------
        sku_id:
            Product identifier.
        embedding:
            1-D float32 array of shape ``(dim,)``.

        Raises
        ------
        ValueError
            If the embedding shape does not match the gallery dimension.
        """
        embedding = self._validate_and_reshape(embedding, single=True)
        self._ensure_index_type(self.size + 1)
        self._index.add(embedding)
        self._sku_ids.append(sku_id)

    def add_batch(self, sku_ids: list[str], embeddings: np.ndarray) -> None:
        """Add a batch of L2-normalized embeddings.

        Parameters
        ----------
        sku_ids:
            List of product identifiers, one per row.
        embeddings:
            2-D float32 array of shape ``(n, dim)``.

        Raises
        ------
        ValueError
            If *sku_ids* length does not match *embeddings* row count
            or dimensions are wrong.
        """
        embeddings = self._validate_and_reshape(embeddings, single=False)
        if len(sku_ids) != embeddings.shape[0]:
            raise ValueError(
                f"sku_ids length ({len(sku_ids)}) != embeddings rows "
                f"({embeddings.shape[0]})"
            )
        self._ensure_index_type(self.size + len(sku_ids))
        self._index.add(embeddings)
        self._sku_ids.extend(sku_ids)
        logger.debug(
            "Added batch of %d vectors (%d unique SKUs)",
            len(sku_ids),
            len(set(sku_ids)),
        )

    # ------------------------------------------------------------------
    # Search with vote aggregation
    # ------------------------------------------------------------------

    def search(
        self, query: np.ndarray, top_k: int | None = None
    ) -> list[SkuMatch]:
        """Search the gallery and return vote-aggregated SKU matches.

        The raw top-k nearest neighbours are grouped by SKU.  The best
        SKU is the one with the most *votes* (ties broken by lowest
        average cosine distance).

        Parameters
        ----------
        query:
            1-D float32 array of shape ``(dim,)``, L2-normalized.
        top_k:
            Number of raw neighbours to retrieve.  Falls back to
            ``config.top_k``.

        Returns
        -------
        list[SkuMatch]
            Aggregated matches sorted by descending confidence.
        """
        if self.size == 0:
            logger.warning("Search on empty gallery — returning no matches")
            return []

        top_k = top_k or self._config.top_k
        # Clamp top_k to gallery size to avoid FAISS errors.
        effective_k = min(top_k, self.size)

        query_vec = self._validate_and_reshape(query, single=True)
        similarities, indices = self._index.search(query_vec, effective_k)

        # Convert inner-product similarities to cosine distances.
        # similarity ∈ [-1, 1] for unit vectors; distance = 1 - similarity.
        sims: np.ndarray = similarities[0]
        idxs: np.ndarray = indices[0]

        # Aggregate votes per SKU.
        sku_votes: dict[str, list[float]] = defaultdict(list)
        for sim, idx in zip(sims, idxs):
            if idx < 0:
                # FAISS returns -1 for missing neighbours.
                continue
            sku_id = self._sku_ids[int(idx)]
            distance = float(1.0 - sim)
            sku_votes[sku_id].append(distance)

        if not sku_votes:
            return []

        # Sort: most votes first, then lowest average distance.
        ranked = sorted(
            sku_votes.items(),
            key=lambda item: (-len(item[1]), np.mean(item[1])),
        )

        best_sku, best_dists = ranked[0]
        best_avg_dist = float(np.mean(best_dists))
        confidence = float(np.clip(1.0 - best_avg_dist, 0.0, 1.0))

        runner_up_sku: str | None = None
        runner_up_margin: float | None = None
        if len(ranked) >= 2:
            ru_sku, ru_dists = ranked[1]
            runner_up_sku = ru_sku
            runner_up_margin = float(np.mean(ru_dists) - best_avg_dist)

        # Build full result list (primary + remaining).
        matches: list[SkuMatch] = [
            SkuMatch(
                sku_id=best_sku,
                distance=best_avg_dist,
                confidence=confidence,
                runner_up_sku=runner_up_sku,
                runner_up_margin=runner_up_margin,
            )
        ]
        for sku_id, dists in ranked[1:]:
            avg_d = float(np.mean(dists))
            matches.append(
                SkuMatch(
                    sku_id=sku_id,
                    distance=avg_d,
                    confidence=float(np.clip(1.0 - avg_d, 0.0, 1.0)),
                )
            )

        return matches

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: Path | None = None) -> None:
        """Persist the FAISS index and metadata JSON to disk.

        Parameters
        ----------
        path:
            FAISS index output path.  Falls back to ``config.index_path``.
            The metadata file is written alongside, controlled by
            ``config.metadata_path``.
        """
        index_path = path or self._config.index_path
        meta_path = self._config.metadata_path

        index_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.parent.mkdir(parents=True, exist_ok=True)

        faiss.write_index(self._index, str(index_path))

        metadata = self._build_metadata()
        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        logger.info(
            "Saved gallery  vectors=%d  index=%s  meta=%s",
            self.size,
            index_path,
            meta_path,
        )

    @classmethod
    def load(
        cls,
        path: Path,
        metadata_path: Path | None = None,
        config: GalleryConfig | None = None,
    ) -> SkuGallery:
        """Load a previously saved gallery from disk.

        Parameters
        ----------
        path:
            Path to the FAISS index file.
        metadata_path:
            Path to the metadata JSON.  When *None*, inferred by
            replacing the index suffix with ``.meta.json``.
        config:
            Optional configuration override.

        Returns
        -------
        SkuGallery
            Loaded gallery ready for search.

        Raises
        ------
        FileNotFoundError
            If the index or metadata file does not exist.
        """
        if not path.exists():
            raise FileNotFoundError(f"FAISS index not found: {path}")

        if metadata_path is None:
            # Derive: gallery_v1.faiss -> gallery_v1.meta.json
            metadata_path = path.with_suffix("").with_suffix(".meta.json")

        if not metadata_path.exists():
            raise FileNotFoundError(f"Metadata file not found: {metadata_path}")

        meta: dict[str, Any] = json.loads(
            metadata_path.read_text(encoding="utf-8")
        )

        dim: int = meta["dim"]
        cfg = config or GalleryConfig(index_path=path, metadata_path=metadata_path)

        gallery = cls.__new__(cls)
        gallery._dim = dim
        gallery._config = cfg
        gallery._sku_ids = list(meta["sku_ids"])
        gallery._index = faiss.read_index(str(path))
        gallery._created_at = meta.get(
            "created_at", datetime.now(timezone.utc).isoformat()
        )
        gallery._is_trained = True

        logger.info(
            "Loaded gallery  version=%s  vectors=%d  dim=%d",
            meta.get("version", "unknown"),
            gallery.size,
            dim,
        )
        return gallery

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_metadata(self) -> dict[str, Any]:
        """Assemble the metadata dict for serialisation."""
        return {
            "version": self.version,
            "dim": self._dim,
            "count": self.size,
            "sku_ids": self._sku_ids,
            "created_at": self._created_at,
        }

    def _validate_and_reshape(
        self, vec: np.ndarray, *, single: bool
    ) -> np.ndarray:
        """Ensure correct dtype, shape, and L2-normalisation."""
        vec = np.asarray(vec, dtype=np.float32)

        if single:
            if vec.ndim == 1:
                vec = vec.reshape(1, -1)
            if vec.shape != (1, self._dim):
                raise ValueError(
                    f"Expected shape (1, {self._dim}), got {vec.shape}"
                )
        else:
            if vec.ndim != 2 or vec.shape[1] != self._dim:
                raise ValueError(
                    f"Expected shape (n, {self._dim}), got {vec.shape}"
                )

        # Ensure L2-normalised (re-normalise to be safe).
        faiss.normalize_L2(vec)
        return vec

    def _ensure_index_type(self, target_size: int) -> None:
        """Switch to IVF-PQ when the gallery grows past the threshold.

        This is a one-time migration: once the index is converted it
        stays as IVF-PQ even if vectors are removed.
        """
        if target_size <= _LARGE_CATALOG_THRESHOLD:
            return
        if not isinstance(self._index, faiss.IndexFlatIP):
            # Already migrated.
            return

        logger.info(
            "Gallery exceeds %d vectors — migrating to IndexIVFPQ",
            _LARGE_CATALOG_THRESHOLD,
        )

        # IVF-PQ parameters tuned for product-recognition workloads.
        nlist = int(np.sqrt(target_size))  # number of Voronoi cells
        m = 16  # number of sub-quantizers (dim must be divisible by m)
        nbits = 8  # bits per sub-quantizer code

        quantizer = faiss.IndexFlatIP(self._dim)
        ivfpq = faiss.IndexIVFPQ(quantizer, self._dim, nlist, m, nbits)
        ivfpq.metric_type = faiss.METRIC_INNER_PRODUCT

        if self.size > 0:
            # Retrieve all existing vectors to retrain.
            all_vecs = self._index.reconstruct_n(0, self.size)
            ivfpq.train(all_vecs)
            ivfpq.add(all_vecs)
        else:
            ivfpq.train(np.zeros((nlist, self._dim), dtype=np.float32))

        ivfpq.nprobe = min(16, nlist)
        self._index = ivfpq
        self._is_trained = True
        logger.info("Migration complete  nlist=%d  m=%d  nprobe=%d", nlist, m, ivfpq.nprobe)

    def __repr__(self) -> str:
        return (
            f"SkuGallery(dim={self._dim}, size={self.size}, "
            f"version='{self.version}')"
        )
