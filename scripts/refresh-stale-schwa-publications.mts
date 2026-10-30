#!/usr/bin/env node
/** Refresh owner-approved Schwa publications after dictionary morphology changed. Dry-run by default. */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !/^[a-f0-9-]{36}$/i.test(actor))
  throw Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const apply = process.argv.includes("--apply");
const limitAt = process.argv.indexOf("--limit");
const limit = limitAt >= 0 ? Number(process.argv[limitAt + 1]) : 78;
if (!Number.isInteger(limit) || limit < 1 || limit > 78) throw Error("INVALID_LIMIT");
const manifest = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-written-facts-owner-review-20261029.json", "utf8"));
const rows = manifest.rows.filter((row: any) => row.reviewStatus === "approved_written");
const rowByPair = new Map<string, any>(rows.map((row: any) => [`${row.canonicalWordId}:${row.microSkillKey}`, row]));
const live = await loadWeakVowelRepairInventory(url, "production");
const sources = new Map(live.sources.map(source => [`${source.word.id}:${source.microSkillKey}`, source]));
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  const stale = await db.query(`with wanted as
    (select * from jsonb_to_recordset($1::jsonb) as x(id uuid,skill text)),
    latest as (select distinct on (p.canonical_word_id,p.micro_skill_key)
      p.canonical_word_id,p.micro_skill_key,p.content_version_id,p.dictionary_fingerprint,p.published_at
      from public.adle_weak_vowel_content_publications p join wanted w
        on w.id=p.canonical_word_id and w.skill=p.micro_skill_key
      order by p.canonical_word_id,p.micro_skill_key,p.published_at desc,p.content_version_id desc)
    select l.*,c.content,public.teaching_dictionary_route_dictionary_fingerprint(l.canonical_word_id) current_fingerprint
    from latest l join public.teaching_dictionary_route_content_versions c on c.id=l.content_version_id
    where l.dictionary_fingerprint<>public.teaching_dictionary_route_dictionary_fingerprint(l.canonical_word_id)
    order by l.micro_skill_key,l.canonical_word_id`,
    [JSON.stringify(rows.map((row: any) => ({ id: row.canonicalWordId, skill: row.microSkillKey })))]);
  const candidates: Array<{ row: any; source: typeof live.sources[number]; facts: any; content: any }> = [];
  const mismatches: any[] = [];
  for (const published of stale.rows) {
    const key = `${published.canonical_word_id}:${published.micro_skill_key}`;
    const row = rowByPair.get(key);
    const source = sources.get(key);
    if (!row || !source || source.assignmentStatus !== "assigned" ||
        source.word.display_word !== row.word || source.metadata.length !== 1 ||
        !source.dictations.some(d => d.review_status === "approved_for_first_exposure" &&
          d.dictation_sentence === row.approvedSentence)) throw Error(`CURRENT_SOURCE_CHANGED:${key}`);
    const previous = published.content.content?.weakVowel;
    if (row.word === "player" && published.micro_skill_key === "D4_SCHWA_FINAL_ER_FINAL") {
      mismatches.push({ word: row.word, reason: "reviewed syllable 1 conflicts with two spoken cuts and published 2-syllable recording" });
      continue;
    }
    if (!previous || published.content.wordMeaning !== row.sourceMeaning ||
        (JSON.stringify(previous.target) !== JSON.stringify(row.lessonTarget) && row.word !== "family") ||
        JSON.stringify(previous.selectionTarget) !== JSON.stringify(row.selectedVowel) ||
        JSON.stringify(previous.acceptedCutSets) !== JSON.stringify(row.proposedSpokenCuts) ||
        previous.familyDecision !== row.familyDecision ||
        Number(previous.spokenSyllableCount) !== Number(source.metadata[0].syllables)) {
      mismatches.push({ word: row.word, skill: row.microSkillKey,
        meaning: published.content.wordMeaning === row.sourceMeaning,
        target: JSON.stringify(previous?.target) === JSON.stringify(row.lessonTarget),
        selection: JSON.stringify(previous?.selectionTarget) === JSON.stringify(row.selectedVowel),
        cuts: { previous: previous?.acceptedCutSets, reviewed: row.proposedSpokenCuts },
        family: [previous?.familyDecision, row.familyDecision],
        syllables: [previous?.spokenSyllableCount, source.metadata[0].syllables] });
      continue;
    }
    for (const kind of ["word", "sentence"] as const) {
      const recording = previous[`${kind}Recording`];
      const path = `public${recording?.src ?? ""}`;
      if (!recording?.src?.startsWith("/audio/") || !existsSync(path) ||
          createHash("sha256").update(readFileSync(path)).digest("hex") !== recording.sha256)
        throw Error(`REVIEWED_AUDIO_MISSING_OR_CHANGED:${row.word}:${kind}`);
    }
    const facts = { ...previous, target: row.lessonTarget, sourceFingerprint: repairSourceFingerprint(source),
      reviewSourceReference: `${previous.reviewSourceReference}; refreshed after approved dictionary morphology update 2026-10-30` };
    const blockers = weakVowelRouteBlockers(facts, { displayWord: row.word,
      definition: row.sourceMeaning, dictationSentence: row.approvedSentence,
      microSkillKey: row.microSkillKey });
    if (blockers.length) throw Error(`ROUTE_BLOCKED:${row.word}:${blockers.join(",")}`);
    candidates.push({ row, source, facts, content: published.content });
  }
  if (mismatches.length !== 1 || mismatches[0].word !== "player" || candidates.length !== 77)
    throw Error(`STALE_COVERAGE_CHANGED:${JSON.stringify({ candidates: candidates.length, mismatches })}`);
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='300s'");
  const protectedState = async () => (await db.query(`select jsonb_build_object(
    'children',(select count(*) from public.children),
    'learningItems',(select count(*) from public.adle_learning_items),
    'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
    'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
  const before = await protectedState();
  const refreshed = [];
  for (const { row, source, facts, content } of candidates.slice(0, limit)) {
    const written = await db.query(`select decision_status,lesson_target,selected_vowel,family_decision
      from public.teaching_dictionary_weak_vowel_written_reviews
      where canonical_word_id=$1 and micro_skill_key=$2 and workbook_sha256=$3`,
      [row.canonicalWordId, row.microSkillKey, manifest.workbookSha256]);
    if (written.rows.length !== 1 || written.rows[0].decision_status !== "approved_written" ||
        JSON.stringify(written.rows[0].lesson_target) !== JSON.stringify(row.lessonTarget) ||
        JSON.stringify(written.rows[0].selected_vowel) !== JSON.stringify(row.selectedVowel) ||
        written.rows[0].family_decision !== row.familyDecision)
      throw Error(`WRITTEN_REVIEW_CHANGED:${row.word}`);
    const route = { ...content, content: { weakVowel: facts } };
    const payload = { displayWord: row.word, definition: row.sourceMeaning,
      dictationSentence: row.approvedSentence, skillKeys: [row.microSkillKey], routeContents: [route],
      canonicalMorphology: { parts: [], joins: [], transformations: [] } };
    const draft = await db.query<{id: string}>(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
      [row.canonicalWordId, source.word.normalised_word, JSON.stringify(payload), facts.reviewSourceReference, actor]);
    const staged = await db.query<{ids: string[]}>("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id, actor]);
    if (staged.rows[0].ids.length !== 1) throw Error(`STAGE_FAILED:${row.word}`);
    const version = staged.rows[0].ids[0];
    await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [version, actor]);
    await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
      [version, actor, facts.sourceFingerprint, facts.wordRecording.sha256, facts.sentenceRecording.sha256]);
    refreshed.push({ word: row.word, skill: row.microSkillKey, version });
  }
  const after = await protectedState();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("LEARNER_STATE_CHANGED");
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "refreshed" : "rollback_proof", staleBefore: stale.rows.length,
    selected: refreshed.length, sample: refreshed.slice(0, 5), learnerState: before }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
