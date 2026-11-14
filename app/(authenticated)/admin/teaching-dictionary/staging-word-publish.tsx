"use client";

import { useEffect, useState } from "react";
import { stagingWordPublishStatus } from "./staging-word-publish-actions";

type PublishState = Awaited<ReturnType<typeof stagingWordPublishStatus>>;

export function StagingWordPublish({ wordId, skill, senseId, word, lesson, fallback }: {
  wordId: string; skill: string; senseId: string; word: string; lesson: string; fallback: string;
}) {
  const [result, setResult] = useState<PublishState>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ skill, sense: senseId });
    fetch(`/api/admin/teaching-dictionary/${wordId}/ing-publication?${query}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Publication status unavailable");
        const result: PublishState = await response.json();
        if (!controller.signal.aborted) setResult(result);
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ status: "error", message: "Could not check publication status." });
      });
    return () => controller.abort();
  }, [wordId, skill, senseId, retry]);

  if (!result || result.status === "unavailable") return <span className="text-sm">{fallback}</span>;
  if (result.status === "active")
    return <p className="text-sm font-semibold text-emerald-800" role="status">✓ Active</p>;
  if (result.status === "error") return <div className="text-sm">
    <p role="status">{result.message}</p>
    <button type="button" className="underline" onClick={() => { setResult(undefined); setRetry(count => count + 1); }}>
      Check publication status
    </button>
  </div>;

  async function publish(fingerprint: string) {
    setBusy(true);
    try {
      setResult(await stagingWordPublishStatus(wordId, skill, senseId, fingerprint));
    } catch {
      setResult({ status: "error", message: "Could not confirm publication. Check the latest status before retrying." });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{result.alreadyActive ? "Active · Update ready to publish" : "Ready to publish"}</span>
      {!confirm && <button type="button" className="rounded-lg border px-3 py-1" onClick={() => setConfirm(true)}>Publish word</button>}
    </div>
    {confirm && <div className="space-y-2" role="group" aria-label="Confirm word publication">
      <p>Publish <strong>{word}</strong> to <strong>{lesson}</strong>?</p>
      <button type="button" className="rounded-lg bg-[var(--scarlett)] px-3 py-1 font-semibold text-white disabled:opacity-50"
        disabled={busy} onClick={() => void publish(result.fingerprint)}>
        {busy ? "Publishing…" : `Publish ${word}`}
      </button>
      <button type="button" className="ml-2 underline" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
    </div>}
  </div>;
}
