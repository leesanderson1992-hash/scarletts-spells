"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewRootHistoricalLanguage } from "./root-family-actions";
export function RootLanguageReview({ wordId, familyKey, revision, origin }: {
  wordId: string; familyKey: string; revision: number; origin: string;
}) {
  const [language, setLanguage] = useState(origin), [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <div className="flex basis-full flex-wrap items-end gap-2">
    <label className="grid gap-1">Historical language
      <select aria-label="Historical language" className="rounded border p-1" value={language}
        disabled={pending} onChange={event => setLanguage(event.target.value)}>
        {!["Latin", "Greek", "Latin-derived"].includes(origin) && <option value={origin}>{origin}</option>}
        <option>Latin</option><option>Greek</option><option>Latin-derived</option>
      </select>
    </label>
    <button type="button" className="rounded border px-2 py-1 disabled:opacity-50"
      disabled={pending || language === origin} onClick={() => start(async () => {
        setError("");
        try {
          const result = await reviewRootHistoricalLanguage({ wordId, familyKey, revision, origin: language });
          if (!result.ok) setError(result.error ?? "Historical language could not be saved.");
          else router.refresh();
        } catch { setError("Historical language could not be saved. Reload and retry."); }
      })}>{pending ? "Saving…" : "Save historical language"}</button>
    {error && <p role="alert" className="basis-full text-rose-900">{error}</p>}
  </div>;
}
