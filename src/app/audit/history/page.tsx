"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Audit {
  id: string;
  storeId: string;
  shelfId: string;
  merchandiserName: string | null;
  status: string;
  complianceScore: number | null;
  createdAt: string;
  shelf: {
    shelfNumber: string;
    category: string | null;
  };
  store: {
    name: string;
  };
}

export default function AuditHistoryPage() {
  const router = useRouter();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAudits() {
    setLoading(true);
    try {
      const res = await fetch("/api/audits");
      const data = await res.json();
      if (Array.isArray(data)) {
        setAudits(
          data.filter((a: Audit) => a.status === "completed")
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAudits();
  }, []);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
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

  function scoreBorderColor(score: number | null) {
    if (score === null) return "border-l-gray-300";
    if (score >= 80) return "border-l-green-500";
    if (score >= 50) return "border-l-yellow-500";
    return "border-l-red-500";
  }

  return (
    <div className="p-4 pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Історія аудитів</h1>
        <button
          onClick={fetchAudits}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 h-9 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl active:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182"
            />
          </svg>
          Оновити
        </button>
      </div>

      {loading && audits.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 bg-gray-200 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : audits.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">
            Немає завершених аудитів
          </p>
          <p className="text-xs text-gray-500">
            Проведіть перший аудит стелажу
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <button
              key={audit.id}
              onClick={() => router.push(`/audit/${audit.id}`)}
              className={`w-full bg-white border border-gray-200 border-l-4 ${scoreBorderColor(
                audit.complianceScore
              )} rounded-2xl p-4 text-left shadow-sm active:shadow-none active:bg-gray-50 transition-all`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    Стелаж {audit.shelf.shelfNumber}
                    {audit.shelf.category
                      ? ` — ${audit.shelf.category}`
                      : ""}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {audit.store.name}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {formatDate(audit.createdAt)}
                    {audit.merchandiserName
                      ? ` · ${audit.merchandiserName}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-sm font-bold px-2.5 py-1 rounded-xl ${scoreColor(
                      audit.complianceScore
                    )}`}
                  >
                    {audit.complianceScore !== null
                      ? `${Math.round(audit.complianceScore)}%`
                      : "—"}
                  </span>
                  <svg
                    className="w-4 h-4 text-gray-400"
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
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
