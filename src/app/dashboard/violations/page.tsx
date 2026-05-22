"use client";

import { useState, useEffect, useMemo } from "react";

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
  complianceScore: number | null;
  createdAt: string;
  store: Store;
  shelf: Shelf;
}

interface Violation {
  id: string;
  auditId: string;
  type: string;
  productName: string | null;
  articleNumber: string | null;
  shelfLevel: number | null;
  position: number | null;
  description: string;
  isFixed: boolean;
  createdAt: string;
}

type TimeRange = "week" | "month" | "quarter" | "all";

function getDateRange(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "quarter":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "all":
      return null;
  }
}

function violationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    missing: "Відсутній товар",
    misplaced: "Неправильне розміщення",
    extra: "Зайвий товар",
    damaged: "Пошкоджений товар",
    price: "Невірна ціна",
  };
  return labels[type] || type;
}

function violationTypeColor(type: string): string {
  const colors: Record<string, string> = {
    missing: "#ef4444",
    misplaced: "#eab308",
    extra: "#f97316",
    damaged: "#8b5cf6",
    price: "#06b6d4",
  };
  return colors[type] || "#6b7280";
}

export default function ViolationsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [violations, setViolations] = useState<
    (Violation & { audit: Audit })[]
  >([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [loading, setLoading] = useState(true);
  const [expandedViolation, setExpandedViolation] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/stores").then((r) => r.json()),
      fetch("/api/audits").then((r) => r.json()),
    ])
      .then(async ([storesData, auditsData]) => {
        const storeList = Array.isArray(storesData) ? storesData : [];
        const auditList: Audit[] = Array.isArray(auditsData)
          ? auditsData
          : [];
        setStores(storeList);
        setAudits(auditList);

        // Fetch violations for all audits
        const allViolations: (Violation & { audit: Audit })[] = [];
        for (const audit of auditList) {
          try {
            const res = await fetch(
              `/api/audits/${audit.id}/violations`
            );
            const vData = await res.json();
            if (Array.isArray(vData)) {
              for (const v of vData) {
                allViolations.push({ ...v, audit });
              }
            }
          } catch {
            // skip
          }
        }
        setViolations(allViolations);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const startDate = getDateRange(timeRange);
    return violations.filter((v) => {
      const dateMatch = startDate
        ? new Date(v.createdAt) >= startDate
        : true;
      const storeMatch =
        selectedStoreId === "all" ||
        v.audit.storeId === selectedStoreId;
      return dateMatch && storeMatch;
    });
  }, [violations, selectedStoreId, timeRange]);

  // Group by type
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of filtered) {
      map[v.type] = (map[v.type] || 0) + 1;
    }
    const total = filtered.length || 1;
    return Object.entries(map)
      .map(([type, count]) => ({
        type,
        count,
        pct: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Most problematic products
  const byProduct = useMemo(() => {
    const map: Record<
      string,
      { count: number; types: Record<string, number> }
    > = {};
    for (const v of filtered) {
      const name = v.productName || "Невідомий товар";
      if (!map[name]) map[name] = { count: 0, types: {} };
      map[name].count++;
      map[name].types[v.type] = (map[name].types[v.type] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, data]) => {
        const mainType = Object.entries(data.types).sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0];
        return { name, count: data.count, mainType: mainType || "—" };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [filtered]);

  // Most problematic shelves
  const byShelf = useMemo(() => {
    const map: Record<
      string,
      {
        count: number;
        shelfNumber: string;
        storeName: string;
        scores: number[];
      }
    > = {};
    for (const v of filtered) {
      const key = v.audit.shelfId;
      if (!map[key]) {
        map[key] = {
          count: 0,
          shelfNumber: v.audit.shelf?.shelfNumber ?? "—",
          storeName: v.audit.store?.name ?? "—",
          scores: [],
        };
      }
      map[key].count++;
      if (v.audit.complianceScore !== null) {
        map[key].scores.push(v.audit.complianceScore);
      }
    }
    return Object.entries(map)
      .map(([, data]) => ({
        shelfNumber: data.shelfNumber,
        storeName: data.storeName,
        count: data.count,
        avgCompliance:
          data.scores.length > 0
            ? data.scores.reduce((s, v) => s + v, 0) / data.scores.length
            : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [filtered]);

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
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Аналітика порушень
        </h2>
        <div className="ml-auto flex items-center gap-3">
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="all">Всі магазини</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>

          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(
              [
                { key: "week", label: "Тиждень" },
                { key: "month", label: "Місяць" },
                { key: "quarter", label: "Квартал" },
                { key: "all", label: "Все" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  timeRange === key
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stat */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500">Всього порушень</p>
            <p className="text-2xl font-bold text-gray-900">
              {filtered.length}
            </p>
          </div>
        </div>
      </div>

      {/* Violations by type */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Порушення за типом
        </h3>
        {byType.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">
            Порушення відсутні
          </p>
        ) : (
          <div className="space-y-3">
            {byType.map(({ type, count, pct }) => (
              <div key={type} className="flex items-center gap-4">
                <div className="w-40 text-sm font-medium text-gray-700">
                  {violationTypeLabel(type)}
                </div>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.max(pct, 3)}%`,
                      backgroundColor: violationTypeColor(type),
                    }}
                  >
                    {pct >= 15 && (
                      <span className="text-white text-xs font-medium">
                        {count}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-20 text-right text-sm text-gray-600">
                  {count} ({pct.toFixed(0)}%)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Most problematic products */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Найпроблемніші товари
        </h3>
        {byProduct.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">
            Немає даних
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Товар
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Порушень
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Основний тип
                  </th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() =>
                      setExpandedViolation(
                        expandedViolation === `product-${i}`
                          ? null
                          : `product-${i}`
                      )
                    }
                  >
                    <td className="py-3 px-2 text-gray-900 font-medium">
                      {item.name}
                    </td>
                    <td className="py-3 px-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        {item.count}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{
                          backgroundColor: violationTypeColor(item.mainType),
                        }}
                      >
                        {violationTypeLabel(item.mainType)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Most problematic shelves */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Найпроблемніші стелажі
        </h3>
        {byShelf.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">
            Немає даних
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Стелаж
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Магазин
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Порушень
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">
                    Середня відповідність
                  </th>
                </tr>
              </thead>
              <tbody>
                {byShelf.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() =>
                      setExpandedViolation(
                        expandedViolation === `shelf-${i}`
                          ? null
                          : `shelf-${i}`
                      )
                    }
                  >
                    <td className="py-3 px-2 text-gray-900 font-medium">
                      {item.shelfNumber}
                    </td>
                    <td className="py-3 px-2 text-gray-600">
                      {item.storeName}
                    </td>
                    <td className="py-3 px-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        {item.count}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {item.avgCompliance !== null ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.avgCompliance > 80
                              ? "bg-green-100 text-green-700"
                              : item.avgCompliance >= 50
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.avgCompliance.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
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
