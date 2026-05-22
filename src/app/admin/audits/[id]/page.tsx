"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Store {
  id: string;
  name: string;
}

interface Shelf {
  id: string;
  shelfNumber: string;
  planogramUrl: string | null;
}

interface AuditPhoto {
  id: string;
  shelfLevel: number;
  photoUrl: string;
}

interface Violation {
  id: string;
  type: string;
  productName: string | null;
  articleNumber: string | null;
  shelfLevel: number | null;
  position: number | null;
  description: string;
  photoUrl: string | null;
  comment: string | null;
  isFixed: boolean;
  fixedPhotoUrl: string | null;
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
  shelf: Shelf;
  photos: AuditPhoto[];
  violations: Violation[];
}

function violationBadge(type: string): { label: string; cls: string } {
  switch (type) {
    case "missing":
      return { label: "Відсутній", cls: "bg-red-100 text-red-700" };
    case "misplaced":
      return { label: "Не на місці", cls: "bg-amber-100 text-amber-700" };
    case "extra":
      return { label: "Зайвий", cls: "bg-blue-100 text-blue-700" };
    case "damaged":
      return { label: "Пошкоджений", cls: "bg-purple-100 text-purple-700" };
    case "price":
      return { label: "Ціна", cls: "bg-orange-100 text-orange-700" };
    default:
      return { label: type, cls: "bg-gray-100 text-gray-700" };
  }
}

function ComplianceGauge({ score }: { score: number | null }) {
  const value = score ?? 0;
  const hasScore = score !== null;
  const circumference = 2 * Math.PI * 54;
  const dashoffset = circumference - (value / 100) * circumference;

  let strokeColor = "#d1d5db";
  if (hasScore) {
    if (value >= 80) strokeColor = "#16a34a";
    else if (value >= 50) strokeColor = "#d97706";
    else strokeColor = "#dc2626";
  }

  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
        {hasScore && (
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            className="transition-all duration-700"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900">
          {hasScore ? `${Math.round(value)}%` : "—"}
        </span>
        <span className="text-xs text-gray-500">відповідність</span>
      </div>
    </div>
  );
}

export default function AuditDetailPage() {
  const params = useParams();
  const auditId = params.id as string;

  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingComment, setSavingComment] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}`);
      const data = await res.json();
      if (data && !data.error) setAudit(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [auditId]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  async function handleToggleFixed(violationId: string, currentFixed: boolean) {
    if (!audit) return;
    try {
      await fetch(`/api/audits/${auditId}/violations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ violationId, isFixed: !currentFixed }),
      });
      setAudit((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          violations: prev.violations.map((v) =>
            v.id === violationId ? { ...v, isFixed: !currentFixed } : v
          ),
        };
      });
    } catch {
      // ignore
    }
  }

  async function handleSaveComment(violationId: string, comment: string) {
    if (!audit) return;
    setSavingComment(violationId);
    try {
      await fetch(`/api/audits/${auditId}/violations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ violationId, comment }),
      });
      setAudit((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          violations: prev.violations.map((v) =>
            v.id === violationId ? { ...v, comment } : v
          ),
        };
      });
    } catch {
      // ignore
    } finally {
      setSavingComment(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Аудит не знайдено</p>
        <Link href="/admin/audits" className="mt-2 text-blue-600 text-sm hover:underline">
          Повернутися до списку
        </Link>
      </div>
    );
  }

  const statusMap: Record<string, { text: string; cls: string }> = {
    completed: { text: "Завершено", cls: "text-green-700 bg-green-50" },
    in_progress: { text: "В процесі", cls: "text-blue-700 bg-blue-50" },
    cancelled: { text: "Скасовано", cls: "text-gray-600 bg-gray-100" },
  };
  const st = statusMap[audit.status] || { text: audit.status, cls: "text-gray-600 bg-gray-100" };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/audits" className="hover:text-blue-600">
          Аудити
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">
          {new Date(audit.createdAt).toLocaleDateString("uk-UA")}
        </span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <ComplianceGauge score={audit.complianceScore} />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">
                {audit.store.name} — Стелаж {audit.shelf.shelfNumber}
              </h1>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-md ${st.cls}`}>
                {st.text}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
              <span>
                Дата: {new Date(audit.createdAt).toLocaleDateString("uk-UA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {audit.merchandiserName && (
                <span>Мерчандайзер: {audit.merchandiserName}</span>
              )}
              <span>Порушень: {audit.violations.length}</span>
              <span>
                Виправлено: {audit.violations.filter((v) => v.isFixed).length}/{audit.violations.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Split view: Planogram vs Photos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Planogram */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Планограма</h2>
          {audit.shelf.planogramUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={audit.shelf.planogramUrl}
              alt="Planogram"
              className="w-full rounded-lg border border-gray-200 object-contain max-h-96"
            />
          ) : (
            <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
              <p className="text-sm text-gray-400">Планограма не завантажена</p>
            </div>
          )}
        </div>

        {/* Audit photos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Фото аудиту ({audit.photos.length})
          </h2>
          {audit.photos.length === 0 ? (
            <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
              <p className="text-sm text-gray-400">Фото ще не завантажено</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {audit.photos.map((photo) => (
                <div key={photo.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.photoUrl}
                    alt={`Level ${photo.shelfLevel}`}
                    className="w-full h-32 object-cover rounded-lg border border-gray-200"
                  />
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded font-medium">
                    Рівень {photo.shelfLevel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Violations */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Порушення ({audit.violations.length})
        </h2>

        {audit.violations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Порушень не знайдено</p>
        ) : (
          <div className="space-y-3">
            {audit.violations.map((violation) => {
              const badge = violationBadge(violation.type);
              return (
                <div
                  key={violation.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    violation.isFixed
                      ? "border-green-200 bg-green-50/50"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    {/* Photo evidence */}
                    {violation.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={violation.photoUrl}
                        alt="Evidence"
                        className="w-20 h-20 rounded-lg object-cover border border-gray-200 shrink-0"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {violation.shelfLevel !== null && (
                          <span className="text-xs text-gray-400">
                            Рівень {violation.shelfLevel}
                          </span>
                        )}
                        {violation.isFixed && (
                          <span className="text-xs font-medium text-green-600">Виправлено</span>
                        )}
                      </div>

                      {violation.productName && (
                        <p className="text-sm font-medium text-gray-900">
                          {violation.productName}
                          {violation.articleNumber && (
                            <span className="text-gray-400 font-normal ml-1">
                              (арт. {violation.articleNumber})
                            </span>
                          )}
                        </p>
                      )}

                      <p className="text-sm text-gray-600 mt-0.5">{violation.description}</p>

                      {/* Comment field */}
                      <div className="mt-2">
                        <textarea
                          defaultValue={violation.comment || ""}
                          onBlur={(e) => {
                            const newComment = e.target.value;
                            if (newComment !== (violation.comment || "")) {
                              handleSaveComment(violation.id, newComment);
                            }
                          }}
                          placeholder="Додати коментар..."
                          rows={1}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                        {savingComment === violation.id && (
                          <p className="text-[10px] text-gray-400 mt-0.5">Збереження...</p>
                        )}
                      </div>
                    </div>

                    {/* Fixed toggle */}
                    <button
                      onClick={() => handleToggleFixed(violation.id, violation.isFixed)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        violation.isFixed
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {violation.isFixed ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      )}
                      Виправлено
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
