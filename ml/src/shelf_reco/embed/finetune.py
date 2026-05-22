"""ArcFace fine-tuning scaffold for the embedding backbone.

This module provides the components needed to fine-tune a pretrained
backbone with ArcFace (Additive Angular Margin) loss for SKU classification.

Usage (from a training script)::

    from shelf_reco.embed.backbone import EmbeddingBackbone
    from shelf_reco.embed.finetune import FineTuner

    backbone = EmbeddingBackbone.from_config("dinov2_vitb14", "cuda")
    tuner = FineTuner(backbone, num_classes=500, config=finetune_cfg)
    for epoch in range(num_epochs):
        metrics = tuner.train_epoch(dataloader)
        print(f"Epoch {epoch}: {metrics}")
    tuner.save_checkpoint(Path("checkpoints/epoch_10.pt"))

This is a scaffold -- all classes are functional but the training loop
is meant to be orchestrated by a standalone training script.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

from shelf_reco.embed.backbone import EmbeddingBackbone

logger = logging.getLogger("shelf_reco.embed.finetune")


# ======================================================================
# Configuration
# ======================================================================


@dataclass
class FineTuneConfig:
    """Hyperparameters for ArcFace fine-tuning.

    Attributes:
        lr: Learning rate for the ArcFace head (and unfrozen backbone layers).
        weight_decay: AdamW weight decay.
        arcface_scale: ArcFace logit scaling factor ``s``.
        arcface_margin: ArcFace angular margin ``m`` in radians.
        unfreeze_last_n_blocks: Number of trailing transformer blocks to
            unfreeze in the backbone (0 = fully frozen backbone).
        gradient_clip_norm: Max gradient norm for clipping (``None`` = no clip).
        triplet_margin: Margin for the triplet loss term (set to 0 to disable).
    """

    lr: float = 1e-4
    weight_decay: float = 1e-2
    arcface_scale: float = 30.0
    arcface_margin: float = 0.5
    unfreeze_last_n_blocks: int = 0
    gradient_clip_norm: float | None = 1.0
    triplet_margin: float = 0.3


# ======================================================================
# ArcFace head
# ======================================================================


class ArcFaceHead(nn.Module):
    """Additive Angular Margin (ArcFace) classification head.

    Projects L2-normalized embeddings onto a normalized weight matrix
    and applies an angular margin penalty to the target logit, improving
    intra-class compactness and inter-class separability.

    Args:
        embedding_dim: Dimensionality of input embeddings.
        num_classes: Number of SKU classes.
        scale: Logit scaling factor ``s``  (default 30.0).
        margin: Angular margin ``m`` in radians (default 0.5).
    """

    def __init__(
        self,
        embedding_dim: int,
        num_classes: int,
        scale: float = 30.0,
        margin: float = 0.5,
    ) -> None:
        super().__init__()
        self.scale = scale
        self.margin = margin
        self.num_classes = num_classes

        # Class prototype weight matrix (learned, kept on unit hypersphere)
        self.weight = nn.Parameter(torch.empty(num_classes, embedding_dim))
        nn.init.xavier_uniform_(self.weight)

        # Precompute trig constants
        self._cos_m = math.cos(margin)
        self._sin_m = math.sin(margin)
        # Threshold for numerical stability: cos(pi - m)
        self._th = math.cos(math.pi - margin)
        self._mm = math.sin(math.pi - margin) * margin

    def forward(
        self,
        embeddings: torch.Tensor,
        labels: torch.Tensor,
    ) -> torch.Tensor:
        """Compute ArcFace logits.

        Args:
            embeddings: ``(B, dim)`` L2-normalized embedding batch.
            labels: ``(B,)`` integer class labels.

        Returns:
            ``(B, num_classes)`` scaled logits with angular margin applied
            at the ground-truth positions.
        """
        # Normalize both embeddings and weights to the unit hypersphere
        normed_embeddings = F.normalize(embeddings, p=2, dim=1)
        normed_weights = F.normalize(self.weight, p=2, dim=1)

        # Cosine similarity: (B, num_classes)
        cosine = torch.mm(normed_embeddings, normed_weights.t())
        cosine = cosine.clamp(-1.0 + 1e-7, 1.0 - 1e-7)

        # Apply angular margin to target class
        sine = torch.sqrt(1.0 - cosine.pow(2))
        # cos(theta + m) = cos(theta)*cos(m) - sin(theta)*sin(m)
        phi = cosine * self._cos_m - sine * self._sin_m

        # Numerical guard: when cos(theta) < cos(pi - m), fall back to
        # cosine - m*sin(pi - m) to stay monotonic
        phi = torch.where(cosine > self._th, phi, cosine - self._mm)

        # One-hot select: apply margin only at ground-truth index
        one_hot = torch.zeros_like(cosine)
        one_hot.scatter_(1, labels.unsqueeze(1), 1.0)

        logits = one_hot * phi + (1.0 - one_hot) * cosine
        logits = logits * self.scale

        return logits


# ======================================================================
# Triplet mining
# ======================================================================


class TripletMiner:
    """Hard-negative triplet mining within a batch.

    For each anchor, finds the hardest positive (largest distance with
    same label) and hardest negative (smallest distance with different
    label).

    Args:
        margin: Triplet loss margin.
    """

    def __init__(self, margin: float = 0.3) -> None:
        self.margin = margin

    def mine_and_compute_loss(
        self,
        embeddings: torch.Tensor,
        labels: torch.Tensor,
    ) -> torch.Tensor:
        """Compute triplet loss with batch-hard mining.

        Args:
            embeddings: ``(B, dim)`` L2-normalized embeddings.
            labels: ``(B,)`` integer class labels.

        Returns:
            Scalar triplet loss (0.0 if no valid triplets exist).
        """
        # Pairwise Euclidean distance matrix
        dist_matrix = torch.cdist(embeddings, embeddings, p=2)  # (B, B)

        # Masks for positive and negative pairs
        label_equal = labels.unsqueeze(0) == labels.unsqueeze(1)  # (B, B)
        identity_mask = torch.eye(
            labels.size(0), dtype=torch.bool, device=labels.device
        )
        pos_mask = label_equal & ~identity_mask
        neg_mask = ~label_equal

        # Hardest positive: max distance among same-label pairs
        # Replace non-positive entries with 0 so they don't win the max
        pos_dists = dist_matrix * pos_mask.float()
        hardest_pos, _ = pos_dists.max(dim=1)  # (B,)

        # Hardest negative: min distance among different-label pairs
        # Replace non-negative entries with a large value
        large_value = dist_matrix.max().item() + 1.0
        neg_dists = dist_matrix + (~neg_mask).float() * large_value
        hardest_neg, _ = neg_dists.min(dim=1)  # (B,)

        # Triplet loss: max(d_pos - d_neg + margin, 0)
        losses = F.relu(hardest_pos - hardest_neg + self.margin)

        # Only count anchors that have at least one positive
        valid_anchors = pos_mask.any(dim=1)
        if valid_anchors.sum() == 0:
            return torch.tensor(0.0, device=embeddings.device, requires_grad=True)

        return losses[valid_anchors].mean()


# ======================================================================
# Fine-tuner
# ======================================================================


@dataclass
class EpochMetrics:
    """Metrics collected during a training epoch."""

    arcface_loss: float = 0.0
    triplet_loss: float = 0.0
    total_loss: float = 0.0
    accuracy: float = 0.0
    num_batches: int = 0


class FineTuner:
    """Orchestrates ArcFace fine-tuning of an embedding backbone.

    Freezes the backbone (or partially unfreezes trailing blocks),
    attaches an ArcFace head, and runs a training epoch on demand.

    Args:
        backbone: Pretrained ``EmbeddingBackbone`` to fine-tune.
        num_classes: Number of SKU classes in the training set.
        config: Fine-tuning hyperparameters.
    """

    def __init__(
        self,
        backbone: EmbeddingBackbone,
        num_classes: int,
        config: FineTuneConfig | None = None,
    ) -> None:
        self._config = config or FineTuneConfig()
        self._backbone = backbone
        self._num_classes = num_classes

        # Access the underlying nn.Module for parameter management
        self._model: nn.Module = backbone._model  # type: ignore[attr-defined]
        self._device = next(self._model.parameters()).device

        # Freeze / partial-unfreeze backbone
        self._freeze_backbone()

        # ArcFace classification head
        self._head = ArcFaceHead(
            embedding_dim=backbone.dim,
            num_classes=num_classes,
            scale=self._config.arcface_scale,
            margin=self._config.arcface_margin,
        ).to(self._device)

        # Optional triplet miner
        self._triplet_miner: TripletMiner | None = None
        if self._config.triplet_margin > 0:
            self._triplet_miner = TripletMiner(margin=self._config.triplet_margin)

        # Optimizer over trainable params only
        trainable_params = list(self._trainable_parameters())
        self._optimizer = torch.optim.AdamW(
            trainable_params,
            lr=self._config.lr,
            weight_decay=self._config.weight_decay,
        )

        logger.info(
            "FineTuner initialized: %d classes, %d trainable params, "
            "backbone blocks unfrozen=%d",
            num_classes,
            sum(p.numel() for p in trainable_params),
            self._config.unfreeze_last_n_blocks,
        )

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def train_epoch(self, dataloader: DataLoader[Any]) -> EpochMetrics:
        """Run one training epoch.

        The dataloader must yield ``(images, labels)`` tuples where
        ``images`` is a ``(B, C, H, W)`` tensor (already preprocessed)
        and ``labels`` is a ``(B,)`` integer tensor of class indices.

        Args:
            dataloader: PyTorch DataLoader providing the training batches.

        Returns:
            Aggregated metrics for the epoch.
        """
        self._model.train()
        self._head.train()
        metrics = EpochMetrics()

        for batch_idx, (images, labels) in enumerate(dataloader):
            images = images.to(self._device)
            labels = labels.to(self._device)

            # Forward: backbone -> embeddings -> L2 normalize
            embeddings = self._backbone.encode(images)
            embeddings = F.normalize(embeddings, p=2, dim=1)

            # ArcFace loss
            logits = self._head(embeddings, labels)
            arcface_loss = F.cross_entropy(logits, labels)

            # Optional triplet loss
            triplet_loss = torch.tensor(0.0, device=self._device)
            if self._triplet_miner is not None:
                triplet_loss = self._triplet_miner.mine_and_compute_loss(
                    embeddings, labels
                )

            total_loss = arcface_loss + triplet_loss

            # Backward
            self._optimizer.zero_grad()
            total_loss.backward()
            if self._config.gradient_clip_norm is not None:
                nn.utils.clip_grad_norm_(
                    self._trainable_parameters(),
                    self._config.gradient_clip_norm,
                )
            self._optimizer.step()

            # Accuracy
            with torch.no_grad():
                preds = logits.argmax(dim=1)
                correct = (preds == labels).sum().item()
                accuracy = correct / labels.size(0)

            # Accumulate
            metrics.arcface_loss += arcface_loss.item()
            metrics.triplet_loss += triplet_loss.item()
            metrics.total_loss += total_loss.item()
            metrics.accuracy += accuracy
            metrics.num_batches += 1

            if (batch_idx + 1) % 50 == 0:
                avg_loss = metrics.total_loss / metrics.num_batches
                avg_acc = metrics.accuracy / metrics.num_batches
                logger.info(
                    "Batch %d: loss=%.4f  acc=%.3f",
                    batch_idx + 1,
                    avg_loss,
                    avg_acc,
                )

        # Average metrics over batches
        if metrics.num_batches > 0:
            metrics.arcface_loss /= metrics.num_batches
            metrics.triplet_loss /= metrics.num_batches
            metrics.total_loss /= metrics.num_batches
            metrics.accuracy /= metrics.num_batches

        logger.info(
            "Epoch complete: loss=%.4f  arcface=%.4f  triplet=%.4f  acc=%.3f",
            metrics.total_loss,
            metrics.arcface_loss,
            metrics.triplet_loss,
            metrics.accuracy,
        )
        return metrics

    # ------------------------------------------------------------------
    # Checkpointing
    # ------------------------------------------------------------------

    def save_checkpoint(self, path: Path) -> None:
        """Save model + head + optimizer state to a checkpoint file.

        Args:
            path: Destination file path (e.g. ``checkpoints/epoch_5.pt``).
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        checkpoint = {
            "backbone_state_dict": self._model.state_dict(),
            "head_state_dict": self._head.state_dict(),
            "optimizer_state_dict": self._optimizer.state_dict(),
            "config": {
                "num_classes": self._num_classes,
                "embedding_dim": self._backbone.dim,
                "arcface_scale": self._config.arcface_scale,
                "arcface_margin": self._config.arcface_margin,
            },
        }
        torch.save(checkpoint, path)
        logger.info("Checkpoint saved to %s", path)

    def load_checkpoint(self, path: Path) -> None:
        """Load model + head + optimizer state from a checkpoint.

        Args:
            path: Checkpoint file path.

        Raises:
            FileNotFoundError: If *path* does not exist.
        """
        if not path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {path}")

        checkpoint = torch.load(path, map_location=self._device, weights_only=False)
        self._model.load_state_dict(checkpoint["backbone_state_dict"])
        self._head.load_state_dict(checkpoint["head_state_dict"])
        self._optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        logger.info("Checkpoint loaded from %s", path)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _freeze_backbone(self) -> None:
        """Freeze all backbone parameters, then optionally unfreeze trailing blocks."""
        # Freeze everything first
        for param in self._model.parameters():
            param.requires_grad = False

        n_unfreeze = self._config.unfreeze_last_n_blocks
        if n_unfreeze <= 0:
            logger.info("Backbone fully frozen")
            return

        # Attempt to unfreeze last N transformer blocks.
        # Works for ViT models that expose .blocks as a nn.Sequential/ModuleList.
        blocks = getattr(self._model, "blocks", None)
        if blocks is None:
            logger.warning(
                "Backbone has no .blocks attribute; cannot partial-unfreeze. "
                "All backbone parameters remain frozen."
            )
            return

        total_blocks = len(blocks)
        unfreeze_from = max(0, total_blocks - n_unfreeze)
        unfrozen_count = 0
        for block in blocks[unfreeze_from:]:
            for param in block.parameters():
                param.requires_grad = True
                unfrozen_count += 1

        logger.info(
            "Unfroze last %d/%d blocks (%d parameters)",
            min(n_unfreeze, total_blocks),
            total_blocks,
            unfrozen_count,
        )

    def _trainable_parameters(self):
        """Yield all trainable parameters (backbone + head)."""
        for param in self._model.parameters():
            if param.requires_grad:
                yield param
        yield from self._head.parameters()
