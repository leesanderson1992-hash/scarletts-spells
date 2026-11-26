"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeSpellingFamilyMember } from "./sense-morphology-actions";

export function FamilyRemoveButton({ wordId, word, familyKey, familyName, isBase = false }: {
  wordId: string; word: string; familyKey: string; familyName: string; isBase?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);
  const router = useRouter();
  if (isBase) return null;
  if (removed) return <span role="status" className="text-xs text-emerald-800">Removed</span>;
  return <span className="inline-flex items-center gap-1">
    <button type="button" aria-label={`De-assign ${word} from ${familyName}`}
      title={`De-assign ${word} from this spelling family`} disabled={pending}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-lg hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(`Are you sure you want to de-assign ${word} from ${familyName}? The word and its grammatical links will be kept.`)) return;
        setError("");
        start(async () => {
          try {
            const result = await removeSpellingFamilyMember({ wordId, familyKey });
            if (!result.ok) setError(result.error ?? "The family link could not be removed.");
            else { setRemoved(true); router.refresh(); }
          } catch { setError("The family link could not be removed. Try again."); }
        });
      }}>{pending ? <span className="text-xs">…</span> : "×"}</button>
    {error && <span role="alert" className="max-w-xs text-xs text-rose-900">{error}</span>}
  </span>;
}
