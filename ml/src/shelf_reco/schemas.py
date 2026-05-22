"""Pydantic models — single source of truth for all data contracts.

Every module imports from here. Do NOT duplicate definitions elsewhere.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BBox(BaseModel):
    """Bounding box in pixels, xyxy format."""

    x1: float
    y1: float
    x2: float
    y2: float
    score: float = Field(ge=0.0, le=1.0)

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center_x(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def center_y(self) -> float:
        return (self.y1 + self.y2) / 2.0


class Detection(BaseModel):
    """A single detected product facing on a shelf photo."""

    bbox: BBox
    shelf_row: int | None = None  # 0 = top shelf, filled by postprocess
    crop_id: str  # stable ID for embedding cache


class SkuMatch(BaseModel):
    """Result of matching an embedding against the SKU gallery."""

    sku_id: str
    distance: float  # cosine distance, 0 = perfect match
    confidence: float = Field(ge=0.0, le=1.0)
    runner_up_sku: str | None = None
    runner_up_margin: float | None = None  # for threshold calibration


class RecognizedFacing(BaseModel):
    """A detected facing with its embedding and optional SKU match."""

    detection: Detection
    embedding: list[float]  # L2-normalized, dim from config
    match: SkuMatch | None  # None if below confidence threshold


class ShelfRecognitionResult(BaseModel):
    """Full recognition result for a shelf image."""

    image_path: str
    image_hash: str  # SHA-256, for idempotency
    facings: list[RecognizedFacing]
    model_version: str
    gallery_version: str


class PlanogramSlot(BaseModel):
    """A single slot in a planogram grid."""

    shelf_row: int  # 0 = top shelf
    position: int  # left-to-right, 0-indexed
    sku_id: str
    facings: int = Field(ge=1)  # expected number of facings
    width_units: float | None = None
    height_units: float | None = None


class PlanogramGrid(BaseModel):
    """Normalized planogram representation."""

    planogram_id: str
    fixture_id: str | None = None
    shelf_count: int
    slots: list[PlanogramSlot]
    source_format: Literal["json_v1", "spaceman_xml", "custom"]
    metadata: dict[str, str | int | float | bool] = {}


class ComplianceViolation(BaseModel):
    """A violation found by comparing recognition result with planogram."""

    type: Literal["missing", "misplaced", "extra"]
    sku_id: str
    product_name: str | None = None
    shelf_row: int
    position: int
    description: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)


class ComplianceResult(BaseModel):
    """Result of comparing shelf recognition with planogram."""

    compliance_score: float = Field(ge=0.0, le=100.0)
    violations: list[ComplianceViolation]
    summary: str
    recognized_count: int
    expected_count: int
