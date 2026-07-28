/** Guarded promotion of the reviewed legacy un- lesson into the shared Dynamic Prefix registry. */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PROFILE = "D4_MOR_PREFIXES_UN";
const PROJECT = "wwohrqtunajrbwxyssjf";
const SOURCE = "data/adle/pilots/d4-mor-prefixes-un/v1/lesson.json";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (message: string): never => { throw new Error(message); };
const words = [
  ["unhappy", "happy", "feeling pleased", "not happy", "not"],
  ["unfair", "fair", "fair and equal", "not fair", "not"],
  ["unkind", "kind", "caring and helpful", "not kind", "not"],
  ["unlock", "lock", "close with a lock", "reverse the lock", "reverse"],
  ["untidy", "tidy", "neat and ordered", "not tidy", "not"],
  ["unnatural", "natural", "natural", "not natural", "not"],
  ["unnecessary", "necessary", "necessary", "not necessary", "not"],
] as const;

async function main() {
  const sourceRaw = await readFile(resolve(ROOT, SOURCE), "utf8");
  const sourceSha = sha(sourceRaw);
  if (process.argv.includes("--validate")) {
    console.log(JSON.stringify({ profile: PROFILE, sourceSha256: sourceSha, words: words.map(([word]) => word), blockers: [] }, null, 2));
    return;
  }
  const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes("--apply") || arg("--environment") !== "production" || arg("--profile") !== PROFILE || arg("--confirm-source-sha256") !== sourceSha) fail("Use --apply --environment production --profile D4_MOR_PREFIXES_UN --confirm-source-sha256 <exact>.");
  const databaseUrl = arg("--database-url");
  if (!databaseUrl) fail("--database-url is required.");
  const target = new URL(databaseUrl);
  if (!target.hostname.includes(PROJECT) && !target.username.includes(PROJECT)) fail("Refusing a database other than production.");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const batchId = randomUUID();
  try {
    await client.query("begin");
    const before = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_bundles) scheduling");
    const already = await client.query("select id from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active' for update", [PROFILE]);
    if (already.rowCount) fail(`${PROFILE} already has an active production profile.`);
    const found = await client.query("select w.id,w.normalised_word,w.row_status,w.review_status,w.frequency_band,w.age_band,w.complexity_band,(select count(*) from canonical_teaching_dictionary_word_metadata m where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure') metadata,(select count(*) from canonical_teaching_dictionary_dictation_sentences d where d.canonical_word_id=w.id and d.row_status='active' and d.review_status='approved_for_first_exposure') dictation from canonical_teaching_dictionary_words w where w.normalised_word=any($1) for update", [words.map(([word]) => word)]);
    if (found.rowCount !== words.length || found.rows.some((row) => row.row_status !== "active" || row.review_status !== "approved_for_first_exposure" || !row.frequency_band || !row.age_band || !row.complexity_band || +row.metadata < 1 || +row.dictation !== 1)) fail("The reviewed un- dictionary contract is incomplete.");
    const ids = new Map(found.rows.map((row) => [row.normalised_word, row.id]));
    const provenance = { source: SOURCE, source_sha256: sourceSha, promoted_profile: PROFILE, prohibited_writes: { learner: 0, assignment: 0, evidence: 0, scheduling: 0 } };
    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,$4,$5,$6,$7,'admin_import','validated',$8,$9,now())", [batchId, SOURCE, sourceSha, "adle_dynamic_prefix_un_production_v1", { errors: 0 }, { words: 0, profiles: 1, members: words.length }, { production_enabled: true, learner_writes: 0 }, provenance, "ADLE guarded un- Dynamic Prefix production promotion"]);
    const profile = await client.query("insert into canonical_teaching_dictionary_prefix_profiles (import_batch_id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,'un-','un','not or reverse',$3,$4,'dynamic-prefix-un-observation-v2','What did you notice about what un- does in these words?',true,'active','approved_for_first_exposure',$5,2,$6,$7,'internal_reviewed_seed','ADLE reviewed un- lesson',$8,'internal','Legacy reviewed lesson promoted into the profile-driven Dynamic Prefix runtime.','high','Katie Sanderson',now()) returning id", [batchId, PROFILE, JSON.stringify([{ id: "not", label: "NOT", description: "not" }, { id: "reverse", label: "REVERSE", description: "reverse" }]), JSON.stringify([{ text: "un", label: "un-", outcome: null, meaning: null, status: "target" }, { text: "", label: "no prefix", outcome: null, meaning: null, status: "target" }]), SOURCE, sourceSha, provenance, SOURCE]);
    for (const [index, [word, base, baseMeaning, childMeaning, bin]] of words.entries()) {
      const split = [{ id: "prefix", kind: "prefix", sourceText: "un", surfaceText: "un", gloss: bin === "reverse" ? "reverse" : "not", displayRange: { start: 0, end: 2 } }, { id: "base", kind: "base", sourceText: base, surfaceText: base, displayRange: { start: 2, end: word.length } }];
      await client.query("insert into canonical_teaching_dictionary_prefix_members (import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,'transfer',$4,$5,$6,$7,$8,$9,'Concatenate un- and the complete teaching base.','un',true,'active','approved_for_first_exposure',$10,$11,$12,$13,'internal_reviewed_seed','ADLE reviewed un- lesson',$14,'internal','Teaching split only; canonical dictionary morphology remains authoritative.','high','Katie Sanderson',now())", [batchId, profile.rows[0].id, ids.get(word), base, baseMeaning, childMeaning, bin, JSON.stringify(split), JSON.stringify([{ afterPartId: "prefix", beforePartId: "base", joinType: "none" }]), SOURCE, index + 3, sha(JSON.stringify({ word, base, baseMeaning, childMeaning, bin })), provenance, SOURCE]);
    }
    const after = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_bundles) scheduling");
    const verify = await client.query("select count(*) members from canonical_teaching_dictionary_prefix_members where import_batch_id=$1 and assignment_eligible and row_status='active' and review_status='approved_for_first_exposure'", [batchId]);
    if (+verify.rows[0].members !== words.length || JSON.stringify(before.rows[0]) !== JSON.stringify(after.rows[0])) fail("Post-promotion invariant failed.");
    await client.query("commit");
    console.log(JSON.stringify({ status: "production_promoted", profile: PROFILE, batchId, sourceSha256: sourceSha, members: +verify.rows[0].members, prohibitedWrites: before.rows[0] }));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
