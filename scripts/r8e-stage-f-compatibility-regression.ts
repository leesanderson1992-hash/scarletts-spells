import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260828150000_materialize_r8e_stage_f_historical_occurrence_sources.sql",
  "utf8",
);
const repairRunner = readFileSync("scripts/r8e-historical-repair.ts", "utf8");
const sqlProof = readFileSync(
  "scripts/sql/prove-r8e-stage-f-compatibility-local.sql",
  "utf8",
);

const exactOccurrences = [
  "a38d85fc-ea0f-4190-b87c-4a0a24420037",
  "852e2923-9622-4668-b659-923c2d018530",
  "a659de3f-ab82-481b-9b2f-2a4fefb1385f",
  "76a6e7fc-7460-4f4f-b8b5-7a5e65c77f2d",
  "3ebb3ecb-ad41-4461-b571-db340373ed9e",
  "5e6bc904-d0c3-431b-a9aa-004650454e81",
  "9b306e4f-e3c6-4699-9de0-59c4934b927e",
];

assert.match(
  migration,
  /create function public\.materialize_r8e_stage_f_historical_occurrence_source\([\s\S]*p_source_misspelling_instance_id uuid,[\s\S]*p_expected_parent_user_id uuid,[\s\S]*p_expected_child_id uuid/,
);
for (const occurrenceId of exactOccurrences) {
  assert.equal(
    migration.split(occurrenceId).length - 1,
    1,
    `compatibility manifest must contain ${occurrenceId} exactly once`,
  );
}
assert.equal(
  (migration.match(/'historical_stage_f_canonical_reconstruction'/g) ?? [])
    .length >= 3,
  true,
  "reconstructed sources must carry explicit Stage-F provenance",
);
assert.match(
  migration,
  /returned_correction_stage_f_replay[\s\S]*attached_verified_route[\s\S]*canonical_mapping[\s\S]*dry_run_first/,
);
assert.match(
  migration,
  /review_case\.case_status = 'add_canonical_mapping'[\s\S]*decision\.decision_type = 'add_canonical_mapping'[\s\S]*decision\.previous_status = 'open'[\s\S]*mapping\.source_case_id = v_case\.id[\s\S]*mapping\.source_decision_id = v_decision\.id/,
);
assert.match(
  migration,
  /mapping\.mapping_status = 'active'[\s\S]*mapping\.resolver_visibility_status = 'visible'[\s\S]*resolver_visibility_enabled/,
);
assert.match(
  migration,
  /v_authority_count <> 1[\s\S]*ambiguous historical canonical authority/,
);
assert.match(
  migration,
  /conflict\.correct_spelling_normalized <> v_mapping\.correct_spelling_normalized[\s\S]*conflicting governed canonical authority/,
);
assert.match(
  migration,
  /already represented by a different governed source[\s\S]*action', 'reused'/,
);
assert.match(
  migration,
  /candidate_status,[\s\S]*promotion_scope,[\s\S]*canonical_intake_handoff_state[\s\S]*'parent_local_promoted',[\s\S]*'parent_local',[\s\S]*'awaiting_r8c_exact_id_handoff'/,
);
assert.match(
  migration,
  /revoke all on function public\.materialize_r8e_stage_f_historical_occurrence_source\([\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role/,
);
assert.doesNotMatch(
  migration,
  /create or replace function public\.(?:ensure_parent_approved_spelling_occurrence_source|adle_authorize_parent_approval_exact_id_handoff|adle_reconcile_parent_spelling_decision_r8d)/,
  "compatibility must not replace R8B, R8C, or R8D",
);

for (const historicalTable of [
  "writing_issues",
  "misspelling_instances",
  "writing_issue_correction_attempts",
  "spelling_catalog_review_cases",
  "spelling_catalog_review_case_decisions",
  "spelling_canonical_mappings",
  "spelling_canonical_mapping_events",
  "learning_items",
  "learning_item_issue_links",
  "learning_item_evidence",
]) {
  assert.equal(
    new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${historicalTable}`, "i")
      .test(migration),
    false,
    `compatibility must not mutate historical table ${historicalTable}`,
  );
}
for (const forbiddenTable of [
  "adle_canonical_intake_candidates",
  "adle_learning_items",
  "adle_learning_item_sources",
  "adle_review_schedule_words",
  "adle_review_schedule_word_routes",
  "daily_assignments",
  "adle_review_sessions",
  "adle_review_word_encounters",
  "adle_review_r6_child_rollouts",
]) {
  assert.equal(
    new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${forbiddenTable}`, "i")
      .test(migration),
    false,
    `compatibility must not write downstream table ${forbiddenTable}`,
  );
}

assert.match(
  repairRunner,
  /historical_stage_f_canonical_reconstruction[\s\S]*materialize_r8e_stage_f_historical_occurrence_source/,
  "the future R8E runner must use the dedicated compatibility RPC",
);
assert.match(
  repairRunner,
  /stageFCompatibility[\s\S]*ensure_parent_approved_spelling_occurrence_source/,
  "non-Stage-F missing sources must stay on normal R8B",
);

for (const proof of [
  "normal_r8b_rejection_preserved",
  "changed word did not fail closed",
  "changed micro-skill did not fail closed",
  "no longer has a final learning decision",
  "missing Stage-F provenance did not fail closed",
  "changed canonical mapping did not fail closed",
  "ambiguous authority did not fail closed",
  "foreign live source did not fail closed",
  "Stage-F idempotent reuse failed",
  "historical/admin rows changed during materialization",
  "R8C did not hand off all seven exact Stage-F sources",
]) {
  assert.equal(sqlProof.includes(proof), true, `missing local proof: ${proof}`);
}

process.stdout.write(
  `${JSON.stringify({
    status: "PASS",
    exactOccurrenceAllowlist: exactOccurrences.length,
    normalR8BUnchanged: true,
    r8cExactIdHandoffUnchanged: true,
    r8dProtectionUnchanged: true,
    historicalMutationStatements: 0,
    downstreamOrReviewMutationStatements: 0,
    serviceOnlyRpc: true,
  }, null, 2)}\n`,
);
