import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildAdleParentIssueSourceEntityId,
  classifyAdditionalSpellingOccurrence,
  findAdleWritingOccurrences,
} from "../lib/adle/review-work/additional-spelling";
import { analyseParentAddedMisspellingPair } from "../lib/writing-engine/spelling/parent-added-misspelling-analysis";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const overlapping = classifyAdditionalSpellingOccurrence({
  positionStart: 4,
  positionEnd: 13,
  observedSpelling: "imposible",
  correctSpelling: "impossible",
  targets: [{
    encounterId: "target-1",
    canonicalSpelling: "impossible",
    originalOutcomeSource: "writing",
    originalObservedSpelling: "imposible",
    positionStart: 4,
    positionEnd: 13,
  }],
});
assert.deepEqual(overlapping, {
  status: "already_captured",
  encounterId: "target-1",
  reason: "overlapping_target_occurrence",
});

const distinctOccurrence = classifyAdditionalSpellingOccurrence({
  positionStart: 40,
  positionEnd: 49,
  observedSpelling: "imposible",
  correctSpelling: "impossible",
  targets: [{
    encounterId: "target-1",
    canonicalSpelling: "impossible",
    originalOutcomeSource: "writing",
    originalObservedSpelling: "imposible",
    positionStart: 4,
    positionEnd: 13,
  }],
});
assert.deepEqual(distinctOccurrence, { status: "allowed" });

const audioOccurrence = classifyAdditionalSpellingOccurrence({
  positionStart: 4,
  positionEnd: 13,
  observedSpelling: "imposible",
  correctSpelling: "impossible",
  targets: [{
    encounterId: "target-1",
    canonicalSpelling: "impossible",
    originalOutcomeSource: "audio_retrieval_check",
    originalObservedSpelling: null,
    positionStart: null,
    positionEnd: null,
  }],
});
assert.deepEqual(audioOccurrence, { status: "allowed" });

assert.deepEqual(
  findAdleWritingOccurrences("A seperate task and a seperate plan.", "seperate").map(
    ({ start, end }) => ({ start, end }),
  ),
  [
    { start: 2, end: 10 },
    { start: 22, end: 30 },
  ],
);
assert.deepEqual(findAdleWritingOccurrences("No match here.", "seperate"), []);

assert.equal(
  buildAdleParentIssueSourceEntityId({
    reviewSessionId: "session-1",
    positionStart: 4,
    positionEnd: 13,
    observedSpelling: "IMPOSIBLE",
    correctSpelling: "Impossible",
  }),
  "adle_review_submitted_writing_parent_identified:session-1:4-13:imposible:impossible",
);

const actions = read("app/courses/review/actions/adle-review-work-actions.ts");
const submitAction = actions.slice(
  actions.indexOf("export async function submitAdleReviewWorkInspection"),
  actions.indexOf("function parseOccurrence"),
);
assert.match(submitAction, /resolution_status", "needs_route"/);
assert.match(submitAction, /adle_review_parent_reviews/);
for (const forbidden of [
  "task_submissions",
  "task_completions",
  "assignment_items",
  "daily_assignments",
  "adle_review_schedule_words",
  "adle_review_outcome_events",
  "coin_ledger",
  "authentic_use",
]) {
  assert.doesNotMatch(submitAction, new RegExp(forbidden));
}

assert.match(actions, /analyseParentAddedMisspellingPair/);
assert.match(actions, /analysis_payload/);
assert.match(actions, /resolution_status: "confirmed"/);
assert.match(actions, /resolution_status: "sent_to_admin"/);
assert.match(actions, /resolution_status: "not_a_learning_issue"/);
assert.match(actions, /intakeApprovedAdleReviewCorrection/);

for (const forbiddenImport of [
  "review-completion-actions",
  "adle/review-v3/r5",
  "review-scheduler",
  "free-writing-evidence",
  "rewards/adle-learning-item-bridges",
  "task-completion",
  "word-treasure",
  "golden-nugget",
  "course-coins",
]) {
  assert.doesNotMatch(actions, new RegExp(`from [^\\n]*${forbiddenImport}`));
}
for (const forbiddenWrite of [
  "child_word_treasures",
  "writing_issue_correction_attempts",
  "correction_attempted_at",
  "task_submissions",
]) {
  assert.doesNotMatch(actions, new RegExp(`\\.from\\(["']${forbiddenWrite}["']\\)`));
}

const readModel = read("lib/adle/review-work/read-model.ts");
assert.match(readModel, /progressionRole: "none"/);
assert.match(readModel, /learnerReviewCompleted: true/);
assert.match(readModel, /available_to_review/);
assert.doesNotMatch(readModel, /parent_review_status/);

const queue = read("app/courses/review/page.tsx");
assert.match(queue, /New completed Review/);
assert.match(queue, /learner Review already complete/);
assert.match(queue, /sourceType: "lesson_submission"/);

const detail = read("app/courses/review/[submissionId]/page.tsx");
assert.match(detail, /Parent inspection does not affect completion, schedules or rewards/);
assert.match(detail, /reviewEntry\.sourceType === "adle_review_v3"/);

const sections = read("app/courses/review/adle-review-sections.tsx");
assert.match(sections, /UnifiedSpellingReviewTable/);
assert.match(sections, /reviewWorkflowPhase="adle_observational"/);
assert.match(sections, /View Target Word details/);
assert.match(sections, /label: "Successful"/);
assert.match(sections, /label: "Repaired"/);
assert.match(sections, /label: "Missed"/);
assert.match(sections, />\s*Submit\s*</);
assert.doesNotMatch(sections, /Mark reviewed|Confirm spelling issue/);

const unifiedTable = read("app/courses/review/unified-spelling-review-table.tsx");
assert.match(unifiedTable, /adle_parent_added_missed_word/);
assert.match(unifiedTable, /adle_observational/);
assert.match(unifiedTable, /sendAdleReviewParentSpellingCandidateToCatalog/);
assert.match(unifiedTable, /rejectAdleReviewParentSpellingCandidate/);

const fixture = read("app/dev/adle/review-work/fixture.tsx");
assert.match(fixture, /UnifiedSpellingReviewTable/);
assert.match(fixture, /AdleWritingIssuePicker/);
assert.match(fixture, /addFixtureMisspelling/);
assert.match(fixture, /analyseParentAddedMisspellingPair/);
assert.match(fixture, /setRows\(\(current\) => \[\.\.\.current, newRow\]\)/);
assert.doesNotMatch(fixture, /Fixture add form is ready/);
assert.match(fixture, /definately/);
assert.match(fixture, /seperate/);
assert.match(fixture, /formatErrorPatternLabel\(input\.pattern\)/);
assert.match(fixture, /words: \["impossible", "necessary"\]/);
assert.match(fixture, /words: \["environment", "receive"\]/);

assert.deepEqual(
  analyseParentAddedMisspellingPair({
    observedSpelling: "  DEFINATELY ",
    correctSpelling: "Definitely",
  }),
  {
    observedSpelling: "definately",
    correctSpelling: "definitely",
    detectedErrorPattern: "root_family_preservation_error",
    primaryCategory: "Morphology",
    secondaryCategory: null,
    selectedWordFamilyId: "igh-ie-y",
  },
);
assert.deepEqual(
  analyseParentAddedMisspellingPair({
    observedSpelling: "seperate",
    correctSpelling: "separate",
  }),
  {
    observedSpelling: "seperate",
    correctSpelling: "separate",
    detectedErrorPattern: "wrong_vowel_grapheme",
    primaryCategory: "Phonic",
    secondaryCategory: "Pattern/rule",
    selectedWordFamilyId: "schwa_unstressed_vowel",
  },
);

const migration = read("supabase/migrations/20260827120000_add_adle_review_parent_observation.sql");
assert.match(migration, /num_nonnulls\(source_submission_id, source_adle_review_session_id\) = 1/);
assert.match(migration, /service_role/);
assert.match(migration, /stage = 'completed'/);
assert.match(migration, /canonical intake source guard preflight failed/);
assert.match(migration, /source_adle_review_session_id, child_id/);
assert.match(migration, /analysis_payload jsonb/);
assert.match(migration, /resolution_status/);
assert.match(migration, /source_adle_review_parent_issue_link_id/);
assert.match(migration, /adle_parent_added_missed_word/);
assert.match(migration, /resume_adle_spelling_catalog_review_case_admin/);

const recommendationService = read(
  "lib/writing-engine/persistence/spelling-canonical-recommendation-service.ts",
);
assert.match(recommendationService, /adle_parent_added_missed_word/);
assert.match(recommendationService, /ensureCanonicalRecommendationForCandidateMapping/);
assert.match(actions, /ensureCanonicalRecommendationForCandidateMapping/);

const adminRoute = read("lib/adle/review-work/admin-catalog-route.ts");
assert.match(adminRoute, /intakeApprovedAdleReviewCorrection/);
assert.match(adminRoute, /resolution_status: "confirmed"/);
for (const forbidden of [
  "child_word_treasures",
  "writing_issues",
  "writing_issue_correction_attempts",
  "task_submissions",
]) {
  assert.doesNotMatch(adminRoute, new RegExp(`\\.from\\(["']${forbidden}["']\\)`));
}

const adminCatalogActions = read("app/admin/catalog-review/actions.ts");
assert.match(adminCatalogActions, /applyAdleCatalogReviewDecision/);
assert.match(
  adminCatalogActions,
  /source_provenance\s*!==\s*[\r\n\s]*"adle_review_submitted_writing_parent_identified"[\s\S]*surfaceReturnedCorrectionReplayRecommendations/,
);

for (const legacyFunctionSource of [
  read("supabase/migrations/20260804210000_add_adle_canonical_intake_demands.sql"),
  read("supabase/migrations/20260804223000_qualify_adle_canonical_intake_blocked_links.sql"),
  read("supabase/migrations/20260809150000_integrate_base_word_release_authority.sql"),
]) {
  assert.match(legacyFunctionSource, /v_source\.task_submission_id is null/i);
  assert.match(
    legacyFunctionSource,
    /source_candidate_mapping_id\s*,\s*source_submission_id\s*,\s*child_id/i,
  );
}

const canonicalIntake = read("lib/adle/loaders/canonical-intake-live.ts");
assert.match(canonicalIntake, /intakeApprovedAdleReviewCorrection/);
assert.match(canonicalIntake, /source_adle_review_session_id/);
assert.match(canonicalIntake, /exactly one governed source/);
assert.match(canonicalIntake, /no single governed anchor/);

const protectedCourseFiles = [
  "lib/submissions/status.ts",
  "lib/courses/progress.ts",
  "lib/rewards/course-coins.ts",
];
for (const path of protectedCourseFiles) {
  assert.doesNotMatch(read(path), /adle_review_parent_reviews|available_to_review/);
}

console.log("adle-review-work-regression: ok");
