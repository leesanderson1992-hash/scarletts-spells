/** Owner-reviewed teaching-base conversion for the six pilot anchors. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

const target = process.argv[2];
const apply = process.argv.includes("--apply");
if (target !== "staging" && target !== "production") throw new Error("TARGET_REQUIRED");
if (apply && !process.argv.includes(`--confirm=pilot-simple-anchors:${target}`))
  throw new Error("EXACT_CONFIRMATION_REQUIRED");
const envKey = target === "staging" ? "SUPABASE_STAGING_DB_URL" : "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
delete process.env[envKey];
process.loadEnvFile(target === "staging" ? ".env.staging.local" : ".env.local");
const url = process.env[envKey];
const ref = target === "staging" ? "qkpjbajicacbrphthibk" : "wwohrqtunajrbwxyssjf";
if (!url || new URL(url).username.split(".").at(-1) !== ref) throw new Error("DATABASE_TARGET_MISMATCH");
const path = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv";
const csv = readFileSync(path);
assert.equal(createHash("sha256").update(csv).digest("hex"),
  "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const rows = parseDictionaryCsv(csv.toString("utf8"));
const names = ["adore", "apply", "consider", "desire", "reason", "understand"];
const reviewed = new Map(names.map((name) => {
  const matches = rows.filter((row) => row.payload.canonicalMorphology.parts.some((part) =>
    part.kind === "base" && part.sourceText === name));
  assert.equal(matches.length, 1);
  const part = matches[0].payload.canonicalMorphology.parts.find((item) => item.kind === "base")!;
  assert(part.gloss);
  return [name, part.gloss];
}));
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const batch = await db.query(`insert into canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,
      row_counts,import_mode,batch_status,imported_by,imported_at)
    values($1,$2,'canonical-pilot-exact-legacy-base-v1',$3::jsonb,$4::jsonb,
      'admin_import','applied','Katie Sanderson reviewed 14-word pilot',now()) returning id`,
  [path, createHash("sha256").update(csv).digest("hex"),
    JSON.stringify({ exactLegacyOnePartConversion: true }), JSON.stringify({ morphology: names.length })]);
  const output = [];
  for (const name of names) {
    const result = await db.query(`select w.id word_id,w.display_word,m.*,
      (select count(*)::int from canonical_teaching_dictionary_lexical_base_family_members f
        where f.canonical_morphology_id=m.id) lexical_refs,
      (select count(*)::int from adle_learning_items x
        where x.canonical_word_id=w.id and x.row_status='active') learner_items,
      (select count(*)::int from teaching_dictionary_route_content_versions v
        join teaching_dictionary_route_content_publications p on p.content_version_id=v.id
        where v.canonical_word_id=w.id) routes
      from canonical_teaching_dictionary_words w
      join canonical_teaching_dictionary_word_morphology m
        on m.canonical_word_id=w.id and m.row_status='active'
      where w.normalised_word=$1 and w.dialect_code='en-GB'
        and w.row_status='active' and w.review_status='approved_for_first_exposure'
      for update of w,m`, [name]);
    assert.equal(result.rows.length, 1, `ANCHOR_IDENTITY_CHANGED:${name}`);
    const old = result.rows[0];
    assert.equal(old.analysis_status, "approved");
    assert.equal(old.review_status, "approved_for_first_exposure");
    const part = [{ id: "base", kind: "base", sourceText: name, surfaceText: name,
      gloss: reviewed.get(name), displayRange: { start: 0, end: name.length } }];
    if (isDeepStrictEqual(old.morphology_parts, part)
      && old.word_sum === name && isDeepStrictEqual(old.morphology_joins, [])) {
      output.push({ name, canonicalId: old.id, alreadyCanonical: true });
      continue;
    }
    if (name === "understand") {
      assert.deepEqual(old.morphology_parts,
        [{ text: "under", type: "prefix" }, { text: "stand", type: "base" }]);
      assert.deepEqual(old.morphology_joins, ["plus"]);
      assert.equal(old.word_sum, "under + stand → understand");
    } else {
      assert.deepEqual(old.morphology_parts, [{ text: name, type: "base" }]);
      assert.deepEqual(old.morphology_joins, []);
      assert.equal(old.word_sum, name);
    }
    assert.deepEqual(old.morphology_transformations ?? [], []);
    assert.equal(old.display_word, name);
    assert.equal(old.lexical_refs, 0);
    assert.equal(old.learner_items, 0);
    assert.equal(old.routes, 0);
    await db.query(`update canonical_teaching_dictionary_word_morphology
      set row_status='retired' where id=$1 and row_status='active'`, [old.id]);
    const inserted = await db.query(`insert into canonical_teaching_dictionary_word_morphology
      (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
       source_metadata,raw_morpholex_segmentation,raw_morpholex_pos,
       morphology_parts,feature_keys,morphology_joins,morphology_transformations,
       transformation_notes,word_sum,analysis_status,source_category,source_name,
       source_url,source_licence,source_use_note,confidence,review_status,
       reviewed_by,reviewed_at,review_notes)
      values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,
        $12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now(),$24)
      returning id`, [batch.rows[0].id, old.word_id, old.source_sheet, old.source_row_number,
      old.source_row_hash, JSON.stringify({ ...old.source_metadata, legacyMorphologyId: old.id,
        reviewedPilotCsvSha256: createHash("sha256").update(csv).digest("hex") }),
      old.raw_morpholex_segmentation, old.raw_morpholex_pos, JSON.stringify(part),
      JSON.stringify(old.feature_keys), JSON.stringify([]), JSON.stringify([]),
      old.transformation_notes, name, old.analysis_status, old.source_category,
      old.source_name, old.source_url, old.source_licence, old.source_use_note,
      old.confidence, old.review_status, "Katie Sanderson reviewed 14-word pilot",
      `${old.review_notes ?? ""} Owner-reviewed teaching analysis: one ${name} base; meaning from reviewed pilot CSV.`]);
    output.push({ name, previousId: old.id, canonicalId: inserted.rows[0].id });
  }
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target, status: apply ? "applied" : "rollback_proof", output }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
