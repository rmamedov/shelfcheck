"""Recognition orchestrator — detect, embed, match, compare.

Public API:
    ShelfRecognizer -- end-to-end shelf recognition pipeline
"""

from shelf_reco.recognize.pipeline import ShelfRecognizer

__all__ = ["ShelfRecognizer"]
