import { ADLE_ACTIVITY_CATALOGUE, activityAuditCounts } from "@/lib/adle/activity-catalogue";

import { ActivityCatalogueGallery } from "./activity-catalogue-gallery";
import { VisualConvergenceLab } from "./visual-convergence-lab";

export default function AdleActivityCataloguePage() {
  const counts = activityAuditCounts();
  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8">
        <header>
          <p className="brand-eyebrow">Admin · development/design reference</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">ADLE Visual Convergence Lab</h1>
          <p className="brand-copy mt-4 max-w-4xl">
            Side-by-side deterministic fixtures for inspecting whether distinct pedagogical concepts and route adapters
            can eventually share interaction engines. This page has no learner, evidence, proficiency, reward, schedule,
            completion, or database integration.
          </p>
          <p className="brand-copy mt-2 text-sm">
            {ADLE_ACTIVITY_CATALOGUE.length} governed concepts · {counts.canonicalActivityConcepts} canonical · {counts.configuredModes} modes · {counts.totalImplementations} audited implementations
          </p>
        </header>

        <VisualConvergenceLab />

        <details className="brand-card rounded-3xl p-5">
          <summary className="cursor-pointer text-lg font-black text-[color:var(--ink)]">Canonical activity reference gallery</summary>
          <div className="mt-5"><ActivityCatalogueGallery /></div>
        </details>

        <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
            <thead className="bg-[var(--mist)]">
              <tr>
                {['Activity', 'Purpose', 'Implementation', 'Routes', 'Status'].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {ADLE_ACTIVITY_CATALOGUE.map((activity) => (
                <tr key={activity.activityKey}>
                  <td className="px-4 py-4 align-top font-semibold">{activity.displayName}<code className="mt-1 block text-xs font-normal">{activity.activityKey}</code></td>
                  <td className="max-w-xl px-4 py-4 align-top">{activity.pedagogicalPurpose}</td>
                  <td className="px-4 py-4 align-top"><code className="text-xs">{activity.canonicalComponentPath ?? 'Not yet canonical'}</code></td>
                  <td className="px-4 py-4 align-top">{activity.usedByRoutes.join(', ') || 'None'}</td>
                  <td className="px-4 py-4 align-top"><span className="rounded-full border border-[var(--border)] bg-[var(--mist)] px-2 py-1 text-xs font-semibold">{activity.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
