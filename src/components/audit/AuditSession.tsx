"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CameraCapture } from "./CameraCapture";
import { ComplianceGauge } from "./ComplianceGauge";
import { ViolationCard, ViolationType } from "./ViolationCard";
import { ImageSourcePicker } from "./ImageSourcePicker";

interface AuditShelf {
  id: string;
  shelfNumber: string;
  category: string | null;
  shelvesCount: number;
  planogramUrl: string | null;
}

interface AuditStore {
  id: string;
  name: string;
}

interface AuditPhoto {
  id: string;
  shelfLevel: number;
  photoUrl: string;
}

interface AuditData {
  id: string;
  storeId: string;
  shelfId: string;
  merchandiserName: string | null;
  status: string;
  complianceScore: number | null;
  shelf: AuditShelf;
  store: AuditStore;
  photos: AuditPhoto[];
  violations: ViolationType[];
}

interface AnalysisResult {
  complianceScore: number;
  violations: Array<{
    type: string;
    productName: string;
    articleNumber: string | null;
    shelfLevel: number;
    position: number;
    description: string;
  }>;
  summary: string;
}

type Phase = "loading" | "photography" | "analysis" | "results";

interface ShelfPhoto {
  level: number;
  blob: Blob;
  url: string; // object URL for preview
  uploadedUrl?: string; // server URL after upload
}

export function AuditSession({ auditId }: { auditId: string }) {
  const router = useRouter();

  // Audit data
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  // Photography state
  const [currentLevel, setCurrentLevel] = useState(0);
  const [photos, setPhotos] = useState<ShelfPhoto[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Analysis state
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisTotal, setAnalysisTotal] = useState(0);
  const [currentAnalysisLevel, setCurrentAnalysisLevel] = useState(0);

  // Results state
  const [complianceScore, setComplianceScore] = useState<number | null>(null);
  const [violations, setViolations] = useState<ViolationType[]>([]);
  const [resultSummary, setResultSummary] = useState("");
  const [activeResultTab, setActiveResultTab] = useState<
    "planogram" | "photo" | "comparison"
  >("photo");
  const [activePhotoLevel, setActivePhotoLevel] = useState(0);

  // Fix camera state
  const [fixingViolationId, setFixingViolationId] = useState<string | null>(
    null
  );
  const [showFixCamera, setShowFixCamera] = useState(false);

  // Source picker state
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showFixSourcePicker, setShowFixSourcePicker] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fixGalleryInputRef = useRef<HTMLInputElement>(null);

  // Load audit data
  useEffect(() => {
    async function loadAudit() {
      try {
        const res = await fetch(`/api/audits/${auditId}`);
        const data = await res.json();
        if (data.error) {
          router.push("/audit");
          return;
        }
        setAudit(data);

        if (data.status === "completed") {
          // Show results for completed audits
          setComplianceScore(data.complianceScore);
          setViolations(data.violations || []);
          setPhase("results");
        } else {
          // Resume or start photography
          setCurrentLevel(data.shelf.shelvesCount);
          setPhase("photography");
          // Load any existing photos
          if (data.photos && data.photos.length > 0) {
            const existingPhotos: ShelfPhoto[] = data.photos.map(
              (p: AuditPhoto) => ({
                level: p.shelfLevel,
                blob: new Blob(), // placeholder
                url: p.photoUrl,
                uploadedUrl: p.photoUrl,
              })
            );
            setPhotos(existingPhotos);
            // Find next level to photograph
            const photographedLevels = new Set(
              data.photos.map((p: AuditPhoto) => p.shelfLevel)
            );
            let nextLevel = data.shelf.shelvesCount;
            while (nextLevel >= 1 && photographedLevels.has(nextLevel)) {
              nextLevel--;
            }
            if (nextLevel < 1) {
              // All levels done, move to analysis
              startAnalysis(data, existingPhotos);
            } else {
              setCurrentLevel(nextLevel);
            }
          }
        }
      } catch {
        router.push("/audit");
      }
    }
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  // Photography handlers
  function handleOpenCamera() {
    setShowSourcePicker(true);
  }

  function handleSourceCamera() {
    setShowSourcePicker(false);
    setShowCamera(true);
  }

  function handleSourceGallery() {
    setShowSourcePicker(false);
    galleryInputRef.current?.click();
  }

  function handleGallerySelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be selected again
    e.target.value = "";
    handleCapture(file);
  }

  function handleCapture(blob: Blob) {
    const url = URL.createObjectURL(blob);
    setPreviewBlob(blob);
    setPreviewUrl(url);
    setShowCamera(false);
  }

  function handleRetake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl(null);
    setShowCamera(true);
  }

  async function handleAcceptPhoto() {
    if (!previewBlob || !audit) return;
    setUploading(true);

    try {
      // Upload the photo
      const formData = new FormData();
      formData.append("file", previewBlob, `shelf_${currentLevel}.jpg`);
      formData.append("type", "photos");

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadData.url) throw new Error("Upload failed");

      // Create audit photo record
      const photoRecord = {
        level: currentLevel,
        blob: previewBlob,
        url: previewUrl!,
        uploadedUrl: uploadData.url,
      };

      const newPhotos = [...photos, photoRecord];
      setPhotos(newPhotos);

      // Save photo to audit
      await fetch(`/api/audits/${auditId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Create AuditPhoto record via direct DB call through a simple endpoint
      // For now, we'll track it and use the photos during analysis
      setPreviewBlob(null);
      setPreviewUrl(null);

      // Move to next level
      const nextLevel = currentLevel - 1;
      if (nextLevel < 1) {
        // All levels photographed
        startAnalysis(audit, newPhotos);
      } else {
        setCurrentLevel(nextLevel);
      }
    } catch {
      // ignore, keep on preview
    } finally {
      setUploading(false);
    }
  }

  function handleSkipToWholeRack() {
    // Set to whole-rack mode and open source picker
    setCurrentLevel(0); // special "whole rack" indicator
    setShowSourcePicker(true);
  }

  // Analysis
  const startAnalysis = useCallback(
    async (auditData: AuditData, auditPhotos: ShelfPhoto[]) => {
      setPhase("analysis");
      setAnalysisTotal(auditPhotos.length);
      setAnalysisProgress(0);

      let allViolations: ViolationType[] = [];
      let lastScore = 0;
      let lastSummary = "";

      for (let i = 0; i < auditPhotos.length; i++) {
        const photo = auditPhotos[i];
        setCurrentAnalysisLevel(photo.level);
        setAnalysisProgress(i);

        try {
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              auditId: auditData.id,
              shelfLevel: photo.level,
              photoUrl: photo.uploadedUrl || photo.url,
              planogramUrl: auditData.shelf.planogramUrl || "",
              shelfNumber: auditData.shelf.shelfNumber,
            }),
          });

          const result: AnalysisResult = await res.json();
          if (result.complianceScore !== undefined) {
            lastScore = result.complianceScore;
          }
          if (result.summary) {
            lastSummary = result.summary;
          }
        } catch {
          // Continue with next photo
        }

        setAnalysisProgress(i + 1);
      }

      // Fetch final violations from server
      try {
        const violationsRes = await fetch(
          `/api/audits/${auditData.id}/violations`
        );
        const violationsData = await violationsRes.json();
        if (Array.isArray(violationsData)) {
          allViolations = violationsData;
        }
      } catch {
        // ignore
      }

      // Fetch updated audit for final score
      try {
        const auditRes = await fetch(`/api/audits/${auditData.id}`);
        const updatedAudit = await auditRes.json();
        if (updatedAudit.complianceScore !== undefined) {
          lastScore = updatedAudit.complianceScore;
        }
      } catch {
        // ignore
      }

      setComplianceScore(lastScore);
      setViolations(allViolations);
      setResultSummary(lastSummary);
      setPhase("results");
    },
    []
  );

  // Violation handlers
  async function handleViolationComment(
    violationId: string,
    comment: string
  ) {
    if (!audit) return;
    try {
      await fetch(`/api/audits/${audit.id}/violations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ violationId, comment }),
      });
      setViolations((prev) =>
        prev.map((v) => (v.id === violationId ? { ...v, comment } : v))
      );
    } catch {
      // ignore
    }
  }

  function handleViolationFix(violationId: string) {
    setFixingViolationId(violationId);
    setShowFixSourcePicker(true);
  }

  function handleFixSourceCamera() {
    setShowFixSourcePicker(false);
    setShowFixCamera(true);
  }

  function handleFixSourceGallery() {
    setShowFixSourcePicker(false);
    fixGalleryInputRef.current?.click();
  }

  function handleFixGallerySelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleFixCapture(file);
  }

  async function handleFixCapture(blob: Blob) {
    if (!fixingViolationId || !audit) return;
    setShowFixCamera(false);

    try {
      // Upload fix photo
      const formData = new FormData();
      formData.append("file", blob, "fix_photo.jpg");
      formData.append("type", "photos");

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (uploadData.url) {
        await fetch(`/api/audits/${audit.id}/violations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            violationId: fixingViolationId,
            isFixed: true,
            fixedPhotoUrl: uploadData.url,
          }),
        });

        setViolations((prev) =>
          prev.map((v) =>
            v.id === fixingViolationId
              ? { ...v, isFixed: true, fixedPhotoUrl: uploadData.url }
              : v
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setFixingViolationId(null);
    }
  }

  // Complete audit
  async function handleCompleteAudit() {
    if (!audit) return;
    try {
      await fetch(`/api/audits/${audit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          complianceScore: complianceScore,
        }),
      });
      router.push("/audit");
    } catch {
      // ignore
    }
  }

  // Loading phase
  if (phase === "loading" || !audit) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Завантаження...</p>
        </div>
      </div>
    );
  }

  // Photography phase
  if (phase === "photography") {
    const totalLevels = audit.shelf.shelvesCount;
    const photographedCount = photos.length;
    const progress =
      currentLevel === 0
        ? 100
        : ((totalLevels - currentLevel) / totalLevels) * 100;

    return (
      <div className="p-4 pb-8">
        {/* Hidden gallery file input */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleGallerySelect}
        />

        {/* Source picker */}
        {showSourcePicker && (
          <ImageSourcePicker
            onSelectCamera={handleSourceCamera}
            onSelectGallery={handleSourceGallery}
            onClose={() => setShowSourcePicker(false)}
          />
        )}

        {/* Camera overlay */}
        {showCamera && (
          <CameraCapture
            onCapture={handleCapture}
            onClose={() => setShowCamera(false)}
            guideText={
              currentLevel === 0
                ? "Сфотографуйте весь стелаж"
                : `Полиця ${currentLevel} з ${totalLevels}`
            }
          />
        )}

        {/* Header info */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              {audit.store.name}
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            Стелаж {audit.shelf.shelfNumber}
            {audit.shelf.category ? ` — ${audit.shelf.category}` : ""}
          </h2>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-gray-900">
              {currentLevel === 0
                ? "Фото всього стелажу"
                : `Полиця ${currentLevel} з ${totalLevels}`}
            </span>
            <span className="text-xs text-gray-500">
              {photographedCount}/{totalLevels} зроблено
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Preview or camera trigger */}
        {previewUrl ? (
          <div className="space-y-3">
            <div className="rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
              <img
                src={previewUrl}
                alt={`Полиця ${currentLevel}`}
                className="w-full aspect-[4/3] object-cover"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRetake}
                className="flex-1 h-12 bg-gray-100 text-gray-700 font-semibold rounded-xl active:bg-gray-200 transition-colors"
              >
                Перезняти
              </button>
              <button
                onClick={handleAcceptPhoto}
                disabled={uploading}
                className="flex-1 h-12 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Далі
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Camera viewfinder placeholder */}
            <button
              onClick={handleOpenCamera}
              className="w-full aspect-[4/3] bg-gray-900 rounded-2xl flex flex-col items-center justify-center gap-3 active:bg-gray-800 transition-colors"
            >
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                  />
                </svg>
              </div>
              <p className="text-white/70 text-sm">
                Натисніть, щоб відкрити камеру
              </p>
            </button>

            {/* Skip button */}
            {photographedCount === 0 && (
              <button
                onClick={handleSkipToWholeRack}
                className="w-full h-11 text-sm text-gray-500 active:text-gray-700 transition-colors"
              >
                Зробити одне фото всього стелажу
              </button>
            )}
          </div>
        )}

        {/* Taken photos strip */}
        {photos.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Зроблені фото
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {photos.map((photo, idx) => (
                <div
                  key={idx}
                  className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0 border-2 border-green-400"
                >
                  <img
                    src={photo.uploadedUrl || photo.url}
                    alt={`Полиця ${photo.level}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Analysis phase
  if (phase === "analysis") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center px-6">
          {/* Animated spinner */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-blue-100 rounded-full" />
            <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
            </div>
          </div>

          <h2 className="text-lg font-bold text-gray-900 mb-1">
            Аналізуємо...
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {currentAnalysisLevel > 0
              ? `Аналіз полиці ${currentAnalysisLevel}...`
              : "Підготовка до аналізу..."}
          </p>

          {/* Progress */}
          <div className="w-48 mx-auto">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-700"
                style={{
                  width: `${
                    analysisTotal > 0
                      ? (analysisProgress / analysisTotal) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {analysisProgress} з {analysisTotal}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Results phase
  return (
    <div className="pb-8">
      {/* Hidden fix gallery input */}
      <input
        ref={fixGalleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFixGallerySelect}
      />

      {/* Fix source picker */}
      {showFixSourcePicker && (
        <ImageSourcePicker
          onSelectCamera={handleFixSourceCamera}
          onSelectGallery={handleFixSourceGallery}
          onClose={() => {
            setShowFixSourcePicker(false);
            setFixingViolationId(null);
          }}
        />
      )}

      {/* Fix camera */}
      {showFixCamera && (
        <CameraCapture
          onCapture={handleFixCapture}
          onClose={() => {
            setShowFixCamera(false);
            setFixingViolationId(null);
          }}
          guideText="Сфотографуйте виправлену полицю"
        />
      )}

      {/* Score */}
      <div className="flex flex-col items-center py-6 bg-white border-b border-gray-100">
        <ComplianceGauge score={complianceScore ?? 0} />
        {resultSummary && (
          <p className="text-sm text-gray-600 text-center mt-3 px-6 max-w-sm">
            {resultSummary}
          </p>
        )}
      </div>

      {/* Comparison tabs */}
      <div className="px-4 pt-4">
        <div className="flex bg-gray-100 rounded-xl p-1 mb-3">
          {(
            [
              { key: "planogram", label: "Планограма" },
              { key: "photo", label: "Фото" },
              { key: "comparison", label: "Порівняння" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveResultTab(tab.key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeResultTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 mb-6">
          {activeResultTab === "planogram" && (
            <div className="aspect-[4/3] flex items-center justify-center">
              {audit.shelf.planogramUrl ? (
                <img
                  src={audit.shelf.planogramUrl}
                  alt="Планограма"
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-sm text-gray-400">Планограма відсутня</p>
              )}
            </div>
          )}

          {activeResultTab === "photo" && (
            <div>
              <div className="aspect-[4/3] flex items-center justify-center bg-gray-900">
                {photos.length > 0 || (audit.photos && audit.photos.length > 0) ? (
                  <img
                    src={
                      photos[activePhotoLevel]?.uploadedUrl ||
                      photos[activePhotoLevel]?.url ||
                      audit.photos[activePhotoLevel]?.photoUrl ||
                      ""
                    }
                    alt={`Полиця ${activePhotoLevel + 1}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <p className="text-sm text-gray-400">Немає фото</p>
                )}
              </div>
              {/* Level selector */}
              {(photos.length > 1 ||
                (audit.photos && audit.photos.length > 1)) && (
                <div className="flex gap-1.5 p-2 overflow-x-auto">
                  {(photos.length > 0 ? photos : audit.photos).map(
                    (photo, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActivePhotoLevel(idx)}
                        className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${
                          activePhotoLevel === idx
                            ? "border-blue-500"
                            : "border-transparent"
                        }`}
                      >
                        <img
                          src={
                            "uploadedUrl" in photo
                              ? (photo as ShelfPhoto).uploadedUrl ||
                                (photo as ShelfPhoto).url
                              : (photo as AuditPhoto).photoUrl
                          }
                          alt={`Рівень ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {activeResultTab === "comparison" && (
            <div className="aspect-[4/3] grid grid-cols-2 gap-px bg-gray-300">
              <div className="bg-gray-100 flex items-center justify-center">
                {audit.shelf.planogramUrl ? (
                  <img
                    src={audit.shelf.planogramUrl}
                    alt="Планограма"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <p className="text-[10px] text-gray-400 text-center">
                    Планограма
                  </p>
                )}
              </div>
              <div className="bg-gray-900 flex items-center justify-center">
                {photos.length > 0 || (audit.photos && audit.photos.length > 0) ? (
                  <img
                    src={
                      photos[0]?.uploadedUrl ||
                      photos[0]?.url ||
                      audit.photos[0]?.photoUrl ||
                      ""
                    }
                    alt="Фото"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <p className="text-[10px] text-gray-400 text-center">
                    Фото
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Violations */}
        {violations.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">
                Порушення ({violations.length})
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                  {violations.filter((v) => v.type === "missing").length}{" "}
                  відсутніх
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">
                  {violations.filter((v) => v.type === "misplaced").length}{" "}
                  зміщених
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                  {violations.filter((v) => v.type === "extra").length}{" "}
                  зайвих
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {violations.map((violation) => (
                <ViolationCard
                  key={violation.id}
                  violation={violation}
                  onComment={handleViolationComment}
                  onFix={handleViolationFix}
                />
              ))}
            </div>
          </div>
        )}

        {/* No violations */}
        {violations.length === 0 && complianceScore !== null && (
          <div className="text-center py-8 mb-6">
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-7 h-7 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">
              Порушень не виявлено
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Стелаж відповідає планограмі
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {audit.status !== "completed" && (
            <button
              onClick={handleCompleteAudit}
              className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              Завершити аудит
            </button>
          )}
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: `Аудит стелажу ${audit.shelf.shelfNumber}`,
                  text: `Відповідність: ${complianceScore}%. Порушень: ${violations.length}`,
                  url: window.location.href,
                });
              } else {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            className="w-full h-12 bg-gray-100 text-gray-700 font-semibold rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
              />
            </svg>
            Поділитися звітом
          </button>
        </div>
      </div>
    </div>
  );
}
