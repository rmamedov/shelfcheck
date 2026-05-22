"""Unit tests for data contract schemas."""

import pytest
from shelf_reco.schemas import (
    BBox,
    ComplianceResult,
    ComplianceViolation,
    Detection,
    PlanogramGrid,
    PlanogramSlot,
    RecognizedFacing,
    ShelfRecognitionResult,
    SkuMatch,
)


class TestBBox:
    def test_basic_creation(self) -> None:
        bbox = BBox(x1=10, y1=20, x2=110, y2=120, score=0.9)
        assert bbox.width == 100
        assert bbox.height == 100
        assert bbox.area == 10000
        assert bbox.center_x == 60
        assert bbox.center_y == 70

    def test_score_bounds(self) -> None:
        with pytest.raises(Exception):
            BBox(x1=0, y1=0, x2=10, y2=10, score=1.5)
        with pytest.raises(Exception):
            BBox(x1=0, y1=0, x2=10, y2=10, score=-0.1)


class TestDetection:
    def test_creation(self) -> None:
        det = Detection(
            bbox=BBox(x1=10, y1=20, x2=110, y2=120, score=0.9),
            shelf_row=0,
            crop_id="abc123",
        )
        assert det.shelf_row == 0
        assert det.crop_id == "abc123"

    def test_shelf_row_none(self) -> None:
        det = Detection(
            bbox=BBox(x1=0, y1=0, x2=10, y2=10, score=0.5),
            crop_id="test",
        )
        assert det.shelf_row is None


class TestSkuMatch:
    def test_full_match(self) -> None:
        m = SkuMatch(
            sku_id="SKU001",
            distance=0.1,
            confidence=0.9,
            runner_up_sku="SKU002",
            runner_up_margin=0.15,
        )
        assert m.sku_id == "SKU001"
        assert m.runner_up_margin == 0.15

    def test_no_runner_up(self) -> None:
        m = SkuMatch(sku_id="SKU001", distance=0.05, confidence=0.95)
        assert m.runner_up_sku is None


class TestPlanogramGrid:
    def test_creation(self) -> None:
        grid = PlanogramGrid(
            planogram_id="plan_001",
            fixture_id="shelf_A1",
            shelf_count=3,
            slots=[
                PlanogramSlot(shelf_row=0, position=0, sku_id="SKU001", facings=2),
                PlanogramSlot(shelf_row=0, position=1, sku_id="SKU002", facings=1),
                PlanogramSlot(shelf_row=1, position=0, sku_id="SKU003", facings=3),
            ],
            source_format="json_v1",
        )
        assert grid.shelf_count == 3
        assert len(grid.slots) == 3


class TestRecognizedFacing:
    def test_with_match(self) -> None:
        facing = RecognizedFacing(
            detection=Detection(
                bbox=BBox(x1=0, y1=0, x2=50, y2=80, score=0.85),
                crop_id="test_crop",
            ),
            embedding=[0.1] * 768,
            match=SkuMatch(sku_id="SKU001", distance=0.1, confidence=0.9),
        )
        assert facing.match is not None
        assert facing.match.sku_id == "SKU001"

    def test_without_match(self) -> None:
        facing = RecognizedFacing(
            detection=Detection(
                bbox=BBox(x1=0, y1=0, x2=50, y2=80, score=0.85),
                crop_id="test_crop",
            ),
            embedding=[0.1] * 768,
            match=None,
        )
        assert facing.match is None


class TestShelfRecognitionResult:
    def test_serialization_roundtrip(self) -> None:
        result = ShelfRecognitionResult(
            image_path="/tmp/test.jpg",
            image_hash="abc123",
            facings=[],
            model_version="v0.1.0",
            gallery_version="v1_test",
        )
        data = result.model_dump()
        restored = ShelfRecognitionResult.model_validate(data)
        assert restored.image_hash == result.image_hash


class TestComplianceResult:
    def test_creation(self) -> None:
        result = ComplianceResult(
            compliance_score=75.0,
            violations=[
                ComplianceViolation(
                    type="missing",
                    sku_id="SKU001",
                    product_name="Coca-Cola 0.5L",
                    shelf_row=0,
                    position=2,
                    description="Товар відсутній на полиці",
                    confidence=0.85,
                ),
            ],
            summary="Знайдено 1 порушення",
            recognized_count=10,
            expected_count=12,
        )
        assert result.compliance_score == 75.0
        assert len(result.violations) == 1
