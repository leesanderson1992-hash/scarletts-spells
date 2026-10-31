#!/usr/bin/env node
/** Certify exact, previously Production-enabled profile packages for the
 * composite dictionary closure. Does not alter canonical words or dictation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const SOURCE = "docs/implementation/seed-data/teaching-dictionary/candidates/";
const profiles = [
  { id: "9c509ea0-76f7-43ae-814f-2a81bc703111", path: `${SOURCE}2026-07-28-dynamic-suffix-ity/reviewed-staging-package.json`,
    sha: "e8213cf5c71f51afb4914cb1df85326dd3061188ffabbb70f7a0b20a8ff72e1f",
    words: ["equality", "responsibility"], evidence: "docs/implementation/qa/adle-dynamic-suffix-ity-production-receipt-2026-07-28.json" },
  { id: "7fc4dc11-416f-42f1-936e-c398395afac8", path: `${SOURCE}2026-07-22-d4-dynamic-prefix-staging-enrichment/reviewed-staging-package.json`,
    sha: "d5d4b9df9c399db66a143ed86af55db58fa8ba7595a6e8263821693ba4641916",
    words: ["subheading", "superhero"], evidence: "docs/implementation/adle-current-state-and-release-registry.md" },
];
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
  !new URL(url).hostname.endsWith("pooler.supabase.com")) throw new Error("PRODUCTION_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin transaction isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  for (const profile of profiles) {
    const raw = readFileSync(profile.path, "utf8");
    assert.equal(hash(raw), profile.sha, `Original package changed: ${profile.id}`);
    assert(readFileSync(profile.evidence, "utf8").includes(profile.id), `Production evidence missing: ${profile.id}`);
    const document = JSON.parse(raw);
    const sourceWords = new Map(document.words.map((row) => [row.word, row]));
    const batch = (await db.query(`select * from public.canonical_teaching_dictionary_import_batches
      where id=$1 for update`, [profile.id])).rows[0];
    assert(batch && batch.batch_status === "applied" && batch.source_folder_sha256 === profile.sha);
    assert.equal(batch.source_metadata.package_sha256, profile.sha);
    assert.equal(batch.release_id, null);
    assert.equal(batch.package_sha256, null);
    assert(batch.verified_at);
    const rows = (await db.query(`select w.id,w.normalised_word,w.row_status,w.review_status,
      d.dictation_sentence,d.dictation_target_token_index,d.audio_text
      from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id
        and d.row_status='active' and d.review_status='approved_for_first_exposure'
      where w.import_batch_id=$1 order by w.normalised_word`, [profile.id])).rows;
    assert.deepEqual(rows.map((row) => row.normalised_word), [...profile.words].sort());
    for (const row of rows) {
      assert(row.row_status === "active" && row.review_status === "approved_for_first_exposure");
      const original = sourceWords.get(row.normalised_word);
      assert(original && original.dictation);
      assert.equal(row.dictation_sentence, original.dictation.sentence);
      assert.equal(row.dictation_target_token_index, original.dictation.targetTokenIndex);
      assert.equal(row.audio_text, original.dictation.audioText);
    }
    const releaseId = `identify-profile-source-verification-2026-10-31:${profile.id}`;
    await db.query(`update public.canonical_teaching_dictionary_import_batches
      set release_id=$2,package_sha256=$3,target_environment='production',
        importer_version='identify_profile_source_verification_v1',updated_at=clock_timestamp(),
        verification_summary=verification_summary || $4::jsonb
      where id=$1 and batch_status='applied' and release_id is null and package_sha256 is null`,
      [profile.id,releaseId,profile.sha,JSON.stringify({
        provenanceBridge: "exact_original_package_and_production_rows_verified_for_composite_closure",
        originalImportMode: "admin_import", originalPackage: profile.path,
        originalProductionEvidence: profile.evidence, verifiedWords: profile.words,
        ownerReviewSha256: "e66a5e8af1d6c6732e5a8dea7eed73fab3ae9c96a363c1601a40ff3663f77718",
      })]);
    const check = (await db.query(`select release_id,package_sha256,verified_at from public.canonical_teaching_dictionary_import_batches
      where id=$1`, [profile.id])).rows[0];
    assert.equal(check.release_id, releaseId);
    assert.equal(check.package_sha256, profile.sha);
    assert(check.verified_at);
  }
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof",
    verifiedBatches: profiles.map((profile) => profile.id), verifiedCanonicalWords: 4,
    canonicalWordOrDictationRowsChanged: 0 }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
