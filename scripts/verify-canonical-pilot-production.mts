/** Read-only post-publication verification of the fixed reviewed pilot. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_READ_ONLY_DATABASE_REQUIRED");
const file = readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
assert.equal(createHash("sha256").update(file).digest("hex"),
  "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const rows = parseDictionaryCsv(file.toString("utf8"));
assert.equal(rows.length, 14);
const batch = "d596f473-19fd-4b15-94a5-1b69b043391f";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin read only");
  const report = [];
  for (const row of rows) {
    assert(!row.error && row.canonicalWordId, `CSV_INVALID:${row.normalisedWord}`);
    const result = await db.query(`select w.display_word,w.normalised_word,
      md.written_syllable_breakdown,md.stress_pattern,m.morphology_parts,
      m.morphology_joins,m.word_sum,m.analysis_status,
      (select count(*)::int from teaching_dictionary_manager_drafts d
        join teaching_dictionary_manager_publications p on p.draft_id=d.id
        where d.canonical_word_id=w.id and d.source_reference like $2) pilot_publications
      from canonical_teaching_dictionary_words w
      join canonical_teaching_dictionary_word_metadata md
        on md.canonical_word_id=w.id and md.row_status='active'
      join canonical_teaching_dictionary_word_morphology m
        on m.canonical_word_id=w.id and m.row_status='active'
      where w.id=$1 and w.row_status='active'
        and w.review_status='approved_for_first_exposure'`,
    [row.canonicalWordId, `CSV batch ${batch},%`]);
    assert.equal(result.rows.length, 1, `ACTIVE_OVERVIEW_MISSING:${row.normalisedWord}`);
    const actual = result.rows[0];
    assert.equal(actual.normalised_word, row.normalisedWord);
    assert.equal(actual.display_word, row.payload.displayWord);
    assert.equal(actual.written_syllable_breakdown, row.writtenSyllableBreakdown);
    assert.equal(actual.stress_pattern, row.payload.metadata.stress_pattern);
    assert.equal(actual.word_sum, row.payload.canonicalMorphology.wordSum);
    assert.equal(actual.analysis_status, "approved");
    assert(isDeepStrictEqual(actual.morphology_parts, row.payload.canonicalMorphology.parts),
      `PARTS_MISMATCH:${row.normalisedWord}`);
    assert(isDeepStrictEqual(actual.morphology_joins, row.payload.canonicalMorphology.joins),
      `JOINS_MISMATCH:${row.normalisedWord}`);
    assert.equal(actual.pilot_publications, 1);
    const member = await db.query(`select f.family_key,f.revision,f.base_kind,f.base_meaning,
      m.morphology_parts,m.canonical_morphology_id
      from canonical_teaching_dictionary_lexical_base_family_members m
      join canonical_teaching_dictionary_lexical_base_families f
        on f.family_key=m.family_key and f.revision=m.revision
      where m.canonical_word_id=$1 and f.review_status='approved'
        and not exists(select 1 from canonical_teaching_dictionary_lexical_base_families newer
          where newer.family_key=f.family_key and newer.revision>f.revision)`,
    [row.canonicalWordId]);
    assert.equal(member.rows.length, 1, `FAMILY_MISSING_OR_DUPLICATE:${row.normalisedWord}`);
    assert(isDeepStrictEqual(member.rows[0].morphology_parts, row.payload.canonicalMorphology.parts),
      `FAMILY_PARTS_STALE:${row.normalisedWord}`);
    const skills = await db.query(`select distinct p.micro_skill_key from adle_reviewed_word_skill_pairs p
      join adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key='production'
      where p.canonical_word_id=$1
        and not exists(select 1 from adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
        and not exists(select 1 from teaching_dictionary_pair_latest_decisions x
          where x.environment_key='production' and x.canonical_word_id=p.canonical_word_id
            and x.micro_skill_key=p.micro_skill_key and x.action='deassign')
      order by p.micro_skill_key`, [row.canonicalWordId]);
    assert(isDeepStrictEqual(skills.rows.map((item) => item.micro_skill_key),
      [...row.payload.skillKeys].sort()), `SKILL_SET_MISMATCH:${row.normalisedWord}`);
    report.push({ word: row.normalisedWord, family: member.rows[0].family_key,
      familyRevision: member.rows[0].revision, skills: skills.rows.length,
      writtenSyllables: actual.written_syllable_breakdown });
  }
  const understand = await db.query(`select m.morphology_parts,m.word_sum from
    canonical_teaching_dictionary_words w join canonical_teaching_dictionary_word_morphology m
      on m.canonical_word_id=w.id and m.row_status='active'
    where w.normalised_word='understand' and w.row_status='active'`);
  assert.equal(understand.rows.length, 1);
  assert.equal(understand.rows[0].morphology_parts.length, 1);
  assert.equal(understand.rows[0].morphology_parts[0].sourceText, "understand");
  console.log(JSON.stringify({ verified: report.length, understandSingleBase: true, report }, null, 2));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
