"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface DataPoint {
  label: string;
  value: number;
}

interface SimpleLineChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
}

export default function SimpleLineChart({
  data,
  height = 300,
  color = "#2563eb",
}: SimpleLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
  } | null>(null);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [updateWidth]);

  if (data.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center text-gray-400"
        style={{ height }}
      >
        Немає даних для відображення
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 60, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = 100;
  const minValue = 0;
  const gridLines = [0, 25, 50, 75, 100];

  const xStep = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth / 2;

  const points = data.map((d, i) => ({
    x: padding.left + (data.length > 1 ? i * xStep : chartWidth / 2),
    y:
      padding.top +
      chartHeight -
      ((d.value - minValue) / (maxValue - minValue)) * chartHeight,
    label: d.label,
    value: d.value,
  }));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const areaPath =
    points.length > 0
      ? `M ${points[0].x},${padding.top + chartHeight} ` +
        points.map((p) => `L ${p.x},${p.y}`).join(" ") +
        ` L ${points[points.length - 1].x},${padding.top + chartHeight} Z`
      : "";

  const gradientId = `lineGradient-${color.replace("#", "")}`;

  const showLabels = data.length <= 30;
  const labelStep = showLabels
    ? 1
    : Math.ceil(data.length / 10);

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={height}
        className="select-none"
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((val) => {
          const y =
            padding.top +
            chartHeight -
            ((val - minValue) / (maxValue - minValue)) * chartHeight;
          return (
            <g key={val}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={1}
                strokeDasharray={val === 0 ? "0" : "4 4"}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-400"
                fontSize={11}
              >
                {val}%
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {points.length > 1 && (
          <path d={areaPath} fill={`url(#${gradientId})`} />
        )}

        {/* Line */}
        {points.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={tooltip?.label === p.label ? 6 : 4}
            fill="white"
            stroke={color}
            strokeWidth={2.5}
            className="cursor-pointer transition-all"
            onMouseEnter={() =>
              setTooltip({ x: p.x, y: p.y, label: p.label, value: p.value })
            }
          />
        ))}

        {/* X-axis labels */}
        {points.map(
          (p, i) =>
            i % labelStep === 0 && (
              <text
                key={`label-${i}`}
                x={p.x}
                y={padding.top + chartHeight + 20}
                textAnchor="middle"
                className="fill-gray-500"
                fontSize={10}
                transform={
                  data.length > 10
                    ? `rotate(-45, ${p.x}, ${padding.top + chartHeight + 20})`
                    : undefined
                }
              >
                {p.label}
              </text>
            )
        )}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x - 40}
              y={tooltip.y - 36}
              width={80}
              height={24}
              rx={6}
              fill="#1f2937"
              opacity={0.9}
            />
            <text
              x={tooltip.x}
              y={tooltip.y - 20}
              textAnchor="middle"
              fill="white"
              fontSize={12}
              fontWeight={600}
            >
              {tooltip.value.toFixed(1)}%
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
