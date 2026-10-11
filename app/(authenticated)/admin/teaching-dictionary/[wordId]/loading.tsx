export default function TeachingDictionaryWordLoading() {
  return <main className="mx-auto max-w-6xl p-6 text-[color:var(--ink)]" role="status" aria-live="polite">
    <p className="text-sm">Opening word…</p>
    <div className="mt-4 h-9 w-48 animate-pulse rounded bg-slate-100" aria-hidden="true" />
    <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--border)] bg-white p-5" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-100" />)}
    </div>
  </main>;
}
