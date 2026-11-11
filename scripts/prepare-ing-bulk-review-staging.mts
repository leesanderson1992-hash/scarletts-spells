/** Install the queue and prepare reviewed base senses for the staging browser proof. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

assert(process.argv.includes("--prepare-disposable-staging"));
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(actor);
const version = "20261111110000";
const name = "teaching_ing_bulk_review_queue";
const migration = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  const applied = (await db.query("select statements from supabase_migrations.schema_migrations where version=$1", [version])).rows[0];
  if (applied) assert.deepEqual(applied.statements, [migration]);
  else {
    await db.query(migration.slice("begin;\n".length, -"\ncommit;\n".length));
    await db.query("insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)", [version, [migration], name]);
  }
  for (const [base, ipa, meaning] of [
    ["pick", "/pɪk/", "To choose something from a group."],
    ["pour", "/pɔː/", "To make a liquid flow out of a container."],
  ]) {
    const word = (await db.query(`select id from canonical_teaching_dictionary_words
      where normalised_word=$1 and row_status='active' and review_status='approved_for_first_exposure'`, [base])).rows[0];
    assert(word, `Missing staging base ${base}`);
    const sense = `${base}-bulk-proof`;
    const family = `${base}_verb_${base}_bulk_proof_base_family`;
    if ((await db.query("select 1 from canonical_teaching_dictionary_lexical_base_families where family_key=$1", [family])).rowCount) continue;
    const senseSet = { pronunciations: [{ id: "standard", ipa, spokenSyllableCount: 1, stressPattern: "primary" }],
      senses: [{ id: sense, definition: meaning, pronunciationId: "standard", partOfSpeech: "verb" }] };
    const analyses = [{ senseId: sense, parts: [{ id: "base", kind: "base", sourceText: base, surfaceText: base,
      gloss: meaning, displayRange: { start: 0, end: base.length } }],
      joins: [], transformations: [], wordSum: `${base} → ${base}`, requestedSkillKeys: [] }];
    await db.query("select public.import_reviewed_teaching_dictionary_word($1,$2,$3,'',$4,$5,$6,$7)",
      [randomUUID(), word.id, base, senseSet, JSON.stringify(analyses), actor, "Disposable bulk review staging fixture"]);
    const created = (await db.query("select public.create_reviewed_free_base_family_from_sense($1,$2,$3,$2,$3,'base','free_base',$4,$5) key",
      [randomUUID(), word.id, sense, actor, "Disposable bulk review staging fixture"])).rows[0].key;
    assert.equal(created, family);
  }
  await db.query("commit");
  writeFileSync("/tmp/regular-ing-bulk-review-proof.csv", [
    "word,meaning,base,ipa,syllables,stress,sentence",
    "boxing,,,,,,",
    "picking,Choosing something from a group.,pick,/ˈpɪkɪŋ/,2,primary-unstressed,She is picking a book from the shelf.",
    "pouring,Making a liquid flow out of a container.,pour,/ˈpɔːrɪŋ/,2,primary-unstressed,He is pouring water into a glass.",
    "unboxing,,,,,,",
  ].join("\r\n") + "\r\n");
  console.log("Queue schema and two base families ready in staging. Mixed proof CSV written.");
} catch (error) {
  await db.query("rollback");
  throw error;
} finally {
  await db.end();
}
