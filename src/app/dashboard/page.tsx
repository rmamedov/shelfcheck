"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Store {
  id: string;
  name: string;
}

interface Shelf {
  id: string;
  shelfNumber: string;
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
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

function ComplianceBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        В процесі
      </span>
    );
  }
  if (score > 80) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        {score.toFixed(1)}%
      </span>
    );
  }
  if (score >= 50) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        {score.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      {score.toFixed(1)}%
    </span>
  );
}

export default function DashboardOverview() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/audits")
      .then((r) => r.json())
      .then((data) => {
        setAudits(Array.isArray(data) ? data : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Compute stats
  const totalAudits = audits.length;
  const completedAudits = audits.filter((a) => a.complianceScore !== null);
  const avgCompliance =
    completedAudits.length > 0
      ? completedAudits.reduce((sum, a) => sum + (a.complianceScore ?? 0), 0) /
        completedAudits.length
      : 0;
  const activeStores = new Set(audits.map((a) => a.storeId)).size;
  const openViolationsAudits = audits.filter(
    (a) => a.complianceScore !== null && a.complianceScore < 80
  ).length;

  // Compliance distribution
  const greenCount = completedAudits.filter(
    (a) => (a.complianceScore ?? 0) > 80
  ).length;
  const yellowCount = completedAudits.filter(
    (a) =>
      (a.complianceScore ?? 0) >= 50 && (a.complianceScore ?? 0) <= 80
  ).length;
  const redCount = completedAudits.filter(
    (a) => (a.complianceScore ?? 0) < 50
  ).length;
  const total = completedAudits.length || 1;
  const greenPct = (greenCount / total) * 100;
  const yellowPct = (yellowCount / total) * 100;
  const redPct = (redCount / total) * 100;

  // Recent 10 audits
  const recentAudits = audits.slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Всього аудитів"
          value={totalAudits.toString()}
          color="#2563eb"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
            </svg>
          }
        />
        <StatCard
          title="Середня відповідність"
          value={`${avgCompliance.toFixed(1)}%`}
          color="#22c55e"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <StatCard
          title="Активних магазинів"
          value={activeStores.toString()}
          color="#8b5cf6"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
            </svg>
          }
        />
        <StatCard
          title="Відкритих порушень"
          value={openViolationsAudits.toString()}
          color="#ef4444"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          }
        />
      </div>

      {/* Compliance distribution */}
      {completedAudits.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Розподіл відповідності
          </h2>
          <div className="flex rounded-full overflow-hidden h-6 bg-gray-100">
            {greenPct > 0 && (
              <div
                className="bg-green-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                style={{ width: `${greenPct}%` }}
              >
                {greenPct >= 10 ? `${greenPct.toFixed(0)}%` : ""}
              </div>
            )}
            {yellowPct > 0 && (
              <div
                className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                style={{ width: `${yellowPct}%` }}
              >
                {yellowPct >= 10 ? `${yellowPct.toFixed(0)}%` : ""}
              </div>
            )}
            {redPct > 0 && (
              <div
                className="bg-red-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                style={{ width: `${redPct}%` }}
              >
                {redPct >= 10 ? `${redPct.toFixed(0)}%` : ""}
              </div>
            )}
          </div>
          <div className="flex gap-6 mt-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600">
                Добре ({greenCount})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-sm text-gray-600">
                Увага ({yellowCount})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-sm text-gray-600">
                Критично ({redCount})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent audits table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Останні аудити
          </h2>
          <Link
            href="/admin/audits"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Всі аудити &rarr;
          </Link>
        </div>

        {recentAudits.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">
            Аудити відсутні
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Магазин
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Стелаж
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Мерчандайзер
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Відповідність
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentAudits.map((audit) => (
                  <tr
                    key={audit.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-2 text-gray-900">
                      {audit.store?.name ?? "—"}
                    </td>
                    <td className="py-3 px-2 text-gray-600">
                      {audit.shelf?.shelfNumber ?? "—"}
                    </td>
                    <td className="py-3 px-2 text-gray-600">
                      {audit.merchandiserName ?? "—"}
                    </td>
                    <td className="py-3 px-2">
                      <ComplianceBadge score={audit.complianceScore} />
                    </td>
                    <td className="py-3 px-2 text-gray-500">
                      {new Date(audit.createdAt).toLocaleDateString("uk-UA")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
