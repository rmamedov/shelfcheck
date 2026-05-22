"""Unit tests for detection postprocessing."""

from shelf_reco.schemas import BBox, Detection


def _make_det(x1: float, y1: float, x2: float, y2: float, score: float = 0.9) -> Detection:
    return Detection(
        bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2, score=score),
        crop_id=f"test_{x1}_{y1}",
    )


class TestFilterByArea:
    def test_filters_small(self) -> None:
        from shelf_reco.detect.postprocess import filter_by_area

        dets = [
            _make_det(0, 0, 10, 10),  # area = 100
            _make_det(0, 0, 100, 100),  # area = 10000
            _make_det(0, 0, 5, 5),  # area = 25
        ]
        result = filter_by_area(dets, min_area=500)
        assert len(result) == 1
        assert result[0].bbox.area == 10000

    def test_keeps_all_above_threshold(self) -> None:
        from shelf_reco.detect.postprocess import filter_by_area

        dets = [_make_det(0, 0, 100, 100), _make_det(50, 50, 200, 200)]
        result = filter_by_area(dets, min_area=100)
        assert len(result) == 2


class TestComputeIoU:
    def test_no_overlap(self) -> None:
        from shelf_reco.detect.postprocess import compute_iou

        a = BBox(x1=0, y1=0, x2=10, y2=10, score=0.9)
        b = BBox(x1=20, y1=20, x2=30, y2=30, score=0.9)
        assert compute_iou(a, b) == 0.0

    def test_perfect_overlap(self) -> None:
        from shelf_reco.detect.postprocess import compute_iou

        a = BBox(x1=0, y1=0, x2=10, y2=10, score=0.9)
        assert compute_iou(a, a) == 1.0

    def test_partial_overlap(self) -> None:
        from shelf_reco.detect.postprocess import compute_iou

        a = BBox(x1=0, y1=0, x2=10, y2=10, score=0.9)
        b = BBox(x1=5, y1=5, x2=15, y2=15, score=0.9)
        iou = compute_iou(a, b)
        # Intersection = 5*5=25, Union = 100+100-25=175
        assert abs(iou - 25 / 175) < 1e-6


class TestAssignShelfRows:
    def test_two_shelves(self) -> None:
        from shelf_reco.detect.postprocess import assign_shelf_rows

        dets = [
            _make_det(0, 0, 50, 50),  # center_y=25 -> top
            _make_det(60, 0, 110, 50),  # center_y=25 -> top
            _make_det(0, 200, 50, 250),  # center_y=225 -> bottom
            _make_det(60, 200, 110, 250),  # center_y=225 -> bottom
        ]
        result = assign_shelf_rows(dets, expected_count=2)
        top_rows = [d.shelf_row for d in result if d.bbox.center_y < 100]
        bot_rows = [d.shelf_row for d in result if d.bbox.center_y > 100]
        assert all(r == 0 for r in top_rows)
        assert all(r == 1 for r in bot_rows)
