export default function ReviewDetailLoading() {
  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 md:p-6" role="status" aria-live="polite">
      <div className="brand-card rounded-3xl p-5">
        <p className="brand-eyebrow">Review work</p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--ink)]">Opening review…</h1>
        <p className="mt-2 text-sm text-[var(--mid)]">Preparing the original writing and review steps.</p>
      </div>
      <div className="brand-card rounded-3xl p-5">
        <div className="h-6 w-48 animate-pulse rounded bg-[var(--mist)]" />
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-[var(--mist)]" />
      </div>
    </main>
  );
}
