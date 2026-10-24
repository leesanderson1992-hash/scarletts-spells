/** Governed 152-row word/skill support release. Dry-run by default. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { parseCsv } from "./lib/deterministic-csv";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "data/adle/homophone/convergence-v1/contrast-set-review.csv"), "utf8");
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const rows = parseCsv(source).rows;
const manifest = JSON.parse(readFileSync(resolve(root, "data/adle/homophone/convergence-v1/manifest.json"), "utf8")) as {
  skills: Array<{ key: string; routeStatus: string; sets: Array<{ setKey: string; members: string[] }> }>;
};
const newSkills = new Set(manifest.skills.filter(skill => skill.routeStatus !== "retain_v2").map(skill => skill.key));
const selected = rows.filter(row => newSkills.has(row.micro_skill_key));
if (newSkills.size !== 58 || selected.length !== 152 || selected.some(row => row.review_status !== "approved"
  || !row.intended_sense || !row.grammatical_role || !row.target_sentence || !row.approval_reference)
  || new Set(selected.map(row => `${row.micro_skill_key}\u0000${row.word}`)).size !== 152) {
  throw new Error("homophone_support_source_invalid");
}
const action = process.argv[2] ?? "plan";
const environment = "production";
if (!["plan", "apply"].includes(action))
  throw new Error("usage: release-homophone-convergence-support.mts plan|apply --source-sha256=<reviewed-source-sha256>");
const envName = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const envFile = readFileSync(resolve(root, ".env.local"), "utf8");
const line = envFile.split(/\r?\n/).find(value => value.startsWith(`${envName}=`));
const connectionString = (process.env[envName] ?? line?.slice(line.indexOf("=") + 1) ?? "").trim().replace(/^['"]|['"]$/g, "");
if (!connectionString) throw new Error(`homophone_support_connection_missing:${environment}`);
const target = new URL(connectionString);
const projectRef = "wwohrqtunajrbwxyssjf";
if (!target.username.includes(projectRef) || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("homophone_support_target_mismatch");
if (action === "apply" && !process.argv.includes(`--source-sha256=${sourceSha256}`))
  throw new Error("homophone_support_reviewed_source_receipt_required");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
await client.connect();
try {
  await client.query(action === "apply" ? "begin" : "begin read only");
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '45s'");
  if (action === "apply") await client.query("select pg_advisory_xact_lock(hashtext('homophone-convergence-support-v1'))");
  const words = [...new Set(selected.map(row => row.word))];
  const wordRead = await client.query<{ id: string; normalised_word: string }>(`
    select id,normalised_word from canonical_teaching_dictionary_words where dialect_code='en-GB'
      and row_status='active' and review_status='approved_for_first_exposure'
      and normalised_word=any($1::text[])`, [words]);
  const byWord = new Map(wordRead.rows.map(word => [word.normalised_word.replaceAll("’", "'"), word.id]));
  if (wordRead.rows.length !== words.length || byWord.size !== words.length
    || selected.some(row => !byWord.has(row.word)))
    throw new Error("homophone_support_dictionary_coverage_incomplete");
  const catalog = await client.query<{ micro_skill_key: string }>(
    "select micro_skill_key from micro_skill_catalog where micro_skill_key=any($1::text[])", [[...newSkills]]);
  if (catalog.rows.length !== 58) throw new Error("homophone_support_catalog_incomplete");
  const existing = await client.query<{ canonical_word_id: string; micro_skill_key: string; source_row_hash: string }>(`
    select canonical_word_id,micro_skill_key,source_row_hash from canonical_teaching_dictionary_word_support
    where micro_skill_key=any($1::text[]) and row_status='active' and review_status='approved_for_first_exposure'
      and support_role='support_example'`, [[...newSkills]]);
  if (existing.rows.length) throw new Error(`homophone_support_existing_rows_require_reconciliation:${existing.rows.length}`);
  if (action === "plan") {
    console.log(JSON.stringify({ ready: true, environment, newSkills: 58, supportRows: 152,
      distinctWords: words.length, sourceSha256, mutationPerformed: false }));
    await client.query("rollback");
  } else {
    const batch = await client.query<{ id: string }>(`
      insert into canonical_teaching_dictionary_import_batches
        (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
         import_mode,batch_status,source_metadata,imported_by,imported_at)
      values($1,$2,'homophone_convergence_support_v1',$3::jsonb,$4::jsonb,$5::jsonb,
        'admin_import','applied',$6::jsonb,$7,now()) returning id`, [
      "data/adle/homophone/convergence-v1/contrast-set-review.csv", sourceSha256,
      JSON.stringify({ approvedContrastSource: true }), JSON.stringify({ support: 152 }),
      JSON.stringify({ reviewStatus: "approved_for_first_exposure" }),
      JSON.stringify({ sourceSha256, purpose: "homophone_convergence_support" }), "Katie Sanderson approved convergence",
    ]);
    for (const [index, row] of selected.entries()) {
      const sourceRowHash = createHash("sha256").update(`${sourceSha256}:${row.micro_skill_key}:${row.word}`).digest("hex");
      await client.query(`insert into canonical_teaching_dictionary_word_support
        (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
         micro_skill_key,support_role,source_category,source_name,source_use_note,confidence,review_status,
         review_notes,reviewed_by,reviewed_at)
        values($1,$2,'active','contrast-set-review.csv',$3,$4,$5::jsonb,$6,'support_example',
          'internal_reviewed_seed','Katie Sanderson homophone convergence',
          'Approved context contrast for this microskill.','high','approved_for_first_exposure',
          'Exact reviewed meaning and role are in source_metadata.',$7,now())`, [
        batch.rows[0].id, byWord.get(row.word), index + 2, sourceRowHash,
        JSON.stringify({ setKey: row.set_key, intendedSense: row.intended_sense,
          grammaticalRole: row.grammatical_role, targetSentence: row.target_sentence,
          sourceSha256, approvalReference: row.approval_reference }), row.micro_skill_key, row.reviewed_by,
      ]);
    }
    const check = await client.query<{ n: number; skills: number }>(`
      select count(*)::int n,count(distinct micro_skill_key)::int skills
      from canonical_teaching_dictionary_word_support where import_batch_id=$1`, [batch.rows[0].id]);
    if (check.rows[0]?.n !== 152 || check.rows[0]?.skills !== 58)
      throw new Error("homophone_support_release_readback_failed");
    await client.query("commit");
    console.log(JSON.stringify({ environment, batchId: batch.rows[0].id,
      supportRows: check.rows[0].n, skills: check.rows[0].skills, sourceSha256 }));
  }
} catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
finally { await client.end(); }
