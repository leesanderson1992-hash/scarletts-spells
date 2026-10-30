#!/usr/bin/env node
/** Version ten missing written-syllable facts from the owner's supplied CSV. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const mode = process.argv[2];
if (!["plan", "prove", "release", "verify"].includes(mode)) {
  throw new Error("Usage: release-owner-supplied-existing-written-syllables.mts plan|prove|release|verify [--confirm <sha-prefix>]");
}
const path = "outputs/teaching-dictionary-import-plan-2026-10-30/remaining-written-syllable-updates.csv";
const source = readFileSync(path, "utf8");
const sourceSha = createHash("sha256").update(source).digest("hex");
const rows = parseCsv(source);
assert.deepEqual(rows.map((row) => row.word).sort(),
  ["box", "cover", "dad", "equal", "fortune", "get", "pack", "prepare", "spell", "type"]);
for (const row of rows) {
  assert.equal(row.proposed_written_syllables.replaceAll("-", ""), row.word);
  assert.equal(row.proposed_written_syllables.split("-").length, Number(row.spoken_syllables));
}
const index = process.argv.indexOf("--confirm");
if (mode === "release" && (index < 0 || process.argv[index + 1] !== sourceSha.slice(0, 12))) {
  throw new Error(`Exact source confirmation required: --confirm ${sourceSha.slice(0, 12)}`);
}
const releaseId = "owner-supplied-existing-written-syllables-2026-10-30-v1";
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!url || !`${new URL(url).hostname}|${decodeURIComponent(new URL(url).username)}`.includes("wwohrqtunajrbwxyssjf")) {
  throw new Error("Verified Production transaction-pooler URL required");
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
await db.connect();
try {
  await db.query(mode === "plan" || mode === "verify" ? "begin read only" : "begin");
  await db.query("set local statement_timeout='60s'");
  if (mode === "verify") {
    const result = await db.query(`select w.normalised_word,md.written_syllable_breakdown,md.syllables,
      md.source_metadata,md.id from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
      where w.normalised_word=any($1::text[]) and w.row_status='active'`, [rows.map((row) => row.word)]);
    assert.equal(result.rowCount, 10);
    const facts = new Map(result.rows.map((row) => [row.normalised_word, row]));
    for (const row of rows) {
      const fact = facts.get(row.word);
      assert(fact);
      assert.equal(fact.written_syllable_breakdown, row.proposed_written_syllables);
      assert.equal(fact.syllables, row.spoken_syllables);
      assert.equal(fact.source_metadata.releaseId, releaseId);
      assert.equal(fact.source_metadata.sourceSha256, sourceSha);
    }
    await db.query("rollback");
    console.log(JSON.stringify({ mode, verified: 10, sourceSha256: sourceSha }));
  } else {
    const before = await db.query(`select
      (select count(*)::int from public.children) children,
      (select count(*)::int from public.daily_assignments) assignments,
      (select count(*)::int from public.adle_learning_items) learning_items`);
    const previous = [];
    for (const row of rows) {
      const result = await db.query(`select w.id word_id,w.normalised_word,md.*
        from public.canonical_teaching_dictionary_words w
        join public.canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
        where w.id=$1 and w.normalised_word=$2 and w.row_status='active'
        ${mode === "plan" ? "" : "for update of w,md"}`, [row.canonical_word_id, row.word]);
      assert.equal(result.rowCount, 1, `METADATA_MISSING:${row.word}`);
      const fact = result.rows[0];
      assert.equal(fact.id, row.current_metadata_id, `METADATA_CHANGED:${row.word}`);
      assert.equal(fact.syllables, row.spoken_syllables);
      assert.equal(fact.written_syllable_breakdown, null);
      previous.push(fact);
    }
    if (mode === "plan") {
      await db.query("rollback");
      console.log(JSON.stringify({ mode, ready: 10, sourceSha256: sourceSha }));
    } else {
      const batch = await db.query(`insert into public.canonical_teaching_dictionary_import_batches
        (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,
         readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
        values ($1,$2,'owner_supplied_written_syllables_v1',$3::jsonb,$4::jsonb,$5::jsonb,
          'admin_import','validated',$6::jsonb,$7,now()) returning id`,
        [path, sourceSha, JSON.stringify({ errors: 0, reviewed: 10 }), JSON.stringify({ metadata: 10 }),
          JSON.stringify({ writtenSyllables: 10, protectedWrites: 0 }),
          JSON.stringify({ releaseId, sourceSha256: sourceSha, ownerSource: "British teaching dictionary CSV" }),
          "owner-supplied-written-syllable-release"]);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const fact = previous[i];
        const rowHash = createHash("sha256").update(JSON.stringify(row)).digest("hex");
        await db.query(`update public.canonical_teaching_dictionary_word_metadata
          set row_status='superseded',updated_at=now() where id=$1 and row_status='active'`, [fact.id]);
        const inserted = await db.query(`insert into public.canonical_teaching_dictionary_word_metadata
          (import_batch_id,canonical_word_id,source_id,row_status,source_sheet,source_row_number,
           source_row_hash,source_metadata,syllables,phoneme_hint,grapheme_notes,stress_pattern,
           has_schwa,morphemes,morphology_notes,irregularity_notes,source_category,source_name,
           source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at,
           written_syllable_breakdown)
          select $1,canonical_word_id,source_id,'active',$2,$3,$4,$5::jsonb,syllables,
            phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,morphology_notes,
            irregularity_notes,source_category,source_name,source_url,source_licence,source_use_note,
            confidence,'approved_for_first_exposure','Katie Sanderson',now(),$6
          from public.canonical_teaching_dictionary_word_metadata where id=$7 returning id,written_syllable_breakdown`,
          [batch.rows[0].id, "remaining-written-syllable-updates.csv", i + 2, rowHash,
            JSON.stringify({ releaseId, sourceSha256: sourceSha,
              previousMetadataId: fact.id, humanApprovedWrittenSyllableBreakdown: row.proposed_written_syllables }),
            row.proposed_written_syllables, fact.id]);
        assert.equal(inserted.rowCount, 1);
        assert.equal(inserted.rows[0].written_syllable_breakdown, row.proposed_written_syllables);
      }
      const after = await db.query(`select
        (select count(*)::int from public.children) children,
        (select count(*)::int from public.daily_assignments) assignments,
        (select count(*)::int from public.adle_learning_items) learning_items`);
      assert.deepEqual(after.rows[0], before.rows[0], "PROTECTED_COUNTS_CHANGED");
      await db.query(`update public.canonical_teaching_dictionary_import_batches
        set batch_status='applied',verification_summary=$2::jsonb,verified_at=now()
        where id=$1`, [batch.rows[0].id, JSON.stringify({ status: "verified", metadata: 10, sourceSha256: sourceSha })]);
      if (mode === "prove") {
        await db.query("rollback");
        console.log(JSON.stringify({ mode, proved: 10, rolledBack: true, sourceSha256: sourceSha }));
      } else {
        await db.query("commit");
        console.log(JSON.stringify({ mode, published: 10, sourceSha256: sourceSha }));
      }
    }
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
