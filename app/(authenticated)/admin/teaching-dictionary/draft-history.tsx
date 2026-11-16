"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CATALOGUE_PATH, withCatalogueOrigin, type CatalogueQuery } from "@/lib/teaching-dictionary-manager/catalogue-navigation";
import { loadDraftHistory } from "./draft-history-actions";

export function DraftHistory({ wordId, origin }: { wordId: string; origin: CatalogueQuery }) {
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadDraftHistory>>>();
  const [unavailable, setUnavailable] = useState(false);
  const [loading, startTransition] = useTransition();
  function load() {
    setUnavailable(false);
    startTransition(async () => {
      try { setHistory(await loadDraftHistory(wordId)); }
      catch { setUnavailable(true); }
    });
  }
  return <div className="mt-2">
    {history ? history.length ? <ul className="space-y-1">
      {history.map(version => <li key={version.id}>
        <Link className="underline" prefetch={false}
          href={`${CATALOGUE_PATH}/${wordId}?${withCatalogueOrigin(origin, new URLSearchParams({ draft: version.id }))}`}>
          {new Date(version.created_at).toLocaleString("en-GB")}
        </Link>{" "}· {version.source_reference}
      </li>)}
    </ul> : <p>No saved drafts.</p>
      : <button type="button" className="underline" disabled={loading} onClick={load}>
        {loading ? "Loading draft history…" : unavailable ? "Retry draft history" : "Load draft history"}
      </button>}
    {unavailable && <p role="alert">Could not load draft history.</p>}
  </div>;
}
