#!/usr/bin/env node
/** Close three previously Production-enabled, validated dictionary source batches
 * so their approved rows can be frozen in the new immutable Identify closure. */
import assert from "node:assert/strict";
import pg from "pg";

const batches = [
  { id: "9c509ea0-76f7-43ae-814f-2a81bc703111", sourceSha: "e8213cf5c71f51afb4914cb1df85326dd3061188ffabbb70f7a0b20a8ff72e1f",
    words: ["equality", "responsibility"], receipt: "adle-dynamic-suffix-ity-production-receipt-2026-07-28.json" },
  { id: "016705bb-9a87-44ce-a610-596132240b9b", sourceSha: "d5d4b9df9c399db66a143ed86af55db58fa8ba7595a6e8263821693ba4641916",
    words: ["preschool"], receipt: "adle-dynamic-prefix-re-pre-production-receipt-2026-07-23.json" },
  { id: "7fc4dc11-416f-42f1-936e-c398395afac8", sourceSha: "d5d4b9df9c399db66a143ed86af55db58fa8ba7595a6e8263821693ba4641916",
    words: ["subheading", "superhero"], receipt: "adle-current-state-and-release-registry.md:Dynamic Prefix sub/inter/super" },
];
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
  !new URL(url).hostname.endsWith("pooler.supabase.com")) throw new Error("PRODUCTION_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin transaction isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  for (const entry of batches) {
    const batch = (await db.query(`select * from public.canonical_teaching_dictionary_import_batches
      where id=$1 for update`, [entry.id])).rows[0];
    assert(batch, `Missing batch ${entry.id}`);
    assert.equal(batch.batch_status, "validated");
    assert.equal(batch.source_folder_sha256, entry.sourceSha);
    assert.equal(batch.source_metadata.package_sha256, entry.sourceSha);
    assert.equal(batch.release_id, null);
    assert.equal(batch.package_sha256, null);
    assert.equal(Number(batch.validation_summary.errors), 0);
    assert.equal(batch.readiness_summary.production_enabled, true);
    assert(new Date(batch.created_at) < new Date("2026-08-09T00:00:00Z"));
    const words = (await db.query(`select normalised_word,row_status,review_status from public.canonical_teaching_dictionary_words
      where import_batch_id=$1 order by normalised_word`, [entry.id])).rows;
    assert.deepEqual(words.map((row) => row.normalised_word), [...entry.words].sort());
    assert(words.every((row) => row.row_status === "active" && row.review_status === "approved_for_first_exposure"));
    const dictation = (await db.query(`select count(*)::int n from public.canonical_teaching_dictionary_dictation_sentences
      where canonical_word_id in (select id from public.canonical_teaching_dictionary_words where import_batch_id=$1)
        and row_status='active' and review_status='approved_for_first_exposure'`, [entry.id])).rows[0].n;
    assert.equal(dictation, words.length);
    await db.query(`update public.canonical_teaching_dictionary_import_batches
      set batch_status='applied',verified_at=clock_timestamp(),updated_at=clock_timestamp(),
        verification_summary=$2::jsonb where id=$1 and batch_status='validated'`, [entry.id, JSON.stringify({
      status: "previously_enabled_legacy_source_verified_for_identify_closure",
      priorProductionReceipt: entry.receipt,
      ownerReviewSha256: "e66a5e8af1d6c6732e5a8dea7eed73fab3ae9c96a363c1601a40ff3663f77718",
      approvedWords: entry.words,
    })]);
  }
  const now = (await db.query(`select id,batch_status from public.canonical_teaching_dictionary_import_batches
    where id=any($1::uuid[])`, [batches.map((entry) => entry.id)])).rows;
  assert(now.length === 3 && now.every((row) => row.batch_status === "applied"));
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof", batches: batches.map((entry) => entry.id),
    approvedSourceWords: 5, lessonTargetsUnblocked: ["equality", "preschool", "subheading"] }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
