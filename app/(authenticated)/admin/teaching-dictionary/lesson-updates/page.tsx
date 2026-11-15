import { loadSpecialistBulkReview } from "@/lib/teaching-dictionary-manager/specialist-bulk-review";
import { suffixReviewTitle } from "@/lib/teaching-dictionary-manager/able-ible-workbook";
import { loadIdentifyBaseReview } from "@/lib/teaching-dictionary-manager/base-word-review";
import { publishIdentifyBaseWord } from "./base-word-actions";
import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { buildScopedPath } from "@/lib/children-shared";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { canUpdateIngLesson, findPreparedStagingIngRelease, isStagingIngSkill, loadStagingIngUpdate, STAGING_ING_LESSONS } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import { ING_REVIEW_BATCH_SIZE, ingReviewExportRows } from "@/lib/teaching-dictionary-manager/ing-review-export";
import { ActionSubmitButton } from "../action-submit-button";
import { BulkReviewFlow } from "./bulk-review-flow";
import { isSuffixWorkbookPilot, isIdentifyBaseReview, specialistWorkbookRoute } from "@/lib/teaching-dictionary-manager/bulk-review-scope";
import { loadAbleIbleReview } from "@/lib/teaching-dictionary-manager/able-ible-review";
import { writtenSyllableBlockers } from "@/lib/teaching-dictionary-manager/authoring";
import { DICTIONARY_BANDS } from "@/lib/teaching-dictionary-manager/contracts";
import { unWorkbookApprovalEnabled } from "@/lib/teaching-dictionary-manager/prefix-workbook-draft";
import { loadPendingUnWorkbookQueue } from "@/lib/teaching-dictionary-manager/un-prefix-bulk-review";
import { publishUnWorkbookWords, saveUnWorkbookDetails } from "./un-prefix-actions";
import { UN_PREFIX_SKILL } from "@/lib/teaching-dictionary-manager/prefix-content";
import { publishAbleIbleLesson } from "./able-ible-actions";
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
  const suffixPilot = isSuffixWorkbookPilot(params.skill);
  const baseReview = isIdentifyBaseReview(params.skill);
  const specialistRoute = specialistWorkbookRoute(params.skill);
  const supported = Boolean(specialistRoute) || baseReview || suffixPilot || canUpdateIngLesson() && Boolean(skill);
  const [clusterRows, skillRows, result, suffix, base, specialist] = await Promise.all([
    db.from("micro_skill_clusters").select("skill_cluster_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_cluster_key")
      .eq("is_active", true).eq("is_assignable", true).order("display_name"),
    supported && skill && (view === "preview" || view === "export")
      ? loadStagingIngUpdate(db, skill).then(update => ({ update, error: null }),
        (error: unknown) => ({ update: null, error: error instanceof Error ? error.message : "Could not load the lesson update." }))
      : Promise.resolve({ update: null, error: null }),
    suffixPilot && view !== "workbook" ? loadAbleIbleReview(db, params.skill) : null,
    baseReview && view !== "workbook" ? loadIdentifyBaseReview(db) : null,
    specialistRoute && params.skill && view !== "workbook" ? loadSpecialistBulkReview(db, params.skill, specialistRoute) : null,
  ]);
  if (clusterRows.error || skillRows.error) throw new Error("Could not load the lesson filters.");
  const suffixTitle = suffixReviewTitle(params.skill ?? "");
  const selected = params.skill ?? "";
  const prefixQueue = selected === UN_PREFIX_SKILL && view === "preview" && specialist && unWorkbookApprovalEnabled()
    ? await loadPendingUnWorkbookQueue(db) : null;
  const readyPrefixRows = prefixQueue?.filter(row => !row.blockers.length).slice(0, 100) ?? [];
  const draftWordIds = new Set(prefixQueue?.map(row => row.wordId));
  const lessonName = skill ? STAGING_ING_LESSONS[skill] : "";
  const clusterLabels = new Map((clusterRows.data ?? []).map(row => [row.skill_cluster_key, row.display_name]));
  const skills = (skillRows.data ?? []).map(row => ({ key: row.micro_skill_key, label: row.display_name, cluster: row.skill_cluster_key }));
  const clusters = [...new Set(skills.map(item => item.cluster).filter(Boolean))].map(key => ({
    key,
    label: clusterLabels.get(key) ?? (key === "D4_INF_ING_ENDINGS" ? "-ing endings" : key.replace(/^D\d+_/u, "").replaceAll("_", " ")),
  })).sort((a, b) => a.label.localeCompare(b.label));
  const { update } = result;
  const review = update && view === "export" ? ingReviewExportRows(update) : null;
  const [children, prepared] = await Promise.all([
    update && view === "preview" && update.childIds.length ? db.from("children").select("id,first_name").in("id", update.childIds)
      .eq("parent_user_id", actor.id).eq("is_archived", false).order("first_name") : null,
    update && view === "preview" && (update.changes.length || update.retired.length)
      ? findPreparedStagingIngRelease(db, update.skill, update.fingerprint) : null,
  ]);
  const learners = children?.data ?? [];
  const pageError = result.error || (!update ? params.error : undefined) || (children?.error ? "Could not load staging learners." : undefined);
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <Link href="/admin/teaching-dictionary" className="text-sm underline">Teaching Dictionary</Link>
    <h1 className="text-3xl font-semibold">Bulk review</h1>
    {pageError && <p role="alert" className="rounded-lg bg-rose-50 p-3">{pageError}</p>}
    <BulkReviewFlow key={selected} clusters={clusters} skills={skills} selected={selected}
      initialCluster={params.cluster ?? ""} supported={supported} view={view}
      fullPoolSize={specialist?.current.length ?? base?.current.length ?? suffix?.current.length ?? update?.current.length ?? null}
      allowsBlankWorkbook={suffixPilot || selected === UN_PREFIX_SKILL}
      review={specialist && view === "export" ? <section className={card}>
        <h2 className="text-xl font-semibold">{specialist.rows.length} words waiting for review</h2>
        <ul className="divide-y divide-[var(--border)]">{specialist.rows.map(row => <li key={row.id} className="py-2">
          <Link className="font-semibold underline" href={row.href}>{row.word}</Link>
          <p className="text-sm">{row.note}</p>
        </li>)}</ul>
      </section> : base && view === "export" ? <section className={card}>
        <h2 className="text-xl font-semibold">{base.rows.length} words waiting for review</h2>
        <ul className="divide-y divide-[var(--border)]">{base.rows.map(row => <li key={row.id} className="py-2">
          <Link className="font-semibold underline" href={`/admin/teaching-dictionary/${row.id}`}>{row.word}</Link>
          <p className="text-sm">{row.note}</p>
        </li>)}</ul>
      </section> : suffix && view === "export" && suffix.rows.length > 0 ? <section className={card}>
        <h2 className="text-xl font-semibold">Lesson words to reconcile</h2>
        <ul className="divide-y divide-[var(--border)]">{suffix.rows.map(word => <li key={word.id} className="space-y-1 py-3">
          <p><Link className="font-semibold underline" href={`/admin/teaching-dictionary/${word.id}`}>{word.word}</Link>
            {" · "}{word.status}</p>
          <p className="text-sm">{word.note}</p>
        </li>)}</ul>
      </section> : null}
      batches={specialist ? Math.ceil(specialist.rows.length / ING_REVIEW_BATCH_SIZE) : base ? Math.ceil(base.rows.length / ING_REVIEW_BATCH_SIZE) : suffix ? Math.ceil(suffix.rows.length / ING_REVIEW_BATCH_SIZE) : review ? Math.ceil(review.length / ING_REVIEW_BATCH_SIZE) : null}>
    {specialist && view === "preview" && <section className={card}>
      <h2 className="text-xl font-semibold">{specialist.title} publish status</h2>
      <p>{specialist.current.length} active words · {specialist.rows.length} waiting for review</p>
      <Link className="font-semibold underline" href={`/admin/adle-lesson-readiness?route=${specialist.routeId}&skill=${selected}`}>Open lesson readiness</Link>
      {prefixQueue && <>
        {params.published && <p role="status">{params.published} words published and available in ADLE.</p>}
        {prefixQueue.map(row => <form action={saveUnWorkbookDetails} key={row.id} className="space-y-2 rounded-lg border p-3">
          <input type="hidden" name="word_id" value={row.wordId} />
          <input type="hidden" name="draft_id" value={row.id} />
          <h3 className="font-semibold">{row.payload.displayWord} · {row.blockers.length ? "Needs facts" : "Ready to publish"}</h3>
          <p className="text-sm">{row.payload.definition} · Meaning group {row.payload.routeContents[0]?.content.meaningBinKey === "reverse" ? "Reverse" : "Not"}</p>
          {row.blockers.length > 0 && <>
            <ul className="list-disc pl-5 text-sm">{row.blockers.map(issue => <li key={issue}>{issue}</li>)}</ul>
            <div className="grid gap-2 sm:grid-cols-2">
              {([["ageBand", "Age band"], ["frequencyBand", "Frequency band"], ["complexityBand", "Complexity band"]] as const)
                .filter(([key]) => !row.payload[key]).map(([key, label]) => <label key={key} className="grid gap-1 text-sm">
                  {label}<select name={key} defaultValue="" className="rounded border p-2">
                    <option value="">Choose {label.toLowerCase()}</option>
                    {DICTIONARY_BANDS[key].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                  </select>
                </label>)}
              {(!row.payload.writtenSyllableBreakdown || writtenSyllableBlockers(row.payload.displayWord, row.payload.writtenSyllableBreakdown).length > 0) && <label className="grid gap-1 text-sm">
                Written syllables <input name="writtenSyllableBreakdown" className="rounded border p-2" placeholder="un·fold" />
              </label>}
              {row.payload.metadata.has_schwa == null && <label className="grid gap-1 text-sm">
                Does the British pronunciation have a schwa?
                <select name="hasSchwa" defaultValue="" className="rounded border p-2">
                  <option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ActionSubmitButton className={button} pendingLabel="Checking facts…">Save and recheck {row.payload.displayWord}</ActionSubmitButton>
              <Link className="text-sm underline" href={`/admin/teaching-dictionary/${row.wordId}?draft=${row.id}#td-route-${UN_PREFIX_SKILL}`}>Open word details</Link>
            </div>
          </>}
        </form>)}
        {readyPrefixRows.length > 0 && <form action={publishUnWorkbookWords}>
          {readyPrefixRows.map(row => <div key={row.id} hidden>
            <input type="hidden" name="word_id" value={row.wordId} />
            <input type="hidden" name="draft_id" value={row.id} />
          </div>)}
          <ActionSubmitButton className={button} pendingLabel="Publishing words…">Publish {readyPrefixRows.length} ready {readyPrefixRows.length === 1 ? "word" : "words"}</ActionSubmitButton>
        </form>}
      </>}
      <ul className="divide-y divide-[var(--border)]">{specialist.rows.filter(row => !draftWordIds.has(row.id)).map(row => <li key={row.id} className="py-2">
        <Link className="font-semibold underline" href={row.href}>{row.word}</Link>
        <p className="text-sm">{row.note}</p>
      </li>)}</ul>
    </section>}
    {base && view === "preview" && <section className={card}>
      <h2 className="text-xl font-semibold">Publish words for Identify the Base</h2>
      {params.published && <p role="status">The word is Active in Identify the Base.</p>}
      <p>{base.current.length} active words · {base.rows.length} waiting for review</p>
      {base.rows.length > 0 && !base.rows.some(row => row.choices.length) &&
        <Link className="font-semibold underline" href="/admin/adle-lesson-readiness?route=base_word_lab&skill=D4_MOR_BASE_WORDS_IDENTIFY_BASE">Open lesson readiness</Link>}
      {base.rows.filter(row => row.choices.length).map(row => <form key={row.id} action={publishIdentifyBaseWord}
        className="space-y-2 rounded-lg border p-3">
        <input type="hidden" name="word_id" value={row.id} />
        <label className="grid gap-1">Teaching meaning for {row.word}
          <select name="sense_id" required defaultValue={row.choices.length === 1 ? row.choices[0].id : ""}
            className="rounded border p-2">
            {row.choices.length > 1 && <option value="" disabled>Choose a meaning</option>}
            {row.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.definition}</option>)}
          </select>
        </label>
        <ActionSubmitButton className={button} pendingLabel="Publishing…">Publish {row.word}</ActionSubmitButton>
      </form>)}
    </section>}
    {suffix && view === "preview" && <section className={card}>
      <h2 className="text-xl font-semibold">Preview the {suffixTitle} lesson update</h2>
      {params.error && <p role="alert">{params.error}</p>}
      {params.published && <p role="status">The updated {suffixTitle} pool is active.</p>}
      <p>{suffix.current.length} active words · {suffix.lesson.reviewedCandidateIds.length} reviewed updates</p>
      <ul className="list-disc pl-5">{suffix.lesson.words.filter(word => word.reviewedDraftId).map(word =>
        <li key={word.id}><Link className="underline" href={word.editHref}>{word.word}</Link>
          {word.blockers.length ? ` · ${word.blockers.join(" ")}` : ""}</li>)}</ul>
      {suffix.lesson.blockers.map(blocker => <p key={blocker}>{blocker}</p>)}
      {suffix.lesson.status === "ready_to_launch" && <form action={publishAbleIbleLesson}>
        <input type="hidden" name="skill" value={selected} />
        <input type="hidden" name="fingerprint" value={suffix.lesson.preflightFingerprint} />
        <ActionSubmitButton className={button} pendingLabel="Publishing suffix update…">Publish {suffixTitle} update</ActionSubmitButton>
      </form>}
    </section>}
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
        {update.reviewWords.some(word => word.familyMeaningReview) && <details>
          <summary>Family meanings to review</summary>
          <ul className="mt-2 list-disc pl-5">{update.reviewWords.filter(word => word.familyMeaningReview).map(word =>
            <li key={word.wordId}><Link className="underline" href={`/admin/teaching-dictionary/${word.wordId}#td-base-family`}>{word.displayWord}</Link>
              {" · Confirm the changed family meaning for "}{word.familyMeaningReview}.</li>)}</ul>
        </details>}
        {params.error && <p role="alert" className="rounded-lg bg-rose-50 p-3">{params.error}</p>}
        {params.published && <p role="status" className="rounded-lg bg-emerald-50 p-3">The updated {lessonName} pool is active.</p>}
        <p><strong>{update.current.length}</strong> words in the live pool · <strong>{update.changes.length}</strong> additions or updates · <strong>{update.retired.length}</strong> removals</p>
        {update.changes.length > 0 && <ul className="list-disc pl-5">{update.changes.map(word =>
          <li key={word.canonicalWordId}><Link className="underline" href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>{word.word}</Link> · {update.current.some(current => current.canonicalWordId === word.canonicalWordId) ? "Update" : "Add"} · {word.meaning}</li>)}</ul>}
        {update.retired.length > 0 && <p>Remove words whose approval is no longer current. {update.retired.map(word => word.word).join(", ")}.</p>}
        {prepared && <p role="status">The update has been validated and is waiting for activation.</p>}
        {update.changes.length || update.retired.length ? <form action={publishIngLesson}>
          <input type="hidden" name="skill" value={selected} />
          <input type="hidden" name="fingerprint" value={update.fingerprint} />
          <ActionSubmitButton className={`${button} disabled:opacity-70`} pendingLabel={`Publishing ${lessonName} update…`}>
            {prepared ? "Resume publishing" : `Publish ${lessonName} update`}
          </ActionSubmitButton>
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
