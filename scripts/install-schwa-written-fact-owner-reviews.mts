#!/usr/bin/env node
/** Dry-run by default; install owner-reviewed written Schwa facts only with --apply. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";

process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
  !new URL(url).hostname.endsWith("pooler.supabase.com")) throw Error("PRODUCTION_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const workbook = "/Users/katiesanderson/Downloads/schwa-lesson-facts-resolved-colour.xlsx";
const manifest = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-written-facts-owner-review-20261029.json", "utf8"));
if (sha(readFileSync(workbook)) !== manifest.workbookSha256) throw Error("WORKBOOK_CHANGED");
const rows = manifest.rows as Array<Record<string, any>>;
if (rows.length !== 422 || rows.filter(r => r.reviewStatus === "approved_written").length !== 419 ||
  rows.filter(r => r.reviewStatus === "needs_resolution").length !== 3 ||
  rows.filter(r => r.mappingRule === "full_al_pattern_to_written_a").length !== 64 ||
  new Set(rows.map(r => `${r.canonicalWordId}:${r.microSkillKey}`)).size !== 422 ||
  new Set(rows.map(r => r.workbookRow)).size !== 422) throw Error("MANIFEST_COVERAGE_MISMATCH");
const live = await loadWeakVowelRepairInventory(url, "production");
const byPair = new Map(live.sources.map(s => [`${s.word.id}:${s.microSkillKey}`, s]));
for (const row of rows) {
  const source = byPair.get(`${row.canonicalWordId}:${row.microSkillKey}`);
  if (!source || source.assignmentStatus !== "assigned" || source.word.display_word !== row.word ||
    source.word.review_status !== "approved_for_first_exposure" || source.word.row_status !== "active" ||
    !source.dictations.some(d => d.review_status === "approved_for_first_exposure" && d.dictation_sentence === row.approvedSentence))
    throw Error(`LIVE_SOURCE_CHANGED:${row.workbookRow}`);
  if (row.reviewStatus === "approved_written") {
    if (!row.lessonTarget || !row.selectedVowel || !["approve", "skip"].includes(row.familyDecision) ||
      row.word.slice(row.lessonTarget.start, row.lessonTarget.end) !== row.lessonTarget.text ||
      row.word.slice(row.selectedVowel.start, row.selectedVowel.end) !== row.selectedVowel.text ||
      row.lessonTarget.start !== row.selectedVowel.start) throw Error(`INVALID_WRITTEN_FACT:${row.workbookRow}`);
    if (row.mappingRule === "full_al_pattern_to_written_a" &&
      (row.sourceTarget.text !== "al" || row.lessonTarget.text !== "a")) throw Error(`INVALID_AL_MAPPING:${row.workbookRow}`);
  }
}
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!/^[a-f0-9-]{36}$/i.test(actor)) throw Error("PRODUCTION_ADMIN_ACTOR_MISSING");
const file = "20261029230000_schwa_written_fact_owner_reviews.sql";
const version = file.slice(0, 14);
const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='120s'");
  const prior = await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version]);
  if (!prior.rowCount) {
    await db.query(sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
    await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [version, file.slice(15, -4), [sql]]);
  }
  const prepared = rows.map(r => ({
    canonical_word_id: r.canonicalWordId, micro_skill_key: r.microSkillKey,
    workbook_sha256: manifest.workbookSha256, workbook_row: r.workbookRow, source_row: r.sourceRow,
    source_target: r.sourceTarget, lesson_target: r.lessonTarget, selected_vowel: r.selectedVowel,
    proposed_spoken_cuts: r.proposedSpokenCuts, family_decision: r.familyDecision,
    mapping_rule: r.mappingRule, decision_status: r.reviewStatus,
    decision_reference: `Owner-reviewed schwa-lesson-facts-resolved-colour.xlsx row ${r.workbookRow}; SHA-256 ${manifest.workbookSha256}; written facts approved 2026-10-29; audio and pronunciation pending`,
    reviewed_by: actor,
    row_sha256: sha(JSON.stringify(r)),
  }));
  const batch = JSON.stringify(prepared);
  const evidence = await db.query(`with x as (select * from jsonb_to_recordset($1::jsonb)
      as x(canonical_word_id uuid,micro_skill_key text,workbook_row int,word text,approved_sentence text))
    select count(*)::int total,
      count(*) filter (where w.id is null or w.row_status<>'active' or w.review_status<>'approved_for_first_exposure')::int invalid_words,
      count(*) filter (where not exists(select 1 from public.canonical_teaching_dictionary_dictation_sentences d
        where d.canonical_word_id=x.canonical_word_id and d.dictation_sentence=x.approved_sentence
          and d.row_status='active' and d.review_status='approved_for_first_exposure'))::int invalid_sentences,
      count(*) filter (where public.teaching_dictionary_route_dictionary_fingerprint(x.canonical_word_id) is null)::int missing_fingerprints
    from x left join public.canonical_teaching_dictionary_words w on w.id=x.canonical_word_id`,
    [JSON.stringify(rows.map(r => ({ canonical_word_id:r.canonicalWordId,micro_skill_key:r.microSkillKey,
      workbook_row:r.workbookRow,word:r.word,approved_sentence:r.approvedSentence })))]);
  if (evidence.rows[0].total !== 422 || evidence.rows[0].invalid_words || evidence.rows[0].invalid_sentences ||
    evidence.rows[0].missing_fingerprints) throw Error(`LIVE_EVIDENCE_FAILED:${JSON.stringify(evidence.rows[0])}`);
  const existing = await db.query("select count(*)::int n from public.teaching_dictionary_weak_vowel_written_reviews where workbook_sha256=$1", [manifest.workbookSha256]);
  if (existing.rows[0].n !== 0 && existing.rows[0].n !== 422) throw Error("PARTIAL_EXISTING_IMPORT");
  if (existing.rows[0].n === 0) {
    await db.query(`insert into public.teaching_dictionary_weak_vowel_written_reviews
      (canonical_word_id,micro_skill_key,workbook_sha256,workbook_row,source_row,source_target,lesson_target,
       selected_vowel,proposed_spoken_cuts,family_decision,mapping_rule,decision_status,dictionary_fingerprint,
       row_sha256,decision_reference,reviewed_by)
      select x.canonical_word_id::uuid,x.micro_skill_key,x.workbook_sha256,x.workbook_row,x.source_row,
       x.source_target,x.lesson_target,x.selected_vowel,x.proposed_spoken_cuts,x.family_decision,x.mapping_rule,
       x.decision_status,public.teaching_dictionary_route_dictionary_fingerprint(x.canonical_word_id::uuid),
       x.row_sha256,x.decision_reference,x.reviewed_by::uuid
      from jsonb_to_recordset($1::jsonb) as x(canonical_word_id text,micro_skill_key text,
       workbook_sha256 text,workbook_row integer,source_row integer,source_target jsonb,lesson_target jsonb,
       selected_vowel jsonb,proposed_spoken_cuts jsonb,family_decision text,mapping_rule text,
       decision_status text,row_sha256 text,decision_reference text,reviewed_by text)`, [batch]);
  }
  const readback = await db.query(`select count(*)::int total,
    count(*) filter(where decision_status='approved_written')::int approved,
    count(*) filter(where decision_status='needs_resolution')::int unresolved,
    count(*) filter(where mapping_rule='full_al_pattern_to_written_a')::int mapped_al,
    count(*) filter(where dictionary_fingerprint<>public.teaching_dictionary_route_dictionary_fingerprint(canonical_word_id))::int stale
    from public.teaching_dictionary_weak_vowel_written_reviews where workbook_sha256=$1`, [manifest.workbookSha256]);
  const result = readback.rows[0];
  if (result.total !== 422 || result.approved !== 419 || result.unresolved !== 3 || result.mapped_al !== 64 || result.stale) throw Error(`READBACK_FAILED:${JSON.stringify(result)}`);
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment:"production", mode:apply?"installed":"rollback_proof", workbookSha256:manifest.workbookSha256, migrationVersion:version, result }));
} catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
finally { await db.end(); }
