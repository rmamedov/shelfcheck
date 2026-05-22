"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Store {
  id: string;
  name: string;
  address: string | null;
}

interface Shelf {
  id: string;
  storeId: string;
  shelfNumber: string;
  category: string | null;
  shelvesCount: number;
  planogramUrl: string | null;
}

interface Audit {
  id: string;
  storeId: string;
  shelfId: string;
  merchandiserName: string | null;
  status: string;
  complianceScore: number | null;
  createdAt: string;
  shelf: Shelf;
  store: Store;
}

export default function AuditHomePage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [ongoingAudits, setOngoingAudits] = useState<Audit[]>([]);
  const [recentAudits, setRecentAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [shelvesLoading, setShelvesLoading] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null);
  const [merchandiserName, setMerchandiserName] = useState("");
  const [creating, setCreating] = useState(false);

  // Fetch stores on mount
  useEffect(() => {
    async function fetchStores() {
      try {
        const res = await fetch("/api/stores");
        const data = await res.json();
        if (Array.isArray(data)) setStores(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, []);

  // Fetch shelves and audits when store changes
  useEffect(() => {
    if (!selectedStoreId) {
      setShelves([]);
      setOngoingAudits([]);
      setRecentAudits([]);
      return;
    }

    async function fetchData() {
      setShelvesLoading(true);
      try {
        const [shelvesRes, auditsRes] = await Promise.all([
          fetch(`/api/shelves?storeId=${selectedStoreId}`),
          fetch(`/api/audits?storeId=${selectedStoreId}`),
        ]);
        const shelvesData = await shelvesRes.json();
        const auditsData = await auditsRes.json();

        if (Array.isArray(shelvesData)) setShelves(shelvesData);
        if (Array.isArray(auditsData)) {
          setOngoingAudits(
            auditsData.filter((a: Audit) => a.status === "in_progress")
          );
          setRecentAudits(
            auditsData
              .filter((a: Audit) => a.status === "completed")
              .slice(0, 5)
          );
        }
      } catch {
        // ignore
      } finally {
        setShelvesLoading(false);
      }
    }
    fetchData();
  }, [selectedStoreId]);

  function handleShelfTap(shelf: Shelf) {
    setSelectedShelf(shelf);
    setShowNameModal(true);
  }

  async function handleStartAudit() {
    if (!selectedShelf || !selectedStoreId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStoreId,
          shelfId: selectedShelf.id,
          merchandiserName: merchandiserName.trim() || null,
        }),
      });
      const audit = await res.json();
      if (audit.id) {
        router.push(`/audit/${audit.id}`);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  function getLastAuditForShelf(shelfId: string) {
    const all = [...ongoingAudits, ...recentAudits];
    return all.find((a) => a.shelfId === shelfId);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function scoreColor(score: number | null) {
    if (score === null) return "bg-gray-100 text-gray-500";
    if (score >= 80) return "bg-green-100 text-green-700";
    if (score >= 50) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-gray-200 rounded-lg animate-pulse w-3/4" />
        <div className="h-12 bg-gray-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-36 bg-gray-200 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-8">
      {/* Greeting */}
      <h1 className="text-xl font-bold text-gray-900 mb-4">
        Оберіть стелаж для аудиту
      </h1>

      {/* Store selector */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Магазин
        </label>
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="w-full h-12 px-4 bg-white border border-gray-300 rounded-xl text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='2' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            backgroundSize: "20px",
          }}
        >
          <option value="">Оберіть магазин...</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
              {store.address ? ` — ${store.address}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Ongoing audits */}
      {ongoingAudits.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Продовжити аудит
          </h2>
          <div className="space-y-2">
            {ongoingAudits.map((audit) => (
              <button
                key={audit.id}
                onClick={() => router.push(`/audit/${audit.id}`)}
                className="w-full flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 text-left active:bg-blue-100 transition-colors"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    Стелаж {audit.shelf.shelfNumber}
                    {audit.shelf.category
                      ? ` — ${audit.shelf.category}`
                      : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(audit.createdAt)}
                    {audit.merchandiserName
                      ? ` · ${audit.merchandiserName}`
                      : ""}
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400 shrink-0"
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
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Shelves grid */}
      {selectedStoreId && (
        <>
          {shelvesLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-36 bg-gray-200 rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : shelves.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="w-12 h-12 text-gray-300 mx-auto mb-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                />
              </svg>
              <p className="text-sm text-gray-500">
                Стелажі не знайдено для цього магазину
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {shelves.map((shelf) => {
                const lastAudit = getLastAuditForShelf(shelf.id);
                return (
                  <button
                    key={shelf.id}
                    onClick={() => handleShelfTap(shelf)}
                    className="bg-white border border-gray-200 rounded-2xl p-3 text-left shadow-sm active:shadow-none active:bg-gray-50 transition-all"
                  >
                    {/* Planogram thumbnail */}
                    <div className="w-full aspect-[4/3] bg-gray-100 rounded-xl mb-2 overflow-hidden flex items-center justify-center">
                      {shelf.planogramUrl ? (
                        <img
                          src={shelf.planogramUrl}
                          alt={`Планограма ${shelf.shelfNumber}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg
                          className="w-8 h-8 text-gray-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75Z"
                          />
                        </svg>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      Стелаж {shelf.shelfNumber}
                    </p>
                    {shelf.category && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {shelf.category}
                      </p>
                    )}
                    {lastAudit && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${scoreColor(
                            lastAudit.complianceScore
                          )}`}
                        >
                          {lastAudit.complianceScore !== null
                            ? `${Math.round(lastAudit.complianceScore)}%`
                            : "—"}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatDate(lastAudit.createdAt)}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* No store selected */}
      {!selectedStoreId && !loading && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
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
                d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-500">
            Оберіть магазин, щоб побачити стелажі
          </p>
        </div>
      )}

      {/* Name modal */}
      {showNameModal && selectedShelf && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setShowNameModal(false);
              setMerchandiserName("");
            }}
          />
          <div className="relative w-full max-w-[480px] bg-white rounded-t-3xl p-6 pb-8 safe-area-bottom animate-slide-up">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Новий аудит
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Стелаж {selectedShelf.shelfNumber}
              {selectedShelf.category
                ? ` — ${selectedShelf.category}`
                : ""}
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Ім&apos;я мерчандайзера
            </label>
            <input
              type="text"
              value={merchandiserName}
              onChange={(e) => setMerchandiserName(e.target.value)}
              placeholder="Введіть ваше ім'я..."
              className="w-full h-12 px-4 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
              autoFocus
            />
            <button
              onClick={handleStartAudit}
              disabled={creating}
              className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creating ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
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
                      d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                    />
                  </svg>
                  Почати аудит
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
