# shelf_reco — Shelf & Planogram Recognition

Local ML module for detecting and recognizing products on store shelf photos, comparing with planograms for compliance scoring.

## Architecture

```
detect/     → YOLO-based product detection (bounding boxes + shelf row assignment)
embed/      → DINOv2/OpenCLIP backbone → L2-normalized SKU embeddings
gallery/    → FAISS k-NN index for SKU matching (cosine similarity + vote aggregation)
recognize/  → Orchestrator: detect → embed → match → compare with planogram
planogram/  → JSON planogram parser → normalized PlanogramGrid
api.py      → FastAPI service (called by Next.js instead of Claude Vision)
cli.py      → CLI tools: recognize-shelf, parse-planogram, build-gallery
```

## Quick Start

```bash
# Install (requires Python 3.11+, uv recommended)
cd ml
uv sync

# Or with pip
pip install -e ".[dev]"

# Run tests (no ML models needed for unit tests)
pytest tests/unit/ -v

# Start the API server (port 8001)
shelf-reco-api
# or: uvicorn shelf_reco.api:app --port 8001

# Build a gallery from reference images
build-gallery --raw-dir data/gallery_raw/ --out models/gallery_v1.faiss

# Recognize products on a shelf photo
recognize-shelf --image shelf.jpg --gallery models/gallery_v1.faiss --out result.json

# Parse a planogram
parse-planogram --input planogram.json --out grid.json

# Full comparison (recognize + compare with planogram)
recognize-shelf --image shelf.jpg --gallery models/gallery_v1.faiss --planogram plan.json
```

## Integration with ShelfCheck Next.js

The API runs on port 8001 and is called by `src/app/api/analyze/route.ts`:

1. Next.js sends shelf photo + planogram JSON to `POST /api/compare`
2. ML service runs: detect → embed → match → compare
3. Returns `{complianceScore, violations[], summary}` in the same format as before

Set `ML_SERVICE_URL=http://localhost:8001` in `.env`. Falls back to Claude Vision API if ML service is unavailable.

## Configuration

Edit `configs/default.yaml`:

```yaml
device: "cuda"  # auto-fallback to cpu
detector:
  weights: "models/yolo11x_shelf.pt"
  conf_threshold: 0.25
encoder:
  backbone: "dinov2_vitb14"  # or "openclip_vitl14"
gallery:
  index_path: "models/gallery_v1.faiss"
recognize:
  distance_threshold: 0.35
  margin_threshold: 0.05
```

## Gallery Setup

Organize reference images by SKU:
```
data/gallery_raw/
  COCA_COLA_05/
    front.jpg
    angle.jpg
  PEPSI_05/
    front.jpg
  ...
```

Then build: `build-gallery --raw-dir data/gallery_raw/ --out models/gallery_v1.faiss`
