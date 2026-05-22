"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Shelf {
  id: string;
  shelfNumber: string;
  category: string | null;
  shelvesCount: number;
  planogramUrl: string | null;
}

interface Store {
  id: string;
  name: string;
  address: string | null;
  floorMapUrl: string | null;
  shelves: Shelf[];
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

export default function StoreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.id as string;

  const [store, setStore] = useState<Store | null>(null);
  const [positions, setPositions] = useState<ShelfPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [savingPositions, setSavingPositions] = useState(false);

  // Map editor state
  const mapRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [addShelfModalOpen, setAddShelfModalOpen] = useState(false);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);

  const fetchStore = useCallback(async () => {
    try {
      const [storeRes, posRes] = await Promise.all([
        fetch(`/api/stores/${storeId}`),
        fetch(`/api/stores/${storeId}/positions`),
      ]);
      const storeData = await storeRes.json();
      const posData = await posRes.json();
      if (storeData && !storeData.error) {
        setStore(storeData);
        setEditName(storeData.name);
        setEditAddress(storeData.address || "");
      }
      if (Array.isArray(posData)) setPositions(posData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchStore();
  }, [fetchStore]);

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/stores/${storeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, address: editAddress }),
      });
      fetchStore();
    } finally {
      setSaving(false);
    }
  }

  async function handleFloorMapUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "maps");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.url) {
        await fetch(`/api/stores/${storeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ floorMapUrl: uploadData.url }),
        });
        fetchStore();
      }
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleFloorMapUpload(file);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFloorMapUpload(file);
  }

  // Map interactions
  function handleMapClick(e: React.MouseEvent) {
    if (draggingId) return;
    if (!mapRef.current || !store?.shelves.length) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setClickPos({ x, y });
    setAddShelfModalOpen(true);
  }

  function handleAddShelfPosition(shelfId: string) {
    if (!clickPos) return;
    const existing = positions.find((p) => p.shelfId === shelfId);
    if (existing) {
      // Move existing
      setPositions((prev) =>
        prev.map((p) => (p.shelfId === shelfId ? { ...p, x: clickPos.x, y: clickPos.y } : p))
      );
    } else {
      const shelf = store?.shelves.find((s) => s.id === shelfId);
      if (!shelf) return;
      const newPos: ShelfPosition = {
        id: `temp-${Date.now()}`,
        storeId,
        shelfId,
        x: clickPos.x,
        y: clickPos.y,
        width: 8,
        height: 6,
        shelf,
      };
      setPositions((prev) => [...prev, newPos]);
    }
    setAddShelfModalOpen(false);
    setClickPos(null);
  }

  function handleMouseDown(e: React.MouseEvent, posId: string) {
    e.stopPropagation();
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const pos = positions.find((p) => p.id === posId);
    if (!pos) return;
    const posXPx = (pos.x / 100) * rect.width;
    const posYPx = (pos.y / 100) * rect.height;
    setDragOffset({ x: e.clientX - rect.left - posXPx, y: e.clientY - rect.top - posYPx });
    setDraggingId(posId);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!draggingId || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    const clamped = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    setPositions((prev) =>
      prev.map((p) => (p.id === draggingId ? { ...p, x: clamped.x, y: clamped.y } : p))
    );
  }

  function handleMouseUp() {
    setDraggingId(null);
  }

  function removePosition(posId: string) {
    setPositions((prev) => prev.filter((p) => p.id !== posId));
  }

  async function savePositions() {
    setSavingPositions(true);
    try {
      const payload = positions.map((p) => ({
        shelfId: p.shelfId,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
      }));
      await fetch(`/api/stores/${storeId}/positions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      fetchStore();
    } finally {
      setSavingPositions(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Магазин не знайдено</p>
        <Link href="/admin/stores" className="mt-2 text-blue-600 text-sm hover:underline">
          Повернутися до списку
        </Link>
      </div>
    );
  }

  const shelvesWithoutPosition = store.shelves.filter(
    (s) => !positions.find((p) => p.shelfId === s.id)
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/stores" className="hover:text-blue-600">
          Магазини
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{store.name}</span>
      </div>

      {/* Store info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Інформація про магазин</h2>
        <form onSubmit={handleSaveInfo} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Назва</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Адреса</label>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="self-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Збереження..." : "Зберегти"}
            </button>
          </div>
        </form>
      </div>

      {/* Floor map upload */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Карта торгового залу</h2>
        {!store.floorMapUrl ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300"
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Завантаження...</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M2.25 18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V6a2.25 2.25 0 0 0-2.25-2.25H4.5A2.25 2.25 0 0 0 2.25 6v12Z" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">
                  Перетягніть зображення карти сюди або{" "}
                  <label className="text-blue-600 hover:text-blue-700 cursor-pointer font-medium">
                    оберіть файл
                    <input type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
                  </label>
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Map editor */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500">
                Натисніть на карту, щоб додати стелаж. Перетягуйте прямокутники для зміни позиції.
              </p>
              <div className="flex gap-2">
                <label className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
                  Замінити карту
                  <input type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
                </label>
                <button
                  onClick={savePositions}
                  disabled={savingPositions}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingPositions ? "Збереження..." : "Зберегти позиції"}
                </button>
              </div>
            </div>

            <div
              ref={mapRef}
              className="relative border border-gray-200 rounded-lg overflow-hidden cursor-crosshair select-none"
              style={{ aspectRatio: "16/10" }}
              onClick={handleMapClick}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={store.floorMapUrl}
                alt="Floor map"
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
              />
              {positions.map((pos) => (
                <div
                  key={pos.id}
                  className={`absolute border-2 rounded flex items-center justify-center text-xs font-bold transition-shadow ${
                    draggingId === pos.id
                      ? "border-blue-600 bg-blue-200/70 shadow-lg z-10"
                      : "border-blue-500 bg-blue-100/70 hover:shadow-md"
                  }`}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: `${pos.width}%`,
                    height: `${pos.height}%`,
                    cursor: draggingId === pos.id ? "grabbing" : "grab",
                  }}
                  onMouseDown={(e) => handleMouseDown(e, pos.id)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-blue-800 drop-shadow-sm">{pos.shelf.shelfNumber}</span>
                  <button
                    className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center hover:bg-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePosition(pos.id);
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>

            {shelvesWithoutPosition.length > 0 && (
              <p className="text-xs text-amber-600">
                {shelvesWithoutPosition.length} стелажів ще не розміщено на карті:{" "}
                {shelvesWithoutPosition.map((s) => s.shelfNumber).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Shelves list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Стелажі ({store.shelves.length})
          </h2>
          <Link
            href="/admin/shelves"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Управління стелажами
          </Link>
        </div>
        {store.shelves.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            У цьому магазині ще немає стелажів.{" "}
            <Link href="/admin/shelves" className="text-blue-600 hover:underline">
              Додати стелаж
            </Link>
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {store.shelves.map((shelf) => (
              <div key={shelf.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {shelf.planogramUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shelf.planogramUrl}
                      alt="Planogram"
                      className="w-10 h-10 rounded object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M2.25 18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V6a2.25 2.25 0 0 0-2.25-2.25H4.5A2.25 2.25 0 0 0 2.25 6v12Z" />
                      </svg>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">Стелаж {shelf.shelfNumber}</p>
                    <p className="text-xs text-gray-500">
                      {shelf.category || "Без категорії"} &middot; {shelf.shelvesCount} полиць
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add shelf to map modal */}
      {addShelfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setAddShelfModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Оберіть стелаж для розміщення
            </h3>
            {store.shelves.length === 0 ? (
              <p className="text-sm text-gray-500">
                Спочатку додайте стелажі до цього магазину.
              </p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {store.shelves.map((shelf) => {
                  const hasPosition = positions.some((p) => p.shelfId === shelf.id);
                  return (
                    <button
                      key={shelf.id}
                      onClick={() => handleAddShelfPosition(shelf.id)}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>
                        Стелаж {shelf.shelfNumber}
                        <span className="text-gray-400 ml-1">({shelf.category || "—"})</span>
                      </span>
                      {hasPosition && (
                        <span className="text-xs text-amber-600">Перемістити</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setAddShelfModalOpen(false)}
              className="mt-4 w-full px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
