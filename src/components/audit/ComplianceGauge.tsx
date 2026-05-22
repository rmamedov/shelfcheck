"use client";

import { useEffect, useState } from "react";

interface ComplianceGaugeProps {
  score: number;
  size?: number;
}

export function ComplianceGauge({ score, size = 180 }: ComplianceGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    // Animate score from 0 to target
    let frame: number;
    const startTime = Date.now();
    const duration = 1200;

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  function getColor(s: number): string {
    if (s >= 80) return "#16a34a"; // green-600
    if (s >= 50) return "#ca8a04"; // yellow-600
    return "#dc2626"; // red-600
  }

  function getBgColor(s: number): string {
    if (s >= 80) return "#dcfce7"; // green-100
    if (s >= 50) return "#fef9c3"; // yellow-100
    return "#fee2e2"; // red-100
  }

  const color = getColor(animatedScore);
  const bgColor = getBgColor(animatedScore);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke 0.3s ease" }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold leading-none"
          style={{ fontSize: size * 0.28, color }}
        >
          {animatedScore}%
        </span>
        <span
          className="text-gray-500 mt-1"
          style={{ fontSize: size * 0.08 }}
        >
          відповідність
        </span>
      </div>
    </div>
  );
}
