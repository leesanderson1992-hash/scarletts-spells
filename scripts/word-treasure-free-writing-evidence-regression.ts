import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractSpellcheckFieldsFromDraftPayload } from "../lib/courses/spelling-analysis-text";

const migrationPath =
  "supabase/migrations/20260628120000_add_word_treasure_free_writing_evidence.sql";
const freeWritingEvidencePath = "lib/rewards/free-writing-evidence.ts";
const learnActionsPath = "app/learn/actions.ts";
const reviewDetailPath = "app/courses/review/[submissionId]/page.tsx";
const reviewCompletionActionsPath =
  "app/courses/review/actions/review-completion-actions.ts";
const taskPagePath = "app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx";

const migration = readFileSync(migrationPath, "utf8");
const freeWritingEvidence = readFileSync(freeWritingEvidencePath, "utf8");
const learnActions = readFileSync(learnActionsPath, "utf8");
const reviewDetail = readFileSync(reviewDetailPath, "utf8");
const reviewCompletionActions = readFileSync(reviewCompletionActionsPath, "utf8");
const taskPage = readFileSync(taskPagePath, "utf8");

const fields = extractSpellcheckFieldsFromDraftPayload({
  "story-block": "I used because twice because it made sense.",
  "copy-prompt": "because",
  "choice-block": "because",
  __field_meta: {
    "story-block": { label: "My story", type: "textarea" },
    "copy-prompt": { label: "Copy this prompt", type: "textarea" },
    "choice-block": { label: "Choose one", type: "select-one" },
  },
  __writing_issue_feedback: [
    {
      attempted_correction: "because",
    },
  ],
});

assert.deepEqual(
  fields.map((field) => field.key),
  ["story-block"],
  "Field extraction must keep authentic writing fields and exclude copied, choice, and returned-retry metadata.",
);

assert.match(
  migration,
  /create table if not exists public\.child_word_treasure_evidence_candidates/,
  "Phase 3.6 must add a suspected evidence table.",
);
for (const column of [
  "task_submission_id",
  "task_id",
  "task_type",
  "source_field_key",
  "writing_sample_id",
  "matched_word",
  "occurrence_count",
  "duplicate_status",
  "confirmation_status",
  "would_award_golden_bar",
  "confirmed_awarded_golden_bar",
]) {
  assert.match(migration, new RegExp(`\\b${column}\\b`), `Missing ${column}.`);
}
assert.match(
  migration,
  /treasure_id,\s*task_submission_id,\s*source_field_key/,
  "Candidates must dedupe to one evidence unit per Word Treasure per task field per submission.",
);
assert.match(
  freeWritingEvidence,
  /FREE_WRITING_EVIDENCE_SOURCE_TYPE = "free_writing_task_field"/,
  "Confirmed evidence must use a stable free-writing task-field source type.",
);
assert.match(
  freeWritingEvidence,
  /getFreeWritingEvidenceSourceEntityId[\s\S]*`\$\{input\.taskId\}:\$\{input\.sourceFieldKey\}`/,
  "Duplicate scope must be stable across resubmissions for the same task field.",
);
assert.match(
  freeWritingEvidence,
  /\.eq\("status", "in_forge"\)/,
  "Suspected evidence should only scan canonical Word Treasures in the Forge.",
);
assert.match(
  freeWritingEvidence,
  /eventType: "authentic_correct_use_recorded"[\s\S]*authenticUseIncrement: 1/,
  "Parent confirmation must create an authentic-correct-use event.",
);
assert.match(
  freeWritingEvidence,
  /authentic_correct_uses_after_forge: nextUseCount/,
  "Parent confirmation must increment canonical post-Forge evidence count.",
);
assert.match(
  freeWritingEvidence,
  /eventType: "golden_bar_awarded"[\s\S]*sourceType: "word_treasure"[\s\S]*sourceEntityId: treasure\.id/,
  "Gold Bar award events must be recorded once per treasure.",
);
assert.match(
  freeWritingEvidence,
  /confirmed_awarded_golden_bar: awardsGoldenBar/,
  "Candidate confirmation must remember whether it awarded a Gold Bar.",
);
assert.match(
  freeWritingEvidence,
  /isMissingEvidenceCandidateTableError[\s\S]*PGRST205[\s\S]*child_word_treasure_evidence_candidates/,
  "Review Work must detect missing candidate-table schema-cache errors during staged rollout.",
);
assert.match(
  freeWritingEvidence,
  /Free-writing evidence candidate table is missing[\s\S]*return \[\] as FreeWritingEvidenceReviewCandidate\[\]/,
  "Review Work detail must not hard-fail when the optional suspected-evidence table has not reached the hosted schema yet.",
);
assert.match(
  learnActions,
  /detectAndStoreFreeWritingEvidenceCandidates\(/,
  "Lesson/test submission must store suspected evidence candidates.",
);
assert.match(
  learnActions,
  /countConfirmedFreeWritingGoldBarsForSubmission\(/,
  "Returned-work popup must read confirmed Gold Bars from the prior reviewed submission.",
);
assert.match(
  learnActions,
  /returnedCorrectionAttemptCount > 0\s*\?\s*undefined\s*:\s*suspectedGoldenBarCount/,
  "Retried spelling correction popups must not surface new suspected Gold Bars.",
);
assert.match(
  reviewDetail,
  /getFreeWritingEvidenceCandidatesForReview\(/,
  "Parent review must load suspected free-writing evidence.",
);
assert.match(
  reviewDetail,
  /name="free_writing_evidence_candidate_id"[\s\S]*defaultChecked/,
  "Parent review forms must surface confirmation checkboxes.",
);
assert.match(
  reviewCompletionActions,
  /confirmFreeWritingEvidenceCandidates\(/,
  "Approve and send-back paths must confirm selected evidence before completing the decision.",
);
assert.match(
  taskPage,
  /label: "Gold Bars estimated:"[\s\S]*suspectedGoldenBars/,
  "Child popup may show suspected Gold Bars as estimates.",
);
assert.match(
  taskPage,
  /label: "Gold Bars confirmed:"[\s\S]*confirmedGoldenBars/,
  "Returned-work popup must be able to show parent-confirmed Gold Bars.",
);
assert.match(
  taskPage,
  /Gold Coins are estimates; confirmed Gold Bars have already been checked by your parent\./,
  "Popup copy must distinguish confirmed Gold Bars from estimated Gold Coins.",
);

for (const source of [learnActions, reviewCompletionActions, freeWritingEvidence]) {
  assert.doesNotMatch(
    source,
    /syncSpellingRewardState|\.from\("spelling_reward_states"\)\s*\.\s*(insert|update|upsert|delete)|\.from\("spelling_reward_events"\)\s*\.\s*(insert|update|upsert|delete)/,
    "Free-writing evidence must not write legacy spelling reward tables or call legacy sync.",
  );
}

console.log("word-treasure-free-writing-evidence-regression: ok");
