"""Embedding module for SKU product recognition.

Provides backbone-agnostic image encoding with L2-normalized embeddings,
SQLite-backed caching, and an ArcFace fine-tuning scaffold.

Public API:
    SkuEncoder       -- crop, encode, cache, and return L2-normalized embeddings
    EmbeddingBackbone -- abstract base for swappable vision backbones
"""

from shelf_reco.embed.backbone import EmbeddingBackbone
from shelf_reco.embed.encoder import SkuEncoder

__all__ = ["SkuEncoder", "EmbeddingBackbone"]
