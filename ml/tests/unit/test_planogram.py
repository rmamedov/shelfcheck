"""Unit tests for planogram parser."""

import json
import tempfile
from pathlib import Path

import pytest


SAMPLE_PLANOGRAM = {
    "planogram_id": "plan_001",
    "fixture_id": "shelf_A1",
    "shelves": [
        {
            "row": 0,
            "slots": [
                {"sku_id": "SKU001", "facings": 2, "width_units": 1.5},
                {"sku_id": "SKU002", "facings": 1, "width_units": 1.0},
            ],
        },
        {
            "row": 1,
            "slots": [
                {"sku_id": "SKU003", "facings": 3},
                {"sku_id": "SKU004", "facings": 1},
            ],
        },
    ],
}


class TestPlanogramParser:
    def test_parse_dict(self) -> None:
        from shelf_reco.planogram.parser import PlanogramParser

        parser = PlanogramParser()
        grid = parser.parse(SAMPLE_PLANOGRAM)
        assert grid.planogram_id == "plan_001"
        assert grid.fixture_id == "shelf_A1"
        assert grid.shelf_count == 2
        # 4 slots total, but facings expand: 2+1+3+1 = 7 individual positions
        assert len(grid.slots) == 7
        assert grid.source_format == "json_v1"

    def test_parse_file(self) -> None:
        from shelf_reco.planogram.parser import PlanogramParser

        parser = PlanogramParser()
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(SAMPLE_PLANOGRAM, f)
            f.flush()
            grid = parser.parse(Path(f.name))
        assert grid.planogram_id == "plan_001"
        assert len(grid.slots) == 7

    def test_positions_assigned_correctly(self) -> None:
        from shelf_reco.planogram.parser import PlanogramParser

        parser = PlanogramParser()
        grid = parser.parse(SAMPLE_PLANOGRAM)
        row0_slots = [s for s in grid.slots if s.shelf_row == 0]
        positions = [s.position for s in row0_slots]
        # Row 0: SKU001 x2 facings + SKU002 x1 facing = positions 0,1,2
        assert positions == [0, 1, 2]

    def test_invalid_planogram(self) -> None:
        from shelf_reco.planogram.parser import PlanogramParser

        parser = PlanogramParser()
        with pytest.raises((ValueError, KeyError)):
            parser.parse({"invalid": "data"})

    def test_parse_string(self) -> None:
        from shelf_reco.planogram.parser import PlanogramParser

        parser = PlanogramParser()
        grid = parser.parse(json.dumps(SAMPLE_PLANOGRAM))
        assert grid.planogram_id == "plan_001"
