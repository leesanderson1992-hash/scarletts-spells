#!/usr/bin/env node
/** Exact-source, transactional release of the 23 owner-directed existing-word morphology updates. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const mode = process.argv[2];
if (!["plan", "prove", "release", "verify"].includes(mode)) {
  throw new Error("Usage: release-owner-approved-existing-word-morphology.mts plan|prove|release|verify [--confirm <sha-prefix>]");
}
const remainingScope = process.argv.includes("--remaining");
const path = remainingScope
  ? "outputs/teaching-dictionary-import-plan-2026-10-30/remaining-existing-base-normalizations.csv"
  : "outputs/teaching-dictionary-import-plan-2026-10-30/existing-word-morphology-updates.csv";
const source = readFileSync(path, "utf8");
const sourceSha = createHash("sha256").update(source).digest("hex");
const releaseId = remainingScope
  ? "owner-approved-remaining-existing-base-normalizations-2026-10-30-v1"
  : "owner-approved-existing-word-morphology-2026-10-30-v1";
const rows = parseCsv(source);
const expectedCount = remainingScope ? 6 : 23;
assert.equal(rows.length, expectedCount);
assert.equal(new Set(rows.map((row) => row.base_word)).size, expectedCount);
assert.equal(rows.filter((row) => row.change_kind === "legacy_format_normalization").length, remainingScope ? 6 : 20);
assert.deepEqual(rows.filter((row) => row.change_kind === "preserve_word_sum_and_correct_base_part")
  .map((row) => row.base_word).sort(), remainingScope ? [] : ["brownie", "replace", "review"]);
for (const row of rows) {
  assert.equal(row.current_word_sum, row.proposed_word_sum, row.base_word);
  const parts = JSON.parse(row.proposed_parts);
  assert.equal(parts.map((part: { surfaceText: string }) => part.surfaceText).join(""), row.base_word);
  assert.equal(JSON.parse(row.proposed_joins).length, parts.length - 1);
  assert(Array.isArray(JSON.parse(row.proposed_transformations)));
}
const confirmIndex = process.argv.indexOf("--confirm");
if (mode === "release" && (confirmIndex < 0 || process.argv[confirmIndex + 1] !== sourceSha.slice(0, 12))) {
  throw new Error(`Exact source confirmation required: --confirm ${sourceSha.slice(0, 12)}`);
}
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!url || !`${new URL(url).hostname}|${decodeURIComponent(new URL(url).username)}`.includes("wwohrqtunajrbwxyssjf")) {
  throw new Error("Verified Production transaction-pooler URL required");
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
const protectedTables = ["children", "daily_assignments", "assignment_items", "adle_learning_items", "learning_item_evidence", "child_word_treasures"];
async function counts() {
  const out: Record<string, number> = {};
  for (const table of protectedTables) {
    const result = await db.query(`select count(*)::int n from public.${table}`);
    out[table] = result.rows[0].n;
  }
  return out;
}
async function current(row: Record<string, string>, lock: boolean) {
  const result = await db.query(`select w.id word_id,w.normalised_word,m.*,
    (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members f
      where f.canonical_morphology_id=m.id) lexical_references
    from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'
    where w.normalised_word=$1 and w.dialect_code='en-GB' and w.row_status='active'
    ${lock ? "for update of w,m" : ""}`, [row.base_word]);
  assert.equal(result.rowCount, 1, `CURRENT_WORD_OR_MORPHOLOGY_MISSING:${row.base_word}`);
  const fact = result.rows[0];
  assert.equal(fact.word_id, row.canonical_word_id, `WORD_ID_CHANGED:${row.base_word}`);
  assert.equal(fact.id, row.current_morphology_id, `MORPHOLOGY_ID_CHANGED:${row.base_word}`);
  assert.equal(fact.word_sum, row.current_word_sum, `WORD_SUM_CHANGED:${row.base_word}`);
  assert.deepEqual(fact.morphology_parts, JSON.parse(row.current_parts), `MORPHOLOGY_CHANGED:${row.base_word}`);
  assert.equal(fact.lexical_references, 0, `APPROVED_FAMILY_REFERENCES_CURRENT_MORPHOLOGY:${row.base_word}`);
  assert.equal(fact.analysis_status, "approved");
  assert.equal(fact.review_status, "approved_for_first_exposure");
  return fact;
}
await db.connect();
try {
  await db.query(mode === "plan" || mode === "verify" ? "begin read only" : "begin");
  await db.query("set local statement_timeout='60s'");
  if (mode === "verify") {
    const result = await db.query(`select w.normalised_word,m.word_sum,m.morphology_parts,m.morphology_joins,
      m.morphology_transformations,m.source_metadata
      from public.canonical_teaching_dictionary_word_morphology m
      join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
      where m.row_status='active' and m.source_metadata->>'releaseId'=$1`, [releaseId]);
    assert.equal(result.rowCount, expectedCount, "RELEASED_MORPHOLOGY_COUNT_MISMATCH");
    const facts = new Map(result.rows.map((row) => [row.normalised_word, row]));
    for (const row of rows) {
      const fact = facts.get(row.base_word);
      assert(fact, `RELEASED_MORPHOLOGY_MISSING:${row.base_word}`);
      assert.equal(fact.word_sum, row.proposed_word_sum);
      assert.deepEqual(fact.morphology_parts, JSON.parse(row.proposed_parts));
      assert.deepEqual(fact.morphology_joins, JSON.parse(row.proposed_joins));
      assert.deepEqual(fact.morphology_transformations, JSON.parse(row.proposed_transformations));
      assert.equal(fact.source_metadata.sourceSha256, sourceSha);
    }
    await db.query("rollback");
    console.log(JSON.stringify({ mode, scope: remainingScope ? "remaining" : "original", verified: expectedCount, sourceSha256: sourceSha }));
  } else {
    const before = await counts();
    const existing = await db.query(`select id,batch_status from public.canonical_teaching_dictionary_import_batches
      where source_metadata->>'releaseId'=$1`, [releaseId]);
    if (existing.rowCount) throw new Error("EXISTING_MORPHOLOGY_RELEASE_ALREADY_PRESENT");
    const facts = [];
    for (const row of rows) facts.push(await current(row, mode !== "plan"));
    if (mode === "plan") {
      await db.query("rollback");
      console.log(JSON.stringify({ mode, scope: remainingScope ? "remaining" : "original", ready: expectedCount,
        formatNormalizations: remainingScope ? 6 : 20,
        baseCorrections: remainingScope ? 0 : 3, sourceSha256: sourceSha, protectedCounts: before }));
    } else {
      const batch = await db.query(`insert into public.canonical_teaching_dictionary_import_batches
        (source_folder_path,source_folder_sha256,source_commit,validator_version,validation_summary,
         row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
        values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,'admin_import','validated',$8::jsonb,$9,now()) returning id`,
        [path, sourceSha, null, "owner_approved_existing_morphology_v1",
          JSON.stringify({ errors: 0, reviewed: expectedCount }), JSON.stringify({ morphology: expectedCount }),
          JSON.stringify({ wordSumsUnchanged: true, protectedWrites: 0 }),
          JSON.stringify({ releaseId, sourceSha256: sourceSha, ownerApproval: "Owner instruction, 30 October 2026" }),
          "owner-approved-teaching-dictionary-morphology-release"]);
      const batchId = batch.rows[0].id;
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const fact = facts[index];
        const rowHash = createHash("sha256").update(JSON.stringify({ word: row.base_word,
          sum: row.proposed_word_sum, parts: JSON.parse(row.proposed_parts),
          joins: JSON.parse(row.proposed_joins), transformations: JSON.parse(row.proposed_transformations) })).digest("hex");
        await db.query(`update public.canonical_teaching_dictionary_word_morphology set row_status='retired'
          where id=$1 and row_status='active'`, [fact.id]);
        const inserted = await db.query(`insert into public.canonical_teaching_dictionary_word_morphology
          (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
           raw_morpholex_segmentation,raw_morpholex_pos,morphology_parts,feature_keys,morphology_joins,
           morphology_transformations,transformation_notes,word_sum,analysis_status,source_category,source_name,
           source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at,review_notes)
          select $1,canonical_word_id,'active',$2,$3,$4,$5::jsonb,
            raw_morpholex_segmentation,raw_morpholex_pos,$6::jsonb,feature_keys,$7::jsonb,
            $8::jsonb,transformation_notes,word_sum,analysis_status,source_category,source_name,
            source_url,source_licence,source_use_note,confidence,'approved_for_first_exposure',
            'Katie Sanderson',now(),$9
          from public.canonical_teaching_dictionary_word_morphology where id=$10 returning id`,
          [batchId, path.split("/").at(-1), index + 2, rowHash,
            JSON.stringify({ releaseId, sourceSha256: sourceSha, previousMorphologyId: fact.id,
              ownerApproval: "Owner instruction, 30 October 2026" }),
            row.proposed_parts, row.proposed_joins, row.proposed_transformations,
            "Owner-directed structured morphology and base-family correction; word sum preserved.", fact.id]);
        assert.equal(inserted.rowCount, 1);
        const check = await db.query(`select word_sum,morphology_parts,morphology_joins,morphology_transformations
          from public.canonical_teaching_dictionary_word_morphology where id=$1`, [inserted.rows[0].id]);
        assert.equal(check.rows[0].word_sum, row.proposed_word_sum);
        assert.deepEqual(check.rows[0].morphology_parts, JSON.parse(row.proposed_parts));
        assert.deepEqual(check.rows[0].morphology_joins, JSON.parse(row.proposed_joins));
        assert.deepEqual(check.rows[0].morphology_transformations, JSON.parse(row.proposed_transformations));
      }
      assert.deepEqual(await counts(), before, "PROTECTED_TABLE_COUNT_CHANGED");
      await db.query(`update public.canonical_teaching_dictionary_import_batches
        set batch_status='applied',verification_summary=$2::jsonb,verified_at=now()
        where id=$1`, [batchId, JSON.stringify({ status: "verified", sourceSha256: sourceSha, morphology: expectedCount })]);
      if (mode === "prove") {
        await db.query("rollback");
        console.log(JSON.stringify({ mode, scope: remainingScope ? "remaining" : "original", proved: expectedCount, rolledBack: true, sourceSha256: sourceSha }));
      } else {
        await db.query("commit");
        console.log(JSON.stringify({ mode, scope: remainingScope ? "remaining" : "original", updated: expectedCount, batchId, sourceSha256: sourceSha }));
      }
    }
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
