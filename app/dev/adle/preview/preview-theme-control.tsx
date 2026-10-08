"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "scarlett-theme-v1";

export function PreviewThemeControl() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    setReady(true);
  }, []);

  function choose(next: Theme) {
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Theme still works for this page. */ }
    setTheme(next);
  }

  return (
    <fieldset className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--adie-surface)] p-3">
      <legend className="px-1 text-sm font-bold text-[color:var(--ink)]">Preview theme</legend>
      {(["light", "dark"] as const).map((option) => (
        <button key={option} type="button" aria-pressed={theme === option} disabled={!ready} onClick={() => choose(option)}
          className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-bold text-[color:var(--ink)] aria-pressed:bg-pink-500 aria-pressed:text-white disabled:cursor-wait">
          {option === "light" ? "☀ Light" : "☾ Dark"}
        </button>
      ))}
    </fieldset>
  );
}
