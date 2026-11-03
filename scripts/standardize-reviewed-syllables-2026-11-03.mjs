#!/usr/bin/env node
/** Owner-approved, append-only correction of two production dictionary facts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const mode = process.argv[2];
if (!["plan", "prove", "apply"].includes(mode)) throw new Error("Use plan, prove, or apply");
const env = readFileSync(".env.local", "utf8").split(/\r?\n/u)
  .find((line) => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!env) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
const connectionString = env.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/gu, "");
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");

const corrections = [
  { word: "readable", old: { written_syllable_breakdown: "read-a-ble", stress_pattern: "primary-unstressed-unstressed" },
    next: { written_syllable_breakdown: "read·a·ble", stress_pattern: "primary-unstressed-unstressed" } },
  { word: "enjoyable", old: { written_syllable_breakdown: "en·joy·a·ble", stress_pattern: "unstressed-primary-unstressed" },
    next: { written_syllable_breakdown: "en·joy·a·ble", stress_pattern: "unstressed-primary-unstressed-unstressed" } },
];
const sourceHash = createHash("sha256").update(JSON.stringify(corrections)).digest("hex");
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12_000 });
await db.connect();
try {
  await db.query(mode === "plan" ? "begin read only" : "begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const before = await db.query(`select
    (select count(*)::int from public.adle_learning_items where row_status='active') learning_items,
    (select count(*)::int from public.adle_reviewed_word_skill_pairs) word_skill_pairs`);
  let batchId = null;
  const readback = [];
  for (const [index, correction] of corrections.entries()) {
    const wordResult = await db.query(`select id,display_word,review_status from public.canonical_teaching_dictionary_words
      where normalised_word=$1 and dialect_code='en-GB' and row_status='active'`, [correction.word]);
    assert.equal(wordResult.rowCount, 1, `WORD_IDENTITY_CHANGED:${correction.word}`);
    const word = wordResult.rows[0];
    assert.equal(word.display_word, correction.word);
    assert.equal(word.review_status, "approved_for_first_exposure");
    const metadataResult = await db.query(`select * from public.canonical_teaching_dictionary_word_metadata
      where canonical_word_id=$1 and row_status='active' ${mode === "plan" ? "" : "for update"}`, [word.id]);
    assert.equal(metadataResult.rowCount, 1, `METADATA_IDENTITY_CHANGED:${correction.word}`);
    const metadata = metadataResult.rows[0];
    assert.equal(metadata.review_status, "approved_for_first_exposure");
    assert.equal(metadata.syllables, correction.word === "readable" ? "3" : "4");
    for (const [key, value] of Object.entries(correction.old)) assert.equal(metadata[key], value,
      `PREVIOUS_FACT_CHANGED:${correction.word}:${key}`);
    if (mode !== "plan") {
      if (!batchId) {
        const batch = await db.query(`insert into public.canonical_teaching_dictionary_import_batches
          (source_folder_path,source_folder_sha256,validator_version,import_mode,batch_status,source_metadata,imported_by,imported_at)
          values ($1,$2,'reviewed_syllable_correction_v1','admin_import','applied',$3,'Katie Sanderson',now()) returning id`,
        ["teaching-dictionary/syllable-correction/2026-11-03", sourceHash,
          { approval: "Owner correction in Codex chat, 2026-11-03", sourceHash }]);
        batchId = batch.rows[0].id;
      }
      await db.query(`update public.canonical_teaching_dictionary_word_metadata
        set row_status='superseded',updated_at=now() where id=$1 and row_status='active'`, [metadata.id]);
      const replacement = { ...metadata, ...correction.next,
        import_batch_id: batchId, source_sheet: "owner-reviewed-syllable-correction-2026-11-03",
        source_row_number: index + 2,
        source_row_hash: createHash("sha256").update(`${sourceHash}:${correction.word}`).digest("hex"),
        source_metadata: { ...metadata.source_metadata, correctedFromMetadataId: metadata.id,
          humanApprovedWrittenSyllableBreakdown: correction.next.written_syllable_breakdown,
          ownerDecision: "Codex chat, 2026-11-03", correction: correction.next },
        reviewed_by: "Katie Sanderson", reviewed_at: new Date() };
      const keys = Object.keys(replacement).filter((key) => !["id", "created_at", "updated_at"].includes(key));
      const values = keys.map((key) => replacement[key]);
      const inserted = await db.query(`insert into public.canonical_teaching_dictionary_word_metadata
        (${keys.map((key) => `"${key}"`).join(",")}) values (${keys.map((_, n) => `$${n + 1}`).join(",")})
        returning id,written_syllable_breakdown,stress_pattern`, values);
      assert.equal(inserted.rowCount, 1);
    }
    readback.push({ word: correction.word, previousId: metadata.id, next: correction.next });
  }
  if (mode !== "plan") for (const correction of corrections) {
    const result = await db.query(`select m.written_syllable_breakdown,m.stress_pattern
      from public.canonical_teaching_dictionary_word_metadata m
      join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
      where w.normalised_word=$1 and w.dialect_code='en-GB' and w.row_status='active' and m.row_status='active'`,
      [correction.word]);
    assert.equal(result.rowCount, 1);
    assert.deepEqual(result.rows[0], correction.next);
  }
  const after = await db.query(`select
    (select count(*)::int from public.adle_learning_items where row_status='active') learning_items,
    (select count(*)::int from public.adle_reviewed_word_skill_pairs) word_skill_pairs`);
  assert.deepEqual(after.rows[0], before.rows[0], "LEARNER_OR_SKILL_STATE_CHANGED");
  await db.query(mode === "apply" ? "commit" : "rollback");
  console.log(JSON.stringify({ mode, corrections: readback, sourceHash,
    learnerAndSkillCountsPreserved: true, committed: mode === "apply" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
