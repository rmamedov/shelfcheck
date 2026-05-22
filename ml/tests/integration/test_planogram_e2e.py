"""Integration test: planogram parsing end-to-end."""

from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


class TestPlanogramE2E:
    def test_parse_sample_planogram(self) -> None:
        from shelf_reco.planogram.parser import PlanogramParser
        from shelf_reco.schemas import PlanogramGrid

        parser = PlanogramParser()
        planogram_path = FIXTURES_DIR / "sample_planogram.json"
        assert planogram_path.exists(), f"Fixture not found: {planogram_path}"

        grid = parser.parse(planogram_path)

        assert isinstance(grid, PlanogramGrid)
        assert grid.planogram_id == "test_plan_001"
        assert grid.fixture_id == "shelf_softdrinks_1"
        assert grid.shelf_count == 3
        assert grid.source_format == "json_v1"

        # Check total slots (facings expanded: 3+2+2+2+2+3+4+2 = 20)
        assert len(grid.slots) == 20

        # Check shelf rows (expanded facings)
        row0 = [s for s in grid.slots if s.shelf_row == 0]
        row1 = [s for s in grid.slots if s.shelf_row == 1]
        row2 = [s for s in grid.slots if s.shelf_row == 2]
        assert len(row0) == 7  # 3+2+2
        assert len(row1) == 7  # 2+2+3
        assert len(row2) == 6  # 4+2

        # Check positions are sequential
        for row_slots in [row0, row1, row2]:
            positions = sorted(s.position for s in row_slots)
            assert positions == list(range(len(row_slots)))

        # Check specific SKUs
        sku_ids = {s.sku_id for s in grid.slots}
        assert "COCA_COLA_05" in sku_ids
        assert "MORSHYNSKA_15" in sku_ids

    def test_planogram_json_roundtrip(self) -> None:
        from shelf_reco.planogram.parser import PlanogramParser
        from shelf_reco.schemas import PlanogramGrid

        parser = PlanogramParser()
        grid = parser.parse(FIXTURES_DIR / "sample_planogram.json")

        # Serialize and validate
        data = grid.model_dump()
        restored = PlanogramGrid.model_validate(data)
        assert restored.planogram_id == grid.planogram_id
        assert len(restored.slots) == len(grid.slots)
