import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { reviewWritingChallengeDevSnapshot } from "../lib/adle/review-v3/dev-snapshot";
import {
  participatesInReviewRepair,
  reviewRepairLifecycle,
  type ReviewR3SessionView,
} from "../lib/adle/review-v3/r3-contracts";
import {
  reviewR4StoredStateFromPersistenceRows,
  type ReviewR4PersistenceAttemptRow,
  type ReviewR4PersistenceCueRow,
  type ReviewR4PersistenceEncounterRow,
} from "../lib/adle/review-v3/r4-persistence";
import { reviewR4SessionView } from "../lib/adle/review-v3/r4-state";

const snapshot = reviewWritingChallengeDevSnapshot();
const target = snapshot.targets[0];
const baseEncounter = {
  encounterId: target.encounterId,
  targetOrder: target.order,
  writingDisposition: "attributable_misspelling" as const,
  originalOutcome: "failure" as const,
  resultSource: "review_writing" as const,
  authenticUseCandidate: false,
  audioCheckEligible: false,
  submittedAudioResponse: null,
  audioCheckLocked: false,
  governedCorrectSpellingReveal: null,
  repairRequired: false,
  repairState: "in_progress" as const,
  writingAttributionPrompt: null,
  confirmedWritingAttempt: "neccesary",
};

function reviewSession(repairState: typeof baseEncounter.repairState |
  "required" | "completed_correct" | "attempted_not_secured"): ReviewR3SessionView {
  return {
    assignmentId: snapshot.assignment.assignmentId,
    snapshotFingerprint: snapshot.provenance.sourceFingerprint,
    submittedWritingFrozen: true,
    submittedWritingText: "It was neccesary.",
    encounters: [{
      ...baseEncounter,
      repairRequired: repairState === "required",
      repairState,
    }],
  };
}

const cueRows: ReviewR4PersistenceCueRow[] = [{
  id: "cue-v1",
  child_id: "child-1",
  canonical_word_id: target.canonicalWordId,
  spelling_authority_reference_id: target.answerAuthority.referenceId,
  spelling_authority_version: target.answerAuthority.version,
  tricky_grapheme_start: 2,
  tricky_grapheme_end: 4,
  selected_tricky_text: "ce",
  cue_text: "One c, then two s letters.",
  source_review_encounter_id: target.encounterId,
  version_number: 1,
  supersedes_cue_version_id: null,
  version_status: "active",
  created_at: "2026-08-25T10:00:00.000Z",
}];

function encounterRow(input: {
  stage: ReviewR4PersistenceEncounterRow["repair_stage"];
  state: ReviewR4PersistenceEncounterRow["repair_state"];
  withCue?: boolean;
  attemptCount?: number;
}): ReviewR4PersistenceEncounterRow {
  return {
    id: target.encounterId,
    repair_stage: input.stage,
    revealed_at: input.stage === null ? null : "2026-08-25T10:00:00.000Z",
    repair_tricky_grapheme_start: input.withCue ? 2 : null,
    repair_tricky_grapheme_end: input.withCue ? 4 : null,
    repair_tricky_text: input.withCue ? "ce" : null,
    repair_memory_cue_version_id: input.withCue ? "cue-v1" : null,
    repair_state: input.state,
    repair_terminal_at: input.stage === "terminal" ? "2026-08-25T10:05:00.000Z" : null,
  };
}

function attemptRows(count: 0 | 1 | 2, lastCorrect = false): ReviewR4PersistenceAttemptRow[] {
  return Array.from({ length: count }, (_, index) => ({
    review_encounter_id: target.encounterId,
    attempt_number: (index + 1) as 1 | 2,
    attempt_text: index + 1 === count && lastCorrect ? target.canonicalSpelling : `wrong-${index + 1}`,
    is_correct: index + 1 === count && lastCorrect,
    created_at: `2026-08-25T10:0${index + 3}:00.000Z`,
  }));
}

function hydrate(input: {
  stage: ReviewR4PersistenceEncounterRow["repair_stage"];
  state: Exclude<ReviewR4PersistenceEncounterRow["repair_state"], "not_required">;
  withCue?: boolean;
  attempts?: 0 | 1 | 2;
  lastCorrect?: boolean;
}) {
  const session = reviewSession(input.state);
  const stored = reviewR4StoredStateFromPersistenceRows({
    childId: "child-1",
    encounterRows: [encounterRow(input)],
    cueRows: input.withCue ? cueRows : [],
    attemptRows: attemptRows(input.attempts ?? 0, input.lastCorrect),
  });
  return reviewR4SessionView({ snapshot, reviewSession: session, state: stored });
}

const required = reviewSession("required");
assert.equal(reviewRepairLifecycle(required.encounters[0]), "required");
assert.equal(participatesInReviewRepair(required.encounters[0]), true);
const requiredView = reviewR4SessionView({
  snapshot,
  reviewSession: required,
  state: reviewR4StoredStateFromPersistenceRows({
    childId: "child-1", encounterRows: [], cueRows: [], attemptRows: [],
  }),
});
assert.equal(requiredView.activeRepair, null);
assert.equal(requiredView.nextRepairEncounterId, target.encounterId);

for (const stage of ["compare", "tricky_part", "memory_cue", "look", "cover", "try_again"] as const) {
  const view = hydrate({
    stage,
    state: "in_progress",
    withCue: ["look", "cover", "try_again"].includes(stage),
  });
  assert.equal(view.activeRepair?.stage, stage, `fresh hydration must restore ${stage}`);
  assert.equal(reviewRepairLifecycle(view.reviewSession.encounters[0]), "in_progress");
}

const afterFirstFailure = hydrate({
  stage: "look", state: "in_progress", withCue: true, attempts: 1,
});
assert.equal(afterFirstFailure.activeRepair?.stage, "look");
assert.equal(afterFirstFailure.activeRepair?.attempts.length, 1);
assert.equal(afterFirstFailure.activeRepair?.attempts[0].correct, false);

const completed = hydrate({
  stage: "terminal", state: "completed_correct", withCue: true, attempts: 1, lastCorrect: true,
});
assert.equal(completed.activeRepair, null);
assert.equal(completed.allRequiredRepairsTerminal, true);
assert.equal(completed.terminalRepairs[0].terminalOutcome, "repair_completed");
assert.equal(reviewRepairLifecycle(completed.reviewSession.encounters[0]), "terminal_completed");

const notSecured = hydrate({
  stage: "terminal", state: "attempted_not_secured", withCue: true, attempts: 2,
});
assert.equal(notSecured.activeRepair, null);
assert.equal(notSecured.allRequiredRepairsTerminal, true);
assert.equal(notSecured.terminalRepairs[0].terminalOutcome, "repair_attempted_not_secured");
assert.equal(reviewRepairLifecycle(notSecured.reviewSession.encounters[0]),
  "terminal_attempted_not_secured");

const shell = readFileSync("components/adle/review/review-free-writing-activity.tsx", "utf8");
assert.match(shell, /filter\(participatesInReviewRepair\)/,
  "the outer shell must route from the full durable repair lifecycle");
assert.doesNotMatch(shell, /filter\(\(encounter\) =>\s*encounter\.repairRequired/,
  "the outer shell must not route only from the initial repair-required boolean");

console.log("PASS: ADLE Review R4 SQL-shaped hydration and full repair lifecycle routing");
