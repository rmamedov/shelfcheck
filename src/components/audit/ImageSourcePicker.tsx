"use client";

interface ImageSourcePickerProps {
  onSelectCamera: () => void;
  onSelectGallery: () => void;
  onClose: () => void;
}

export function ImageSourcePicker({
  onSelectCamera,
  onSelectGallery,
  onClose,
}: ImageSourcePickerProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="relative w-full max-w-[480px] animate-slide-up">
        {/* Actions */}
        <div className="bg-white rounded-2xl overflow-hidden mb-2">
          <p className="text-center text-xs text-gray-500 pt-4 pb-2 font-medium">
            Оберіть джерело зображення
          </p>

          <button
            onClick={onSelectCamera}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-gray-50 transition-colors border-t border-gray-100"
          >
            <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
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
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Камера</p>
              <p className="text-xs text-gray-500">Зробити нове фото</p>
            </div>
          </button>

          <button
            onClick={onSelectGallery}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-gray-50 transition-colors border-t border-gray-100"
          >
            <div className="w-11 h-11 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Zm6-16.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
                />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Галерея</p>
              <p className="text-xs text-gray-500">
                Обрати існуюче фото
              </p>
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full h-14 bg-white rounded-2xl text-sm font-semibold text-blue-600 active:bg-gray-50 transition-colors"
        >
          Скасувати
        </button>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}
