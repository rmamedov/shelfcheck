"use client";

import { useState } from "react";

export interface ViolationType {
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

interface ViolationCardProps {
  violation: ViolationType;
  onComment: (violationId: string, comment: string) => void;
  onFix: (violationId: string) => void;
}

const typeConfig: Record<
  string,
  { label: string; color: string; borderColor: string; icon: string }
> = {
  missing: {
    label: "Відсутній",
    color: "bg-red-100 text-red-700",
    borderColor: "border-l-red-500",
    icon: "M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  misplaced: {
    label: "Зміщений",
    color: "bg-yellow-100 text-yellow-700",
    borderColor: "border-l-yellow-500",
    icon: "M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  },
  extra: {
    label: "Зайвий",
    color: "bg-blue-100 text-blue-700",
    borderColor: "border-l-blue-500",
    icon: "M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
};

export function ViolationCard({
  violation,
  onComment,
  onFix,
}: ViolationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState(violation.comment || "");
  const [commentSaving, setCommentSaving] = useState(false);

  const config = typeConfig[violation.type] || typeConfig.missing;

  async function handleSaveComment() {
    setCommentSaving(true);
    onComment(violation.id, commentText);
    // Small delay to show saving state
    await new Promise((r) => setTimeout(r, 300));
    setCommentSaving(false);
  }

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${config.borderColor} overflow-hidden shadow-sm`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left active:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.color}`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={config.icon}
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${config.color}`}
              >
                {config.label}
              </span>
              {violation.isFixed && (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                  Виправлено
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {violation.productName || "Невідомий товар"}
            </p>
            {violation.articleNumber && (
              <p className="text-xs text-gray-500">
                Арт. {violation.articleNumber}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1">
              {violation.shelfLevel !== null && (
                <span className="text-xs text-gray-400">
                  Полиця {violation.shelfLevel}
                </span>
              )}
              {violation.position !== null && (
                <span className="text-xs text-gray-400">
                  Позиція {violation.position}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1 line-clamp-2">
              {violation.description}
            </p>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {/* Photo */}
          {violation.photoUrl && (
            <div className="rounded-xl overflow-hidden bg-gray-100">
              <img
                src={violation.photoUrl}
                alt="Фото порушення"
                className="w-full h-40 object-cover"
              />
            </div>
          )}

          {/* Fixed photo */}
          {violation.fixedPhotoUrl && (
            <div className="rounded-xl overflow-hidden bg-green-50 border border-green-200">
              <div className="px-3 py-1.5 bg-green-100">
                <p className="text-xs font-medium text-green-700">
                  Фото після виправлення
                </p>
              </div>
              <img
                src={violation.fixedPhotoUrl}
                alt="Фото виправлення"
                className="w-full h-40 object-cover"
              />
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Коментар
            </label>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Додати коментар..."
              rows={2}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {commentText !== (violation.comment || "") && (
              <button
                onClick={handleSaveComment}
                disabled={commentSaving}
                className="mt-1.5 text-xs font-medium text-blue-600 active:text-blue-700"
              >
                {commentSaving ? "Збереження..." : "Зберегти коментар"}
              </button>
            )}
          </div>

          {/* Fix button */}
          {!violation.isFixed && (
            <button
              onClick={() => onFix(violation.id)}
              className="w-full h-11 bg-green-50 border border-green-200 text-green-700 font-semibold text-sm rounded-xl flex items-center justify-center gap-2 active:bg-green-100 transition-colors"
            >
              <svg
                className="w-4 h-4"
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
              Виправлено
            </button>
          )}
        </div>
      )}
    </div>
  );
}
