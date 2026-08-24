import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReviewTargetSnapshotV3 } from "../lib/adle/review-v3/contracts";
import { reviewWritingChallengeDevSnapshot } from "../lib/adle/review-v3/dev-snapshot";
import {
  evaluateSubmittedReviewWriting,
  type GovernedReviewMisspellingMapping,
} from "../lib/adle/review-v3/r3-evaluation";
import {
  createReviewR3StoredState,
  reviewR3SessionView,
  submitReviewR3AudioCheck,
  submitReviewR3Writing,
} from "../lib/adle/review-v3/r3-state";
import {
  exactReviewTargetIds,
  findExactReviewTargetMatches,
  isExactReviewAudioResponse,
} from "../lib/adle/review-v3/target-word-matcher";

const snapshot = reviewWritingChallengeDevSnapshot();
const baseTarget = snapshot.targets[0];

function target(encounterId: string, order: number, spelling: string): ReviewTargetSnapshotV3 {
  return {
    ...baseTarget,
    encounterId,
    order,
    canonicalWordId: `word-${encounterId}`,
    canonicalSpelling: spelling,
    answerAuthority: {
      ...baseTarget.answerAuthority,
      referenceId: `answer-${encounterId}`,
    },
  };
}

const exactTargets = [
  target("famous", 1, "famous"),
  target("cafe", 2, "caf\u00e9"),
  target("apostrophe", 3, "can't"),
  target("hyphen", 4, "well-known"),
  target("multi", 5, "ice cream"),
];
const exactWriting = "Famous, famousness and FAMOUS. cafe\u0301 can't well-known ice cream.";
const exactMatches = findExactReviewTargetMatches(exactWriting, exactTargets);
assert.deepEqual(exactMatches.map((match) => match.encounterId), [
  "famous", "cafe", "apostrophe", "hyphen", "multi",
]);
assert.equal(exactMatches.filter((match) => match.encounterId === "famous").length, 1);
assert.equal(exactReviewTargetIds("infamous", [exactTargets[0]]).size, 0, "substrings never count");
assert.equal(exactReviewTargetIds("ice. Cream", [exactTargets[4]]).size, 0, "punctuation cannot join a multi-token target");
assert.equal(isExactReviewAudioResponse("(famous)", exactTargets[0]), true);
assert.equal(isExactReviewAudioResponse("very famous", exactTargets[0]), false);

const mappings: GovernedReviewMisspellingMapping[] = [{
  mappingId: "mapping-neccesary",
  misspellingNormalized: "neccesary",
  correctSpellingNormalized: "necessary",
  microSkillKey: "D4_FIXTURE",
  dialectCode: "en-GB",
  normalizationVersion: "spelling_normalize_v1",
  authorityReference: "resolver-visible-token-safe:mapping-neccesary",
}];

let evaluation = evaluateSubmittedReviewWriting({
  writing: "It was neccesary on Wednesday. Buisness was busy.",
  targets: snapshot.targets,
  governedMappings: mappings,
});
assert.deepEqual(evaluation.map((item) => item.disposition), [
  "attributable_misspelling",
  "correct_in_writing",
  "unaccounted_for",
]);
assert.equal(evaluation[0].observedText, "neccesary");

evaluation = evaluateSubmittedReviewWriting({
  writing: "Necessary was typed correctly, despite neccesary appearing later.",
  targets: [snapshot.targets[0]],
  governedMappings: mappings,
});
assert.equal(evaluation[0].disposition, "correct_in_writing", "an exact occurrence wins over a typo");

for (const unrelated of ["necessarily", "accessory", "messy", "a", "bus"]) {
  const result = evaluateSubmittedReviewWriting({
    writing: unrelated,
    targets: [snapshot.targets[0]],
    governedMappings: mappings,
  });
  assert.equal(result[0].disposition, "unaccounted_for", `${unrelated} must not become a fuzzy failure`);
}

const ambiguousMappings: GovernedReviewMisspellingMapping[] = [
  { ...mappings[0], mappingId: "ambiguous-1", misspellingNormalized: "plain" },
  {
    ...mappings[0],
    mappingId: "ambiguous-2",
    misspellingNormalized: "plain",
    correctSpellingNormalized: "business",
  },
];
const ambiguous = evaluateSubmittedReviewWriting({
  writing: "plain",
  targets: [snapshot.targets[0], snapshot.targets[2]],
  governedMappings: ambiguousMappings,
});
assert.deepEqual(
  ambiguous.map((item) => item.disposition),
  ["unaccounted_for", "unaccounted_for"],
  "an ambiguous token cannot fail either target",
);
const duplicatedAnswer = evaluateSubmittedReviewWriting({
  writing: "neccesary",
  targets: [target("same-1", 1, "necessary"), target("same-2", 2, "necessary")],
  governedMappings: mappings,
});
assert.deepEqual(
  duplicatedAnswer.map((item) => item.disposition),
  ["unaccounted_for", "unaccounted_for"],
  "one token cannot fail two targets",
);

const unknownPlausibleTypo = evaluateSubmittedReviewWriting({
  writing: "necessery",
  targets: [snapshot.targets[0]],
  governedMappings: mappings,
});
assert.equal(
  unknownPlausibleTypo[0].disposition,
  "unaccounted_for",
  "an unknown plausible typo is conservatively sent to audio retrieval",
);

const submittedText = "It was neccesary on Wednesday. Buisness was busy.";
const initialState = createReviewR3StoredState(snapshot);
const writing = submitReviewR3Writing({
  snapshot,
  state: initialState,
  submission: { finalWriting: submittedText, idempotencyKey: "writing-1" },
  evaluations: evaluateSubmittedReviewWriting({
    writing: submittedText,
    targets: snapshot.targets,
    governedMappings: mappings,
  }),
});
assert.equal(writing.result.ok, true);
assert.deepEqual(writing.state.encounters.map((item) => item.originalOutcome), [
  "failure", "success", "pending",
]);
assert.equal(writing.state.encounters[0].repairState, "required");
if (!writing.result.ok) throw new Error("writing transition unexpectedly failed");
assert.equal(writing.result.session.encounters[0].audioCheckEligible, false);
assert.equal(writing.result.session.encounters[1].authenticUseCandidate, true);
assert.equal(writing.result.session.encounters[2].audioCheckEligible, true);

const writingReplay = submitReviewR3Writing({
  snapshot,
  state: writing.state,
  submission: { finalWriting: submittedText, idempotencyKey: "another-key" },
  evaluations: [],
});
assert.equal(writingReplay.result.ok && writingReplay.result.replayed, true);
const writingConflict = submitReviewR3Writing({
  snapshot,
  state: writing.state,
  submission: { finalWriting: `${submittedText} changed`, idempotencyKey: "writing-2" },
  evaluations: [],
});
assert.deepEqual(writingConflict.result, { ok: false, code: "writing_submission_conflict" });

const correctAudio = submitReviewR3AudioCheck({
  snapshot,
  state: writing.state,
  submission: { encounterId: "dev-encounter-3", response: "BUSINESS", idempotencyKey: "audio-3" },
});
assert.equal(correctAudio.result.ok, true);
assert.equal(correctAudio.state.encounters[2].originalOutcome, "success");
assert.equal(correctAudio.state.encounters[2].originalOutcomeSource, "audio_retrieval_check");
if (!correctAudio.result.ok) throw new Error("correct audio transition unexpectedly failed");
assert.equal(correctAudio.result.session.encounters[2].authenticUseCandidate, false);

const correctAudioReplay = submitReviewR3AudioCheck({
  snapshot,
  state: correctAudio.state,
  submission: { encounterId: "dev-encounter-3", response: "BUSINESS", idempotencyKey: "new-key" },
});
assert.equal(correctAudioReplay.result.ok && correctAudioReplay.result.replayed, true);
const audioConflict = submitReviewR3AudioCheck({
  snapshot,
  state: correctAudio.state,
  submission: { encounterId: "dev-encounter-3", response: "businesses", idempotencyKey: "new-key" },
});
assert.deepEqual(audioConflict.result, { ok: false, code: "audio_response_conflict" });

const wrongAudio = submitReviewR3AudioCheck({
  snapshot,
  state: writing.state,
  submission: { encounterId: "dev-encounter-3", response: "buisness", idempotencyKey: "audio-wrong" },
});
assert.equal(wrongAudio.state.encounters[2].originalOutcome, "failure");
assert.equal(wrongAudio.state.encounters[2].repairState, "required");
if (!wrongAudio.result.ok) throw new Error("incorrect audio transition unexpectedly failed");
assert.equal(wrongAudio.result.session.encounters[2].audioCheckLocked, true);
assert.equal(wrongAudio.result.session.encounters[2].governedCorrectSpellingReveal, "business");
assert.equal(
  submitReviewR3AudioCheck({
    snapshot,
    state: writing.state,
    submission: { encounterId: "dev-encounter-1", response: "necessary", idempotencyKey: "forbidden" },
  }).result.ok,
  false,
  "a known writing failure never receives an audio check that could replace it",
);

const hydrated = JSON.parse(JSON.stringify(wrongAudio.state)) as typeof wrongAudio.state;
const hydratedView = reviewR3SessionView(snapshot, hydrated);
assert.equal(hydratedView.encounters[2].audioCheckLocked, true);
assert.equal(hydratedView.encounters[2].submittedAudioResponse, "buisness");

const migration = readFileSync(resolve("supabase/migrations/20260824130000_add_adle_review_r3_retrieval_rpcs.sql"), "utf8");
assert.doesNotMatch(migration, /insert\s+into\s+public\.adle_review_outcome_events/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.adle_authentic_use_events/i);
assert.doesNotMatch(migration, /update\s+public\.adle_review_schedule_words/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.adle_taught_word_history/i);
assert.doesNotMatch(migration, /(insert\s+into|update)\s+public\.[a-z_]*reward/i);

const evaluator = readFileSync(resolve("lib/adle/review-v3/r3-evaluation.ts"), "utf8");
assert.doesNotMatch(evaluator, /levenshtein|edit.?distance|fuzzy|nearest.?word/i);
assert.match(evaluator, /candidates\.size !== 1/);

console.log("ADLE Review R3 target retrieval regression passed.");
