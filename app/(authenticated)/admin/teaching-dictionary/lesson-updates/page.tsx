import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { buildScopedPath } from "@/lib/children-shared";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { canUpdateIngLesson, findPreparedStagingIngRelease, isStagingIngSkill, loadStagingIngUpdate, STAGING_ING_LESSONS } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import { ingReviewEnvironment } from "@/lib/teaching-dictionary-manager/ing-staging-scope";
import { loadIngReviewWords } from "@/lib/teaching-dictionary-manager/ing-review-data";
import { BulkReviewFlow } from "./bulk-review-flow";
import { chooseIngLessonMeaning, generateIngLesson, publishIngLesson } from "./actions";

const button = "rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white";
const card = "space-y-3 rounded-xl border border-[var(--border)] bg-white p-5";

export default async function LessonUpdates({ searchParams }: {
  searchParams: Promise<{ error?: string; published?: string; skill?: string; cluster?: string; view?: string }>;
}) {
  const actor = await requireAdminUser();
  const params = await searchParams;
  const db = createServiceRoleClient();
  const view = params.published || params.error || params.view === "preview" ? "preview"
    : params.view === "workbook" ? "workbook" : "export";
  const skill = isStagingIngSkill(params.skill) ? params.skill : null;
  const supported = canUpdateIngLesson() && Boolean(skill);
  const [clusterRows, skillRows, result] = await Promise.all([
    db.from("micro_skill_clusters").select("skill_cluster_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_cluster_key")
      .eq("is_active", true).eq("is_assignable", true).order("display_name"),
    supported && skill && (view === "preview" || (view === "export" && ingReviewEnvironment() !== "production"))
      ? loadStagingIngUpdate(db, skill).then(update => ({ update, error: null }),
        (error: unknown) => ({ update: null, error: error instanceof Error ? error.message : "Could not load the lesson update." }))
      : Promise.resolve({ update: null, error: null }),
  ]);
  if (clusterRows.error || skillRows.error) throw new Error("Could not load the lesson filters.");
  const selected = params.skill ?? "";
  const lessonName = skill ? STAGING_ING_LESSONS[skill] : "";
  const clusterLabels = new Map((clusterRows.data ?? []).map(row => [row.skill_cluster_key, row.display_name]));
  const skills = (skillRows.data ?? []).map(row => ({ key: row.micro_skill_key, label: row.display_name, cluster: row.skill_cluster_key }));
  const clusters = [...new Set(skills.map(item => item.cluster).filter(Boolean))].map(key => ({
    key,
    label: clusterLabels.get(key) ?? (key === "D4_INF_ING_ENDINGS" ? "-ing endings" : key.replace(/^D\d+_/u, "").replaceAll("_", " ")),
  })).sort((a, b) => a.label.localeCompare(b.label));
  const { update } = result;
  const productionRows = skill && view === "export" && ingReviewEnvironment() === "production"
    ? await loadIngReviewWords(skill) : null;
  const [children, prepared] = await Promise.all([
    update && view === "preview" && update.childIds.length ? db.from("children").select("id,first_name").in("id", update.childIds)
      .eq("parent_user_id", actor.id).eq("is_archived", false).order("first_name") : null,
    update && view === "preview" && (update.changes.length || update.retired.length)
      ? findPreparedStagingIngRelease(db, update.skill, update.fingerprint) : null,
  ]);
  const learners = children?.data ?? [];
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <Link href="/admin/teaching-dictionary" className="text-sm underline">Teaching Dictionary</Link>
    <h1 className="text-3xl font-semibold">Bulk review</h1>
    {params.error || result.error || children?.error ? <p role="alert" className="rounded-lg bg-rose-50 p-3">
      {params.error || result.error || "Could not load staging learners."}</p> : null}
    {params.published && update && <p role="status" className="rounded-lg bg-emerald-50 p-3">The updated {lessonName} pool is active.</p>}
    <BulkReviewFlow key={selected} clusters={clusters} skills={skills} selected={selected}
      initialCluster={params.cluster ?? ""} supported={supported} view={view}
      reviewRows={productionRows?.map(row => ({ id: row.wordId, word: row.displayWord, live: Boolean(row.released) })) ?? null}
      batches={productionRows ? Math.ceil(productionRows.length / 100) : update ? Math.ceil(new Set([...update.reviewWords.map(word => word.wordId),
        ...update.words.filter(word => word.microSkillKey === skill && !word.senseId).map(word => word.canonicalWordId)]).size / 100) : null}>
    {update && view === "preview" && <>
      {update.meaningChoices.length > 0 && <section className={card}>
        <h2 className="text-xl font-semibold">Choose lesson meanings</h2>
        <p>Choose which approved meaning ADLE should teach for this micro-skill. Publish the update to use that meaning in new lessons.</p>
        {update.meaningChoices.map(choice => <form key={choice.wordId} action={chooseIngLessonMeaning}
          className="space-y-2 rounded-lg border border-[var(--border)] p-3">
          <input type="hidden" name="skill" value={selected} />
          <input type="hidden" name="word_id" value={choice.wordId} />
          <label className="grid gap-1"><strong>Lesson meaning for {choice.word}</strong>
            <select name="sense_id" className="rounded border p-2" defaultValue={choice.selectedSenseId ?? ""} required>
              <option value="" disabled>Choose an approved meaning</option>
              {choice.options.map(option => <option key={option.id} value={option.id}>{option.definition}</option>)}
            </select>
          </label>
          {choice.activeMeaning && <p>Currently taught · {choice.activeMeaning}</p>}
          {choice.selectedSenseId && !choice.selectedMeaningReady && <p>Recheck the selected meaning’s lesson approval before publishing.</p>}
          <button className={button}>Save lesson meaning for {choice.word}</button>
        </form>)}
      </section>}
      <section className={card}>
        <h2 className="text-xl font-semibold">Preview the lesson update</h2>
        <p><strong>{update.current.length}</strong> words in the live pool · <strong>{update.changes.length}</strong> additions or updates · <strong>{update.retired.length}</strong> removals</p>
        {update.changes.length > 0 && <ul className="list-disc pl-5">{update.changes.map(word =>
          <li key={word.canonicalWordId}><Link className="underline" href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>{word.word}</Link> · {update.current.some(current => current.canonicalWordId === word.canonicalWordId) ? "Update" : "Add"} · {word.meaning}</li>)}</ul>}
        {update.retired.length > 0 && <p>Remove words whose approval is no longer current. {update.retired.map(word => word.word).join(", ")}.</p>}
        {prepared && <p role="status">The update has been validated and is waiting for activation.</p>}
        {update.changes.length || update.retired.length ? <form action={publishIngLesson}>
          <input type="hidden" name="skill" value={selected} />
          <input type="hidden" name="fingerprint" value={update.fingerprint} />
          <button className={button}>{prepared ? "Resume publishing" : `Publish ${lessonName} update`}</button>
        </form> : <p>The approved words are up to date.</p>}
      </section>
      {update.environment === "staging" && <section className={card}>
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
      </section>}
    </>}
    </BulkReviewFlow>
  </main>;
}
