"""SKU gallery module — FAISS-backed k-NN index for product recognition.

Public API:
    SkuGallery    -- FAISS wrapper with vote-aggregated cosine search
    GalleryBuilder -- build a gallery from reference crop images
"""

from shelf_reco.gallery.builder import GalleryBuilder
from shelf_reco.gallery.index import SkuGallery

__all__ = ["SkuGallery", "GalleryBuilder"]
