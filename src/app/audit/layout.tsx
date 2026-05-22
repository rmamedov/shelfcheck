"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
        d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
      />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 19.5 8.25 12l7.5-7.5"
      />
    </svg>
  );
}

const navItems = [
  { href: "/audit", label: "Головна", icon: HomeIcon, exact: true },
  { href: "/audit", label: "Камера", icon: CameraIcon, isCamera: true },
  { href: "/audit/history", label: "Історія", icon: HistoryIcon },
];

export default function AuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isAuditSession = /^\/audit\/[^/]+$/.test(pathname) && pathname !== "/audit/history";
  const showBackButton = pathname !== "/audit";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 safe-area-top">
        <div className="max-w-[480px] mx-auto flex items-center h-14 px-4">
          {showBackButton && (
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-10 h-10 -ml-2 rounded-xl text-gray-600 active:bg-gray-100 transition-colors"
            >
              <BackIcon className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">ShelfCheck</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[480px] w-full mx-auto">
        {children}
      </main>

      {/* Bottom nav */}
      {!isAuditSession && (
        <nav className="sticky bottom-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
          <div className="max-w-[480px] mx-auto flex items-end justify-around px-2 pt-1 pb-2">
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href) && !item.exact;

              if (item.isCamera) {
                return (
                  <Link
                    key="camera"
                    href="/audit"
                    className="flex flex-col items-center gap-0.5 -mt-4"
                  >
                    <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-600/30 active:scale-95 transition-transform">
                      <item.icon className="w-7 h-7 text-white" />
                    </div>
                    <span className="text-[10px] font-medium text-blue-600">
                      {item.label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 min-w-[64px] py-1 ${
                    isActive ? "text-blue-600" : "text-gray-400"
                  }`}
                >
                  <item.icon className="w-6 h-6" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <style jsx global>{`
        .safe-area-top {
          padding-top: env(safe-area-inset-top, 0px);
        }
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </div>
  );
}
