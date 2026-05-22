"""FastAPI service wrapping the shelf recognition pipeline.

Endpoints:
    POST /api/recognize  — upload shelf photo, get recognition result
    POST /api/compare    — upload photo + planogram JSON, get compliance result
    GET  /api/health     — health check
    POST /api/gallery/build — trigger gallery build from a directory

The response format for ``/api/compare`` is designed to be consumed directly
by the Next.js frontend, using camelCase field names and a flat violation
structure.

Run with::

    shelf-reco-api                    # via console_scripts entry point
    uvicorn shelf_reco.api:app        # direct uvicorn invocation
"""

from __future__ import annotations

import json
import logging
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from shelf_reco.config import AppConfig, get_config
from shelf_reco.planogram import parse_planogram
from shelf_reco.planogram.parser import PlanogramParseError
from shelf_reco.recognize import ShelfRecognizer
from shelf_reco.schemas import ComplianceResult, ShelfRecognitionResult

logger = logging.getLogger("shelf_reco.api")

# ---------------------------------------------------------------------------
# Module-level state (initialized in lifespan)
# ---------------------------------------------------------------------------

_recognizer: ShelfRecognizer | None = None
_config: AppConfig | None = None


def _get_recognizer() -> ShelfRecognizer:
    """Return the initialized recognizer or raise 503."""
    if _recognizer is None:
        raise HTTPException(
            status_code=503,
            detail="Recognition pipeline not initialized. Server is starting up.",
        )
    return _recognizer


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    """Initialize the recognition pipeline on startup, clean up on shutdown."""
    global _recognizer, _config  # noqa: PLW0603

    logger.info("Initializing recognition pipeline ...")
    start = time.monotonic()

    config_path_env = Path("configs/default.yaml")
    _config = get_config(config_path_env if config_path_env.exists() else None)
    _recognizer = ShelfRecognizer(_config)

    elapsed = time.monotonic() - start
    logger.info("Pipeline ready in %.1fs", elapsed)

    yield

    logger.info("Shutting down recognition pipeline")
    _recognizer = None
    _config = None


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Shelf Recognition API",
    version="0.1.0",
    description="Detect and recognize products on shelf photos, compare with planograms.",
    lifespan=lifespan,
)

# Allow CORS for the Next.js frontend (dev and production origins).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Response models (camelCase for Next.js compatibility)
# ---------------------------------------------------------------------------


class ViolationResponse(BaseModel):
    """Single violation in the format expected by the Next.js frontend."""

    type: str
    productName: str | None = None
    skuId: str
    shelfLevel: int
    position: int
    description: str
    confidence: float = 0.0


class CompareResponse(BaseModel):
    """Compliance comparison result for the Next.js frontend."""

    complianceScore: float
    violations: list[ViolationResponse]
    summary: str
    recognizedCount: int
    expectedCount: int


class RecognizeResponse(BaseModel):
    """Recognition result for API consumers."""

    imagePath: str
    imageHash: str
    facingsCount: int
    matchedCount: int
    modelVersion: str
    galleryVersion: str
    facings: list[dict[str, Any]]


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    pipelineReady: bool
    modelVersion: str | None = None


class GalleryBuildRequest(BaseModel):
    """Request body for gallery build endpoint."""

    rawDir: str
    outputPath: str | None = None


class GalleryBuildResponse(BaseModel):
    """Response for gallery build endpoint."""

    status: str
    indexPath: str
    metadataPath: str
    skuCount: int


# ---------------------------------------------------------------------------
# Helper: save upload to temp file
# ---------------------------------------------------------------------------


async def _save_upload_to_temp(upload: UploadFile, suffix: str = ".jpg") -> Path:
    """Save an uploaded file to a temporary path and return it.

    The caller is responsible for cleaning up the temp file.

    Args:
        upload: FastAPI upload file.
        suffix: File extension for the temp file.

    Returns:
        Path to the saved temporary file.

    Raises:
        HTTPException: If the file is empty or cannot be saved.
    """
    content = await upload.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(content)
        tmp.flush()
    finally:
        tmp.close()

    return Path(tmp.name)


def _compliance_to_response(compliance: ComplianceResult) -> CompareResponse:
    """Convert internal ComplianceResult to the camelCase API response.

    Args:
        compliance: Internal compliance result.

    Returns:
        Frontend-compatible response model.
    """
    violations = [
        ViolationResponse(
            type=v.type,
            productName=v.product_name,
            skuId=v.sku_id,
            shelfLevel=v.shelf_row,
            position=v.position,
            description=v.description,
            confidence=v.confidence,
        )
        for v in compliance.violations
    ]

    return CompareResponse(
        complianceScore=compliance.compliance_score,
        violations=violations,
        summary=compliance.summary,
        recognizedCount=compliance.recognized_count,
        expectedCount=compliance.expected_count,
    )


def _recognition_to_response(result: ShelfRecognitionResult) -> RecognizeResponse:
    """Convert internal ShelfRecognitionResult to the API response.

    Args:
        result: Internal recognition result.

    Returns:
        API response model.
    """
    matched_count = sum(1 for f in result.facings if f.match is not None)

    facings_data: list[dict[str, Any]] = []
    for facing in result.facings:
        entry: dict[str, Any] = {
            "bbox": {
                "x1": facing.detection.bbox.x1,
                "y1": facing.detection.bbox.y1,
                "x2": facing.detection.bbox.x2,
                "y2": facing.detection.bbox.y2,
                "score": facing.detection.bbox.score,
            },
            "shelfRow": facing.detection.shelf_row,
            "cropId": facing.detection.crop_id,
        }
        if facing.match:
            entry["match"] = {
                "skuId": facing.match.sku_id,
                "distance": facing.match.distance,
                "confidence": facing.match.confidence,
            }
        else:
            entry["match"] = None
        facings_data.append(entry)

    return RecognizeResponse(
        imagePath=result.image_path,
        imageHash=result.image_hash,
        facingsCount=len(result.facings),
        matchedCount=matched_count,
        modelVersion=result.model_version,
        galleryVersion=result.gallery_version,
        facings=facings_data,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check service health and pipeline readiness."""
    ready = _recognizer is not None
    model_version = None
    if ready and _recognizer is not None:
        model_version = (
            f"yolo:{_recognizer._config.detector.weights.stem}"
            f"+{_recognizer._config.encoder.backbone}"
        )
    return HealthResponse(
        status="ok" if ready else "initializing",
        pipelineReady=ready,
        modelVersion=model_version,
    )


@app.post("/api/recognize", response_model=RecognizeResponse)
async def recognize_shelf(
    photo: UploadFile = File(..., description="Shelf photo (JPEG/PNG)"),
) -> RecognizeResponse:
    """Upload a shelf photo and get product recognition results.

    Runs the full detection -> embedding -> matching pipeline on the
    uploaded image.
    """
    recognizer = _get_recognizer()
    tmp_path: Path | None = None

    try:
        # Determine suffix from filename.
        suffix = ".jpg"
        if photo.filename:
            ext = Path(photo.filename).suffix
            if ext:
                suffix = ext

        tmp_path = await _save_upload_to_temp(photo, suffix=suffix)
        logger.info("Processing recognition request: %s (%s)", photo.filename, tmp_path)

        result = recognizer.recognize(tmp_path)
        return _recognition_to_response(result)

    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Recognition failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Recognition pipeline error: {type(exc).__name__}: {exc}",
        ) from exc
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


@app.post("/api/compare", response_model=CompareResponse)
async def compare_with_planogram(
    photo: UploadFile = File(..., description="Shelf photo (JPEG/PNG)"),
    planogram: str = Form(..., description="Planogram JSON string"),
) -> CompareResponse:
    """Upload a shelf photo and planogram, get compliance result.

    This is the primary endpoint called by the Next.js frontend.
    Accepts multipart form data with the photo file and planogram
    JSON as a form field.

    The response uses camelCase keys to match the frontend's expectations.
    """
    recognizer = _get_recognizer()
    tmp_path: Path | None = None

    try:
        # Parse planogram JSON.
        try:
            planogram_data = json.loads(planogram)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid planogram JSON: {exc}",
            ) from exc

        try:
            grid = parse_planogram(planogram_data)
        except PlanogramParseError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid planogram structure: {exc}",
            ) from exc

        # Save photo to temp file.
        suffix = ".jpg"
        if photo.filename:
            ext = Path(photo.filename).suffix
            if ext:
                suffix = ext

        tmp_path = await _save_upload_to_temp(photo, suffix=suffix)
        logger.info(
            "Processing compare request: photo=%s, planogram=%s",
            photo.filename,
            grid.planogram_id,
        )

        # Run pipeline.
        result = recognizer.recognize(tmp_path)
        compliance = recognizer.compare_with_planogram(result, grid)
        return _compliance_to_response(compliance)

    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Compare failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline error: {type(exc).__name__}: {exc}",
        ) from exc
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


@app.post("/api/gallery/build", response_model=GalleryBuildResponse)
async def build_gallery(request: GalleryBuildRequest) -> GalleryBuildResponse:
    """Trigger gallery build from a directory of reference SKU images.

    This is an administrative endpoint. The directory must exist on the
    server filesystem.

    Expected directory layout::

        rawDir/
            SKU-001/
                front.jpg
                angle.jpg
            SKU-002/
                front.jpg
    """
    recognizer = _get_recognizer()
    config = _config
    if config is None:
        raise HTTPException(status_code=503, detail="Config not initialized.")

    raw_dir = Path(request.rawDir)
    if not raw_dir.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Directory not found: {request.rawDir}",
        )

    sku_dirs = [d for d in raw_dir.iterdir() if d.is_dir()]
    if not sku_dirs:
        raise HTTPException(
            status_code=400,
            detail=f"No SKU subdirectories found in {request.rawDir}",
        )

    try:
        from shelf_reco.config import GalleryConfig
        from shelf_reco.embed.encoder import SkuEncoder
        from shelf_reco.gallery.builder import GalleryBuilder

        # Determine output paths.
        if request.outputPath:
            index_path = Path(request.outputPath)
        else:
            index_path = config.resolve_path(config.gallery.index_path)

        metadata_path = index_path.with_suffix(".meta.json")
        index_path.parent.mkdir(parents=True, exist_ok=True)

        # Build the gallery using the recognizer's encoder.
        encoder_config = config.encoder.model_copy(
            update={"cache_path": config.resolve_path(config.encoder.cache_path)}
        )
        encoder = SkuEncoder(config=encoder_config, device=recognizer._device)
        gallery_config = GalleryConfig(index_path=index_path, metadata_path=metadata_path)

        builder = GalleryBuilder(encoder=encoder, config=gallery_config)
        gallery = builder.build_from_directory(raw_dir)

        logger.info("Gallery built: %s (%d SKUs, %d vectors)", index_path, len(sku_dirs), gallery.size)

        return GalleryBuildResponse(
            status="ok",
            indexPath=str(index_path),
            metadataPath=str(metadata_path),
            skuCount=len(sku_dirs),
        )

    except Exception as exc:
        logger.exception("Gallery build failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Gallery build error: {type(exc).__name__}: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the API server via uvicorn (console_scripts entry point)."""
    import os

    logging.basicConfig(
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        level=logging.INFO,
    )

    config = get_config()

    uvicorn.run(
        "shelf_reco.api:app",
        host=config.api.host,
        port=config.api.port,
        workers=config.api.workers,
        log_level="info",
        reload=os.getenv("SHELF_RECO_RELOAD", "").lower() in ("1", "true"),
    )


if __name__ == "__main__":
    main()
