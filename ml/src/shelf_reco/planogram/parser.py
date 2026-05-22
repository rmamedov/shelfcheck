"""Planogram parser — convert JSON planogram definitions into PlanogramGrid.

Supports the ``json_v1`` format, where shelves are described as a list of
rows, each containing ordered slots with SKU IDs and facing counts.

Expected input format::

    {
        "planogram_id": "plan-001",
        "fixture_id": "fixture-A",
        "shelves": [
            {
                "row": 0,
                "slots": [
                    {"sku_id": "SKU-001", "facings": 2, "width_units": 1.5},
                    {"sku_id": "SKU-002", "facings": 1}
                ]
            },
            ...
        ]
    }
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from shelf_reco.schemas import PlanogramGrid, PlanogramSlot

logger = logging.getLogger("shelf_reco.planogram")


class PlanogramParseError(Exception):
    """Raised when planogram data is structurally invalid."""


class PlanogramParser:
    """Parse JSON planogram definitions into ``PlanogramGrid`` objects.

    The parser validates the input structure, expands facing counts into
    individual slots with sequential positions, and computes shelf metadata.

    Example::

        parser = PlanogramParser()
        grid = parser.parse("planogram.json")
        for slot in grid.slots:
            print(f"Row {slot.shelf_row}, pos {slot.position}: {slot.sku_id}")
    """

    def parse(self, data: dict[str, Any] | Path | str) -> PlanogramGrid:
        """Parse planogram data into a ``PlanogramGrid``.

        Args:
            data: One of:
                - A ``dict`` with the planogram structure.
                - A ``Path`` or ``str`` pointing to a JSON file.

        Returns:
            Validated and normalized ``PlanogramGrid``.

        Raises:
            PlanogramParseError: If the data structure is invalid.
            FileNotFoundError: If a file path is given and does not exist.
            json.JSONDecodeError: If the file contains invalid JSON.
        """
        raw = self._load(data)
        self._validate_structure(raw)
        return self._build_grid(raw)

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    @staticmethod
    def _load(data: dict[str, Any] | Path | str) -> dict[str, Any]:
        """Normalize input to a dict, loading from file or parsing JSON.

        Args:
            data: Raw planogram data, a file path, or a JSON string.

        Returns:
            Parsed dict.

        Raises:
            FileNotFoundError: If a file path does not exist.
            json.JSONDecodeError: If content is not valid JSON.
            PlanogramParseError: If loaded data is not a dict.
        """
        if isinstance(data, Path):
            if not data.exists():
                raise FileNotFoundError(f"Planogram file not found: {data}")
            logger.info("Loading planogram from %s", data)
            with open(data, encoding="utf-8") as f:
                loaded = json.load(f)
        elif isinstance(data, str):
            # Try as file path first, then as JSON string.
            path = Path(data)
            if path.exists():
                logger.info("Loading planogram from %s", path)
                with open(path, encoding="utf-8") as f:
                    loaded = json.load(f)
            else:
                loaded = json.loads(data)
        else:
            loaded = data

        if not isinstance(loaded, dict):
            raise PlanogramParseError(
                f"Expected a JSON object at the top level, got {type(loaded).__name__}"
            )
        return loaded

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_structure(data: dict[str, Any]) -> None:
        """Validate required fields and structural constraints.

        Args:
            data: Raw planogram dict.

        Raises:
            PlanogramParseError: On validation failure.
        """
        # Required top-level fields.
        if "planogram_id" not in data:
            raise PlanogramParseError("Missing required field: 'planogram_id'")

        if "shelves" not in data:
            raise PlanogramParseError("Missing required field: 'shelves'")

        shelves = data["shelves"]
        if not isinstance(shelves, list):
            raise PlanogramParseError(
                f"'shelves' must be a list, got {type(shelves).__name__}"
            )

        if len(shelves) == 0:
            raise PlanogramParseError("'shelves' must not be empty")

        seen_rows: set[int] = set()
        for i, shelf in enumerate(shelves):
            if not isinstance(shelf, dict):
                raise PlanogramParseError(
                    f"shelves[{i}] must be a dict, got {type(shelf).__name__}"
                )

            if "row" not in shelf:
                raise PlanogramParseError(f"shelves[{i}] missing required field: 'row'")

            row = shelf["row"]
            if not isinstance(row, int) or row < 0:
                raise PlanogramParseError(
                    f"shelves[{i}].row must be a non-negative integer, got {row!r}"
                )

            if row in seen_rows:
                raise PlanogramParseError(f"Duplicate shelf row: {row}")
            seen_rows.add(row)

            if "slots" not in shelf:
                raise PlanogramParseError(f"shelves[{i}] missing required field: 'slots'")

            slots = shelf["slots"]
            if not isinstance(slots, list):
                raise PlanogramParseError(
                    f"shelves[{i}].slots must be a list, got {type(slots).__name__}"
                )

            for j, slot in enumerate(slots):
                if not isinstance(slot, dict):
                    raise PlanogramParseError(
                        f"shelves[{i}].slots[{j}] must be a dict"
                    )
                if "sku_id" not in slot:
                    raise PlanogramParseError(
                        f"shelves[{i}].slots[{j}] missing required field: 'sku_id'"
                    )
                facings = slot.get("facings", 1)
                if not isinstance(facings, int) or facings < 1:
                    raise PlanogramParseError(
                        f"shelves[{i}].slots[{j}].facings must be a positive integer, "
                        f"got {facings!r}"
                    )

        logger.debug(
            "Planogram structure validated: %d shelves, rows %s",
            len(shelves),
            sorted(seen_rows),
        )

    # ------------------------------------------------------------------
    # Grid construction
    # ------------------------------------------------------------------

    @staticmethod
    def _build_grid(data: dict[str, Any]) -> PlanogramGrid:
        """Convert validated data into a ``PlanogramGrid``.

        Each slot in the input is expanded by its ``facings`` count into
        individual ``PlanogramSlot`` entries with sequential ``position``
        indices within each shelf row.

        Args:
            data: Validated planogram dict.

        Returns:
            Constructed ``PlanogramGrid``.
        """
        planogram_id: str = data["planogram_id"]
        fixture_id: str | None = data.get("fixture_id")
        shelves_data: list[dict[str, Any]] = data["shelves"]

        all_slots: list[PlanogramSlot] = []
        max_row = 0

        # Sort shelves by row to ensure deterministic ordering.
        sorted_shelves = sorted(shelves_data, key=lambda s: s["row"])

        for shelf in sorted_shelves:
            row: int = shelf["row"]
            max_row = max(max_row, row)
            position = 0

            for slot_data in shelf["slots"]:
                sku_id: str = slot_data["sku_id"]
                facings: int = slot_data.get("facings", 1)
                width_units: float | None = slot_data.get("width_units")
                height_units: float | None = slot_data.get("height_units")

                # Expand facings: each individual facing gets its own
                # PlanogramSlot with a unique position index.
                for _ in range(facings):
                    all_slots.append(
                        PlanogramSlot(
                            shelf_row=row,
                            position=position,
                            sku_id=sku_id,
                            facings=1,
                            width_units=width_units,
                            height_units=height_units,
                        ),
                    )
                    position += 1

        shelf_count = max_row + 1

        # Extract extra metadata fields (anything not part of core schema).
        known_keys = {"planogram_id", "fixture_id", "shelves"}
        metadata = {k: v for k, v in data.items() if k not in known_keys}

        grid = PlanogramGrid(
            planogram_id=planogram_id,
            fixture_id=fixture_id,
            shelf_count=shelf_count,
            slots=all_slots,
            source_format="json_v1",
            metadata=metadata,
        )

        logger.info(
            "Parsed planogram %r: %d shelves, %d total slot positions",
            planogram_id,
            shelf_count,
            len(all_slots),
        )

        return grid


def parse_planogram(data: dict[str, Any] | Path | str) -> PlanogramGrid:
    """Convenience function — parse a planogram in one call.

    Equivalent to ``PlanogramParser().parse(data)``.

    Args:
        data: Planogram data as a dict, file path, or string path.

    Returns:
        Parsed ``PlanogramGrid``.

    Raises:
        PlanogramParseError: If data is structurally invalid.
        FileNotFoundError: If a file path does not exist.
    """
    return PlanogramParser().parse(data)
