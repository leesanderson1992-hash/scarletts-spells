import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getReturnedCorrectionEvidenceFlags,
  returnedCorrectionMatchesApprovedReplacement,
} from "../lib/lessons/returned-correction-evidence";

const learnActionsPath = "app/learn/actions.ts";
const reviewCompletionActionsPath =
  "app/courses/review/actions/review-completion-actions.ts";
const wordTreasuresPath = "lib/rewards/word-treasures.ts";

const learnActions = readFileSync(learnActionsPath, "utf8");
const reviewCompletionActions = readFileSync(reviewCompletionActionsPath, "utf8");
const wordTreasures = readFileSync(wordTreasuresPath, "utf8");

assert.equal(
  returnedCorrectionMatchesApprovedReplacement({
    approvedReplacement: "Definitely",
    attemptedCorrection: " definitely ",
  }),
  true,
);
assert.equal(
  returnedCorrectionMatchesApprovedReplacement({
    approvedReplacement: "definitely",
    attemptedCorrection: "defiantly",
  }),
  false,
);
assert.deepEqual(
  getReturnedCorrectionEvidenceFlags({
    approvedReplacement: "because",
    attemptedCorrection: "becuase",
  }),
  {
    markedFixed: false,
    correctedIndependently: false,
  },
);
assert.deepEqual(
  getReturnedCorrectionEvidenceFlags({
    approvedReplacement: "because",
    attemptedCorrection: "because",
  }),
  {
    markedFixed: true,
    correctedIndependently: true,
  },
);

assert.match(
  learnActions,
  /getReturnedCorrectionEvidenceFlags\([\s\S]*approvedReplacement: issue\.approved_replacement[\s\S]*attemptedCorrection/,
  "Child retry evidence flags must be derived from approved replacement comparison.",
);
assert.doesNotMatch(
  learnActions,
  /marked_fixed:\s*retryMode === "try_again" \? Boolean\(attemptedCorrection\)/,
  "Non-empty retry text must not be optimistically marked fixed.",
);
assert.doesNotMatch(
  learnActions,
  /corrected_independently:\s*true/,
  "Correction attempts must not always be recorded as independently corrected.",
);
assert.match(
  learnActions,
  /approved_replacement_match: evidenceFlags\.markedFixed/,
  "Correction attempt metadata must preserve approved-replacement match truth.",
);

assert.match(
  reviewCompletionActions,
  /finalise_writing_issue_classification_and_learning_item[\s\S]*createOrUpdateGoldenNuggetFromParentApproval/,
  "Parent finalisation must create/update Word Treasure only after the finalisation RPC.",
);
assert.match(
  reviewCompletionActions,
  /doesFinalClassificationCreateLearningItem\([\s\S]*finalClassification[\s\S]*if \(createsLearningItem\)/,
  "Only learning-relevant final classifications should enter the Word Treasure write path.",
);
assert.match(
  wordTreasures,
  /createServiceRoleClient\(\)/,
  "Word Treasure writes must use the service-role server path inside the reward helper.",
);
assert.match(
  reviewCompletionActions,
  /sourceIssueId: finalisedIssue\.id[\s\S]*sourceLearningItemId: learningItemId[\s\S]*sourceSubmissionId: finalisedIssue\.task_submission_id[\s\S]*sourceMisspellingInstanceId/,
  "Word Treasure creation must link source issue, learning item, submission, and misspelling lineage.",
);

assert.match(
  wordTreasures,
  /export async function createOrUpdateGoldenNuggetFromParentApproval/,
  "Canonical Word Treasure helper must expose a parent-approval creation path.",
);
assert.match(
  wordTreasures,
  /existing\.status[\s\S]*newStatus: treasure\.status/,
  "Existing Word Treasure rows must not be downgraded when parent approval adds lineage.",
);
assert.match(
  wordTreasures,
  /event_type: eventType[\s\S]*source_type: sourceType[\s\S]*source_entity_id: sourceEntityId/,
  "Word Treasure helper must write source-linked lifecycle events.",
);
assert.doesNotMatch(
  `${reviewCompletionActions}\n${wordTreasures}`,
  /spelling_reward_states|spelling_reward_events/,
  "Phase 3.2 canonical Nugget writes must not use compatibility reward tables.",
);

console.log("word-treasure-parent-approval-regression: ok");
