"""Vision backbone abstraction for embedding extraction.

Each backbone wraps a pretrained vision encoder and provides:
    - preprocess: BGR ndarray -> preprocessed torch.Tensor
    - encode: batch of preprocessed tensors -> embedding matrix
    - dim: output embedding dimensionality

Use ``EmbeddingBackbone.from_config`` to instantiate the correct backend.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import cv2
import numpy as np
import torch

logger = logging.getLogger("shelf_reco.embed.backbone")

# ImageNet normalization constants
_IMAGENET_MEAN = (0.485, 0.456, 0.406)
_IMAGENET_STD = (0.229, 0.224, 0.225)

# Standard input resolution for ViT models
_VIT_INPUT_SIZE = 224


class EmbeddingBackbone(ABC):
    """Abstract base class for vision embedding backbones.

    Subclasses must implement ``preprocess``, ``encode``, and ``dim``.
    Use the ``from_config`` factory to create the right backbone by name.
    """

    @abstractmethod
    def encode(self, images: torch.Tensor) -> torch.Tensor:
        """Encode a batch of preprocessed images into embeddings.

        Args:
            images: Preprocessed image batch, shape ``(B, C, H, W)``.

        Returns:
            Embedding matrix, shape ``(B, dim)``, float32.
        """

    @abstractmethod
    def preprocess(self, image: np.ndarray) -> torch.Tensor:
        """Preprocess a single BGR image for the backbone.

        Args:
            image: Raw image as ``np.ndarray`` in ``(H, W, C)`` BGR format.

        Returns:
            Preprocessed tensor, shape ``(C, H, W)``, ready for batching.
        """

    @property
    @abstractmethod
    def dim(self) -> int:
        """Dimensionality of the output embeddings."""

    @classmethod
    def from_config(cls, backbone_name: str, device: str) -> EmbeddingBackbone:
        """Factory: create the correct backbone from a config name.

        Args:
            backbone_name: One of ``"dinov2_vitb14"`` or ``"openclip_vitl14"``.
            device: Torch device string (e.g. ``"cpu"``, ``"cuda"``).

        Returns:
            Initialized backbone in eval mode on the requested device.

        Raises:
            ValueError: If ``backbone_name`` is not recognized.
        """
        _registry: dict[str, type[EmbeddingBackbone]] = {
            "dinov2_vitb14": DinoV2Backbone,
            "openclip_vitl14": OpenClipBackbone,
        }
        backbone_cls = _registry.get(backbone_name)
        if backbone_cls is None:
            supported = ", ".join(sorted(_registry))
            raise ValueError(
                f"Unknown backbone {backbone_name!r}. "
                f"Supported: {supported}"
            )

        logger.info("Creating backbone %r on device %r", backbone_name, device)
        return backbone_cls(device=device)


class DinoV2Backbone(EmbeddingBackbone):
    """DINOv2 ViT-B/14 backbone via ``torch.hub``.

    Uses the CLS token output as the image embedding (768-d).
    """

    _DIM = 768

    def __init__(self, device: str = "cpu") -> None:
        self._device = torch.device(device)
        logger.info("Loading DINOv2 ViT-B/14 via torch.hub ...")
        self._model: torch.nn.Module = torch.hub.load(
            "facebookresearch/dinov2",
            "dinov2_vitb14",
            pretrained=True,
        )
        self._model = self._model.to(self._device)
        self._model.eval()
        logger.info("DINOv2 loaded on %s", self._device)

    def preprocess(self, image: np.ndarray) -> torch.Tensor:
        """BGR ndarray -> (3, 224, 224) normalized tensor."""
        # BGR -> RGB
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Resize to square input
        resized = cv2.resize(
            rgb,
            (_VIT_INPUT_SIZE, _VIT_INPUT_SIZE),
            interpolation=cv2.INTER_AREA,
        )

        # HWC uint8 -> CHW float32 in [0, 1]
        tensor = torch.from_numpy(resized).permute(2, 0, 1).float() / 255.0

        # ImageNet normalization
        mean = torch.tensor(_IMAGENET_MEAN, dtype=torch.float32).view(3, 1, 1)
        std = torch.tensor(_IMAGENET_STD, dtype=torch.float32).view(3, 1, 1)
        tensor = (tensor - mean) / std

        return tensor

    @torch.no_grad()
    def encode(self, images: torch.Tensor) -> torch.Tensor:
        """Forward pass through DINOv2 -> CLS token embeddings.

        Args:
            images: ``(B, 3, 224, 224)`` preprocessed batch.

        Returns:
            ``(B, 768)`` embedding matrix.
        """
        images = images.to(self._device)
        # DINOv2 forward returns CLS token when called directly
        embeddings: torch.Tensor = self._model(images)
        return embeddings.float()

    @property
    def dim(self) -> int:
        return self._DIM


class OpenClipBackbone(EmbeddingBackbone):
    """OpenCLIP ViT-L/14 backbone.

    Uses the CLIP image encoder with OpenAI pretrained weights.
    """

    _DIM = 768

    def __init__(self, device: str = "cpu") -> None:
        import open_clip

        self._device = torch.device(device)
        logger.info("Loading OpenCLIP ViT-L/14 (openai weights) ...")

        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-L-14",
            pretrained="openai",
            device=self._device,
        )
        self._model = model
        self._model.eval()
        self._preprocess = preprocess
        logger.info("OpenCLIP loaded on %s", self._device)

    def preprocess(self, image: np.ndarray) -> torch.Tensor:
        """BGR ndarray -> preprocessed tensor using CLIP's own transforms.

        The built-in OpenCLIP transform expects a PIL image, so we convert
        BGR ndarray -> RGB PIL -> apply transform pipeline.
        """
        from PIL import Image

        # BGR -> RGB -> PIL
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb)

        tensor: torch.Tensor = self._preprocess(pil_image)
        return tensor

    @torch.no_grad()
    def encode(self, images: torch.Tensor) -> torch.Tensor:
        """CLIP image encoding.

        Args:
            images: ``(B, 3, H, W)`` preprocessed batch.

        Returns:
            ``(B, 768)`` embedding matrix (before L2 normalization).
        """
        images = images.to(self._device)
        features: torch.Tensor = self._model.encode_image(images)
        return features.float()

    @property
    def dim(self) -> int:
        return self._DIM
