"""Planogram parsing and grid construction.

Public API:
    PlanogramParser  -- parse JSON planograms into PlanogramGrid
    parse_planogram  -- convenience function wrapping PlanogramParser
"""

from shelf_reco.planogram.parser import PlanogramParser, parse_planogram

__all__ = ["PlanogramParser", "parse_planogram"]
