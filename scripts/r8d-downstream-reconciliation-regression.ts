import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  parseR8DReconciliationResult,
  R8D_LEARNING_CLASSIFICATIONS,
} from "../lib/adle/canonical-intake/downstream-reconciliation";

const candidateA = "10000000-0000-4000-8000-000000000001";
const candidateB = "10000000-0000-4000-8000-000000000002";
const base = {
  ok: true,
  replayed: false,
  writingIssueId: "10000000-0000-4000-8000-000000000003",
  sourceCandidateMappingId: candidateA,
  replacementCandidateMappingId: null,
  replacementCandidateMappingIds: [],
  newFinalClassification: "not_an_issue",
  reconciliationClass: "protected_review_history",
  authoritativeSourceCountAfter: 0,
  targetAction: "superseded_last_source",
  scheduleAction: "future_review_stopped",
  protectedHistoryCounts: {
    assignments: 1,
    reviewSessions: 1,
    reviewEncounters: 1,
    reviewOutcomes: 1,
  },
  nextAuthorityVersion: 2,
  replacementRequiresCanonicalIntake: false,
};

assert.deepEqual(parseR8DReconciliationResult(base), base);
assert.deepEqual(
  parseR8DReconciliationResult({
    ...base,
    replacementCandidateMappingId: candidateB,
    replacementCandidateMappingIds: [candidateB],
    newFinalClassification: "concept_gap",
    reconciliationClass: "intake_without_teaching",
    replacementRequiresCanonicalIntake: true,
  }).replacementCandidateMappingIds,
  [candidateB],
);
assert.throws(
  () =>
    parseR8DReconciliationResult({
      ...base,
      replacementRequiresCanonicalIntake: true,
    }),
  /no exact governed source set/,
);
assert.throws(
  () =>
    parseR8DReconciliationResult({
      ...base,
      reconciliationClass: "destructive_delete",
    }),
  /unknown class/,
);
assert.deepEqual([...R8D_LEARNING_CLASSIFICATIONS].sort(), [
  "concept_gap",
  "fragile_knowledge",
  "transfer_failure",
]);

const migration = readFileSync(
  "supabase/migrations/20260828140000_reconcile_downstream_spelling_authority.sql",
  "utf8",
);
const orchestration = readFileSync(
  "lib/adle/canonical-intake/downstream-reconciliation.ts",
  "utf8",
);
const promotionRepository = readFileSync(
  "lib/writing-engine/persistence/spelling-candidate-mapping-promotion.ts",
  "utf8",
);
const candidateAction = readFileSync(
  "app/courses/review/actions/candidate-mapping-actions.ts",
  "utf8",
);
const sqlProof = readFileSync(
  "scripts/sql/prove-r8d-downstream-reconciliation-local.sql",
  "utf8",
);
assert.match(migration, /adle_spelling_decision_reconciliations_append_only/);
assert.match(migration, /adle_authoritative_learning_source_count_r8d/);
assert.match(
  migration,
  /adle_spelling_source_requires_reconciliation_r8d[\s\S]*adle_canonical_intake_candidates[\s\S]*adle_learning_item_sources/,
);
assert.match(
  migration,
  /create or replace function public\.protect_r8b_canonical_intake_handoff_state[\s\S]*A consumed spelling source requires the governed R8D reconciliation path/,
);
assert.match(
  migration,
  /adle_spelling_occurrence_requires_reconciliation_r8d[\s\S]*A consumed spelling decision requires the governed R8D reconciliation path/,
);
assert.match(migration, /R8D cannot safely reconcile an active legacy schedule without route authority/);
assert.match(migration, /update public\.adle_learning_item_sources[\s\S]*row_status = 'superseded'/);
assert.match(migration, /update public\.adle_review_schedule_word_routes[\s\S]*row_status = 'superseded'/);
assert.match(migration, /update public\.adle_review_schedule_words[\s\S]*row_status = 'superseded'/);
assert.doesNotMatch(migration, /delete from public\.adle_/);
assert.match(
  migration,
  /ensure_parent_approved_spelling_occurrence_source[\s\S]*adle_authorize_parent_approval_exact_id_handoff/,
);
assert.match(
  orchestration,
  /adle_reconcile_parent_spelling_decision_r8d[\s\S]*intakeApprovedExactSubmissionCorrections/,
);
assert.match(
  promotionRepository,
  /consumed spelling source requires the governed R8D reconciliation path[\s\S]*R8D_CONSUMED_SOURCE_REVERSION_MESSAGE/,
);
assert.match(
  candidateAction,
  /error\.message === R8D_CONSUMED_SOURCE_REVERSION_MESSAGE[\s\S]*\? R8D_CONSUMED_SOURCE_REVERSION_MESSAGE/,
);
assert.match(
  sqlProof,
  /fixture_key in \([\s\S]*'intake'[\s\S]*'reviewed'[\s\S]*'wordonly'[\s\S]*then null/,
);
assert.match(
  sqlProof,
  /r8d_unconsumed_legacy_reversion[\s\S]*pending_parent_promotion[\s\S]*rollback to savepoint/,
);
assert.match(
  sqlProof,
  /'intake','shared_active_target'[\s\S]*'intake_last','intake_without_teaching'[\s\S]*'reviewed','shared_active_target'[\s\S]*'reviewed_last','protected_review_history'/,
);

console.log(
  "r8d-downstream-reconciliation-regression: governed response, consumed legacy/R8C trust boundary, backwards-compatible missing intake, source counting, protected history, replacement orchestration",
);
