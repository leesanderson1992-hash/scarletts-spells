/** Import all 84 signed contrast sets after the canonical dictionary release. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { parseCsv } from "./lib/deterministic-csv";

type ReviewRow = Record<string, string>;
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "data/adle/homophone/convergence-v1");
const manifest = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8")) as {
  skills: Array<{ key: string; sets: Array<{ setKey: string; members: string[] }> }>;
};
const csvText = readFileSync(resolve(dir, "contrast-set-review.csv"), "utf8");
const rows = parseCsv(csvText).rows;
const sourceHash = createHash("sha256").update(csvText).digest("hex");
const expected = new Map(manifest.skills.flatMap(skill => skill.sets.map(set =>
  [set.setKey, { skillKey: skill.key, words: set.members }] as const)));
const grouped = new Map<string, ReviewRow[]>();
for (const row of rows) grouped.set(row.set_key, [...(grouped.get(row.set_key) ?? []), row]);
if (expected.size !== 84 || grouped.size !== 84 || rows.length !== 175) {
  throw new Error("Contrast-set source cardinality changed");
}
const missing: string[] = [];
for (const [setKey, specification] of expected) {
  const group = grouped.get(setKey);
  if (!group || group.length !== specification.words.length) throw new Error(`Set membership changed: ${setKey}`);
  group.sort((a, b) => Number(a.member_ordinal) - Number(b.member_ordinal));
  if (group.some((row, i) => row.micro_skill_key !== specification.skillKey
    || row.word !== specification.words[i] || Number(row.member_ordinal) !== i + 1)) {
    throw new Error(`Set membership differs from frozen manifest: ${setKey}`);
  }
  const classification = group[0].reviewed_relation_kind;
  const reviewer = group[0].reviewed_by;
  const reference = group[0].approval_reference;
  if (group.some(row => row.review_status !== "approved" || !row.intended_sense.trim()
    || !row.grammatical_role.trim() || !row.target_sentence.trim()
    || !row.sense_source_reference.trim() || !reviewer.trim() || !reference.trim()
    || row.reviewed_relation_kind !== classification || row.reviewed_by !== reviewer
    || row.approval_reference !== reference)) missing.push(setKey);
  if (classification && !["homophone", "near_homophone", "confusable",
    "morphological_contrast", "contraction_real_word"].includes(classification)) {
    throw new Error(`Invalid en-GB relation classification: ${setKey}`);
  }
}
if (missing.length) {
  console.log(JSON.stringify({ ready: false, unreviewedSets: missing.length, firstUnreviewed: missing.slice(0, 5) }));
  if (process.argv.includes("--apply")) throw new Error("No contrast set may be imported before signed review");
  process.exit(0);
}
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ ready: true, reviewedSets: 84, sourceHash }));
  process.exit(0);
}
const env = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!env) throw new Error("Production database connection unavailable");
let connectionString = env.slice(env.indexOf("=") + 1).trim();
if ((connectionString.startsWith('"') && connectionString.endsWith('"'))
  || (connectionString.startsWith("'") && connectionString.endsWith("'"))) {
  connectionString = connectionString.slice(1, -1);
}
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
try {
  await client.connect();
  await client.query("begin isolation level serializable");
  await client.query("select pg_advisory_xact_lock(hashtext('homophone-contrast-set-release'))");
  const words = [...new Set(rows.map(row => row.word))];
  const lookup = await client.query<{ id: string; normalised_word: string }>(`
    select id,normalised_word from public.canonical_teaching_dictionary_words
    where dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure'
      and normalised_word=any($1::text[])`, [words]);
  const byWord = new Map(lookup.rows.map(row => [row.normalised_word.replaceAll("’", "'"), row.id]));
  if (words.some(word => !byWord.has(word))) throw new Error("Approved dictionary coverage is incomplete");
  for (const [setKey, specification] of expected) {
    const group = grouped.get(setKey)!;
    await client.query(`insert into public.homophone_contrast_sets
      (set_key,revision,micro_skill_key,relation_kind,source_reference)
      values($1,1,$2,$3,$4)`, [setKey, specification.skillKey,
      group[0].reviewed_relation_kind, `contrast-set-review.csv sha256:${sourceHash}`]);
    for (const row of group) {
      await client.query(`insert into public.homophone_contrast_set_members
        (set_key,revision,member_ordinal,canonical_word_id,intended_sense,
          grammatical_role,target_sentence,sense_source_reference)
        values($1,1,$2,$3,$4,$5,$6,$7)`, [setKey, Number(row.member_ordinal), byWord.get(row.word),
        row.intended_sense, row.grammatical_role, row.target_sentence, row.sense_source_reference]);
    }
    await client.query("select public.approve_homophone_contrast_set($1,1,$2,$3)",
      [setKey, group[0].reviewed_by, group[0].approval_reference]);
  }
  await client.query("commit");
  console.log(`Imported 84 approved contrast sets from ${sourceHash}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
