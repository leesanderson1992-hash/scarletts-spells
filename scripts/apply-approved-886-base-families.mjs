#!/usr/bin/env node
/** Import owner-approved morphology and its draft lexical family graph. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const DIRECTORY = "data/adle/homophone/convergence-v1";
const reviewPath = `${DIRECTORY}/full-dictionary-unanalysed-words-review.csv`;
const names = ["full-dictionary-unanalysed-words-review.csv", "approved-886-lexical-base-families.csv", "approved-886-lexical-base-family-members.csv"];
const inputHash = createHash("sha256");
for (const name of names) inputHash.update(readFileSync(resolve(ROOT, DIRECTORY, name)));
const sha = inputHash.digest("hex");
const python = spawnSync("python3", ["-c", `import csv,json,sys
from pathlib import Path
d=Path(sys.argv[1]);print(json.dumps([[dict(r) for r in csv.DictReader((d/n).open(encoding='utf-8',newline=''))] for n in sys.argv[2:]]))`, resolve(ROOT, DIRECTORY), ...names], { encoding: "utf8", maxBuffer: 12 * 1024 * 1024 });
if (python.status !== 0) throw new Error(`CSV_PARSE_FAILED: ${python.stderr}`);
const [review, families, members] = JSON.parse(python.stdout);
if (review.length !== 886 || families.length !== 720 || members.length !== 899 || review.some(r => r.review_status !== "approved"))
  throw new Error("INPUT_COUNTS_OR_APPROVAL_MISMATCH");
const reviewByKey = new Map(review.map(row => [row.word_key, row]));
const familyKeys = new Set(families.map(row => row.family_key));
if (reviewByKey.size !== 886 || familyKeys.size !== 720 || members.some(row => !reviewByKey.has(row.word_key) || !familyKeys.has(row.family_key)))
  throw new Error("INPUT_IDENTITY_MISMATCH");
const envLine = readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .find(value => value.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!envLine) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
let connectionString = envLine.slice(envLine.indexOf("=") + 1).trim();
if ((connectionString.startsWith('"') && connectionString.endsWith('"')) || (connectionString.startsWith("'") && connectionString.endsWith("'")))
  connectionString = connectionString.slice(1, -1);
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const reconcilePos = process.argv.includes("--reconcile-pos");
const finalizeLineage = process.argv.includes("--finalize-lineage");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
try {
  await client.connect();
  await client.query(apply ? "begin" : "begin read only");
  await client.query("set local lock_timeout='5s'");
  await client.query("set local statement_timeout='180s'");
  if (apply) await client.query("select pg_advisory_xact_lock(hashtext('approved-886-lexical-base-families'))");
  const counts = await client.query(`select
    (select count(*)::int from canonical_teaching_dictionary_lexical_base_families) families,
    (select count(*)::int from canonical_teaching_dictionary_lexical_base_family_members) members`);
  if (finalizeLineage) {
    if (counts.rows[0].families !== 720 || counts.rows[0].members !== 899) throw new Error("FINAL_LINEAGE_BASELINE_CHANGED");
    const keysInDb = await client.query("select family_key from canonical_teaching_dictionary_lexical_base_families");
    if (keysInDb.rows.some(row => !familyKeys.has(row.family_key))) throw new Error("FINAL_FAMILY_KEYS_DIFFER_FROM_REVIEW_SHEET");
    const batchId = "8dc07131-088b-4992-9e1d-5dd35b77840b";
    const oldSha = "814fd672e973ffe79f986a987eedfb11f3b5582832786db36ef4e3c86ca822e5";
    const batch = await client.query("select source_folder_sha256,source_metadata from canonical_teaching_dictionary_import_batches where id=$1", [batchId]);
    if (batch.rowCount !== 1 || ![oldSha, sha].includes(batch.rows[0].source_folder_sha256))
      throw new Error("FINAL_LINEAGE_BATCH_CHANGED");
    if (apply) await client.query(`update canonical_teaching_dictionary_import_batches
      set source_folder_sha256=$1,source_metadata=source_metadata || $2::jsonb,updated_at=now()
      where id=$3`, [sha, JSON.stringify({ initial_import_sha256: oldSha, final_review_sheet_sha256: sha,
        post_import_correction: "17 part-of-speech family keys resolved from editorial draft; no morphology or membership content changed" }), batchId]);
    await client.query(apply ? "commit" : "rollback");
    console.log(JSON.stringify({ target: "production", changed: apply, batchId, finalInputSha256: sha }));
    process.exit(0);
  }
  if (reconcilePos) {
    if (counts.rows[0].families !== 720 || counts.rows[0].members !== 899) throw new Error("FAMILY_RECONCILIATION_BASELINE_CHANGED");
    const corrections = families.filter(row => row.pos_source === "editorial_pos_draft");
    if (corrections.length !== 17) throw new Error("POS_CORRECTION_COUNT_MISMATCH");
    const existing = await client.query("select family_key,base_lemma,review_status from canonical_teaching_dictionary_lexical_base_families where base_part_of_speech='unresolved'");
    if (existing.rowCount !== 17 || existing.rows.some(row => row.review_status !== "draft" || !corrections.some(f => f.base_lemma === row.base_lemma)))
      throw new Error("POS_CORRECTION_PRECONDITION_FAILED");
    if (apply) for (const family of corrections) {
      const oldKey = `${family.base_lemma}_unresolved_base_family`;
      await client.query(`insert into canonical_teaching_dictionary_lexical_base_families
        (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,base_meaning,source_reference,review_status)
        select $1,revision,base_lemma,$2,base_kind,canonical_base_word_id,base_meaning,source_reference,'draft'
        from canonical_teaching_dictionary_lexical_base_families where family_key=$3 and revision=1`,
      [family.family_key, family.base_part_of_speech, oldKey]);
      await client.query(`insert into canonical_teaching_dictionary_lexical_base_family_members
        (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
         word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
        select $1,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
         word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference
        from canonical_teaching_dictionary_lexical_base_family_members where family_key=$2 and revision=1`, [family.family_key, oldKey]);
      await client.query("delete from canonical_teaching_dictionary_lexical_base_family_members where family_key=$1 and revision=1", [oldKey]);
      await client.query("delete from canonical_teaching_dictionary_lexical_base_families where family_key=$1 and revision=1", [oldKey]);
    }
    const proof = await client.query(`select
      (select count(*)::int from canonical_teaching_dictionary_lexical_base_families) families,
      (select count(*)::int from canonical_teaching_dictionary_lexical_base_family_members) members,
      (select count(*)::int from canonical_teaching_dictionary_lexical_base_families where base_part_of_speech='unresolved') unresolved`);
    if (apply && JSON.stringify(proof.rows[0]) !== JSON.stringify({ families: 720, members: 899, unresolved: 0 }))
      throw new Error(`POS_CORRECTION_READBACK_FAILED: ${JSON.stringify(proof.rows[0])}`);
    await client.query(apply ? "commit" : "rollback");
    console.log(JSON.stringify({ target: "production", changed: apply, posCorrections: corrections.length,
      ...proof.rows[0] }));
    process.exit(0);
  }
  if (counts.rows[0].families || counts.rows[0].members) throw new Error("LEXICAL_FAMILY_REGISTRY_NOT_EMPTY");
  const keys = review.map(row => row.word_key);
  const source = await client.query(`select w.word_key,w.id,w.normalised_word,w.display_word,w.row_status,w.review_status,
    m.id morphology_id,m.analysis_status,m.review_status morphology_review_status,m.row_status morphology_row_status
    from canonical_teaching_dictionary_words w
    left join canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'
    where w.word_key=any($1::text[]) and w.dialect_code='en-GB'`, [keys]);
  if (source.rowCount !== 886 || source.rows.some(r => r.row_status !== "active" || r.review_status !== "approved_for_first_exposure"))
    throw new Error("CANONICAL_WORD_BASELINE_CHANGED");
  const statusCounts = source.rows.reduce((acc, r) => (acc[r.analysis_status ?? "missing"] = (acc[r.analysis_status ?? "missing"] ?? 0) + 1, acc), {});
  if (statusCounts.approved || (statusCounts.missing ?? 0) !== 883 || Object.values(statusCounts).reduce((a,b)=>a+b,0) !== 886)
    throw new Error(`MORPHOLOGY_BASELINE_CHANGED: ${JSON.stringify(statusCounts)}`);
  const baseKeys = families.filter(row => row.canonical_base_word_key).map(row => row.canonical_base_word_key);
  const baseRows = await client.query("select word_key from canonical_teaching_dictionary_words where word_key=any($1::text[]) and dialect_code='en-GB' and row_status='active' and review_status='approved_for_first_exposure'", [baseKeys]);
  if (baseRows.rowCount !== baseKeys.length) throw new Error("CANONICAL_BASE_BASELINE_CHANGED");
  if (!apply) {
    await client.query("rollback");
    console.log(JSON.stringify({ target: "production", inputSha256: sha, changed: false,
      approvedMorphologyToImport: 886, priorMorphology: statusCounts,
      draftFamiliesToCreate: 720, draftMembersToCreate: 899,
      missingCanonicalBases: 74 }));
    process.exit(0);
  }
  const batchResult = await client.query(`insert into canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
     import_mode,batch_status,source_metadata,imported_by,imported_at)
    values ($1,$2,'approved_886_lexical_base_families_v1',$3,$4,$5,'admin_import','applied',$6,$7,now()) returning id`,
    [DIRECTORY, sha, { errors: 0, content_owner_approved: true },
     { morphology: 886, lexical_families: 720, lexical_members: 899 },
     { family_review_status: "draft", route_activated: false, learner_writes: 0 },
     { approval_reference: review[0].approval_reference, input_sha256: sha }, "Codex owner-approved morphology importer"]);
  const batchId = batchResult.rows[0].id;
  const morphologyPayload = review.map((row, index) => ({
    word_key: row.word_key, source_row_number: index + 2,
    source_row_hash: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
    morphology_parts: JSON.parse(row.morphology_parts_json),
    morphology_joins: JSON.parse(row.morphology_joins_json),
    morphology_transformations: JSON.parse(row.morphology_transformations_json),
    word_sum: row.word_sum_candidate, visible_word_sum: row.visible_word_sum_candidate,
    analysis_kind: row.analysis_kind_candidate, confidence: row.analysis_confidence,
    source_morphemes: row.source_morphemes, approval_reference: row.approval_reference,
    reviewed_by: row.reviewed_by
  }));
  await client.query("update canonical_teaching_dictionary_word_morphology set row_status='retired' where canonical_word_id in (select id from canonical_teaching_dictionary_words where word_key=any($1::text[])) and row_status='active'", [keys]);
  const morphologyInsert = await client.query(`insert into canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
     raw_morpholex_segmentation,morphology_parts,feature_keys,morphology_joins,morphology_transformations,
     word_sum,analysis_status,source_category,source_name,source_url,source_licence,source_use_note,
     confidence,review_status,reviewed_by,reviewed_at,review_notes)
    select $1,w.id,'active',$2,r.source_row_number,r.source_row_hash,
      jsonb_build_object('approvalReference',r.approval_reference,'visibleWordSum',r.visible_word_sum,'analysisKind',r.analysis_kind),
      r.source_morphemes,r.morphology_parts,'[]'::jsonb,r.morphology_joins,r.morphology_transformations,
      r.word_sum,'approved','internal_reviewed_seed','Full dictionary morphology content owner review',$2,'internal',
      'Owner-approved structured morphology with raw MorphoLex evidence retained.',r.confidence,
      'approved_for_first_exposure',r.reviewed_by,now(),r.approval_reference
    from jsonb_to_recordset($3::jsonb) as r(word_key text,source_row_number int,source_row_hash text,
      morphology_parts jsonb,morphology_joins jsonb,morphology_transformations jsonb,word_sum text,
      visible_word_sum text,analysis_kind text,confidence text,source_morphemes text,approval_reference text,reviewed_by text)
    join canonical_teaching_dictionary_words w on w.word_key=r.word_key`, [batchId, reviewPath, JSON.stringify(morphologyPayload)]);
  if (morphologyInsert.rowCount !== 886) throw new Error("MORPHOLOGY_INSERT_COUNT_MISMATCH");
  const familyInsert = await client.query(`insert into canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,
     base_meaning,source_reference,review_status)
    select r.family_key,r.revision,r.base_lemma,r.base_part_of_speech,r.base_kind,w.id,
      r.base_meaning,r.source_reference,'draft'
    from jsonb_to_recordset($1::jsonb) as r(family_key text,revision int,base_lemma text,
      base_part_of_speech text,base_kind text,canonical_base_word_key text,base_meaning text,source_reference text)
    left join canonical_teaching_dictionary_words w on w.word_key=r.canonical_base_word_key`, [JSON.stringify(families)]);
  if (familyInsert.rowCount !== 720) throw new Error("FAMILY_INSERT_COUNT_MISMATCH");
  const memberInsert = await client.query(`insert into canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
     word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
    select r.family_key,r.revision,w.id,r.word_part_of_speech,r.relationship_kind,m.id,
      r.word_sum,r.morphology_parts,r.morphology_joins,r.morphology_transformations,r.intended_meaning,r.source_reference
    from jsonb_to_recordset($1::jsonb) as r(family_key text,revision int,word_key text,word_part_of_speech text,
      relationship_kind text,word_sum text,morphology_parts jsonb,morphology_joins jsonb,
      morphology_transformations jsonb,intended_meaning text,source_reference text)
    join canonical_teaching_dictionary_words w on w.word_key=r.word_key
    join canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'
    where m.import_batch_id=$2`, [JSON.stringify(members.map(({ morphology_parts_json, morphology_joins_json,
    morphology_transformations_json, ...rest }) => ({ ...rest,
      morphology_parts: JSON.parse(morphology_parts_json), morphology_joins: JSON.parse(morphology_joins_json),
      morphology_transformations: JSON.parse(morphology_transformations_json) }))), batchId]);
  if (memberInsert.rowCount !== 899) throw new Error("MEMBER_INSERT_COUNT_MISMATCH");
  const proof = await client.query(`select
    (select count(*)::int from canonical_teaching_dictionary_word_morphology where import_batch_id=$1 and row_status='active' and analysis_status='approved') morphology,
    (select count(*)::int from canonical_teaching_dictionary_lexical_base_families where review_status='draft') families,
    (select count(*)::int from canonical_teaching_dictionary_lexical_base_family_members) members,
    (select count(distinct canonical_word_id)::int from canonical_teaching_dictionary_lexical_base_family_members) words`, [batchId]);
  if (JSON.stringify(proof.rows[0]) !== JSON.stringify({ morphology: 886, families: 720, members: 899, words: 886 }))
    throw new Error(`PRODUCTION_READBACK_FAILED: ${JSON.stringify(proof.rows[0])}`);
  await client.query("commit");
  console.log(JSON.stringify({ target: "production", inputSha256: sha, batchId, changed: true, ...proof.rows[0] }));
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally { await client.end().catch(() => {}); }
