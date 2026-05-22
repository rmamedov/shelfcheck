"""Application configuration via pydantic-settings.

All paths, thresholds, and model parameters are configured here.
Nothing is hardcoded in module code.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DetectorConfig(BaseSettings):
    weights: Path = Path("models/yolo11x_shelf.pt")
    conf_threshold: float = 0.25
    iou_threshold: float = 0.5
    min_bbox_area: float = 800.0
    expected_shelf_count: int | None = None  # None = auto-detect


class EncoderConfig(BaseSettings):
    backbone: Literal["dinov2_vitb14", "openclip_vitl14"] = "dinov2_vitb14"
    embedding_dim: int = 768
    batch_size: int = 64
    cache_path: Path = Path(".cache/embeddings.sqlite")


class GalleryConfig(BaseSettings):
    index_path: Path = Path("models/gallery_v1.faiss")
    metadata_path: Path = Path("models/gallery_v1.meta.json")
    top_k: int = 5


class RecognizeConfig(BaseSettings):
    distance_threshold: float = 0.35
    margin_threshold: float = 0.05


class APIConfig(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8001
    workers: int = 1


class AppConfig(BaseSettings):
    """Root configuration, aggregates all sub-configs."""

    model_config = SettingsConfigDict(
        env_prefix="SHELF_RECO_",
        env_nested_delimiter="__",
        yaml_file="configs/default.yaml",
    )

    device: str = "cuda"  # auto-fallback to cpu at runtime
    base_dir: Path = Path(".")

    detector: DetectorConfig = Field(default_factory=DetectorConfig)
    encoder: EncoderConfig = Field(default_factory=EncoderConfig)
    gallery: GalleryConfig = Field(default_factory=GalleryConfig)
    recognize: RecognizeConfig = Field(default_factory=RecognizeConfig)
    api: APIConfig = Field(default_factory=APIConfig)

    def resolve_path(self, p: Path) -> Path:
        """Resolve a relative path against base_dir."""
        if p.is_absolute():
            return p
        return self.base_dir / p


def get_config(config_path: Path | None = None) -> AppConfig:
    """Load configuration, optionally from a YAML file."""
    import yaml

    if config_path and config_path.exists():
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        return AppConfig(**data)
    return AppConfig()


def resolve_device(requested: str) -> str:
    """Resolve device string, falling back to CPU if CUDA unavailable."""
    import torch

    if requested == "cuda" and not torch.cuda.is_available():
        import logging

        logging.getLogger("shelf_reco.config").warning(
            "CUDA requested but not available, falling back to CPU"
        )
        return "cpu"
    return requested
