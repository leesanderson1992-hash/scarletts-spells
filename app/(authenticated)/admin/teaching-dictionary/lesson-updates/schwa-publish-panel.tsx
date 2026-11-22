"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SchwaPublishJob } from "@/lib/teaching-dictionary-manager/schwa-publish-jobs";
const endpoint = "/api/admin/teaching-dictionary/schwa-publish";
const button = "rounded-lg bg-[color:var(--scarlett)] px-4 py-2 font-semibold disabled:opacity-50";
export function SchwaPublishPanel({ skill, ready }: { skill: string; ready: { id: string; word: string }[] }) {
  const router = useRouter();
  const [job, setJob] = useState<SchwaPublishJob | null>(null);
  const [running, setRunning] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const stop = useRef(false), mounted = useRef(true), requestId = useRef<string | null>(null);
  async function send(action: string, jobId?: string) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, skill, jobId, requestId: requestId.current, draftIds: ready.map(row => row.id) }) });
    const data = await response.json() as { job?: SchwaPublishJob; error?: string };
    if (!response.ok || !data.job) throw new Error(data.error ?? "Could not read the publish job. Your progress is saved.");
    return data.job;
  }
  useEffect(() => {
    mounted.current = true; stop.current = false;
    const controller = new AbortController();
    void fetch(`${endpoint}?${new URLSearchParams({ skill })}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Could not load saved publishing progress. Refresh to retry."); return response.json(); })
      .then(data => { if (mounted.current) setJob(data.job); })
      .catch(cause => { if (mounted.current && !controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; stop.current = true; controller.abort(); };
  }, [skill]);
  useEffect(() => {
    if (!running || !job?.id) return;
    const controller = new AbortController(); let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return; inFlight = true;
      try {
        const response = await fetch(`${endpoint}?${new URLSearchParams({ skill, jobId: job.id })}`, { signal: controller.signal });
        if (response.ok) { const data = await response.json(); if (mounted.current && data.job) setJob(data.job); }
      } catch { /* The processing request reports failures; status polling is read-only. */ }
      finally { inFlight = false; }
    }, 2500);
    return () => { clearInterval(timer); controller.abort(); };
  }, [running, job?.id, skill]);
  async function run(resume: boolean) {
    if (running) return;
    setError(""); setRunning(true); stop.current = false;
    requestId.current ??= crypto.randomUUID();
    try {
      let current = await send(resume ? "resume" : "start", resume ? job?.id : undefined);
      if (mounted.current) setJob(current);
      while (!stop.current && current.status === "active") {
        current = await send("process", current.id);
        if (mounted.current) setJob(current);
        if (current.items.some(item => item.status === "publishing") && !current.items.some(item => item.status === "pending"))
          await new Promise(resolve => setTimeout(resolve, 2500));
      }
      if (current.status === "completed" && mounted.current) { requestId.current = null; router.refresh(); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Connection interrupted. Resume your saved publishing job.");
    } finally { if (mounted.current) setRunning(false); }
  }
  const published = job?.items.filter(item => item.status === "published").length ?? 0;
  const total = job?.items.length ?? 0;
  const unfinished = job && job.status !== "completed";
  return <section aria-label="Publish reviewed words" className="space-y-3 rounded-xl border bg-white p-4">
    <h3 className="text-lg font-semibold">Publish reviewed words</h3>
    <p className="text-sm">Words publish in small batches. Results are saved after each word; return here to resume if you leave.</p>
    {error && <p role="alert" className="text-rose-900">{error}</p>}
    {job && <>
      <p role="status" aria-live="polite"><strong>{published} of {total} published</strong> · {running ? "Publishing…" : job.status === "completed" ? "Finished" : "Progress saved · Ready to resume"}</p>
      <progress className="w-full" aria-label="Words published" max={total || 1} value={published} />
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">{job.items.map(item => <li key={item.draftId}>
        <Link className="font-semibold underline" href={`/admin/teaching-dictionary/${item.wordId}`} target="_blank">{item.word}</Link> · {item.status === "published" ? "✓ Active" : item.status === "blocked" ? "Needs review" : item.status === "publishing" ? "Publishing · Safe to resume after an interruption" : item.status === "failed" ? "Retry needed" : "Waiting"}
        {item.error && <p className="text-rose-900">{item.error}</p>}
      </li>)}</ul>
    </>}
    <div className="flex flex-wrap gap-3">
      {unfinished ? <button type="button" className={button} disabled={loading || running} onClick={() => void run(true)}>Resume publishing</button>
        : ready.length > 0 && <button type="button" className={button} disabled={loading || running} onClick={() => void run(false)}>{loading ? "Loading saved progress…" : `Publish ${ready.length} ready words`}</button>}
      {running && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => {
        stop.current = true;
        if (job) void send("pause", job.id).then(setJob).catch(cause => setError(cause.message));
      }}>Pause after this batch</button>}
    </div>
  </section>;
}
