"use client";

import type { ReactNode } from "react";

export function BuilderInfoHint({
  label,
  children,
  align = "center",
}: {
  label: string;
  children: ReactNode;
  align?: "center" | "right";
}) {
  const popoverPositionClass =
    align === "right"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <details className="relative z-50 inline-flex open:z-50">
      <summary
        className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] bg-white text-xs font-semibold text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
        aria-label={label}
        title={label}
      >
        i
      </summary>
      <div
        className={`absolute top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-xs leading-5 text-[color:var(--mid)] shadow-lg ${popoverPositionClass}`}
      >
        {children}
      </div>
    </details>
  );
}
