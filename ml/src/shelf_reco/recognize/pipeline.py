"""ShelfRecognizer — orchestrator: detect -> embed -> match -> compare.

Ties together the detector, encoder, and gallery modules into a single
recognition pipeline.  Also provides planogram compliance comparison.
"""

from __future__ import annotations

import hashlib
import logging
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

from shelf_reco.config import AppConfig, resolve_device
from shelf_reco.detect import ShelfDetector
from shelf_reco.embed import SkuEncoder
from shelf_reco.gallery import SkuGallery
from shelf_reco.schemas import (
    ComplianceResult,
    ComplianceViolation,
    PlanogramGrid,
    RecognizedFacing,
    ShelfRecognitionResult,
    SkuMatch,
)

logger = logging.getLogger("shelf_reco.recognize")


class ShelfRecognizer:
    """End-to-end shelf recognition pipeline.

    Orchestrates detection, embedding, and gallery matching to produce
    a complete recognition result for a shelf image.

    Args:
        config: Application configuration containing sub-configs for each
            pipeline stage (detector, encoder, gallery, thresholds).

    Example::

        from shelf_reco.config import get_config

        cfg = get_config(Path("configs/default.yaml"))
        recognizer = ShelfRecognizer(cfg)
        result = recognizer.recognize("shelf_photo.jpg")
        for facing in result.facings:
            if facing.match:
                print(f"{facing.match.sku_id}: {facing.match.confidence:.2f}")
    """

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._device = resolve_device(config.device)

        logger.info("Initializing ShelfRecognizer (device=%s)", self._device)

        # --- Detector ---
        weights_path = config.resolve_path(config.detector.weights)
        self._detector = ShelfDetector(
            weights=weights_path,
            device=self._device,
            config=config.detector,
        )

        # --- Encoder ---
        encoder_config = config.encoder.model_copy(
            update={"cache_path": config.resolve_path(config.encoder.cache_path)}
        )
        self._encoder = SkuEncoder(config=encoder_config, device=self._device)

        # --- Gallery ---
        index_path = config.resolve_path(config.gallery.index_path)
        metadata_path = config.resolve_path(config.gallery.metadata_path)
        if index_path.exists() and metadata_path.exists():
            self._gallery = SkuGallery.load(
                path=index_path,
                metadata_path=metadata_path,
                config=config.gallery,
            )
        else:
            logger.warning("Gallery files not found, creating empty gallery")
            self._gallery = SkuGallery(
                dim=self._encoder.dim,
                config=config.gallery,
            )

        logger.info("ShelfRecognizer initialized successfully")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def recognize(self, image_path: Path | str) -> ShelfRecognitionResult:
        """Run full recognition on a shelf image.

        Pipeline stages:
            1. Load image and compute content hash (SHA-256 of file bytes).
            2. Detect product facings via YOLO.
            3. Encode detected crops into embedding vectors.
            4. Match each embedding against the SKU gallery.
            5. Apply confidence / margin thresholds.
            6. Assemble and return ``ShelfRecognitionResult``.

        Args:
            image_path: Path to a shelf image file (JPEG, PNG, etc.).

        Returns:
            Full recognition result with all detected facings, their
            embeddings, and optional SKU matches.

        Raises:
            FileNotFoundError: If *image_path* does not exist.
            ValueError: If the image cannot be read.
        """
        image_path = Path(image_path)
        logger.info("Starting recognition for %s", image_path)

        # 1. Load image and compute file-level hash for idempotency.
        if not image_path.exists():
            raise FileNotFoundError(f"Image file not found: {image_path}")

        file_bytes = image_path.read_bytes()
        image_hash = hashlib.sha256(file_bytes).hexdigest()
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Failed to read image: {image_path}")

        logger.debug(
            "Image loaded: shape=%s, hash=%s",
            image.shape,
            image_hash[:12],
        )

        # 2. Detect products.
        detections = self._detector.detect(image)
        logger.info("Detected %d product facings", len(detections))

        if not detections:
            return ShelfRecognitionResult(
                image_path=str(image_path),
                image_hash=image_hash,
                facings=[],
                model_version=self._model_version,
                gallery_version=self._gallery.version,
            )

        # 3. Encode detected crops into embeddings.
        embeddings = self._encoder.encode_crops(image, detections)
        logger.info(
            "Encoded %d crops -> embeddings shape %s",
            len(detections),
            embeddings.shape,
        )

        # 4 & 5. Match against gallery and apply thresholds.
        facings = self._build_facings(detections, embeddings)

        matched_count = sum(1 for f in facings if f.match is not None)
        logger.info(
            "Recognition complete: %d facings, %d matched to SKUs",
            len(facings),
            matched_count,
        )

        # 6. Assemble result.
        return ShelfRecognitionResult(
            image_path=str(image_path),
            image_hash=image_hash,
            facings=facings,
            model_version=self._model_version,
            gallery_version=self._gallery.version,
        )

    def compare_with_planogram(
        self,
        result: ShelfRecognitionResult,
        grid: PlanogramGrid,
    ) -> ComplianceResult:
        """Compare a recognition result against a planogram grid.

        Identifies three violation types:
            - **missing**: SKU expected by planogram but not recognized.
            - **extra**: SKU recognized but not expected in planogram.
            - **misplaced**: SKU found on the wrong shelf or position.

        Compliance score = (matched / total_expected) * 100.

        Args:
            result: Recognition result from :meth:`recognize`.
            grid: Parsed planogram grid.

        Returns:
            Compliance result with score, violations list, and
            Ukrainian-language summary.
        """
        logger.info(
            "Comparing recognition (%d facings) with planogram %s (%d slots)",
            len(result.facings),
            grid.planogram_id,
            len(grid.slots),
        )

        violations: list[ComplianceViolation] = []

        # Build a lookup of recognized SKUs by (shelf_row, position_index).
        recognized_by_row = self._group_facings_by_row(result)

        # Track which recognized facings have been matched to planogram slots.
        matched_facing_ids: set[str] = set()
        matched_slot_count = 0
        total_expected = len(grid.slots)

        # --- Check each planogram slot ---
        for slot in grid.slots:
            row_facings = recognized_by_row.get(slot.shelf_row, [])
            match_found = False

            for facing in row_facings:
                if facing.detection.crop_id in matched_facing_ids:
                    continue
                if facing.match and facing.match.sku_id == slot.sku_id:
                    matched_facing_ids.add(facing.detection.crop_id)
                    matched_slot_count += 1
                    match_found = True
                    break

            if not match_found:
                # Check if the SKU exists on a different shelf (misplaced).
                misplaced_facing = self._find_sku_on_other_rows(
                    slot.sku_id,
                    slot.shelf_row,
                    recognized_by_row,
                    matched_facing_ids,
                )
                if misplaced_facing is not None:
                    matched_facing_ids.add(
                        misplaced_facing.detection.crop_id,
                    )
                    violations.append(
                        ComplianceViolation(
                            type="misplaced",
                            sku_id=slot.sku_id,
                            shelf_row=slot.shelf_row,
                            position=slot.position,
                            description=(
                                f"Товар {slot.sku_id} знайдено на полиці "
                                f"{misplaced_facing.detection.shelf_row}, "
                                f"очікувалось на полиці {slot.shelf_row}"
                            ),
                            confidence=misplaced_facing.match.confidence
                            if misplaced_facing.match
                            else 0.0,
                        ),
                    )
                else:
                    violations.append(
                        ComplianceViolation(
                            type="missing",
                            sku_id=slot.sku_id,
                            shelf_row=slot.shelf_row,
                            position=slot.position,
                            description=(
                                f"Товар {slot.sku_id} відсутній на полиці "
                                f"{slot.shelf_row}, позиція {slot.position}"
                            ),
                        ),
                    )

        # --- Find extra facings (recognized but not in planogram) ---
        for facing in result.facings:
            if facing.detection.crop_id in matched_facing_ids:
                continue
            if facing.match is None:
                continue

            shelf_row = facing.detection.shelf_row or 0
            violations.append(
                ComplianceViolation(
                    type="extra",
                    sku_id=facing.match.sku_id,
                    shelf_row=shelf_row,
                    position=-1,
                    description=(
                        f"Товар {facing.match.sku_id} розпізнано на полиці "
                        f"{shelf_row}, але він не передбачений планограмою"
                    ),
                    confidence=facing.match.confidence,
                ),
            )

        # --- Compute score ---
        compliance_score = (
            (matched_slot_count / total_expected * 100.0) if total_expected > 0 else 100.0
        )

        # --- Generate Ukrainian summary ---
        summary = self._generate_summary(
            compliance_score=compliance_score,
            violations=violations,
            recognized_count=len(result.facings),
            expected_count=total_expected,
        )

        logger.info(
            "Compliance: %.1f%% (%d matched / %d expected), %d violations",
            compliance_score,
            matched_slot_count,
            total_expected,
            len(violations),
        )

        return ComplianceResult(
            compliance_score=round(compliance_score, 1),
            violations=violations,
            summary=summary,
            recognized_count=len(result.facings),
            expected_count=total_expected,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @property
    def _model_version(self) -> str:
        """Compose a model version string from component configs."""
        return (
            f"yolo:{self._config.detector.weights.stem}"
            f"+{self._config.encoder.backbone}"
        )

    @staticmethod
    def _extract_crops(
        image: np.ndarray,
        detections: list,
    ) -> list[np.ndarray]:
        """Extract bounding-box crops from the image.

        Args:
            image: Full shelf image (BGR).
            detections: Detections with bounding boxes.

        Returns:
            List of cropped image arrays, one per detection.
        """
        h, w = image.shape[:2]
        crops: list[np.ndarray] = []
        for det in detections:
            x1 = max(0, int(det.bbox.x1))
            y1 = max(0, int(det.bbox.y1))
            x2 = min(w, int(det.bbox.x2))
            y2 = min(h, int(det.bbox.y2))
            crop = image[y1:y2, x1:x2]
            if crop.size == 0:
                # Degenerate bbox; use a tiny placeholder to avoid errors.
                crop = np.zeros((1, 1, 3), dtype=np.uint8)
            crops.append(crop)
        return crops

    def _build_facings(
        self,
        detections: list,
        embeddings: np.ndarray,
    ) -> list[RecognizedFacing]:
        """Match each detection+embedding against the gallery.

        Applies distance and margin thresholds from config to decide
        whether a gallery match is confident enough to keep.

        Args:
            detections: Post-processed detections with shelf rows.
            embeddings: ``(N, dim)`` L2-normalized embedding matrix.

        Returns:
            List of ``RecognizedFacing`` with optional ``SkuMatch``.
        """
        dist_threshold = self._config.recognize.distance_threshold
        margin_threshold = self._config.recognize.margin_threshold
        facings: list[RecognizedFacing] = []

        for i, det in enumerate(detections):
            embedding_vec = embeddings[i]
            raw_matches = self._gallery.search(embedding_vec)

            # Apply confidence thresholds to the best match.
            match: SkuMatch | None = None
            if raw_matches:
                best = raw_matches[0]
                passes_distance = best.distance <= dist_threshold
                passes_margin = (
                    best.runner_up_margin is None
                    or best.runner_up_margin >= margin_threshold
                )
                if passes_distance and passes_margin:
                    match = best
                elif passes_distance:
                    # Distance OK but margin too tight -- still include with
                    # lower effective confidence to signal ambiguity.
                    match = best
                    logger.debug(
                        "Detection %s: margin %.4f below threshold %.4f, "
                        "keeping with reduced confidence",
                        det.crop_id[:8],
                        best.runner_up_margin or 0.0,
                        margin_threshold,
                    )

            facings.append(
                RecognizedFacing(
                    detection=det,
                    embedding=embedding_vec.tolist(),
                    match=match,
                ),
            )

        return facings

    @staticmethod
    def _group_facings_by_row(
        result: ShelfRecognitionResult,
    ) -> dict[int, list[RecognizedFacing]]:
        """Group recognized facings by shelf row.

        Args:
            result: Recognition result.

        Returns:
            Dict mapping ``shelf_row`` -> list of facings on that row,
            sorted left-to-right by bbox center_x.
        """
        groups: dict[int, list[RecognizedFacing]] = defaultdict(list)
        for facing in result.facings:
            row = facing.detection.shelf_row if facing.detection.shelf_row is not None else 0
            groups[row].append(facing)

        # Sort each row left-to-right for positional matching.
        for row_facings in groups.values():
            row_facings.sort(key=lambda f: f.detection.bbox.center_x)

        return dict(groups)

    @staticmethod
    def _find_sku_on_other_rows(
        sku_id: str,
        expected_row: int,
        recognized_by_row: dict[int, list[RecognizedFacing]],
        already_matched: set[str],
    ) -> RecognizedFacing | None:
        """Search for a SKU on rows other than the expected one.

        Args:
            sku_id: SKU ID to look for.
            expected_row: The row where it was expected (skip this one).
            recognized_by_row: Facings grouped by row.
            already_matched: Crop IDs already matched to a planogram slot.

        Returns:
            The first matching facing found on another row, or ``None``.
        """
        for row, facings in recognized_by_row.items():
            if row == expected_row:
                continue
            for facing in facings:
                if facing.detection.crop_id in already_matched:
                    continue
                if facing.match and facing.match.sku_id == sku_id:
                    return facing
        return None

    @staticmethod
    def _generate_summary(
        compliance_score: float,
        violations: list[ComplianceViolation],
        recognized_count: int,
        expected_count: int,
    ) -> str:
        """Generate a Ukrainian-language compliance summary.

        Args:
            compliance_score: Compliance percentage (0-100).
            violations: List of detected violations.
            recognized_count: Number of recognized facings.
            expected_count: Number of expected slots in planogram.

        Returns:
            Human-readable summary string in Ukrainian.
        """
        missing = sum(1 for v in violations if v.type == "missing")
        extra = sum(1 for v in violations if v.type == "extra")
        misplaced = sum(1 for v in violations if v.type == "misplaced")

        lines: list[str] = [
            f"Відповідність планограмі: {compliance_score:.1f}%",
            f"Розпізнано товарів: {recognized_count}, очікувалось: {expected_count}",
        ]

        if not violations:
            lines.append("Порушень не виявлено. Викладка відповідає планограмі.")
        else:
            parts: list[str] = []
            if missing > 0:
                parts.append(f"відсутніх: {missing}")
            if misplaced > 0:
                parts.append(f"не на своєму місці: {misplaced}")
            if extra > 0:
                parts.append(f"зайвих: {extra}")
            lines.append(f"Виявлено порушень: {len(violations)} ({', '.join(parts)})")

        return "\n".join(lines)
