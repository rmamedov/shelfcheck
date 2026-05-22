"""ShelfDetector — YOLO-based product detection on shelf images.

Loads an Ultralytics YOLO model, runs inference on shelf images, and
returns postprocessed Detection objects with shelf-row assignments.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

from shelf_reco.config import DetectorConfig
from shelf_reco.detect.postprocess import assign_shelf_rows, filter_by_area, nms
from shelf_reco.schemas import BBox, Detection

logger = logging.getLogger("shelf_reco.detect")

_PRETRAINED_FALLBACK = "yolo11x.pt"


class ShelfDetector:
    """Detect product facings on shelf images using YOLO.

    Args:
        weights: Path to the YOLO model weights file.
        device: Torch device string (``"cpu"``, ``"cuda"``, ``"cuda:0"``, etc.).
        config: Optional ``DetectorConfig``; if None a default config is used.

    Example::

        detector = ShelfDetector(Path("models/yolo11x_shelf.pt"))
        detections = detector.detect(cv2.imread("shelf.jpg"))
        for det in detections:
            print(det.shelf_row, det.bbox)
    """

    def __init__(
        self,
        weights: Path,
        device: str = "cpu",
        config: DetectorConfig | None = None,
    ) -> None:
        self._config = config or DetectorConfig()
        self._device = device

        resolved_weights = self._resolve_weights(weights)
        logger.info("Loading YOLO model from %s on device=%s", resolved_weights, device)
        self._model = YOLO(str(resolved_weights))
        self._model.to(device)
        logger.info("YOLO model loaded successfully")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, image: np.ndarray | Path) -> list[Detection]:
        """Run detection on a single shelf image.

        Args:
            image: Either a BGR ``np.ndarray`` (OpenCV convention) or a
                ``Path`` to an image file (loaded via ``cv2.imread``).

        Returns:
            List of postprocessed :class:`Detection` objects with shelf
            rows assigned.

        Raises:
            FileNotFoundError: If *image* is a ``Path`` that does not exist.
            ValueError: If the loaded image is empty / unreadable.
        """
        img = self._load_image(image)
        image_hash = self._compute_image_hash(img)

        logger.debug("Running inference on image of shape %s", img.shape)
        raw_detections = self._run_inference(img, image_hash)
        logger.info("YOLO produced %d raw detections", len(raw_detections))

        # --- Postprocess pipeline ---
        detections = nms(raw_detections, iou_threshold=self._config.iou_threshold)
        detections = filter_by_area(detections, min_area=self._config.min_bbox_area)
        detections = assign_shelf_rows(
            detections,
            expected_count=self._config.expected_shelf_count,
        )

        logger.info("Returning %d detections after postprocessing", len(detections))
        return detections

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_weights(weights: Path) -> Path:
        """Return *weights* if it exists, otherwise fall back to a pretrained model."""
        if weights.exists():
            return weights

        logger.warning(
            "Weights file %s not found; falling back to pretrained '%s'",
            weights,
            _PRETRAINED_FALLBACK,
        )
        return Path(_PRETRAINED_FALLBACK)

    @staticmethod
    def _load_image(image: np.ndarray | Path) -> np.ndarray:
        """Normalize the image input to a BGR ``np.ndarray``."""
        if isinstance(image, Path):
            if not image.exists():
                raise FileNotFoundError(f"Image file not found: {image}")
            img = cv2.imread(str(image), cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError(f"cv2.imread returned None for {image}")
            return img

        if not isinstance(image, np.ndarray):
            raise TypeError(f"Expected np.ndarray or Path, got {type(image).__name__}")
        if image.size == 0:
            raise ValueError("Received an empty image array")
        return image

    @staticmethod
    def _compute_image_hash(image: np.ndarray) -> str:
        """Compute a SHA-1 hash of the raw image bytes for cache keying."""
        return hashlib.sha1(image.tobytes()).hexdigest()

    @staticmethod
    def _make_crop_id(image_hash: str, bbox: BBox) -> str:
        """Generate a stable, unique crop ID from image hash and bbox coords."""
        raw = f"{image_hash}_{bbox.x1}_{bbox.y1}_{bbox.x2}_{bbox.y2}"
        return hashlib.sha1(raw.encode()).hexdigest()

    def _run_inference(self, image: np.ndarray, image_hash: str) -> list[Detection]:
        """Run YOLO inference and convert results to Detection objects."""
        results = self._model.predict(
            source=image,
            conf=self._config.conf_threshold,
            iou=self._config.iou_threshold,
            device=self._device,
            verbose=False,
        )

        detections: list[Detection] = []

        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue

            # boxes.xyxy is Tensor of shape (N, 4), boxes.conf is (N,).
            xyxy = boxes.xyxy.cpu().numpy()
            confs = boxes.conf.cpu().numpy()

            for i in range(len(xyxy)):
                x1, y1, x2, y2 = xyxy[i].tolist()
                score = float(confs[i])

                bbox = BBox(x1=x1, y1=y1, x2=x2, y2=y2, score=score)
                crop_id = self._make_crop_id(image_hash, bbox)
                detections.append(Detection(bbox=bbox, crop_id=crop_id))

        return detections
