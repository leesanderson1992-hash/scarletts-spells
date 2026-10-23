/** Shared presentation from the real learner route; no loading or mutation. */
export function AdlePlanNotices(props: { saved?: string; error?: string }) {
  return <>
    {props.saved ? <p role="status" className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200">{props.saved}</p> : null}
    {props.error ? <p role="alert" className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">{props.error}</p> : null}
  </>;
}

export function AdleEmptyPlan() {
  return <div className="adle-presentation review-scene rounded-3xl p-4 md:p-5">
    <p className="text-sm text-[color:var(--review-muted)]">Today&apos;s spelling plan has not been set up yet. Check back after your grown-up has prepared it.</p>
  </div>;
}

export function AdleReviewCompleteTransition(props: { children: React.ReactNode }) {
  return <div className="adle-presentation review-scene w-full overflow-hidden p-6 md:p-8">
    <p className="review-eyebrow">Review complete ✓</p>
    <h2 className="review-title mt-3">Now for today&apos;s lesson…</h2>
    <p className="mt-2 text-sm text-cyan-50/80">Your Review is safely finished. Continue to prepare the next stage.</p>
    {props.children}
  </div>;
}
