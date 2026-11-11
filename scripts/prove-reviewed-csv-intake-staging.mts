import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { prepareReviewedCsv, renderMultiSenseCsvBundles, type MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(actor);
const version = "20261111100000";
const name = "teaching_reviewed_csv_intake";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const apply = process.argv.includes("--apply-staging-schema");
const fixture = process.argv.find(arg => arg.startsWith("--fixture="))?.slice(10);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const installed = (await db.query("select statements from supabase_migrations.schema_migrations where version=$1", [version])).rows[0];
  if (installed) assert.deepEqual(installed.statements, [sql]);
  else {
    await db.query(sql.slice("begin;\n".length, -"\ncommit;\n".length));
    if (apply) await db.query("insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)", [version,[sql],name]);
  }

  const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
  const head = (await db.query("select sense_set,reviewed_at::text revision from teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1", [wordId])).rows[0];
  const stored = (await db.query(`select m.*,f.family_key,f.component_part_id,f.relationship_kind
    from teaching_dictionary_current_sense_morphology m left join teaching_dictionary_current_sense_family_memberships f
      on f.sense_morphology_id=m.id where m.canonical_word_id=$1`, [wordId])).rows;
  const skill = "D4_INF_ING_ENDINGS_REGULAR";
  const existing: MultiSenseCsvBundle = { wordId, displayWord: "boxing", sourceSenseReviewedAt: head.revision,
    senseSet: head.sense_set,
    analyses: stored.map(row => ({ senseId: row.sense_id, parts: row.morphology_parts, joins: row.morphology_joins,
      transformations: row.morphology_transformations, wordSum: row.word_sum, familyKey: row.family_key,
      componentPartId: row.component_part_id, relationshipKind: row.relationship_kind,
      requestedSkillKeys: row.sense_id === "boxing-verb-packing" ? [skill] : [] })) };
  const fresh: MultiSenseCsvBundle = {
    wordId: "", displayWord: "unboxing", sourceSenseReviewedAt: "",
    senseSet: { pronunciations: [{ id: "unboxing-pronunciation", ipa: "/ʌnˈbɒksɪŋ/",
      spokenSyllableCount: 3, stressPattern: "unstressed-primary-unstressed" }],
    senses: [{ id: "unboxing-opening", partOfSpeech: "verb", pronunciationId: "unboxing-pronunciation",
      definition: "Taking something out of the box it came in.", dictationSentence: "We are unboxing the new lamp.",
      dictationTargetTokenIndex: 2 }] },
    analyses: [{ senseId: "unboxing-opening", parts: [
      { id: "base", kind: "base", sourceText: "unbox", surfaceText: "unbox",
        gloss: "Take something out of its box.", displayRange: { start: 0, end: 5 } },
      { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing",
        gloss: "Shows the action is happening.", displayRange: { start: 5, end: 8 } },
    ], joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }],
    transformations: [], wordSum: "unbox + ing → unboxing", familyKey: "", componentPartId: "",
    relationshipKind: "", requestedSkillKeys: [skill] }],
  };
  const csv = renderMultiSenseCsvBundles([existing, fresh]);
  const entries = prepareReviewedCsv(csv);
  assert.equal(entries.length, 2);
  const importWord = async (bundle: MultiSenseCsvBundle) => (await db.query(
    "select public.import_reviewed_teaching_dictionary_word($1,$2,$3,$4,$5,$6,$7,$8) id",
    [randomUUID(), bundle.wordId || null, bundle.displayWord, bundle.sourceSenseReviewedAt, bundle.senseSet,
      JSON.stringify(bundle.analyses), actor, "Disposable staging CSV proof"])).rows[0].id;
  await db.query("savepoint import_proof");
  assert.equal(await importWord(entries[0].bundle!), wordId);
  const created = await importWord(entries[1].bundle!);
  const requests = (await db.query(`select w.normalised_word,r.sense_id,r.micro_skill_key
    from teaching_dictionary_multi_sense_csv_skill_requests r
    join canonical_teaching_dictionary_words w on w.id=r.canonical_word_id where w.id=$1`, [created])).rows;
  assert.deepEqual(requests, [{ normalised_word: "unboxing", sense_id: "unboxing-opening", micro_skill_key: skill }]);
  await db.query("savepoint duplicate_proof");
  await assert.rejects(() => importWord(entries[1].bundle!), /REVIEWED_CSV_WORD_EXISTS/);
  await db.query("rollback to savepoint duplicate_proof");
  await db.query("rollback to savepoint import_proof");
  await db.query(apply ? "commit" : "rollback");
  if (fixture) writeFileSync(fixture, csv);
  console.log(JSON.stringify({ stagingSchemaApplied: apply, existingMeanings: 3, newWords: 1, duplicateRejected: true }));
} catch (error) {
  await db.query("rollback");
  throw error;
} finally { await db.end(); }
