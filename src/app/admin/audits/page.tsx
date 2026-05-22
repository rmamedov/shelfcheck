"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Store {
  id: string;
  name: string;
}

interface Shelf {
  id: string;
  shelfNumber: string;
  storeId: string;
}

interface Audit {
  id: string;
  storeId: string;
  shelfId: string;
  merchandiserName: string | null;
  status: string;
  complianceScore: number | null;
  createdAt: string;
  store: Store;
  shelf: { id: string; shelfNumber: string };
}

function complianceColor(score: number | null): string {
  if (score === null) return "text-gray-400 bg-gray-100";
  if (score >= 80) return "text-green-700 bg-green-100";
  if (score >= 50) return "text-amber-700 bg-amber-100";
  return "text-red-700 bg-red-100";
}

function statusLabel(status: string): { text: string; cls: string } {
  switch (status) {
    case "completed":
      return { text: "Завершено", cls: "text-green-700 bg-green-50" };
    case "in_progress":
      return { text: "В процесі", cls: "text-blue-700 bg-blue-50" };
    case "cancelled":
      return { text: "Скасовано", cls: "text-gray-600 bg-gray-100" };
    default:
      return { text: status, cls: "text-gray-600 bg-gray-100" };
  }
}

export default function AuditsPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStoreId, setFilterStoreId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New audit form
  const [formStoreId, setFormStoreId] = useState("");
  const [formShelfId, setFormShelfId] = useState("");
  const [formMerchandiser, setFormMerchandiser] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const url = filterStoreId ? `/api/audits?storeId=${filterStoreId}` : "/api/audits";
      const [auditsRes, storesRes, shelvesRes] = await Promise.all([
        fetch(url),
        fetch("/api/stores"),
        fetch("/api/shelves"),
      ]);
      const auditsData = await auditsRes.json();
      const storesData = await storesRes.json();
      const shelvesData = await shelvesRes.json();
      if (Array.isArray(auditsData)) setAudits(auditsData);
      if (Array.isArray(storesData))
        setStores(storesData.map((s: Store & { _count?: unknown }) => ({ id: s.id, name: s.name })));
      if (Array.isArray(shelvesData)) setShelves(shelvesData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredAudits = audits.filter((a) => {
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  });

  const shelvesForSelectedStore = shelves.filter((s) => s.storeId === formStoreId);

  async function handleCreateAudit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: formStoreId,
          shelfId: formShelfId,
          merchandiserName: formMerchandiser || null,
        }),
      });
      setModalOpen(false);
      setFormStoreId("");
      setFormShelfId("");
      setFormMerchandiser("");
      fetchData();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Аудити</h1>
          <p className="mt-1 text-sm text-gray-500">Перевірки стелажів та аналіз відповідності</p>
        </div>
        <button
          onClick={() => {
            setFormStoreId(stores[0]?.id ?? "");
            setFormShelfId("");
            setFormMerchandiser("");
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Новий аудит
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
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
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Всі статуси</option>
          <option value="in_progress">В процесі</option>
          <option value="completed">Завершено</option>
          <option value="cancelled">Скасовано</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 animate-pulse h-64" />
      ) : filteredAudits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
          <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
          </svg>
          <p className="mt-4 text-gray-500">Аудитів ще немає</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Дата</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Магазин</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Стелаж</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Мерчандайзер</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Статус</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Відповідність</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAudits.map((audit) => {
                  const st = statusLabel(audit.status);
                  return (
                    <tr key={audit.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/audits/${audit.id}`}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {new Date(audit.createdAt).toLocaleDateString("uk-UA")}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{audit.store.name}</td>
                      <td className="px-4 py-3 text-gray-600">{audit.shelf.shelfNumber}</td>
                      <td className="px-4 py-3 text-gray-600">{audit.merchandiserName || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-md ${st.cls}`}>
                          {st.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-md ${complianceColor(audit.complianceScore)}`}>
                          {audit.complianceScore !== null
                            ? `${Math.round(audit.complianceScore)}%`
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New audit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Новий аудит</h2>
            <form onSubmit={handleCreateAudit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Магазин *</label>
                <select
                  required
                  value={formStoreId}
                  onChange={(e) => {
                    setFormStoreId(e.target.value);
                    setFormShelfId("");
                  }}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Стелаж *</label>
                <select
                  required
                  value={formShelfId}
                  onChange={(e) => setFormShelfId(e.target.value)}
                  disabled={!formStoreId}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">Оберіть стелаж</option>
                  {shelvesForSelectedStore.map((s) => (
                    <option key={s.id} value={s.id}>
                      Стелаж {s.shelfNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Мерчандайзер
                </label>
                <input
                  type="text"
                  value={formMerchandiser}
                  onChange={(e) => setFormMerchandiser(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ім'я мерчандайзера"
                />
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
                  disabled={submitting || !formStoreId || !formShelfId}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Створення..." : "Створити аудит"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
