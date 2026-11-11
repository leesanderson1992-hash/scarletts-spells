import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { buildScopedPath } from "@/lib/children-shared";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { canUpdateStagingIngLesson, isStagingIngSkill, loadStagingIngUpdate, STAGING_ING_LESSONS } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import { generateIngLesson, publishIngLesson } from "./actions";

const button = "rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white";
const card = "space-y-3 rounded-xl border border-[var(--border)] bg-white p-5";

export default async function LessonUpdates({ searchParams }: {
  searchParams: Promise<{ error?: string; published?: string; skill?: string }>;
}) {
  const actor = await requireAdminUser();
  const params = await searchParams;
  const skill = isStagingIngSkill(params.skill) ? params.skill : "D4_INF_ING_ENDINGS_REGULAR";
  const lessonName = STAGING_ING_LESSONS[skill];
  const db = createServiceRoleClient();
  const result = canUpdateStagingIngLesson()
    ? await loadStagingIngUpdate(db, skill).then(update => ({ update, error: null }),
      (error: unknown) => ({ update: null, error: error instanceof Error ? error.message : "Could not load the lesson update." }))
    : { update: null, error: "-ing publishing is available in staging." };
  const { update } = result;
  const children = update ? await db.from("children").select("id,first_name").in("id", update.childIds)
    .eq("parent_user_id", actor.id).eq("is_archived", false).order("first_name") : null;
  const learners = children?.data ?? [];
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <Link href="/admin/teaching-dictionary#word-csv-import" className="text-sm underline">Teaching Dictionary CSV import</Link>
    <h1 className="text-3xl font-semibold">Lesson updates</h1>
    <nav aria-label="-ing lessons" className="flex flex-wrap gap-4">
      {Object.entries(STAGING_ING_LESSONS).map(([key, label]) => <Link key={key}
        aria-current={key === skill ? "page" : undefined} className={key === skill ? "font-semibold" : "underline"}
        href={`?skill=${key}`}>{label}</Link>)}
    </nav>
    {params.error || result.error || children?.error ? <p role="alert" className="rounded-lg bg-rose-50 p-3">
      {params.error || result.error || "Could not load staging learners."}</p> : null}
    {params.published && <p role="status" className="rounded-lg bg-emerald-50 p-3">The updated {lessonName} pool is active.</p>}
    {update && <>
      <section className={card}>
        <h2 className="text-xl font-semibold">Preview the lesson update</h2>
        <p><strong>{update.current.length}</strong> approved words already released · <strong>{update.changes.length}</strong> approved words ready to publish</p>
        {update.changes.length > 0 && <ul className="list-disc pl-5">{update.changes.map(word =>
          <li key={word.canonicalWordId}><Link className="underline" href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>{word.word}</Link> · {word.meaning}</li>)}</ul>}
        {update.retired.length > 0 && <p>Remove words whose approval is no longer current. {update.retired.map(word => word.word).join(", ")}.</p>}
        {update.changes.length || update.retired.length ? <form action={publishIngLesson}>
          <input type="hidden" name="skill" value={skill} />
          <input type="hidden" name="fingerprint" value={update.fingerprint} />
          <button className={button}>Publish {lessonName} update</button>
        </form> : <p>The approved words are up to date.</p>}
      </section>
      <section className={card}>
        <h2 className="text-xl font-semibold">Generate a staging lesson</h2>
        {learners.length && update.current.length ? <form action={generateIngLesson} className="space-y-4">
          <input type="hidden" name="skill" value={skill} />
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
  </main>;
}
