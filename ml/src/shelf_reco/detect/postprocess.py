"""Postprocessing utilities for shelf detections.

Handles NMS (safety net), minimum area filtering, and shelf-row assignment
via k-means clustering on y-centers.
"""

from __future__ import annotations

import logging

import numpy as np

from shelf_reco.schemas import BBox, Detection

logger = logging.getLogger("shelf_reco.detect.postprocess")


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def compute_iou(a: BBox, b: BBox) -> float:
    """Compute Intersection-over-Union between two bounding boxes.

    Args:
        a: First bounding box.
        b: Second bounding box.

    Returns:
        IoU value in [0, 1].
    """
    inter_x1 = max(a.x1, b.x1)
    inter_y1 = max(a.y1, b.y1)
    inter_x2 = min(a.x2, b.x2)
    inter_y2 = min(a.y2, b.y2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    union_area = a.area + b.area - inter_area
    if union_area <= 0.0:
        return 0.0

    return inter_area / union_area


# ---------------------------------------------------------------------------
# NMS
# ---------------------------------------------------------------------------


def nms(detections: list[Detection], iou_threshold: float) -> list[Detection]:
    """Apply greedy Non-Maximum Suppression as a safety net.

    YOLO already performs NMS, but this ensures no duplicate boxes survive
    if, for example, overlapping tiles or multiple passes are used upstream.

    Args:
        detections: Raw detections (may contain overlaps).
        iou_threshold: Boxes with IoU above this are suppressed.

    Returns:
        Filtered detections, sorted by descending score.
    """
    if not detections:
        return []

    # Sort by score descending — keep highest-confidence boxes first.
    sorted_dets = sorted(detections, key=lambda d: d.bbox.score, reverse=True)
    keep: list[Detection] = []

    for det in sorted_dets:
        suppressed = False
        for kept in keep:
            if compute_iou(det.bbox, kept.bbox) > iou_threshold:
                suppressed = True
                break
        if not suppressed:
            keep.append(det)

    suppressed_count = len(detections) - len(keep)
    if suppressed_count > 0:
        logger.debug("NMS suppressed %d / %d detections", suppressed_count, len(detections))

    return keep


# ---------------------------------------------------------------------------
# Minimum bbox filter
# ---------------------------------------------------------------------------


def filter_by_area(detections: list[Detection], min_area: float) -> list[Detection]:
    """Remove detections whose bounding-box area falls below a threshold.

    This filters out noise detections (tiny partial boxes, edge artifacts).

    Args:
        detections: Input detections.
        min_area: Minimum bbox area in pixels^2.

    Returns:
        Detections whose ``bbox.area >= min_area``.
    """
    kept = [d for d in detections if d.bbox.area >= min_area]
    removed = len(detections) - len(kept)
    if removed > 0:
        logger.debug(
            "Area filter removed %d / %d detections (min_area=%.1f)",
            removed,
            len(detections),
            min_area,
        )
    return kept


# ---------------------------------------------------------------------------
# Shelf-row assignment
# ---------------------------------------------------------------------------


def _kmeans_1d(
    values: np.ndarray,
    k: int,
    *,
    max_iter: int = 100,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """Simple 1-D k-means (no sklearn dependency).

    Args:
        values: 1-D array of float values to cluster.
        k: Number of clusters.
        max_iter: Maximum iterations.
        seed: Random seed for reproducible centroid init.

    Returns:
        Tuple of (labels, centroids) — labels is shape ``(N,)`` with
        integer cluster assignments, centroids is shape ``(k,)``.
    """
    rng = np.random.RandomState(seed)
    n = len(values)

    if n <= k:
        # Degenerate case: fewer points than clusters.
        return np.arange(n, dtype=np.intp), values.copy()

    # Initialize centroids via k spread-out quantiles + small jitter to avoid
    # identical centroids when values are tightly clustered.
    quantile_positions = np.linspace(0, 1, k)
    centroids = np.quantile(values, quantile_positions).astype(np.float64)
    # Add tiny jitter to break ties when quantiles collapse.
    centroids += rng.uniform(-1e-6, 1e-6, size=k)

    labels = np.zeros(n, dtype=np.intp)

    for _ in range(max_iter):
        # Assign each point to the nearest centroid.
        distances = np.abs(values[:, np.newaxis] - centroids[np.newaxis, :])  # (N, k)
        new_labels = np.argmin(distances, axis=1)

        if np.array_equal(new_labels, labels):
            break
        labels = new_labels

        # Recompute centroids.
        for j in range(k):
            members = values[labels == j]
            if len(members) > 0:
                centroids[j] = members.mean()

    return labels, centroids


def _estimate_shelf_count(y_centers: np.ndarray) -> int:
    """Auto-detect the number of shelves from the y-center distribution.

    Uses a horizontal projection histogram: bin the y-centers, smooth,
    and count peaks. Falls back to 1 if detection is ambiguous.

    Args:
        y_centers: 1-D array of bbox y-center values.

    Returns:
        Estimated shelf count (>= 1).
    """
    if len(y_centers) < 2:
        return 1

    # Build histogram with adaptive bin count.
    y_range = float(y_centers.max() - y_centers.min())
    if y_range < 1e-3:
        # All detections at roughly the same height — single row.
        return 1

    n_bins = max(20, min(100, len(y_centers) // 2))
    counts, bin_edges = np.histogram(y_centers, bins=n_bins)

    # Smooth with a simple moving average (window=3) to reduce noise.
    kernel = np.ones(3) / 3.0
    smoothed = np.convolve(counts.astype(np.float64), kernel, mode="same")

    # Detect peaks: a bin is a peak if it is a local maximum and above
    # a minimum occupancy threshold.
    threshold = max(1.0, smoothed.max() * 0.15)
    peaks = 0
    for i in range(1, len(smoothed) - 1):
        if smoothed[i] > smoothed[i - 1] and smoothed[i] > smoothed[i + 1] and smoothed[i] >= threshold:
            peaks += 1

    # Edge case: if no interior peaks found, check whether the endpoints
    # are themselves peaks (common when shelves align with image edges).
    if peaks == 0:
        if len(smoothed) >= 2 and smoothed[0] >= threshold:
            peaks += 1
        if len(smoothed) >= 2 and smoothed[-1] >= threshold:
            peaks += 1

    shelf_count = max(1, peaks)
    logger.debug(
        "Auto-detected %d shelf row(s) from %d detections (y-range=%.0f)",
        shelf_count,
        len(y_centers),
        y_range,
    )
    return shelf_count


def assign_shelf_rows(
    detections: list[Detection],
    expected_count: int | None = None,
) -> list[Detection]:
    """Assign each detection to a shelf row via k-means on y-centers.

    Row 0 is the topmost shelf (smallest y), increasing downward.

    Args:
        detections: Input detections (``shelf_row`` may be None).
        expected_count: If given, use this as the number of clusters.
            If None, auto-detect from the y-center distribution.

    Returns:
        New list of Detection objects with ``shelf_row`` populated.
    """
    if not detections:
        return []

    y_centers = np.array([d.bbox.center_y for d in detections], dtype=np.float64)

    k = expected_count if expected_count is not None else _estimate_shelf_count(y_centers)
    k = max(1, min(k, len(detections)))  # Clamp to valid range.

    labels, centroids = _kmeans_1d(y_centers, k)

    # Map cluster indices so that row 0 = topmost shelf (lowest y centroid).
    sorted_centroid_indices = np.argsort(centroids)
    rank_map = np.empty_like(sorted_centroid_indices)
    rank_map[sorted_centroid_indices] = np.arange(len(sorted_centroid_indices))

    updated: list[Detection] = []
    for det, label in zip(detections, labels):
        row = int(rank_map[label])
        updated.append(det.model_copy(update={"shelf_row": row}))

    row_counts = np.bincount(rank_map[labels], minlength=k)
    logger.info(
        "Assigned %d detections to %d shelf rows (counts per row: %s)",
        len(detections),
        k,
        row_counts.tolist(),
    )

    return updated
