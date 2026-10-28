#!/usr/bin/env node
/** Create two real, child-scoped staging assignments from reviewed publications. */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { prepareLessonFromPublishedWeakVowelWords, type PublishedWeakVowelWord } from "../lib/adle/weak-vowel/governed-content";
import { compileWeakVowelSnapshotV3 } from "../lib/adle/weak-vowel/snapshot";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import type { WeakVowelMicroSkill } from "../lib/adle/weak-vowel/lesson";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || !new URL(url).username.endsWith(process.env.SUPABASE_STAGING_PROJECT_REF ?? "absent")) throw Error("NON_STAGING_TARGET");
const statePath = ".tmp/schwa-final-et-al-staging/state.json";
const state = JSON.parse(readFileSync(statePath, "utf8")) as {
  childId: string; parentUserId: string; releaseSha: string; revisions: Record<string, string>;
};
const initialPlans: Array<{ skill: WeakVowelMicroSkill; date: string; words: string[] }> = [
  { skill: "D4_SCHWA_FINAL_ET", date: "2026-10-28", words: ["basket", "diet", "jacket", "market", "quiet", "target"] },
  { skill: "D4_SCHWA_FINAL_AL", date: "2026-10-29", words: ["actual", "actually", "factual", "natural", "usual", "usually"] },
];
const plans = process.argv.includes("--et-retry")
  ? [{ ...initialPlans[0], date: "2026-10-30" }] : initialPlans;
if (process.argv.includes("--device-voice")) {
  plans.splice(0, plans.length, { ...initialPlans[0], date: "2026-10-31",
    words: ["jacket", "basket", "diet", "market", "quiet", "target"] });
}
if (process.argv.includes("--device-voice-retry")) {
  plans.splice(0, plans.length, { ...initialPlans[0], date: "2026-11-01",
    words: ["market", "basket", "jacket", "diet", "quiet", "target"] });
}
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const release = await db.query<{ id: string; release_key: string; release_manifest_sha256: string; dependency_fingerprint: string }>(
    "select id,release_key,release_manifest_sha256,dependency_fingerprint from public.adle_curriculum_release_manifests where release_manifest_sha256=$1", [state.releaseSha]);
  if (release.rowCount !== 1) throw Error("STAGING_RELEASE_CHANGED");
  const outputs: Array<{ skill: string; date: string; assignmentId: string; wordCount: number }> = [];
  for (const plan of plans) {
    const published = await db.query<{
      content_version_id: string; canonical_word_id: string; micro_skill_key: string; source_fingerprint: string;
      content_sha256: string; dictionary_fingerprint: string; current_dictionary_fingerprint: string;
      word_audio_sha256: string; sentence_audio_sha256: string; display_word: string; definition: string;
      dictation_sentence: string; content: PublishedWeakVowelWord["routeContent"];
    }>(`select p.content_version_id,p.canonical_word_id,p.micro_skill_key,p.source_fingerprint,p.content_sha256,
      p.dictionary_fingerprint,public.teaching_dictionary_route_dictionary_fingerprint(p.canonical_word_id) current_dictionary_fingerprint,
      p.word_audio_sha256,p.sentence_audio_sha256,w.display_word,d.definition,s.dictation_sentence,v.content
      from public.adle_weak_vowel_content_publications p
      join public.teaching_dictionary_route_content_versions v on v.id=p.content_version_id
      join public.canonical_teaching_dictionary_words w on w.id=p.canonical_word_id
      join lateral (select definition from public.teaching_dictionary_definition_versions where canonical_word_id=p.canonical_word_id
        and route_id is null order by published_at desc,id desc limit 1) d on true
      join lateral (select dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=p.canonical_word_id
        and row_status='active' and review_status='approved_for_first_exposure' order by created_at desc,id desc limit 1) s on true
      where p.micro_skill_key=$1 and w.display_word=any($2::text[])
        and p.content_version_id=(select current.content_version_id from public.adle_weak_vowel_content_publications current
          where current.canonical_word_id=p.canonical_word_id and current.micro_skill_key=p.micro_skill_key
          order by current.published_at desc,current.content_version_id desc limit 1)
      order by array_position($2::text[],w.display_word)`,
      [plan.skill,plan.words]);
    if (published.rows.length !== 6 || published.rows.some((row,index) => row.display_word !== plan.words[index] ||
      row.dictionary_fingerprint !== row.current_dictionary_fingerprint)) throw Error(`STAGING_PUBLISHED_WORDS_CHANGED:${plan.skill}`);
    const existingLearning = await db.query<{ id: string }>(`select id from public.adle_learning_items
      where child_id=$1 and canonical_word_id=$2 and micro_skill_key=$3 and row_status='active'
        and item_status in ('pending','pending_reteach')`,
      [state.childId,published.rows[0].canonical_word_id,plan.skill]);
    if (existingLearning.rows.length > 1) throw Error(`STAGING_LEARNING_ITEM_AMBIGUOUS:${plan.skill}`);
    const learning = existingLearning.rowCount ? existingLearning : await db.query<{ id: string }>(`insert into public.adle_learning_items
      (child_id,canonical_word_id,micro_skill_key,source_kind,source_ref,intake_on,item_status,row_status)
      values($1,$2,$3,'verified_misspelling',$4,$5,'pending','active') returning id`,
      [state.childId,published.rows[0].canonical_word_id,plan.skill,`staging-proof:${plan.skill}:${plan.date}`,plan.date]);
    const slots = published.rows.map((row,index) => ({ canonicalWordId: row.canonical_word_id,
      provenance: index === 0 ? "learning_item" as const : "stretch" as const,
      learningItemId: index === 0 ? learning.rows[0].id : null, complexityLevel: null }));
    const reviewed: PublishedWeakVowelWord[] = published.rows.map(row => ({
      contentVersionId: row.content_version_id, canonicalWordId: row.canonical_word_id,
      microSkillKey: plan.skill, spelling: row.display_word, sourceFingerprint: row.source_fingerprint,
      contentSha256AtPublication: row.content_sha256, dictionaryFingerprintAtReview: row.dictionary_fingerprint,
      currentDictionaryFingerprint: row.current_dictionary_fingerprint, wordAudioSha256AtPublication: row.word_audio_sha256,
      sentenceAudioSha256AtPublication: row.sentence_audio_sha256, definition: row.definition,
      sentence: row.dictation_sentence, routeContent: row.content,
    }));
    const prepared = prepareLessonFromPublishedWeakVowelWords({ assignmentKey: `${state.childId}:${plan.date}:${plan.skill}`,
      microSkillKey: plan.skill, slots, published: reviewed,
      currentAssignedPairs: reviewed.map(row => ({ canonicalWordId: row.canonicalWordId, microSkillKey: plan.skill, assignmentStatus: "assigned" as const })),
      currentFamilyAuthorities: [] });
    if (!prepared.lesson) throw Error(`STAGING_LESSON_PREPARATION_BLOCKED:${plan.skill}:${JSON.stringify(prepared.blockers)}`);
    const revision = await db.query<{ data: Record<string, unknown> }>("select to_jsonb(r) data from public.adle_route_activation_revisions r where r.id=$1 and activation_status='enabled'", [state.revisions[plan.skill]]);
    if (revision.rowCount !== 1) throw Error(`STAGING_ACTIVATION_CHANGED:${plan.skill}`);
    const ref = release.rows[0];
    const compiled = compileWeakVowelSnapshotV3({ lesson: prepared.lesson,
      release: { activationRevisionId: state.revisions[plan.skill], releaseManifestId: ref.id,
        releaseKey: ref.release_key, releaseManifestSha256: ref.release_manifest_sha256,
        dependencyFingerprint: ref.dependency_fingerprint },
      childId: state.childId, parentUserId: state.parentUserId, date: plan.date,
      contentAuthorities: [
        { authorityType: "release_manifest", authorityId: ref.id, version: "2", sourceHash: ref.release_manifest_sha256 },
        { authorityType: "activation_revision", authorityId: state.revisions[plan.skill], version: "2", sourceHash: fingerprintSnapshotValue(revision.rows[0].data) },
        { authorityType: "dependency_set", authorityId: ref.id, version: "2", sourceHash: ref.dependency_fingerprint },
        ...prepared.lesson.words.map(word => ({ authorityType: "teaching_content" as const,
          authorityId: word.dinner.contentVersion, version: "1", sourceHash: word.routeContentSha256! })),
      ] });
    const created = await db.query<{ id: string }>(
      "select public.persist_adle_weak_vowel_daily_plan_v3($1,$2,$3,$4::jsonb,$5::jsonb,'[]'::jsonb,$6::jsonb) id",
      [state.parentUserId,state.childId,plan.date,JSON.stringify(compiled.header),JSON.stringify(compiled.items),JSON.stringify(compiled.snapshot)]);
    if (created.rowCount !== 1) throw Error(`STAGING_ASSIGNMENT_CREATE_FAILED:${plan.skill}`);
    const itemCount = await db.query<{ n: number }>("select count(*)::int n from public.assignment_items where daily_assignment_id=$1", [created.rows[0].id]);
    if (itemCount.rows[0].n !== 25) throw Error(`STAGING_ASSIGNMENT_ITEMS_INCOMPLETE:${plan.skill}`);
    outputs.push({ skill: plan.skill, date: plan.date, assignmentId: created.rows[0].id, wordCount: 6 });
  }
  if (apply) await db.query("commit"); else await db.query("rollback");
  if (apply) writeFileSync(statePath, JSON.stringify({ ...state,
    assignments: [...((state as typeof state & { assignments?: typeof outputs }).assignments ?? []), ...outputs] }, null, 2));
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "assignments_created" : "rollback_proof", lessons: outputs,
    durableWrites: apply ? "disposable_child_only" : 0 }));
} catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
finally { await db.end(); }
