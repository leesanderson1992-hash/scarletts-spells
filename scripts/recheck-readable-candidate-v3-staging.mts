/** Recheck the already reviewed readable candidate against the current rule. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { evaluateLessonCandidate, LESSON_CANDIDATE_RULE_REVISION } from
  "../lib/teaching-dictionary-manager/lesson-candidate";
import type { DictionarySenseSet } from "../lib/teaching-dictionary-manager/senses";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=readable-candidate:staging:v3"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
assert(actor, "STAGING_ADMIN_ACTOR_MISSING");
const skill = "D4_MOR_SUFFIXES_ABLE_IBLE";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("select pg_advisory_xact_lock(hashtext($1))", ["readable-candidate-v3-staging"]);
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging' for update`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }], "STAGING_REVIEW_CONTROLS_MUST_BE_CLOSED");
  const word = await db.query<{ id: string; display_word: string }>(`select id,display_word
    from public.canonical_teaching_dictionary_words where normalised_word='readable'
      and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure'`);
  assert.equal(word.rows.length, 1, "REVIEWED_READABLE_WORD_REQUIRED");
  const wordId = word.rows[0].id;
  const sense = await db.query<{ sense_set: DictionarySenseSet }>(`select sense_set from
    public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
  assert.equal(sense.rows.length, 1, "REVIEWED_READABLE_SENSE_REQUIRED");
  assert.equal(sense.rows[0].sense_set.senses.length, 1, "READABLE_SENSE_CHANGED");
  const senseId = sense.rows[0].sense_set.senses[0].id;
  const morphology = await db.query<{ id: string; morphology_parts: unknown;
    morphology_joins: unknown; analysis_status: string; review_status: string; word_sum: string }>(
    `select id,morphology_parts,morphology_joins,analysis_status,review_status,word_sum
      from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id=$1 and row_status='active'`, [wordId]);
  assert.equal(morphology.rows.length, 1, "READABLE_MORPHOLOGY_CHANGED");
  const links = await db.query<{ id: string; sense_id: string; family_key: string;
    component_part_id: string; relationship_kind: string }>(`select id,sense_id,family_key,
      component_part_id,relationship_kind from public.teaching_dictionary_current_sense_family_links
      where canonical_word_id=$1 and sense_id=$2 order by id`, [wordId, senseId]);
  const candidate = evaluateLessonCandidate({ wordId, displayWord: word.rows[0].display_word,
    skillKey: skill, senseId, senseSet: sense.rows[0].sense_set,
    morphology: { parts: morphology.rows[0].morphology_parts,
      joins: morphology.rows[0].morphology_joins,
      analysisStatus: morphology.rows[0].analysis_status,
      reviewStatus: morphology.rows[0].review_status,
      wordSum: morphology.rows[0].word_sum }, familyLinks: links.rows });
  assert.equal(candidate.status, "ready", `READABLE_REVIEW_NEEDED:${candidate.issues.map(row => row.code).join(",")}`);
  const before = await db.query<{ action: string; rule_revision: string }>(`select action,rule_revision
    from public.teaching_dictionary_current_candidate_decisions where environment_key='staging'
      and canonical_word_id=$1 and micro_skill_key=$2 and sense_id=$3`, [wordId, skill, senseId]);
  assert.equal(before.rows.length, 1, "READABLE_APPROVAL_NOT_FOUND");
  assert.equal(before.rows[0].action, "approve");
  if (before.rows[0].rule_revision === LESSON_CANDIDATE_RULE_REVISION) {
    await db.query("rollback");
    console.log(JSON.stringify({ target: "staging", status: "already_current", skill }));
  } else {
    assert(["reviewed_overview_candidate_v1", "reviewed_overview_candidate_v2"]
      .includes(before.rows[0].rule_revision), "UNEXPECTED_PRIOR_RULE_REVISION");
    const snapshot = { senseId, senseSet: sense.rows[0].sense_set,
      morphologyId: morphology.rows[0].id, familyLinkIds: links.rows.map(row => row.id) };
    await db.query(`update public.adle_word_skill_review_controls
      set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
      where environment_key='staging'`);
    await db.query(`select public.reconcile_teaching_dictionary_bulk_review_v6(
      'staging',$1,array[]::uuid[],array[]::uuid[],
      $2::uuid[],array[]::uuid[],array[]::uuid[],
      $3::jsonb,$4,$5,null,$6,$7::jsonb,'teaching_dictionary_bulk')`,
    [skill, [wordId], JSON.stringify({ [wordId]: senseId }), actor, randomUUID(),
      LESSON_CANDIDATE_RULE_REVISION, JSON.stringify({ [wordId]: snapshot })]);
    const after = await db.query<{ action: string; rule_revision: string }>(`select action,rule_revision
      from public.teaching_dictionary_current_candidate_decisions where environment_key='staging'
        and canonical_word_id=$1 and micro_skill_key=$2 and sense_id=$3`, [wordId, skill, senseId]);
    assert.deepEqual(after.rows, [{ action: "approve", rule_revision: LESSON_CANDIDATE_RULE_REVISION }]);
    await db.query(`update public.adle_word_skill_review_controls
      set review_enabled=false,publication_enabled=false,withdrawal_enabled=false
      where environment_key='staging'`);
    await db.query(apply ? "commit" : "rollback");
    console.log(JSON.stringify({ target: "staging", status: apply ? "rechecked" : "rollback_proof",
      skill, ruleRevision: LESSON_CANDIDATE_RULE_REVISION }));
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
