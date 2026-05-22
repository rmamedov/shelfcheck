"""CLI entry points for shelf recognition, planogram parsing, and gallery building.

Exposes three Typer apps that are wired to console_scripts in pyproject.toml:
    - ``recognize-shelf``  — run full recognition pipeline on a shelf image
    - ``parse-planogram``  — parse a JSON planogram into a PlanogramGrid
    - ``build-gallery``    — build a FAISS gallery from a directory of reference images

Each app is self-contained and can be invoked independently.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Annotated, Optional

import typer

# ---------------------------------------------------------------------------
# Logging setup (shared by all CLI apps)
# ---------------------------------------------------------------------------

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def _setup_logging(verbose: bool) -> None:
    """Configure root logging for CLI usage."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(format=_LOG_FORMAT, level=level, stream=sys.stderr)


# ===========================================================================
# recognize-shelf
# ===========================================================================

app_recognize = typer.Typer(
    name="recognize-shelf",
    help="Run shelf product recognition on a single image.",
    no_args_is_help=True,
)


@app_recognize.command()
def recognize(
    image: Annotated[
        Path,
        typer.Option("--image", "-i", help="Path to the shelf image file."),
    ],
    gallery: Annotated[
        Path,
        typer.Option("--gallery", "-g", help="Path to the FAISS gallery index."),
    ],
    config: Annotated[
        Optional[Path],
        typer.Option("--config", "-c", help="Path to a YAML config file."),
    ] = None,
    out: Annotated[
        Optional[Path],
        typer.Option("--out", "-o", help="Output JSON file (stdout if omitted)."),
    ] = None,
    planogram: Annotated[
        Optional[Path],
        typer.Option("--planogram", "-p", help="Optional planogram JSON for compliance check."),
    ] = None,
    verbose: Annotated[
        bool,
        typer.Option("--verbose", "-v", help="Enable debug logging."),
    ] = False,
) -> None:
    """Detect, embed, and match products on a shelf image.

    Optionally compare against a planogram if --planogram is provided.
    """
    _setup_logging(verbose)
    logger = logging.getLogger("shelf_reco.cli.recognize")

    # Validate inputs.
    if not image.exists():
        logger.error("Image file not found: %s", image)
        raise typer.Exit(code=1)

    if not gallery.exists():
        logger.error("Gallery index not found: %s", gallery)
        raise typer.Exit(code=1)

    # Load config and override gallery path.
    from shelf_reco.config import get_config

    cfg = get_config(config)
    # Override gallery index path from CLI argument.
    cfg.gallery.index_path = gallery

    # Initialize recognizer.
    from shelf_reco.recognize import ShelfRecognizer

    recognizer = ShelfRecognizer(cfg)

    # Run recognition.
    logger.info("Recognizing shelf image: %s", image)
    result = recognizer.recognize(image)

    # Build output payload.
    output: dict = result.model_dump(mode="json")

    # Optional planogram comparison.
    if planogram is not None:
        if not planogram.exists():
            logger.error("Planogram file not found: %s", planogram)
            raise typer.Exit(code=1)

        from shelf_reco.planogram import parse_planogram

        grid = parse_planogram(planogram)
        compliance = recognizer.compare_with_planogram(result, grid)
        output["compliance"] = compliance.model_dump(mode="json")
        logger.info("Compliance score: %.1f%%", compliance.compliance_score)

    # Write output.
    json_str = json.dumps(output, indent=2, ensure_ascii=False)
    if out is not None:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json_str, encoding="utf-8")
        logger.info("Result written to %s", out)
    else:
        typer.echo(json_str)


# ===========================================================================
# parse-planogram
# ===========================================================================

app_planogram = typer.Typer(
    name="parse-planogram",
    help="Parse a JSON planogram into a normalized PlanogramGrid.",
    no_args_is_help=True,
)


@app_planogram.command()
def parse(
    input_file: Annotated[
        Path,
        typer.Option("--input", "-i", help="Path to the planogram JSON file."),
    ],
    out: Annotated[
        Optional[Path],
        typer.Option("--out", "-o", help="Output JSON file (stdout if omitted)."),
    ] = None,
    verbose: Annotated[
        bool,
        typer.Option("--verbose", "-v", help="Enable debug logging."),
    ] = False,
) -> None:
    """Parse a planogram JSON file and output the normalized grid."""
    _setup_logging(verbose)
    logger = logging.getLogger("shelf_reco.cli.planogram")

    if not input_file.exists():
        logger.error("Input file not found: %s", input_file)
        raise typer.Exit(code=1)

    from shelf_reco.planogram import parse_planogram
    from shelf_reco.planogram.parser import PlanogramParseError

    try:
        grid = parse_planogram(input_file)
    except PlanogramParseError as exc:
        logger.error("Failed to parse planogram: %s", exc)
        raise typer.Exit(code=1) from exc

    json_str = json.dumps(grid.model_dump(mode="json"), indent=2, ensure_ascii=False)
    if out is not None:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json_str, encoding="utf-8")
        logger.info("Planogram grid written to %s", out)
    else:
        typer.echo(json_str)


# ===========================================================================
# build-gallery
# ===========================================================================

app_gallery = typer.Typer(
    name="build-gallery",
    help="Build a FAISS SKU gallery from a directory of reference images.",
    no_args_is_help=True,
)


@app_gallery.command()
def build(
    raw_dir: Annotated[
        Path,
        typer.Option("--raw-dir", "-d", help="Directory of reference SKU images (one subdir per SKU)."),
    ],
    out: Annotated[
        Path,
        typer.Option("--out", "-o", help="Output path for the FAISS index file."),
    ],
    encoder_backbone: Annotated[
        str,
        typer.Option("--encoder-backbone", "-b", help="Encoder backbone name."),
    ] = "dinov2_vitb14",
    config: Annotated[
        Optional[Path],
        typer.Option("--config", "-c", help="Path to a YAML config file."),
    ] = None,
    device: Annotated[
        str,
        typer.Option("--device", help="Torch device (cuda, cpu)."),
    ] = "cuda",
    verbose: Annotated[
        bool,
        typer.Option("--verbose", "-v", help="Enable debug logging."),
    ] = False,
) -> None:
    """Build a FAISS gallery index from reference SKU images.

    Expected directory layout::

        raw_dir/
            SKU-001/
                front.jpg
                angle.jpg
            SKU-002/
                front.jpg
            ...

    Each subdirectory name is used as the SKU ID.
    """
    _setup_logging(verbose)
    logger = logging.getLogger("shelf_reco.cli.gallery")

    if not raw_dir.is_dir():
        logger.error("Raw directory not found: %s", raw_dir)
        raise typer.Exit(code=1)

    from shelf_reco.config import GalleryConfig, get_config, resolve_device

    cfg = get_config(config)
    resolved_device = resolve_device(device)

    from shelf_reco.embed.encoder import SkuEncoder
    from shelf_reco.gallery.builder import GalleryBuilder

    # Initialize encoder with config.
    encoder_cfg = cfg.encoder.model_copy(update={"backbone": encoder_backbone})
    encoder = SkuEncoder(config=encoder_cfg, device=resolved_device)

    # Discover SKU directories.
    sku_dirs = sorted(
        [d for d in raw_dir.iterdir() if d.is_dir()],
        key=lambda d: d.name,
    )
    if not sku_dirs:
        logger.error("No SKU subdirectories found in %s", raw_dir)
        raise typer.Exit(code=1)

    logger.info("Found %d SKU directories in %s", len(sku_dirs), raw_dir)

    # Build gallery.
    out.parent.mkdir(parents=True, exist_ok=True)
    metadata_path = out.with_suffix(".meta.json")
    gallery_config = GalleryConfig(index_path=out, metadata_path=metadata_path)

    builder = GalleryBuilder(encoder=encoder, config=gallery_config)
    gallery = builder.build_from_directory(raw_dir)

    logger.info("Gallery built: %d vectors, index=%s", gallery.size, out)
    typer.echo(f"Gallery index saved to {out}")
    typer.echo(f"Gallery metadata saved to {metadata_path}")
