"use client";

import { useState, useEffect, useMemo } from "react";
import SimpleLineChart from "@/components/dashboard/SimpleLineChart";
import SimpleBarChart from "@/components/dashboard/SimpleBarChart";

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
  status: string;
  store: Store;
  shelf: Shelf;
}

type TimeRange = "week" | "month" | "quarter";

function getDateRange(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "quarter":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

export default function TrendsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/stores").then((r) => r.json()),
      fetch("/api/audits").then((r) => r.json()),
    ])
      .then(([storesData, auditsData]) => {
        setStores(Array.isArray(storesData) ? storesData : []);
        setAudits(Array.isArray(auditsData) ? auditsData : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredAudits = useMemo(() => {
    const startDate = getDateRange(timeRange);
    return audits.filter((a) => {
      const dateMatch = new Date(a.createdAt) >= startDate;
      const storeMatch =
        selectedStoreId === "all" || a.storeId === selectedStoreId;
      return dateMatch && storeMatch;
    });
  }, [audits, selectedStoreId, timeRange]);

  const completedAudits = useMemo(
    () => filteredAudits.filter((a) => a.complianceScore !== null),
    [filteredAudits]
  );

  // Compliance over time (grouped by day)
  const complianceByDay = useMemo(() => {
    const dayMap: Record<string, { sum: number; count: number }> = {};
    for (const a of completedAudits) {
      const day = new Date(a.createdAt).toISOString().slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { sum: 0, count: 0 };
      dayMap[day].sum += a.complianceScore!;
      dayMap[day].count++;
    }

    const sorted = Object.entries(dayMap).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return sorted.map(([day, { sum, count }]) => ({
      label: formatDateShort(new Date(day)),
      value: sum / count,
    }));
  }, [completedAudits]);

  // Audits per day for bar chart
  const auditsPerDay = useMemo(() => {
    const dayMap: Record<string, number> = {};
    for (const a of filteredAudits) {
      const day = new Date(a.createdAt).toISOString().slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + 1;
    }
    const sorted = Object.entries(dayMap).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return sorted.map(([day, count]) => ({
      label: formatDateShort(new Date(day)),
      value: count,
    }));
  }, [filteredAudits]);

  // Best/worst/most improved shelf
  const shelfStats = useMemo(() => {
    const shelfMap: Record<
      string,
      { scores: number[]; shelfNumber: string }
    > = {};
    for (const a of completedAudits) {
      const key = a.shelfId;
      if (!shelfMap[key]) {
        shelfMap[key] = {
          scores: [],
          shelfNumber: a.shelf?.shelfNumber ?? key,
        };
      }
      shelfMap[key].scores.push(a.complianceScore!);
    }

    let bestShelf = { name: "—", avg: 0 };
    let worstShelf = { name: "—", avg: 100 };
    let mostImproved = { name: "—", improvement: -Infinity };

    for (const [, data] of Object.entries(shelfMap)) {
      const avg = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;

      if (avg > bestShelf.avg) {
        bestShelf = { name: data.shelfNumber, avg };
      }
      if (avg < worstShelf.avg) {
        worstShelf = { name: data.shelfNumber, avg };
      }

      if (data.scores.length >= 2) {
        const first = data.scores[data.scores.length - 1];
        const last = data.scores[0];
        const improvement = last - first;
        if (improvement > mostImproved.improvement) {
          mostImproved = { name: data.shelfNumber, improvement };
        }
      }
    }

    if (mostImproved.improvement === -Infinity) {
      mostImproved = { name: "—", improvement: 0 };
    }

    return { bestShelf, worstShelf, mostImproved };
  }, [completedAudits]);

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
        <h2 className="text-lg font-semibold text-gray-900">Тренди</h2>
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

      {/* Shelf stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-500 mb-1">Найкращий стелаж</p>
          <p className="text-xl font-bold text-gray-900">
            {shelfStats.bestShelf.name}
          </p>
          <p className="text-sm text-green-600 font-medium">
            {shelfStats.bestShelf.avg.toFixed(1)}% середня
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-500 mb-1">Найгірший стелаж</p>
          <p className="text-xl font-bold text-gray-900">
            {shelfStats.worstShelf.name}
          </p>
          <p className="text-sm text-red-600 font-medium">
            {shelfStats.worstShelf.avg.toFixed(1)}% середня
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-500 mb-1">Найбільше покращення</p>
          <p className="text-xl font-bold text-gray-900">
            {shelfStats.mostImproved.name}
          </p>
          <p className="text-sm text-blue-600 font-medium">
            {shelfStats.mostImproved.improvement > 0 ? "+" : ""}
            {shelfStats.mostImproved.improvement.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Line chart: compliance over time */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Середня відповідність за часом
        </h3>
        <SimpleLineChart data={complianceByDay} height={300} color="#2563eb" />
      </div>

      {/* Bar chart: audits per day */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Кількість аудитів за день
        </h3>
        <SimpleBarChart data={auditsPerDay} height={250} />
      </div>
    </div>
  );
}
