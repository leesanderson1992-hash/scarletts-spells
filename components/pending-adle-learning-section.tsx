import Link from "next/link";

import type { PendingAdleLearningResult } from "@/lib/adle/pending-learning";

type PendingAdleLearningSectionProps = {
  result: PendingAdleLearningResult;
  queueHref: string;
  previewLimit?: number;
  showQueueLink?: boolean;
};

export function PendingAdleLearningSection({
  result,
  queueHref,
  previewLimit,
  showQueueLink = true,
}: PendingAdleLearningSectionProps) {
  const routes = result.status === "ready" ? result.routes : [];
  const visibleRoutes = previewLimit ? routes.slice(0, previewLimit) : routes;

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-eyebrow">ADLE learning</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
            Pending ADLE learning
          </h2>
          <p className="mt-1 text-sm text-[color:var(--mid)]">
            Active spelling routes waiting to be taught, reviewed, or resumed.
          </p>
        </div>
        {result.status === "ready" ? (
          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
            {routes.length} {routes.length === 1 ? "route" : "routes"}
          </span>
        ) : null}
      </div>

      {result.status === "unavailable" ? (
        <p className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
          Pending ADLE learning is temporarily unavailable. The rest of Insights is still up to date.
        </p>
      ) : visibleRoutes.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
          No pending ADLE learning right now.
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {visibleRoutes.map((route) => (
            <article
              key={route.learningItemId}
              className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {route.canonicalWord}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--mid)]">
                    {route.learnerSpelling
                      ? `Learner spelling: ${route.learnerSpelling}`
                      : "Learner spelling unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--mid)]">
                    {route.microSkillName
                      ? `${route.microSkillName} · ${route.microSkillKey}`
                      : route.microSkillKey}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--border)] bg-[rgba(248,247,243,0.95)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                  {route.lifecycleLabel}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {showQueueLink ? (
        <Link href={queueHref} className="brand-secondary-btn mt-4">
          Open full queue
        </Link>
      ) : null}
    </section>
  );
}
