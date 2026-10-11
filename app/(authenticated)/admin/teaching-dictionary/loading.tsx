export default function TeachingDictionaryLoading() {
  return <main className="mx-auto max-w-7xl p-6 text-[color:var(--ink)]" role="status" aria-live="polite">
    <h1 className="text-3xl font-semibold">Teaching Dictionary Manager</h1>
    <p className="mt-3 text-sm">Loading words…</p>
    <div className="mt-6 rounded-2xl border border-[var(--border)] bg-white p-5" aria-hidden="true">
      <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
      <div className="mt-6 grid gap-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-8 animate-pulse rounded bg-slate-100" />)}</div>
    </div>
  </main>;
}
