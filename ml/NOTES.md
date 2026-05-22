# Notes & Future Work

## Out of scope — do NOT implement here

- **Spaceman XML parser** — Fozzy may use JDA Space Planning or Spaceman PSA format. Ask which format before implementing.
- **Excel planogram parser** — some retailers export planograms as Excel. Defer until needed.
- **Spatial alignment** (homography, slot matching between photo and planogram) — separate project.
- **ONNX export** — deferred to optimization phase after MVP validation.
- **Dataset collection/annotation** — assume datasets exist per defined interface.
- **Training from scratch** — only fine-tuning on top of pretrained backbones.

## TODO for future phases

- [ ] RT-DETR as alternative detector backbone (switchable via config)
- [ ] Multi-GPU inference for large batch processing
- [ ] Embedding versioning: track model_version in gallery metadata, refuse mixed-version queries
- [ ] Prometheus metrics for API monitoring
- [ ] Async FAISS search for API concurrency
- [ ] Image quality check before detection (blur, exposure, angle)
