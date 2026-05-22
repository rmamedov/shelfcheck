"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface BarDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface SimpleBarChartProps {
  data: BarDataPoint[];
  height?: number;
}

export default function SimpleBarChart({
  data,
  height = 250,
}: SimpleBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const gridCount = 4;
  const gridStep = Math.ceil(maxValue / gridCount);

  const barGap = Math.max(2, chartWidth * 0.02);
  const barWidth = Math.max(
    8,
    (chartWidth - barGap * (data.length + 1)) / data.length
  );
  const defaultColor = "#2563eb";

  const labelStep = data.length > 15 ? Math.ceil(data.length / 10) : 1;

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={height}
        className="select-none"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Grid lines */}
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const val = i * gridStep;
          const y =
            padding.top + chartHeight - (val / maxValue) * chartHeight;
          return (
            <g key={i}>
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
                {val}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barHeight = (d.value / maxValue) * chartHeight;
          const x =
            padding.left +
            barGap +
            i * (barWidth + barGap);
          const y = padding.top + chartHeight - barHeight;
          const isHovered = hoveredIndex === i;
          const barColor = d.color || defaultColor;

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              className="cursor-pointer"
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={barColor}
                rx={3}
                opacity={isHovered ? 1 : 0.85}
                className="transition-opacity"
              />

              {/* X label */}
              {i % labelStep === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={padding.top + chartHeight + 18}
                  textAnchor="middle"
                  className="fill-gray-500"
                  fontSize={10}
                  transform={
                    data.length > 8
                      ? `rotate(-45, ${x + barWidth / 2}, ${
                          padding.top + chartHeight + 18
                        })`
                      : undefined
                  }
                >
                  {d.label}
                </text>
              )}

              {/* Hover tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={x + barWidth / 2 - 30}
                    y={y - 28}
                    width={60}
                    height={22}
                    rx={6}
                    fill="#1f2937"
                    opacity={0.9}
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 13}
                    textAnchor="middle"
                    fill="white"
                    fontSize={12}
                    fontWeight={600}
                  >
                    {d.value}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
