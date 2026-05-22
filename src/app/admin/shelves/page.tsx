"use client";

import { useEffect, useState, useCallback } from "react";

interface Store {
  id: string;
  name: string;
}

interface PlanogramImage {
  id: string;
  imageUrl: string;
  sortOrder: number;
  label: string | null;
}

interface Shelf {
  id: string;
  storeId: string;
  shelfNumber: string;
  category: string | null;
  shelvesCount: number;
  planogramUrl: string | null;
  planogramImages?: PlanogramImage[];
  store: Store;
}

type UploadMode = "per-shelf" | "single";

interface ShelfSlotImage {
  url: string;
  label: string;
}

export default function ShelvesPage() {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStoreId, setFilterStoreId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editShelf, setEditShelf] = useState<Shelf | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [formStoreId, setFormStoreId] = useState("");
  const [formNumber, setFormNumber] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formShelvesCount, setFormShelvesCount] = useState(6);

  // Planogram upload state
  const [uploadMode, setUploadMode] = useState<UploadMode>("single");
  const [singleImage, setSingleImage] = useState<ShelfSlotImage | null>(null);
  const [perShelfImages, setPerShelfImages] = useState<(ShelfSlotImage | null)[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const url = filterStoreId ? `/api/shelves?storeId=${filterStoreId}` : "/api/shelves";
      const [shelvesRes, storesRes] = await Promise.all([
        fetch(url),
        fetch("/api/stores"),
      ]);
      const shelvesData = await shelvesRes.json();
      const storesData = await storesRes.json();
      if (Array.isArray(shelvesData)) setShelves(shelvesData);
      if (Array.isArray(storesData))
        setStores(storesData.map((s: Store & { _count?: unknown }) => ({ id: s.id, name: s.name })));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset per-shelf slots when shelvesCount changes
  useEffect(() => {
    setPerShelfImages((prev) => {
      const arr = Array(formShelvesCount).fill(null) as (ShelfSlotImage | null)[];
      // Preserve any existing images
      for (let i = 0; i < Math.min(prev.length, formShelvesCount); i++) {
        arr[i] = prev[i];
      }
      return arr;
    });
  }, [formShelvesCount]);

  function openCreateModal() {
    setEditShelf(null);
    setFormStoreId(filterStoreId || (stores[0]?.id ?? ""));
    setFormNumber("");
    setFormCategory("");
    setFormShelvesCount(6);
    setUploadMode("single");
    setSingleImage(null);
    setPerShelfImages(Array(6).fill(null));
    setModalOpen(true);
  }

  function openEditModal(shelf: Shelf) {
    setEditShelf(shelf);
    setFormStoreId(shelf.storeId);
    setFormNumber(shelf.shelfNumber);
    setFormCategory(shelf.category || "");
    setFormShelvesCount(shelf.shelvesCount);

    const imgs = shelf.planogramImages || [];
    if (imgs.length === 0) {
      setUploadMode("single");
      setSingleImage(null);
      setPerShelfImages(Array(shelf.shelvesCount).fill(null));
    } else if (imgs.length === 1 && (!imgs[0].label || imgs[0].label === "Весь стелаж")) {
      // Single image mode
      setUploadMode("single");
      setSingleImage({ url: imgs[0].imageUrl, label: imgs[0].label || "Весь стелаж" });
      setPerShelfImages(Array(shelf.shelvesCount).fill(null));
    } else {
      // Per-shelf mode
      setUploadMode("per-shelf");
      setSingleImage(null);
      const slots: (ShelfSlotImage | null)[] = Array(shelf.shelvesCount).fill(null);
      for (const img of imgs) {
        const idx = img.sortOrder;
        if (idx >= 0 && idx < shelf.shelvesCount) {
          slots[idx] = { url: img.imageUrl, label: img.label || `Полиця ${idx + 1}` };
        }
      }
      setPerShelfImages(slots);
    }

    setModalOpen(true);
  }

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "planograms");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    return data.url || null;
  }

  // Single image handlers
  async function handleSingleUpload(files: FileList | File[]) {
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setUploadingSlot(-1);
    try {
      const url = await uploadFile(file);
      if (url) {
        setSingleImage({ url, label: "Весь стелаж" });
      }
    } finally {
      setUploadingSlot(null);
    }
  }

  // Per-shelf handlers
  async function handlePerShelfUpload(slotIndex: number, files: FileList | File[]) {
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setUploadingSlot(slotIndex);
    try {
      const url = await uploadFile(file);
      if (url) {
        setPerShelfImages((prev) => {
          const next = [...prev];
          next[slotIndex] = { url, label: `Полиця ${slotIndex + 1}` };
          return next;
        });
      }
    } finally {
      setUploadingSlot(null);
    }
  }

  function handleDrop(slotIndex: number, e: React.DragEvent) {
    e.preventDefault();
    setDragOverSlot(null);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      if (slotIndex === -1) {
        handleSingleUpload(files);
      } else {
        handlePerShelfUpload(slotIndex, files);
      }
    }
  }

  function removeImage(slotIndex: number) {
    if (slotIndex === -1) {
      setSingleImage(null);
    } else {
      setPerShelfImages((prev) => {
        const next = [...prev];
        next[slotIndex] = null;
        return next;
      });
    }
  }

  // Collect all images for save
  function collectPlanogramImages(): ShelfSlotImage[] {
    if (uploadMode === "single") {
      return singleImage ? [singleImage] : [];
    }
    return perShelfImages
      .map((img, idx) => (img ? { ...img, label: `Полиця ${idx + 1}` } : null))
      .filter((x): x is ShelfSlotImage => x !== null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const images = collectPlanogramImages();
      const payload = {
        storeId: formStoreId,
        shelfNumber: formNumber,
        category: formCategory || null,
        shelvesCount: formShelvesCount,
        planogramUrl: images[0]?.url || null,
      };

      let shelfId = editShelf?.id;
      if (editShelf) {
        await fetch(`/api/shelves/${editShelf.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const res = await fetch("/api/shelves", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        shelfId = data.id;
      }

      // Save planogram images
      if (shelfId) {
        // Delete existing
        await fetch(`/api/shelves/${shelfId}/planograms`, { method: "DELETE" });
        // Create new
        for (let i = 0; i < images.length; i++) {
          await fetch(`/api/shelves/${shelfId}/planograms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: images[i].url,
              sortOrder: i,
              label: images[i].label,
            }),
          });
        }
      }

      setModalOpen(false);
      fetchData();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити цей стелаж?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/shelves/${id}`, { method: "DELETE" });
      fetchData();
    } finally {
      setDeleting(null);
    }
  }

  // --- Upload zone component ---
  function UploadZone({
    slotIndex,
    image,
    label,
    compact,
  }: {
    slotIndex: number;
    image: ShelfSlotImage | null;
    label: string;
    compact?: boolean;
  }) {
    const isUploading = uploadingSlot === slotIndex;
    const isDragOver = dragOverSlot === slotIndex;

    if (image) {
      return (
        <div className={`relative group ${compact ? "h-28" : "h-40"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={label}
            className="w-full h-full object-cover rounded-xl border border-gray-200"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-colors" />
          <button
            type="button"
            onClick={() => removeImage(slotIndex)}
            className="absolute top-2 right-2 p-1 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-xl px-3 py-2">
            <p className="text-xs text-white font-medium">{label}</p>
          </div>
        </div>
      );
    }

    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverSlot(slotIndex);
        }}
        onDragLeave={() => setDragOverSlot(null)}
        onDrop={(e) => handleDrop(slotIndex, e)}
        className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors ${
          compact ? "h-28" : "h-40"
        } ${isDragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-[11px] text-gray-500">Завантаження...</p>
          </div>
        ) : (
          <>
            <svg className={`text-gray-300 ${compact ? "w-6 h-6" : "w-8 h-8"} mb-1.5`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3h18M3 3v18m0-18h.257M21 3v18M3 21h18" />
            </svg>
            <p className={`text-gray-500 font-medium ${compact ? "text-[11px]" : "text-xs"}`}>
              {label}
            </p>
            <label className={`text-blue-600 hover:text-blue-700 cursor-pointer font-medium ${compact ? "text-[10px]" : "text-[11px]"}`}>
              Обрати файл
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    if (slotIndex === -1) {
                      handleSingleUpload(e.target.files);
                    } else {
                      handlePerShelfUpload(slotIndex, e.target.files);
                    }
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Стелажі</h1>
          <p className="mt-1 text-sm text-gray-500">Управління стелажами та планограмами</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Додати стелаж
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={filterStoreId}
          onChange={(e) => {
            setFilterStoreId(e.target.value);
            setLoading(true);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Всі магазини</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 bg-white rounded-xl shadow-sm border border-gray-200 animate-pulse" />
          ))}
        </div>
      ) : shelves.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
          <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
          </svg>
          <p className="mt-4 text-gray-500">Стелажів ще немає</p>
          <button onClick={openCreateModal} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
            Додати перший стелаж
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {shelves.map((shelf) => {
            const imgCount = shelf.planogramImages?.length || 0;
            return (
              <div
                key={shelf.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"
              >
                {/* Planogram thumbnail */}
                <div className="h-32 bg-gray-50 flex items-center justify-center relative">
                  {shelf.planogramUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shelf.planogramUrl}
                        alt="Planogram"
                        className="w-full h-full object-cover"
                      />
                      {imgCount > 1 && (
                        <span className="absolute top-2 right-2 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded-md">
                          {imgCount} зобр.
                        </span>
                      )}
                    </>
                  ) : (
                    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M2.25 18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V6a2.25 2.25 0 0 0-2.25-2.25H4.5A2.25 2.25 0 0 0 2.25 6v12Z" />
                    </svg>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Стелаж {shelf.shelfNumber}
                    </h3>
                    <span className="shrink-0 text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {shelf.shelvesCount} полиць
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{shelf.store.name}</p>
                  {shelf.category && (
                    <span className="mt-1.5 inline-block self-start px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-md font-medium">
                      {shelf.category}
                    </span>
                  )}
                  <div className="mt-auto pt-3 flex gap-2">
                    <button
                      onClick={() => openEditModal(shelf)}
                      className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Редагувати
                    </button>
                    <button
                      onClick={() => handleDelete(shelf.id)}
                      disabled={deleting === shelf.id}
                      className="px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {deleting === shelf.id ? "..." : "Видалити"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editShelf ? "Редагувати стелаж" : "Новий стелаж"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Магазин *</label>
                <select
                  required
                  value={formStoreId}
                  onChange={(e) => setFormStoreId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Оберіть магазин</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Номер стелажу *
                  </label>
                  <input
                    type="text"
                    required
                    value={formNumber}
                    onChange={(e) => setFormNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="A1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Кількість полиць
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formShelvesCount}
                    onChange={(e) => setFormShelvesCount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категорія</label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Молочні продукти"
                />
              </div>

              {/* ===== Planogram Upload Section ===== */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Зображення планограми
                </label>

                {/* Mode toggle */}
                <div className="flex bg-gray-100 rounded-xl p-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setUploadMode("single")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      uploadMode === "single"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3h18M3 3v18m0-18h.257M21 3v18M3 21h18" />
                    </svg>
                    Одне зображення
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode("per-shelf")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      uploadMode === "per-shelf"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                    </svg>
                    По полицях
                  </button>
                </div>

                {/* Mode description */}
                <p className="text-[11px] text-gray-400 mb-3">
                  {uploadMode === "single"
                    ? "Завантажте одне зображення всіх полиць стелажу"
                    : `Завантажте окреме зображення для кожної з ${formShelvesCount} полиць`}
                </p>

                {/* Single image upload */}
                {uploadMode === "single" && (
                  <UploadZone
                    slotIndex={-1}
                    image={singleImage}
                    label="Весь стелаж"
                  />
                )}

                {/* Per-shelf upload */}
                {uploadMode === "per-shelf" && (
                  <div className="space-y-2">
                    {perShelfImages.map((img, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="shrink-0 w-20 text-right">
                          <span className="text-xs font-semibold text-gray-600">
                            Полиця {idx + 1}
                          </span>
                        </div>
                        <div className="flex-1">
                          <UploadZone
                            slotIndex={idx}
                            image={img}
                            label={`Полиця ${idx + 1}`}
                            compact
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formStoreId || !formNumber.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Збереження..." : editShelf ? "Зберегти" : "Створити"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
