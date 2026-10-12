"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { DictionaryRecommendation } from "@/lib/admin/recommend-dictionary-entries";

type PageData = { rows: DictionaryRecommendation[]; total: number; page: number };
type SelectionMode = "selected" | "all";
const PAGE_SIZE = 50;
const MAX_EXPORT_ROWS = 10_000;

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(new Date(value));
}

export function RecommendationWorkspace({ initial, initialSearch, previewRows }: {
  initial: PageData;
  initialSearch: string;
  previewRows?: DictionaryRecommendation[];
}) {
  const [data, setData] = useState(initial);
  const [draftSearch, setDraftSearch] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<SelectionMode>("selected");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const skipInitialLoad = useRef(true);

  useEffect(() => {
    if (previewRows) return;
    if (skipInitialLoad.current) { skipInitialLoad.current = false; return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ q: search, page: String(page) });
    fetch(`/admin/recommend-dictionary-entries/data?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
          throw new Error("Could not load dictionary recommendations. Sign in again if your session expired.");
        }
        return response.json() as Promise<PageData>;
      })
      .then((next) => setData(next))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load recommendations.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, search, previewRows]);

  const previewMatches = previewRows?.filter((row) => row.word_key.includes(search.trim().toLocaleLowerCase("en-GB")));
  const displayData = previewMatches
    ? { rows: previewMatches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: previewMatches.length, page }
    : data;
  const pageKeys = displayData.rows.map((row) => row.word_key);
  const isSelected = (key: string) => mode === "all" ? !excluded.has(key) : selected.has(key);
  const selectedCount = mode === "all" ? Math.max(0, displayData.total - excluded.size) : selected.size;
  const pages = Math.max(1, Math.ceil(displayData.total / PAGE_SIZE));

  function clearSelection() {
    setMode("selected");
    setSelected(new Set());
    setExcluded(new Set());
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearSelection();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  function toggleWord(key: string) {
    if (mode === "all") {
      setExcluded((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    } else {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    }
  }

  function selectPage() {
    if (mode === "all") {
      setExcluded((current) => {
        const next = new Set(current);
        for (const key of pageKeys) next.delete(key);
        return next;
      });
    } else {
      setSelected((current) => new Set([...current, ...pageKeys]));
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/admin/recommend-dictionary-entries/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, keys: [...selected], excludedKeys: [...excluded], search }),
      });
      if (!response.ok) {
        const result = response.headers.get("Content-Type")?.includes("application/json")
          ? await response.json() as { error?: string } : {};
        throw new Error(result.error ?? "Could not export the selected words.");
      }
      if (!response.headers.get("Content-Type")?.includes("text/csv")) {
        throw new Error("Could not export the words. Sign in again if your session expired.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "recommend-dictionary-entries.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not export the selected words.");
    } finally { setExporting(false); }
  }

  return <section className="space-y-4">
    <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="recommend-dictionary-search">
        Search words
        <input id="recommend-dictionary-search" value={draftSearch} maxLength={100}
          onChange={(event) => setDraftSearch(event.target.value)}
          className="min-w-64 rounded-lg border border-slate-300 px-3 py-2" placeholder="Enter a word" />
      </label>
      <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Search</button>
    </form>

    <div className="flex flex-wrap items-center gap-3 text-sm">
      <strong>{displayData.total.toLocaleString("en-GB")} words</strong>
      <span aria-live="polite">{selectedCount.toLocaleString("en-GB")} selected</span>
      <button type="button" onClick={selectPage} disabled={loading || !displayData.rows.length}
        className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">Select this page</button>
      <button type="button" onClick={() => { setMode("all"); setSelected(new Set()); setExcluded(new Set()); }}
        disabled={loading || !displayData.total || displayData.total > MAX_EXPORT_ROWS}
        className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">Select all search results</button>
      <button type="button" onClick={clearSelection} disabled={!selectedCount}
        className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">Clear selection</button>
      <button type="button" onClick={exportCsv} disabled={Boolean(previewRows) || loading || exporting || !selectedCount}
        className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
        {exporting ? "Preparing CSV…" : "Export selected CSV"}
      </button>
    </div>
    {previewRows && <p className="text-sm text-slate-600">CSV export is disabled for sample data.</p>}
    {displayData.total > MAX_EXPORT_ROWS && <p className="text-sm text-amber-800">Narrow the search to export all results; the dictionary importer accepts up to 10,000 rows.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-slate-700"><tr>
          <th scope="col" className="p-3">Select</th>
          <th scope="col" className="p-3">Word</th>
          <th scope="col" className="p-3 text-right">Verified uses</th>
          <th scope="col" className="p-3 text-right">Children</th>
          <th scope="col" className="p-3 text-right">ADLE</th>
          <th scope="col" className="p-3 text-right">Other writing</th>
          <th scope="col" className="p-3">First seen</th>
          <th scope="col" className="p-3">Latest seen</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {displayData.rows.map((row) => <tr key={row.word_key} className="hover:bg-slate-50">
            <td className="p-3"><input type="checkbox" checked={isSelected(row.word_key)}
              onChange={() => toggleWord(row.word_key)} disabled={loading}
              aria-label={`Select ${row.word_key}`} /></td>
            <th scope="row" className="p-3 font-semibold">{row.word_key}</th>
            <td className="p-3 text-right">{row.verified_uses}</td>
            <td className="p-3 text-right">{row.children_count}</td>
            <td className="p-3 text-right">{row.adle_uses}</td>
            <td className="p-3 text-right">{row.other_writing_uses}</td>
            <td className="p-3 whitespace-nowrap">{date(row.first_seen_at)}</td>
            <td className="p-3 whitespace-nowrap">{date(row.last_seen_at)}</td>
          </tr>)}
          {!displayData.rows.length && <tr><td colSpan={8} className="p-8 text-center text-slate-600">No words match this search.</td></tr>}
        </tbody>
      </table>
    </div>
    <nav aria-label="Recommendation pages" className="flex items-center gap-3 text-sm">
      <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}
        disabled={loading || page <= 1} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" onClick={() => setPage((current) => Math.min(pages, current + 1))}
        disabled={loading || page >= pages} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">Next</button>
    </nav>
  </section>;
}
