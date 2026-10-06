import { Suspense } from "react";
import Link from "next/link";

import { ChildSwitcher } from "@/components/child-switcher";
import { buildScopedPath } from "@/lib/children";
import { groupInsightSkills, loadParentInsightSkills } from "@/lib/parent-insights/proficiency";
import { loadReviewCycle } from "@/lib/parent-insights/review-cycle";
import { createClient } from "@/lib/supabase/server";
import { InsightsWorkspace } from "./workspace";

type Child = { id: string; first_name: string; last_name: string | null };

function londonDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function ParentInsights({ child, childOptions }: { child: Child | null; childOptions: Child[] }) {
  if (!child) {
    return <div className="parent-insights brand-page"><section className="brand-card p-6">
      <h1 className="brand-title">Insights</h1>
      <p className="brand-copy mt-2">Add or restore a child profile to see learning insights.</p>
      <Link className="brand-primary-btn mt-4" href="/children">Manage children</Link>
    </section></div>;
  }
  const today = londonDate();
  const reviewPromise = loadReviewCycle(child.id, today);
  return <div className="parent-insights brand-page">
    <header className="parent-insights-header">
      <div>
        <p className="brand-eyebrow">Parent insights</p>
        <h1 className="brand-title">{child.first_name}&apos;s spelling progress</h1>
        <p className="brand-copy">See the level each microskill has achieved and the words behind each level.</p>
      </div>
      <div className="parent-insights-actions">
        <ChildSwitcher activeChildId={child.id} childOptions={childOptions} redirectPath="/insights" compact showSingleChild />
        <Link className="brand-secondary-btn" href={buildScopedPath("/insights/details", child.id, "parent")}>More insights and tools</Link>
      </div>
    </header>
    <Suspense fallback={<div className="insights-skeleton-grid" aria-busy="true"><div className="insights-skeleton" /><div className="insights-skeleton" /></div>}>
      <ProficiencySection childId={child.id} today={today} reviewPromise={reviewPromise} />
    </Suspense>
  </div>;
}

async function ProficiencySection({ childId, today, reviewPromise }: {
  childId: string;
  today: string;
  reviewPromise: ReturnType<typeof loadReviewCycle>;
}) {
  let skills: Awaited<ReturnType<typeof loadParentInsightSkills>> | null = null;
  let snapshots: Awaited<ReturnType<typeof loadSnapshots>> = [];
  try {
    [skills, snapshots] = await Promise.all([
      loadParentInsightSkills(childId),
      loadSnapshots(childId),
    ]);
  } catch {
    skills = null;
  }
  if (!skills) {
    return <section className="brand-card p-6" role="alert">
      <h2 className="text-lg font-semibold">Learning insights are unavailable</h2>
      <p className="brand-copy mt-2">Please try this page again. Your learning records have not changed.</p>
    </section>;
  }
  return <InsightsWorkspace key={childId} families={groupInsightSkills(skills)} skills={skills} snapshots={snapshots} today={today}
    reviewSlot={<Suspense fallback={<div className="insights-skeleton" aria-busy="true" aria-label="Loading review cycle" />}>
      <ReviewCycleSection promise={reviewPromise} />
    </Suspense>} />;
}

async function loadSnapshots(childId: string) {
  const client = await createClient();
  const result = await client.from("parent_insight_family_snapshots")
    .select("snapshot_on,family_key,family_label,average_level,microskill_count,policy_version,banding_version")
    .eq("child_id", childId).order("snapshot_on", { ascending: true }).limit(500);
  // The migration can be absent in a local checkout; the current projection remains usable.
  if (result.error) return [];
  return result.data.map((row) => ({
    date: row.snapshot_on as string,
    familyKey: row.family_key as string,
    familyLabel: row.family_label as string,
    average: Number(row.average_level),
    count: row.microskill_count as number,
    policyVersion: row.policy_version as string,
    bandingVersion: row.banding_version as string,
  }));
}

async function ReviewCycleSection({ promise }: { promise: ReturnType<typeof loadReviewCycle> }) {
  let result: Awaited<ReturnType<typeof loadReviewCycle>> | null = null;
  try {
    result = await promise;
  } catch {
    result = null;
  }
  if (!result) {
    return <section className="insights-review-card brand-card" role="alert"><h2>Review cycle unavailable</h2><p className="brand-copy">Please try again later.</p></section>;
  }
  return <section className="insights-review-card brand-card">
      <div className="insights-card-heading"><div><h2>Review cycle</h2><p>Words at each spaced-review window</p></div></div>
      <div className="insights-review-legend"><span><i className="is-advancing" /> Advancing</span><span><i className="is-staying" /> Retrying</span><span><i className="is-regressed" /> Regressed</span></div>
      <div className="insights-review-list">{result.buckets.map((bucket) => <details key={bucket.key} className="insights-review-bucket">
        <summary><span>{bucket.label}</span><strong>{bucket.words.length}</strong><span className="insights-review-preview">{bucket.words.slice(0, 2).map((word) => <span key={word.id} className={`insights-word-pill is-${word.status}`}>{word.word}</span>)}</span><span aria-hidden="true">›</span></summary>
        <div className="insights-review-expanded">{bucket.words.length ? bucket.words.map((word) => <span key={word.id} className={`insights-word-pill is-${word.status}`} title={word.dueOn ? `Due ${word.dueOn}` : undefined}>{word.word}</span>) : <p>No words in this window.</p>}</div>
      </details>)}</div>
      {result.exceptionCount > 0 ? <p className="insights-review-exceptions">{result.exceptionCount} word{result.exceptionCount === 1 ? " is" : "s are"} on a recovery, reteaching, or paused route outside these windows.</p> : null}
    </section>;
}
