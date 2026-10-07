"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type ReviewSection = {
  id: string;
  title: string;
  summary: string;
  content: ReactNode;
  count?: number;
  keepMounted?: boolean;
};

export function ReviewGuidedSections({
  storageKey,
  initialSection,
  sections,
}: {
  storageKey: string;
  initialSection: string;
  sections: ReviewSection[];
}) {
  const [newCounts, setNewCounts] = useState<Record<string, number>>({});
  const router = useRouter();
  const refreshRequested = useRef(false);
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("review-section-changed", callback);
    window.addEventListener("popstate", callback);
    return () => {
      window.removeEventListener("review-section-changed", callback);
      window.removeEventListener("popstate", callback);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    const requested = new URLSearchParams(window.location.search).get("section");
    const saved = window.sessionStorage.getItem(storageKey);
    const candidate = requested ?? saved;
    return candidate !== null && (candidate === "" || sections.some((section) => section.id === candidate))
      ? candidate : initialSection;
  }, [storageKey, sections, initialSection]);
  const getServerSnapshot = useCallback(() => initialSection, [initialSection]);
  const openSection = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (refreshRequested.current) {
      refreshRequested.current = false;
      window.dispatchEvent(new Event("review-data-refreshed"));
    }
  }, [sections]);

  useEffect(() => {
    const onAdded = (event: Event) => {
      const section = (event as CustomEvent<{ section: string }>).detail?.section;
      if (section) setNewCounts((current) => ({ ...current, [section]: (current[section] ?? 0) + 1 }));
    };
    window.addEventListener("review-word-added", onAdded);
    return () => window.removeEventListener("review-word-added", onAdded);
  }, []);

  function choose(id: string) {
    const next = openSection === id ? "" : id;
    window.sessionStorage.setItem(storageKey, next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("section", next);
    else url.searchParams.delete("section");
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event("review-section-changed"));
    if (next && newCounts[next]) {
      refreshRequested.current = true;
      router.refresh();
      setNewCounts((current) => ({ ...current, [next]: 0 }));
    }
  }

  return (
    <div className="grid gap-3">
      {sections.map((section, index) => {
        const open = openSection === section.id;
        const panelId = `${storageKey.replace(/[^a-zA-Z0-9-]/g, "-")}-${section.id}`;
        return (
          <section key={section.id} className="brand-card overflow-hidden rounded-3xl">
            <h2>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => choose(section.id)}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left md:px-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 font-semibold text-[var(--ink)]">{section.title}</span>
                <span className="hidden text-sm text-[var(--mid)] sm:block">{section.count === undefined ? section.summary : `${section.count + (newCounts[section.id] ?? 0)} ${section.id === "context" ? "context" : "spelling"} items`}{newCounts[section.id] && section.count === undefined ? ` · ${newCounts[section.id]} new` : ""}</span>
                <span aria-hidden="true" className="text-xl text-[var(--ink)]">{open ? "⌄" : "›"}</span>
              </button>
            </h2>
            <div id={panelId} hidden={!open} className={open ? "border-t border-[var(--border)] p-4 md:p-5" : ""}>
              {open || section.keepMounted ? section.content : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
