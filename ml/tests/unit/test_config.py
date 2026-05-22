"""Unit tests for configuration."""

from pathlib import Path

from shelf_reco.config import AppConfig, DetectorConfig, EncoderConfig, GalleryConfig


class TestDetectorConfig:
    def test_defaults(self) -> None:
        cfg = DetectorConfig()
        assert cfg.conf_threshold == 0.25
        assert cfg.iou_threshold == 0.5
        assert cfg.min_bbox_area == 800.0
        assert cfg.expected_shelf_count is None


class TestEncoderConfig:
    def test_defaults(self) -> None:
        cfg = EncoderConfig()
        assert cfg.backbone == "dinov2_vitb14"
        assert cfg.embedding_dim == 768
        assert cfg.batch_size == 64


class TestGalleryConfig:
    def test_defaults(self) -> None:
        cfg = GalleryConfig()
        assert cfg.top_k == 5


class TestAppConfig:
    def test_defaults(self) -> None:
        cfg = AppConfig()
        assert cfg.device == "cuda"
        assert cfg.detector.conf_threshold == 0.25
        assert cfg.encoder.backbone == "dinov2_vitb14"

    def test_resolve_path_relative(self) -> None:
        cfg = AppConfig(base_dir=Path("/opt/models"))
        resolved = cfg.resolve_path(Path("weights/model.pt"))
        assert resolved == Path("/opt/models/weights/model.pt")

    def test_resolve_path_absolute(self) -> None:
        cfg = AppConfig(base_dir=Path("/opt/models"))
        resolved = cfg.resolve_path(Path("/absolute/path/model.pt"))
        assert resolved == Path("/absolute/path/model.pt")
