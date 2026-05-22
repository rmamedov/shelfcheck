"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Store {
  id: string;
  name: string;
  floorMapUrl?: string | null;
}

interface Shelf {
  id: string;
  shelfNumber: string;
}

interface ShelfPosition {
  id: string;
  storeId: string;
  shelfId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shelf: Shelf;
}

interface Audit {
  id: string;
  storeId: string;
  shelfId: string;
  complianceScore: number | null;
  createdAt: string;
  status: string;
  shelf: Shelf;
}

interface PopupData {
  shelfNumber: string;
  score: number | null;
  date: string | null;
  auditId: string | null;
  x: number;
  y: number;
}

function getComplianceColor(score: number | null): string {
  if (score === null) return "#9ca3af"; // gray
  if (score > 80) return "#22c55e"; // green
  if (score >= 50) return "#eab308"; // yellow
  return "#ef4444"; // red
}

function getComplianceLabel(score: number | null): string {
  if (score === null) return "Немає аудиту";
  if (score > 80) return "Добре";
  if (score >= 50) return "Увага";
  return "Критично";
}

interface StoreMapViewProps {
  storeId: string;
}

export default function StoreMapView({ storeId }: StoreMapViewProps) {
  const [store, setStore] = useState<Store | null>(null);
  const [positions, setPositions] = useState<ShelfPosition[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<PopupData | null>(null);

  // Zoom/pan state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storeId) return;

    setLoading(true);
    setPopup(null);
    setScale(1);
    setTranslate({ x: 0, y: 0 });

    Promise.all([
      fetch(`/api/stores/${storeId}`).then((r) => r.json()),
      fetch(`/api/stores/${storeId}/positions`).then((r) => r.json()),
      fetch(`/api/audits?storeId=${storeId}`).then((r) => r.json()),
    ])
      .then(([storeData, posData, auditData]) => {
        setStore(storeData);
        setPositions(Array.isArray(posData) ? posData : []);
        setAudits(Array.isArray(auditData) ? auditData : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [storeId]);

  // Find latest completed audit per shelf
  const latestAuditByShelf = useCallback(() => {
    const map: Record<string, Audit> = {};
    const sorted = [...audits]
      .filter((a) => a.complianceScore !== null)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    for (const audit of sorted) {
      if (!map[audit.shelfId]) {
        map[audit.shelfId] = audit;
      }
    }
    return map;
  }, [audits]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.min(3, Math.max(0.3, prev + delta)));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
      }
    },
    [translate]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setTranslate({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleShelfClick = useCallback(
    (pos: ShelfPosition, e: React.MouseEvent) => {
      e.stopPropagation();
      const auditMap = latestAuditByShelf();
      const audit = auditMap[pos.shelfId];

      const rect = containerRef.current?.getBoundingClientRect();
      const popupX = e.clientX - (rect?.left ?? 0);
      const popupY = e.clientY - (rect?.top ?? 0);

      setPopup({
        shelfNumber: pos.shelf.shelfNumber,
        score: audit?.complianceScore ?? null,
        date: audit?.createdAt ?? null,
        auditId: audit?.id ?? null,
        x: popupX,
        y: popupY,
      });
    },
    [latestAuditByShelf]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400">
        <svg
          className="animate-spin h-8 w-8 mr-3 text-blue-600"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Завантаження...
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400">
        Магазин не знайдено
      </div>
    );
  }

  const auditMap = latestAuditByShelf();

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative bg-gray-100 rounded-xl border border-gray-200 overflow-hidden"
        style={{
          height: 500,
          cursor: isPanning ? "grabbing" : "grab",
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "center center",
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Floor map background */}
          {store.floorMapUrl && (
            <img
              src={store.floorMapUrl}
              alt="Floor map"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          )}

          {!store.floorMapUrl && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300">
              <div className="text-center">
                <svg
                  className="w-16 h-16 mx-auto mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
                  />
                </svg>
                <span>Карта магазину не завантажена</span>
              </div>
            </div>
          )}

          {/* Shelf position overlays */}
          {positions.map((pos) => {
            const audit = auditMap[pos.shelfId];
            const score = audit?.complianceScore ?? null;
            const bgColor = getComplianceColor(score);

            return (
              <div
                key={pos.id}
                className="absolute flex items-center justify-center text-white text-xs font-bold cursor-pointer border-2 border-white/50 rounded shadow-md hover:shadow-lg hover:scale-105 transition-transform"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: `${pos.width}px`,
                  height: `${pos.height}px`,
                  backgroundColor: bgColor,
                  transform: "translate(-50%, -50%)",
                }}
                onClick={(e) => handleShelfClick(pos, e)}
                title={`${pos.shelf.shelfNumber} - ${
                  score !== null ? `${score.toFixed(0)}%` : "Немає аудиту"
                }`}
              >
                {pos.shelf.shelfNumber}
              </div>
            );
          })}
        </div>

        {/* Popup */}
        {popup && (
          <div
            className="absolute z-20 bg-white rounded-xl shadow-lg border border-gray-200 p-4 min-w-[220px]"
            style={{
              left: popup.x,
              top: popup.y,
              transform: "translate(-50%, -110%)",
            }}
          >
            <button
              onClick={() => setPopup(null)}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
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
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="font-semibold text-gray-900 mb-2">
              Стелаж {popup.shelfNumber}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Результат:</span>
                <span
                  className="font-medium"
                  style={{
                    color: getComplianceColor(popup.score),
                  }}
                >
                  {popup.score !== null
                    ? `${popup.score.toFixed(1)}%`
                    : "Немає аудиту"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Статус:</span>
                <span className="font-medium text-gray-700">
                  {getComplianceLabel(popup.score)}
                </span>
              </div>
              {popup.date && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Дата:</span>
                  <span className="text-gray-700">
                    {new Date(popup.date).toLocaleDateString("uk-UA")}
                  </span>
                </div>
              )}
            </div>
            {popup.auditId && (
              <a
                href={`/admin/audits/${popup.auditId}`}
                className="mt-3 block text-center text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Деталі аудиту &rarr;
              </a>
            )}
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1">
          <button
            onClick={() =>
              setScale((prev) => Math.min(3, prev + 0.2))
            }
            className="w-8 h-8 bg-white rounded-lg shadow border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          >
            +
          </button>
          <button
            onClick={() =>
              setScale((prev) => Math.max(0.3, prev - 0.2))
            }
            className="w-8 h-8 bg-white rounded-lg shadow border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          >
            -
          </button>
          <button
            onClick={() => {
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            }}
            className="w-8 h-8 bg-white rounded-lg shadow border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 text-xs"
          >
            1:1
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-2">
        <span className="text-sm font-medium text-gray-600">Легенда:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-green-500" />
          <span className="text-sm text-gray-600">&gt;80% Добре</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-yellow-500" />
          <span className="text-sm text-gray-600">50-80% Увага</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-red-500" />
          <span className="text-sm text-gray-600">&lt;50% Критично</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-gray-400" />
          <span className="text-sm text-gray-600">Немає аудиту</span>
        </div>
      </div>
    </div>
  );
}
