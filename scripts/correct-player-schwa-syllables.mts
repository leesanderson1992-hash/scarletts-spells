#!/usr/bin/env node
/** One-word owner correction: append metadata/review and refresh Schwa lesson. Dry-run default. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
const wordId = "5b81ec91-1f19-5571-8b48-39417b0a8481";
const skill = "D4_SCHWA_FINAL_ER_FINAL";
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const ownerDecision = {
  word: "player", canonicalWordId: wordId, microSkillKey: skill,
  spokenSyllables: 2, finalErSyllableIndex: 2,
  decision: "Owner approved correction to two syllables and final -er in syllable 2 on 2026-10-30",
};
const decisionSha = sha(JSON.stringify(ownerDecision));
const manifest = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-written-facts-owner-review-20261029.json", "utf8"));
const row = manifest.rows.find((r: any) => r.canonicalWordId === wordId && r.microSkillKey === skill);
if (!row || row.word !== "player" || row.reviewStatus !== "approved_written" ||
    row.lessonTarget.syllableIndex !== 1 || JSON.stringify(row.proposedSpokenCuts) !== "[[4]]")
  throw Error("REVIEWED_PLAYER_SOURCE_CHANGED");
const source = (await loadWeakVowelRepairInventory(url, "production")).sources.find(s =>
  s.word.id === wordId && s.microSkillKey === skill);
if (!source || source.assignmentStatus !== "assigned" || source.metadata.length !== 1 ||
    source.metadata[0].syllables !== "1" ||
    !source.dictations.some(d => d.review_status === "approved_for_first_exposure" &&
      d.dictation_sentence === row.approvedSentence)) throw Error("PLAYER_DICTIONARY_SOURCE_CHANGED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='120s'");
  const protectedState = async () => (await db.query(`select jsonb_build_object(
    'children',(select count(*) from public.children),
    'learningItems',(select count(*) from public.adle_learning_items),
    'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
    'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
  const before = await protectedState();
  const publication = await db.query(`select p.content_version_id,p.dictionary_fingerprint,c.content
    from public.adle_weak_vowel_content_publications p
    join public.teaching_dictionary_route_content_versions c on c.id=p.content_version_id
    where p.canonical_word_id=$1 and p.micro_skill_key=$2
    order by p.published_at desc,p.content_version_id desc limit 1`, [wordId, skill]);
  const previous = publication.rows[0]?.content?.content?.weakVowel;
  if (!previous || publication.rows[0].dictionary_fingerprint ===
      (await db.query("select public.teaching_dictionary_route_dictionary_fingerprint($1) sha", [wordId])).rows[0].sha ||
      previous.spokenSyllableCount !== 2 || previous.target.syllableIndex !== 2 ||
      JSON.stringify(previous.acceptedCutSets) !== "[[4]]" ||
      publication.rows[0].content.wordMeaning !== row.sourceMeaning)
    throw Error("PLAYER_PRIOR_PUBLICATION_CHANGED");
  for (const kind of ["word", "sentence"] as const) {
    const recording = previous[`${kind}Recording`];
    const path = `public${recording?.src ?? ""}`;
    if (!recording?.src?.startsWith("/audio/") || !existsSync(path) ||
        sha(readFileSync(path)) !== recording.sha256)
      throw Error(`PLAYER_AUDIO_CHANGED:${kind}`);
  }
  const batch = await db.query<{id: string}>(`insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
     import_mode,batch_status,source_metadata,imported_by,imported_at)
    values($1,$2,'owner_player_syllable_correction_v1',$3::jsonb,$4::jsonb,$5::jsonb,
     'admin_import','applied',$6::jsonb,'Katie Sanderson',now()) returning id`,
    [`owner-reviewed-player-syllables/2026-10-30`, decisionSha,
      JSON.stringify({ errors: 0 }), JSON.stringify({ metadata: 1 }),
      JSON.stringify({ ready: 1 }), JSON.stringify(ownerDecision)]);
  const superseded = await db.query(`update public.canonical_teaching_dictionary_word_metadata
    set row_status='superseded',updated_at=now() where id=$1 and row_status='active'`, [source.metadata[0].id]);
  if (superseded.rowCount !== 1) throw Error("PLAYER_METADATA_SUPERSESSION_FAILED");
  const replacement = await db.query(`insert into public.canonical_teaching_dictionary_word_metadata
    (import_batch_id,canonical_word_id,source_id,row_status,source_sheet,source_row_number,source_row_hash,
     source_metadata,syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,
     morphology_notes,irregularity_notes,written_syllable_breakdown,source_category,source_name,source_url,
     source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    select $2::uuid,m.canonical_word_id,m.source_id,'active','owner-reviewed-player-syllables-2026-10-30',2,
      $3,coalesce(m.source_metadata,'{}'::jsonb)||jsonb_build_object(
        'ownerCorrection', $4::jsonb,'supersededMetadataId',m.id),
      '2',m.phoneme_hint,m.grapheme_notes,m.stress_pattern,m.has_schwa,m.morphemes,
      m.morphology_notes,m.irregularity_notes,m.written_syllable_breakdown,m.source_category,m.source_name,m.source_url,
      m.source_licence,m.source_use_note,m.confidence,'approved_for_first_exposure','Katie Sanderson',now()
    from public.canonical_teaching_dictionary_word_metadata m where m.id=$1 and m.row_status='superseded'
    returning *`, [source.metadata[0].id, batch.rows[0].id, decisionSha, JSON.stringify(ownerDecision)]);
  if (replacement.rows.length !== 1) throw Error("PLAYER_METADATA_REPLACEMENT_FAILED");
  const correctedSource = { ...source, metadata: replacement.rows };
  const reviewedTarget = { ...row.lessonTarget, syllableIndex: 2 };
  const currentFingerprint = (await db.query(
    "select public.teaching_dictionary_route_dictionary_fingerprint($1) sha", [wordId])).rows[0].sha;
  if (currentFingerprint === publication.rows[0].dictionary_fingerprint) throw Error("PLAYER_FINGERPRINT_UNCHANGED");
  await db.query(`insert into public.teaching_dictionary_weak_vowel_written_reviews
    (canonical_word_id,micro_skill_key,workbook_sha256,workbook_row,source_row,source_target,
     lesson_target,selected_vowel,proposed_spoken_cuts,family_decision,mapping_rule,decision_status,
     dictionary_fingerprint,row_sha256,decision_reference,reviewed_by)
    values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,'approved_written',$12,$13,$14,$15::uuid)`,
    [wordId, skill, decisionSha, row.workbookRow, row.sourceRow,
      JSON.stringify(row.lessonTarget), JSON.stringify(reviewedTarget), JSON.stringify(row.selectedVowel),
      JSON.stringify(row.proposedSpokenCuts), row.familyDecision, row.mappingRule,
      currentFingerprint, sha(JSON.stringify({ ...row, lessonTarget: reviewedTarget })),
      `One-row owner correction ${decisionSha}: two spoken syllables; final -er is syllable 2; approved 2026-10-30`, actor]);
  const facts = { ...previous, target: reviewedTarget,
    sourceFingerprint: repairSourceFingerprint(correctedSource),
    reviewSourceReference: `Owner correction ${decisionSha}; two syllables and final -er in syllable 2; 2026-10-30` };
  const blockers = weakVowelRouteBlockers(facts, { displayWord: row.word,
    definition: row.sourceMeaning, dictationSentence: row.approvedSentence, microSkillKey: skill });
  if (blockers.length) throw Error(`PLAYER_ROUTE_BLOCKED:${blockers.join(",")}`);
  const route = { ...publication.rows[0].content, content: { weakVowel: facts } };
  const payload = { displayWord: row.word, definition: row.sourceMeaning,
    dictationSentence: row.approvedSentence, skillKeys: [skill], routeContents: [route],
    canonicalMorphology: { parts: [], joins: [], transformations: [] } };
  const draft = await db.query<{id: string}>(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'player','en-GB',$2::jsonb,'approved_submission',$3,$4::uuid) returning id`,
    [wordId, JSON.stringify(payload), facts.reviewSourceReference, actor]);
  const staged = await db.query<{ids: string[]}>(
    "select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id, actor]);
  if (staged.rows[0].ids.length !== 1) throw Error("PLAYER_STAGE_FAILED");
  const version = staged.rows[0].ids[0];
  await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [version, actor]);
  await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
    [version, actor, facts.sourceFingerprint, facts.wordRecording.sha256, facts.sentenceRecording.sha256]);
  const after = await protectedState();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("LEARNER_STATE_CHANGED");
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "corrected" : "rollback_proof", word: row.word,
    metadataId: replacement.rows[0].id, reviewSha: decisionSha, contentVersion: version,
    fingerprint: currentFingerprint, learnerState: before }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
