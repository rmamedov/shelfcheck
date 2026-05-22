"""Shelf product detection module.

Provides ShelfDetector — a YOLO-based detector that locates product facings
in shelf images and assigns them to shelf rows via postprocessing.
"""

from shelf_reco.detect.detector import ShelfDetector

__all__ = ["ShelfDetector"]
