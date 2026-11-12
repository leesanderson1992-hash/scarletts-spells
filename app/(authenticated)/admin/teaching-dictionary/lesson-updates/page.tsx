import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { buildScopedPath } from "@/lib/children-shared";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { canUpdateStagingIngLesson, isStagingIngSkill, loadStagingIngUpdate, STAGING_ING_LESSONS } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import { BulkReviewFlow } from "./bulk-review-flow";
import { generateIngLesson, publishIngLesson } from "./actions";

const button = "rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white";
const card = "space-y-3 rounded-xl border border-[var(--border)] bg-white p-5";

export default async function LessonUpdates({ searchParams }: {
  searchParams: Promise<{ error?: string; published?: string; skill?: string; cluster?: string }>;
}) {
  const actor = await requireAdminUser();
  const params = await searchParams;
  const db = createServiceRoleClient();
  const [clusterRows, skillRows, result] = await Promise.all([
    db.from("micro_skill_clusters").select("skill_cluster_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_cluster_key")
      .eq("is_active", true).eq("is_assignable", true).order("display_name"),
    canUpdateStagingIngLesson() && isStagingIngSkill(params.skill)
      ? loadStagingIngUpdate(db, params.skill).then(update => ({ update, error: null }),
        (error: unknown) => ({ update: null, error: error instanceof Error ? error.message : "Could not load the lesson update." }))
      : Promise.resolve({ update: null, error: null }),
  ]);
  if (clusterRows.error || skillRows.error) throw new Error("Could not load the lesson filters.");
  const selected = params.skill ?? "";
  const skill = isStagingIngSkill(selected) ? selected : null;
  const lessonName = skill ? STAGING_ING_LESSONS[skill] : "";
  const clusters = (clusterRows.data ?? []).map(row => ({ key: row.skill_cluster_key, label: row.display_name }));
  const skills = (skillRows.data ?? []).map(row => ({ key: row.micro_skill_key, label: row.display_name, cluster: row.skill_cluster_key }));
  const { update } = result;
  const children = update ? await db.from("children").select("id,first_name").in("id", update.childIds)
    .eq("parent_user_id", actor.id).eq("is_archived", false).order("first_name") : null;
  const learners = children?.data ?? [];
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <Link href="/admin/teaching-dictionary" className="text-sm underline">Teaching Dictionary</Link>
    <h1 className="text-3xl font-semibold">Bulk review</h1>
    {params.error || result.error || children?.error ? <p role="alert" className="rounded-lg bg-rose-50 p-3">
      {params.error || result.error || "Could not load staging learners."}</p> : null}
    {params.published && <p role="status" className="rounded-lg bg-emerald-50 p-3">The updated {lessonName} pool is active.</p>}
    <BulkReviewFlow key={selected} clusters={clusters} skills={skills} selected={selected}
      initialCluster={params.cluster ?? ""} supported={Boolean(update)} published={Boolean(params.published)}
      batches={update ? Math.ceil(new Set([...update.reviewWords.map(word => word.wordId),
        ...update.words.filter(word => word.microSkillKey === skill && !word.senseId).map(word => word.canonicalWordId)]).size / 100) : 0}>
    {update && <>
      <section className={card}>
        <h2 className="text-xl font-semibold">Preview the lesson update</h2>
        <p><strong>{update.current.length}</strong> approved words already released · <strong>{update.changes.length}</strong> approved words ready to publish</p>
        {update.changes.length > 0 && <ul className="list-disc pl-5">{update.changes.map(word =>
          <li key={word.canonicalWordId}><Link className="underline" href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>{word.word}</Link> · {word.meaning}</li>)}</ul>}
        {update.retired.length > 0 && <p>Remove words whose approval is no longer current. {update.retired.map(word => word.word).join(", ")}.</p>}
        {update.changes.length || update.retired.length ? <form action={publishIngLesson}>
          <input type="hidden" name="skill" value={selected} />
          <input type="hidden" name="fingerprint" value={update.fingerprint} />
          <button className={button}>Publish {lessonName} update</button>
        </form> : <p>The approved words are up to date.</p>}
      </section>
      <section className={card}>
        <h2 className="text-xl font-semibold">Generate a staging lesson</h2>
        {learners.length && update.current.length ? <form action={generateIngLesson} className="space-y-4">
          <input type="hidden" name="skill" value={selected} />
          <label className="grid gap-1">Test learner
            <select name="child_id" className="rounded border p-2">{learners.map(learner =>
              <option key={learner.id} value={learner.id}>{learner.first_name}</option>)}</select>
          </label>
          <fieldset>
            <legend>Choose one or two released words to use as targets</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">{update.current.map(word =>
              <label key={word.canonicalWordId} className="flex items-center gap-2">
                <input type="checkbox" name="word_id" value={word.canonicalWordId} /> {word.word}
              </label>)}</div>
          </fieldset>
          <button className={button}>Generate {lessonName} lesson</button>
        </form> : <p>Generation needs an enabled test learner on your account and at least one released word with a current approval.</p>}
        {learners.map(learner => <p key={learner.id}><Link className="underline"
          href={buildScopedPath("/learn/week/adle", learner.id, "child")}>Open {learner.first_name}’s lesson</Link></p>)}
      </section>
    </>}
    </BulkReviewFlow>
  </main>;
}
