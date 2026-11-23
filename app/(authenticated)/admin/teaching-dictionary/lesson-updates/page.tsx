import { isSchwaWorkbookSkill } from "@/lib/teaching-dictionary-manager/weak-vowel-workbook";
import { loadSchwaWorkbookQueue } from "@/lib/teaching-dictionary-manager/schwa-bulk-review";
import { SchwaPublishPanel } from "./schwa-publish-panel";
import { saveSchwaWorkbookDetails, generateSchwaWorkbookLesson } from "./schwa-actions";
import { homophoneCanonicalPublishingEnabled, loadCanonicalHomophonePreview } from "@/lib/teaching-dictionary-manager/homophone-canonical-release";
import { publishHomophoneDictionaryLesson, generateHomophoneDictionaryLesson } from "./homophone-actions";
import { isHomophoneReviewSkill } from "@/lib/teaching-dictionary-manager/homophone-review-contract";
import { SavedFamilyReviews } from "./saved-family-reviews";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { isCompoundWorkbookSkill } from "@/lib/teaching-dictionary-manager/compound-workbook";
import { loadPendingCompoundWorkbookQueue } from "@/lib/teaching-dictionary-manager/compound-workbook-draft";
import { publishCompoundWorkbookWords, saveCompoundWorkbookDetails } from "./compound-actions";
import { FormatHint } from "../format-hint";
import { isComparativeReviewSkill } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { loadComparativeReview } from "@/lib/teaching-dictionary-manager/comparative-review";
import { publishComparativeSets } from "./comparative-actions";
import { includeActiveWorkbookReview } from "@/lib/teaching-dictionary-manager/active-workbook-review";
import { loadLessonReviewRequests } from "@/lib/teaching-dictionary-manager/lesson-review-requests";
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
import { NEGATIVE_PREFIX_SKILL, prefixMeaningFromParts, prefixWorkbookChoice, prefixWorkbookEnabled, prefixWorkbookFieldLabel, PREFIX_PUBLISH_BATCH_SIZE } from "@/lib/teaching-dictionary-manager/prefix-workbook";
import { loadPendingPrefixWorkbookQueue } from "@/lib/teaching-dictionary-manager/prefix-bulk-review";
import { publishPrefixWorkbookWords, savePrefixWorkbookDetails } from "./prefix-actions";
import { publishAbleIbleLesson } from "./able-ible-actions";
import { chooseIngLessonMeaning, generateIngLesson, publishIngLesson } from "./actions";

const button = "rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white";
const card = "space-y-3 rounded-xl border border-[var(--border)] bg-white p-5";

export default async function LessonUpdates({ searchParams }: {
  searchParams: Promise<{ error?: string; published?: string; skill?: string; cluster?: string; family?: string; view?: string }>;
}) {
  const actor = await requireAdminUser();
  const params = await searchParams;
  const db = createServiceRoleClient();
  const view = params.published || params.error || params.view === "preview" ? "preview"
    : params.view === "families" ? "families" : params.view === "workbook" ? "workbook" : "export";
  const skill = isStagingIngSkill(params.skill) ? params.skill : null;
  const suffixPilot = isSuffixWorkbookPilot(params.skill);
  const baseReview = isIdentifyBaseReview(params.skill);
  const specialistRoute = specialistWorkbookRoute(params.skill);
  const supported = Boolean(specialistRoute) || baseReview || suffixPilot || canUpdateIngLesson() && Boolean(skill);
  const [familyRows, clusterRows, skillRows, result, suffix, base, specialist, otherRequests] = await Promise.all([
    db.from("micro_skill_families").select("skill_family_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_clusters").select("skill_cluster_key,skill_family_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_cluster_key,skill_family_key")
      .eq("is_active", true).eq("is_assignable", true).order("display_name"),
    supported && skill && (view === "preview" || view === "export")
      ? loadStagingIngUpdate(db, skill, view === "export" ? "pool" : "full").then(update => ({ update, error: null }),
        (error: unknown) => ({ update: null, error: error instanceof Error ? error.message : "Could not load the lesson update." }))
      : Promise.resolve({ update: null, error: null }),
    suffixPilot && (view === "export" || view === "preview") ? loadAbleIbleReview(db, params.skill) : null,
    baseReview && (view === "export" || view === "preview") ? loadIdentifyBaseReview(db) : null,
    specialistRoute && params.skill && (view === "export" || view === "preview") ? loadSpecialistBulkReview(db, params.skill, specialistRoute) : null,
    !supported && params.skill ? loadLessonReviewRequests(db, params.skill) : null,
  ]);
  if (familyRows.error || clusterRows.error || skillRows.error) throw new Error("Could not load the lesson filters.");
  const suffixTitle = suffixReviewTitle(params.skill ?? "");
  const selected = params.skill ?? "";
  const prefixSkill = prefixWorkbookEnabled(selected) ? selected : null;
  const comparativeSkill = isComparativeReviewSkill(selected) ? selected : null;
  const comparative = comparativeSkill && view === "preview" ? await loadComparativeReview(db, comparativeSkill) : null;
  const compoundSkill = isCompoundWorkbookSkill(selected) ? selected : null;
  const compoundQueue = compoundSkill && view === "preview" ? await loadPendingCompoundWorkbookQueue(db, compoundSkill) : null;
  const readyCompounds = compoundQueue?.filter(row => !row.blockers.length).slice(0, 30) ?? [];
  const schwaSkill = isSchwaWorkbookSkill(selected) ? selected : null;
  const schwaQueue = schwaSkill && view === "preview" ? specialist && "queue" in specialist ? specialist.queue : await loadSchwaWorkbookQueue(db, schwaSkill) : null;
  const readySchwa = schwaQueue?.filter(row => !row.blockers.length && !row.published).slice(0, 200) ?? [];
  const blankWorkbookSkill = prefixSkill ?? (suffixPilot || comparativeSkill || compoundSkill || schwaSkill || isHomophoneReviewSkill(selected) ? selected : null);
  const prefixQueue = prefixSkill && view === "preview" && specialist
    ? await loadPendingPrefixWorkbookQueue(db, prefixSkill) : null;
  const readyPrefixRows = prefixQueue?.filter(row => !row.blockers.length).slice(0, PREFIX_PUBLISH_BATCH_SIZE) ?? [];
  const draftWordIds = new Set([...(schwaQueue?.map(row => row.wordId) ?? []),...(prefixQueue?.map(row => row.wordId) ?? []), ...(compoundQueue?.map(row => row.wordId) ?? [])]);
  const homophoneRelease = homophoneCanonicalPublishingEnabled(selected) && view === "preview"
    ? await loadCanonicalHomophonePreview(db, selected) : null;
  const homophoneLearners = homophoneRelease?.content || schwaSkill && resolveAdleRouteActivationEnvironment() === "staging" ? await db.from("children").select("id,first_name")
    .eq("parent_user_id", actor.id).eq("is_archived", false).order("first_name") : null;
  const lessonName = skill ? STAGING_ING_LESSONS[skill] : "";
  const clusterLabels = new Map((clusterRows.data ?? []).map(row => [row.skill_cluster_key, row.display_name]));
  const skills = (skillRows.data ?? []).map(row => ({ key: row.micro_skill_key, label: row.display_name,
    cluster: row.skill_cluster_key, family: row.skill_family_key }));
  const familyLabels = new Map((familyRows.data ?? []).map(row => [row.skill_family_key, row.display_name]));
  // Existing active lessons remain reachable while older catalogues acquire parent labels.
  const families = [...new Set(skills.map(skill => skill.family).filter(Boolean))]
    .map(key => ({ key, label: familyLabels.get(key) ?? key.replace(/^D\d+_/u, "").replaceAll("_", " ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const clusters = [...new Set(skills.map(item => item.cluster).filter(Boolean))].map(key => ({
    key,
    family: (clusterRows.data ?? []).find(row => row.skill_cluster_key === key)?.skill_family_key
      ?? skills.find(skill => skill.cluster === key)?.family ?? "",
    label: clusterLabels.get(key) ?? (key === "D4_INF_ING_ENDINGS" ? "-ing endings" : key.replace(/^D\d+_/u, "").replaceAll("_", " ")),
  })).sort((a, b) => a.label.localeCompare(b.label));
  const { update } = result;
  const review = update && view === "export" ? ingReviewExportRows(update) : null;
  const initialReview = specialist?.rows
    ?? base?.rows.map(row => ({ ...row, href: `/admin/teaching-dictionary/${row.id}` }))
    ?? suffix?.rows.map(row => ({ ...row, href: `/admin/teaching-dictionary/${row.id}` }))
    ?? review?.map(row => ({ id: row.wordId, word: row.displayWord, note: row.note,
      href: `/admin/teaching-dictionary/${row.wordId}` }))
    ?? [];
  const activeWords = specialist?.current ?? base?.current ?? suffix?.current ?? update?.current ?? [];
  const wordsToReview = view === "export" ? await includeActiveWorkbookReview(db, selected, activeWords, initialReview,
    specialistRoute !== "weak_vowel_word_lab") : initialReview;
  const reviewIds = new Set(wordsToReview.map(row => row.id));
  const resolvedWords = activeWords.filter(word => !reviewIds.has(word.canonicalWordId))
    .sort((a, b) => a.word.localeCompare(b.word, "en-GB"));
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
    {Boolean(otherRequests?.size) && <section className={card}>
      <h2 className="text-xl font-semibold">Saved lesson requests</h2>
      <p>This micro-skill needs a supported Bulk review workbook and publisher.</p>
      <ul className="list-disc pl-5">{[...otherRequests!.values()].sort((a, b) => a.word.localeCompare(b.word)).map(row =>
        <li key={row.word_id}><Link className="underline" href={`/admin/teaching-dictionary/${row.word_id}`}>{row.word}</Link></li>)}</ul>
    </section>}
    <BulkReviewFlow key={selected} families={families} clusters={clusters} skills={skills} selected={selected}
      savedReviews={view === "families" && params.skill && resolveAdleRouteActivationEnvironment() ? <SavedFamilyReviews db={db} environment={resolveAdleRouteActivationEnvironment()!} skill={params.skill} /> : null}
      familyGuidance={schwaSkill ? "Family exploration is optional. Link or create a family in this flow when you choose to use it." : undefined}
      familyRequired={!isHomophoneReviewSkill(selected) && !schwaSkill} initialFamily={params.family ?? ""} initialCluster={params.cluster ?? ""} supported={supported} view={view}
      fullPoolSize={specialist?.current.length ?? base?.current.length ?? suffix?.current.length ?? update?.current.length ?? null}
      blankWorkbookHref={blankWorkbookSkill ? `/admin/teaching-dictionary/export/review-workbook?skill=${blankWorkbookSkill}&scope=blank` : undefined}
      review={view === "export" ? <>
        {wordsToReview.length > 0 && <section className={card}>
          <h2 className="text-xl font-semibold">{wordsToReview.length} {wordsToReview.length === 1 ? "word to review or publish" : "words to review or publish"}</h2>
          <ul className="divide-y divide-[var(--border)]">{wordsToReview.map(row => <li key={row.id} className="py-2">
            <Link prefetch={false} className="font-semibold underline" href={row.href}>{row.word}</Link>
            <p className="text-sm">{row.note}</p>
          </li>)}</ul>
        </section>}
        <details className={card}>
          <summary className="cursor-pointer font-semibold">Resolved words ({resolvedWords.length})</summary>
          {resolvedWords.length ? <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {resolvedWords.map(word => <li key={word.canonicalWordId}>
              <Link prefetch={false} className="underline" href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>{word.word}</Link>
            </li>)}
          </ul> : <p className="text-sm">No resolved words for this lesson yet.</p>}
        </details>
      </> : null}
      batches={specialist || base || suffix || review ? Math.ceil(wordsToReview.length / ING_REVIEW_BATCH_SIZE) : null}>
    {specialist && view === "preview" && <section className={card}>
      <h2 className="text-xl font-semibold">{specialist.title} publish status</h2>
      {isHomophoneReviewSkill(selected) && <p>Review and approve the Dictionary facts for every word in the contrast set. Family assignment is not required for this lesson.</p>}
      {homophoneRelease && <div className="space-y-3 rounded-lg border p-4">
        {params.published && <p role="status">{params.published} words are Active with the approved Dictionary facts.</p>}
        {homophoneRelease.blockers.length > 0 && <div><p>These words stay in review. Complete pairs can still be published.</p><ul className="list-disc pl-5">{homophoneRelease.blockers.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
        {homophoneRelease.content && <>
          <h3 className="font-semibold">Approved Dictionary facts ready to publish</h3>
          {homophoneRelease.content?.sets.flatMap(set => set.members).map(member => <div key={member.canonicalWordId}>
            <strong>{member.word}</strong><p>{member.intendedSense}</p><p className="text-sm">{member.teachingSentence}</p>
          </div>)}
          <form action={publishHomophoneDictionaryLesson}>
            <input type="hidden" name="skill" value={selected} /><input type="hidden" name="fingerprint" value={homophoneRelease.fingerprint} />
            <ActionSubmitButton className={button} pendingLabel="Publishing Dictionary facts…">Publish lesson update</ActionSubmitButton>
          </form>
          {specialist.current.length > 0 && <form action={generateHomophoneDictionaryLesson} className="space-y-2">
            <input type="hidden" name="skill" value={selected} />
            <label className="grid gap-1">Test learner<select name="child_id" className="rounded border p-2" required>
              <option value="">Choose a test learner</option>{homophoneLearners?.data?.map(child => <option key={child.id} value={child.id}>{child.first_name}</option>)}
            </select></label>
            <ActionSubmitButton className={button} pendingLabel="Generating lesson…">Generate test lesson</ActionSubmitButton>
          </form>}
        </>}
      </div>}
      <p>{new Set([...specialist.current.map(word => word.canonicalWordId), ...specialist.rows.map(word => word.id)]).size} words in this flow · {specialist.current.length} Active in ADLE · {specialist.rows.length} need review</p>
      {specialist.rows.some(row => specialist.current.some(word => word.canonicalWordId === row.id)) &&
        <p className="text-sm text-slate-600">{specialist.rows.filter(row => specialist.current.some(word => word.canonicalWordId === row.id)).length} Active words are also in review for missing facts or unpublished updates. Their existing lesson version stays available.</p>}
      <Link className="font-semibold underline" href={`/admin/adle-lesson-readiness?route=${specialist.routeId}&skill=${selected}`}>Open lesson readiness</Link>
      {schwaSkill && schwaQueue && <div className="space-y-4">
        {params.published && <p role="status">{params.published} words published. Passing words are Active in ADLE.</p>}
        <p>Dictionary meanings, pronunciation and word parts are reused. Review the exact weak vowel and Dictionary spoken syllable divisions below. The spoken syllable count describes the pronunciation. Family exploration is optional and never holds up the core lesson. When selected, it is included automatically in new lessons once enough approved family members are available.</p>
        <SchwaPublishPanel key={schwaSkill} skill={schwaSkill} ready={readySchwa.map(row => ({ id: row.id, word: row.payload.displayWord }))} />
        {schwaQueue.filter(row => !row.published || row.blockers.length).map(row => <form action={saveSchwaWorkbookDetails} key={row.id} className="space-y-3 rounded-lg border p-4">
          <input type="hidden" name="skill" value={schwaSkill} /><input type="hidden" name="word_id" value={row.wordId} /><input type="hidden" name="draft_id" value={row.id} />
          <h3 className="font-semibold">{row.payload.displayWord} · {row.blockers.length ? "Needs facts" : "Ready to publish"}</h3>
          <p className="text-sm text-slate-600">Family exploration: {row.familyState === "waiting" ? "Waiting for the approved base/root and at least two approved family members. You can publish the core lesson now." : row.familyState === "ready" ? "Ready — included automatically in new lessons." : "Not used."}</p>
          <p>{row.payload.definition}</p><ul className="list-disc pl-5 text-sm">{row.blockers.map(issue => <li key={issue}>{issue}</li>)}</ul>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm"><span>Target letter or ending<FormatHint label="weak vowel target" format="One target span containing one written vowel." example="a for about; ar for collar." /></span><input name="weak_vowel_target" defaultValue={row.fields.weak_vowel_target} className="rounded border p-2" maxLength={20} /></label>
            <label className="grid gap-1 text-sm">Occurrence<select name="weak_vowel_occurrence" defaultValue={row.fields.weak_vowel_occurrence || "1"} className="rounded border p-2">{[1,2,3,4].map(i => <option key={i}>{i}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Sound<select name="weak_vowel_sound" defaultValue={row.fields.weak_vowel_sound} className="rounded border p-2"><option value="">Choose</option><option>Schwa</option><option>Other unstressed vowel</option></select></label>
            <label className="grid gap-1 text-sm"><span>Dictionary spoken syllable divisions<FormatHint label="spoken syllable divisions" format="Split the word as it is spoken in the approved British pronunciation, using its normal spelling and middle dots. Do not split by word parts. Saving updates the Dictionary for all Schwa lessons." example="wri·ter" /></span><input name="written_syllable_breakdown" defaultValue={row.fields.written_syllable_breakdown} className="rounded border p-2" maxLength={150} /></label>
            <label className="grid gap-1 text-sm">Activity cut source<select name="activity_cut_source" defaultValue={row.fields.activity_cut_source || "Use dictionary"} className="rounded border p-2"><option>Use dictionary</option><option>Reviewed alternative</option><option>Review conflict</option></select><span className="text-xs">Using approved Dictionary divisions unless a reviewed alternative is selected.</span></label>
            <label className="grid gap-1 text-sm"><span>Alternative activity divisions (optional)<FormatHint label="alternative activity divisions" format="Only fill for Reviewed alternative. Use middle dots. Keep spelling hyphens; separate accepted alternatives with |." example="wri·ter" /></span><input name="activity_syllables" defaultValue={row.fields.activity_syllables} className="rounded border p-2" maxLength={150} /></label>
            {([['age_band', 'Age band', DICTIONARY_BANDS.ageBand], ['frequency_band', 'Frequency', DICTIONARY_BANDS.frequencyBand], ['complexity_band', 'Complexity', DICTIONARY_BANDS.complexityBand], ['has_schwa', 'Pronunciation has schwa', ['Yes', 'No']]] as const).map(([key, title, choices]) => <label className="grid gap-1 text-sm" key={key}>{title}<select name={key} defaultValue={row.fields[key]} className="rounded border p-2"><option value="">Choose</option>{choices.map(choice => <option key={choice}>{choice}</option>)}</select></label>)}
            <label className="grid gap-1 text-sm">Family exploration<select name="family_exploration" defaultValue={row.fields.family_exploration} className="rounded border p-2"><option>Not used</option><option>Use approved family</option></select></label>
          </div>
          <div className="flex flex-wrap gap-3"><ActionSubmitButton className={button} pendingLabel="Saving and checking…">Save and recheck</ActionSubmitButton><Link className="underline" href={`/admin/teaching-dictionary/${row.wordId}#td-base-family`}>Open meaning and family</Link></div>
        </form>)}
        {schwaQueue.some(row => row.published && !row.blockers.length) && <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">Active words · Family exploration status</summary>
          <ul className="mt-3 space-y-2 text-sm">{schwaQueue.filter(row => row.published && !row.blockers.length).map(row => <li key={row.id}>
            <Link className="font-semibold underline" href={`/admin/teaching-dictionary/${row.wordId}#td-base-family`}>{row.payload.displayWord}</Link> · Active · Family exploration: {row.familyState === "waiting" ? "Waiting for enough approved family members. It will be included automatically in new lessons when ready." : row.familyState === "ready" ? "Ready — included in new lessons." : "Not used."}
          </li>)}</ul>
        </details>}
        {resolveAdleRouteActivationEnvironment() === "staging" && specialist.current.length >= 4 && <form action={generateSchwaWorkbookLesson} className="grid gap-3 rounded-lg border p-4">
          <h3 className="font-semibold">Generate a staging test lesson</h3><p className="text-sm">Creates a four-word test queue using Active words. Use a fresh staging test learner.</p><input type="hidden" name="skill" value={schwaSkill} />
          <label className="grid gap-1">Test learner<select name="child_id" required className="rounded border p-2"><option value="">Choose a fresh test learner</option>{homophoneLearners?.data?.map(child => <option key={child.id} value={child.id}>{child.first_name}</option>)}</select></label>
          <label className="grid gap-1">Active target<select name="word_id" required className="rounded border p-2">{specialist.current.map(word => <option key={word.canonicalWordId} value={word.canonicalWordId}>{word.word}</option>)}</select></label>
          <ActionSubmitButton className={button} pendingLabel="Generating lesson…">Generate test lesson</ActionSubmitButton>
        </form>}
      </div>}
      {compoundSkill && compoundQueue && <>
        {params.published && <p role="status">{params.published} compound words published and available in ADLE.</p>}
        {compoundQueue.map(row => <form action={saveCompoundWorkbookDetails} key={row.id} className="space-y-3 rounded-lg border p-3">
          <input type="hidden" name="skill" value={compoundSkill} /><input type="hidden" name="word_id" value={row.wordId} /><input type="hidden" name="draft_id" value={row.id} />
          <h3 className="font-semibold">{row.payload.displayWord} · {row.blockers.length ? "Needs facts" : "Ready to publish"}</h3>
          <p>{row.payload.definition}</p><p className="text-sm">{row.payload.canonicalMorphology.wordSum}</p>
          <ul className="list-disc pl-5 text-sm">{row.blockers.map(issue => <li key={issue}>{issue}</li>)}</ul>
          <label className="grid gap-1 text-sm"><span>How the parts make the meaning<FormatHint label="compound explanation" format="One short sentence connecting the component meanings to the whole word." example="A bedroom is a room with a bed, used for sleeping." /></span>
            <textarea name="componentToWholeRelationship" maxLength={1000} defaultValue={String(row.payload.routeContents[0]?.content.componentToWholeRelationship ?? "")} className="rounded border p-2" />
          </label>
          <div className="flex flex-wrap items-center gap-3"><ActionSubmitButton className={button} pendingLabel="Checking compound…">Save and recheck</ActionSubmitButton><Link className="text-sm underline" href={`/admin/teaching-dictionary/${row.wordId}?draft=${row.id}#td-canonical-parts`}>Open word details</Link></div>
        </form>)}
        {readyCompounds.length > 0 && <form action={publishCompoundWorkbookWords}>
          <input type="hidden" name="skill" value={compoundSkill} />
          {readyCompounds.map(row => <div key={row.id} hidden><input type="hidden" name="word_id" value={row.wordId} /><input type="hidden" name="draft_id" value={row.id} /></div>)}
          <ActionSubmitButton className={button} pendingLabel="Publishing compound words…">Publish {readyCompounds.length} ready words</ActionSubmitButton>
        </form>}
      </>}
      {prefixSkill && prefixQueue && <>
        {params.published && <p role="status">{params.published} words published and available in ADLE.</p>}
        {prefixQueue.map(row => <form action={savePrefixWorkbookDetails} key={row.id} className="space-y-2 rounded-lg border p-3">
          <input type="hidden" name="skill" value={prefixSkill} />
          <input type="hidden" name="word_id" value={row.wordId} />
          <input type="hidden" name="draft_id" value={row.id} />
          <h3 className="font-semibold">{row.payload.displayWord} · {row.blockers.length ? "Needs facts" : "Ready to publish"}</h3>
          <p className="text-sm">{row.payload.definition} · {prefixWorkbookFieldLabel(prefixSkill)} {(prefixSkill === NEGATIVE_PREFIX_SKILL ? prefixMeaningFromParts(row.payload.canonicalMorphology.parts) : prefixWorkbookChoice(prefixSkill, row.payload.routeContents[0]?.content.meaningBinKey))?.label ?? "Needs review"}</p>
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
                Spoken syllable divisions <input name="writtenSyllableBreakdown" className="rounded border p-2" placeholder="un·fold" />
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
              <Link className="text-sm underline" href={`/admin/teaching-dictionary/${row.wordId}?draft=${row.id}#td-route-${prefixSkill}`}>Open word details</Link>
            </div>
          </>}
        </form>)}
        {readyPrefixRows.length > 0 && <form action={publishPrefixWorkbookWords}>
          <input type="hidden" name="skill" value={prefixSkill} />
          {readyPrefixRows.map(row => <div key={row.id} hidden>
            <input type="hidden" name="word_id" value={row.wordId} />
            <input type="hidden" name="draft_id" value={row.id} />
          </div>)}
          <ActionSubmitButton className={button} pendingLabel="Publishing words…">Publish {readyPrefixRows.length} ready {readyPrefixRows.length === 1 ? "word" : "words"}</ActionSubmitButton>
        </form>}
      </>}
      {comparative && <section className="space-y-3">
        <h3 className="text-lg font-semibold">Review complete adjective sets</h3>
        {params.published && <p role="status">{params.published} adjective sets are Active.</p>}
        {comparative.families.map(row => <div key={row.family.familyKey} className="rounded-lg border p-3">
          <p className="font-semibold">{row.family.words.map(word => word.word).join(" → ")}</p>
          {row.blockers.length ? <ul className="list-disc pl-5">
            {row.blockers.map(issue => <li key={issue}>{issue}</li>)}
          </ul> : <p>{row.active ? "Active" : "Ready to publish"}</p>}
          <div className="flex flex-wrap gap-3">{row.family.words.map(word =>
            <Link prefetch={false} className="text-sm underline" key={word.canonicalWordId}
              href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>Edit {word.word}</Link>)}</div>
        </div>)}
        {comparative.families.some(row => !row.blockers.length && !row.active) && <form action={publishComparativeSets}>
          <input type="hidden" name="skill" value={selected} />
          <input type="hidden" name="fingerprint" value={comparative.fingerprint} />
          {comparative.families.filter(row => !row.blockers.length && !row.active).map(row =>
            <input key={row.family.familyKey} type="hidden" name="family_key" value={row.family.familyKey} />)}
          <ActionSubmitButton className={button} pendingLabel="Publishing adjective sets…">Publish ready adjective sets</ActionSubmitButton>
        </form>}
      </section>}
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
