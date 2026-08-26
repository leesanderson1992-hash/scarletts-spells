import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ReviewFreeWritingActivity,
  reviewWheelSelectionRotation,
  reviewWheelSpinRotation,
} from "../components/adle/review/review-free-writing-activity";
import {
  REVIEW_ACTIVITY_SEQUENCE_V3,
  REVIEW_CHALLENGE_TYPES,
  REVIEW_COMPLETION_CONTRACT_V3,
  REVIEW_CONTRACT_REGISTRY_VERSION_V3,
  REVIEW_SNAPSHOT_COMPILER_VERSION_V3,
  REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3,
  REVIEW_SNAPSHOT_SCHEMA_VERSION_V3,
  REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3,
  REVIEW_TIMER_POLICY_V3,
  type CompiledReviewSnapshotV3,
} from "../lib/adle/review-v3/contracts";
import {
  createReviewWritingChallengeDraftEnvelope,
  restoreReviewWritingChallengeDraft,
  type ReviewWritingChallengeDraftStore,
} from "../lib/adle/review-v3/writing-challenge-draft";
import {
  applyParentReauthenticatedExtension,
  beginCreativeWriting,
  createReviewWritingChallengeSession,
  expireCreativeWritingIfNeeded,
  remainingWritingSeconds,
  revealInitialWheelResult,
  saveWritingChallengeDraft,
  selectReviewChallengePrompt,
} from "../lib/adle/review-v3/writing-challenge-session";
import { sealCompiledReviewSnapshotV3 } from "../lib/adle/review-v3/snapshot-validator";

const HASH = "b".repeat(64);
const WORDS = ["necessary", "Wednesday"] as const;
const CHALLENGE_LABELS = {
  conundrums: "Conundrums",
  reflection: "Reflection",
  stories: "Stories",
  fortunately_unfortunately: "Fortunately / Unfortunately",
  persuasion: "Persuasion",
} as const;

function fixture(): CompiledReviewSnapshotV3 {
  return sealCompiledReviewSnapshotV3({
    snapshotSchemaVersion: REVIEW_SNAPSHOT_SCHEMA_VERSION_V3,
    compilerVersion: REVIEW_SNAPSHOT_COMPILER_VERSION_V3,
    validatorVersion: REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3,
    contractRegistryVersion: REVIEW_CONTRACT_REGISTRY_VERSION_V3,
    assignment: {
      assignmentId: "review-r2-fixture",
      reviewItemId: "review-r2-item",
      generationSource: "adle_review_writing_challenge_v3",
    },
    targets: WORDS.map((word, index) => ({
      contractVersion: 3 as const,
      encounterId: `encounter-${index + 1}`,
      order: index + 1,
      canonicalWordId: `word-${index + 1}`,
      canonicalSpelling: word,
      answerAuthority: {
        referenceId: `answer-${index + 1}`,
        version: "v1",
        matchingPolicy: "governed_exact_tokens_v1" as const,
      },
      audioAuthority: {
        referenceId: `audio-${index + 1}`,
        version: "v1",
        kind: "speech_text" as const,
        speechText: word,
        assetReference: null,
      },
      schedule: {
        scheduleWordId: `schedule-${index + 1}`,
        sourceBundleId: "legacy-bundle",
        dueKind: "scheduled_review" as const,
        dueOn: "2026-08-24",
        intervalIndex: 0,
        schedulePolicyVersion: "review_policy_v1_2026-07-04",
        wordScheduleVersion: "adle_review_per_word_schedule_v1",
      },
      routeProvenance: [{
        routeId: "fixture-route",
        microSkillKey: "FIXTURE",
        learningItemId: null,
      }],
      availableCue: null,
    })),
    promptCandidates: REVIEW_CHALLENGE_TYPES.map((challengeType) => ({
      contractVersion: 3 as const,
      promptVersionId: `${challengeType}-v1`,
      stablePromptKey: `fixture-${challengeType}`,
      challengeType,
      contentVersion: "v1",
      promptText: `${challengeType} prompt`,
      instructionText: `${challengeType} instruction`,
      configuration: { title: "A journey among the stars", top_tip: "Imagine a surprising turn & explain it." },
      reusePolicy: challengeType === "reflection"
        ? "reusable_lru_no_immediate_repeat" as const
        : "once_per_learner" as const,
      authority: {
        releaseReference: "fixture",
        sourceFingerprint: HASH,
      },
    })),
    initialChallengeType: "stories",
    timerPolicy: REVIEW_TIMER_POLICY_V3,
    activitySequence: REVIEW_ACTIVITY_SEQUENCE_V3,
    completionContract: REVIEW_COMPLETION_CONTRACT_V3,
    contentVersions: [{
      contentRefId: "fixture-prompt-content",
      kind: "review_prompt",
      key: "fixture",
      version: "v1",
      sourceFingerprint: HASH,
    }],
    provenance: {
      sourceKind: "compiled_review_assignment",
      fingerprintAlgorithm: "sha256",
      fingerprintVersion: REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3,
    },
  });
}

class MemoryDraftStore implements ReviewWritingChallengeDraftStore {
  readonly entries = new Map<string, unknown>();

  load(key: string): unknown { return this.entries.get(key) ?? null; }
  save(key: string, value: unknown): void { this.entries.set(key, value); }
  clear(key: string): void { this.entries.delete(key); }
}

const snapshot = fixture();
let session = createReviewWritingChallengeSession(snapshot);
assert.equal(session.wheelResult, "stories");
assert.equal(session.selectedChallengeType, null);

const selectorMarkup = renderToStaticMarkup(
  createElement(ReviewFreeWritingActivity, { snapshot, initialSession: session }),
);
assert.match(selectorMarkup, />SPIN</, "The selector must expose the prominent SPIN control");
assert.doesNotMatch(selectorMarkup, /Pull the lever/i, "The retired lever language must not remain");
assert.match(selectorMarkup, /<svg[^>]+viewBox="0 0 400 400"/, "The wheel must be a real scalable SVG");
assert.equal(
  (selectorMarkup.match(/data-wheel-segment=/g) ?? []).length,
  5,
  "The wheel must contain exactly five equal snapshot-governed segments",
);
for (const challengeType of REVIEW_CHALLENGE_TYPES) {
  assert.match(
    selectorMarkup,
    new RegExp(CHALLENGE_LABELS[challengeType]),
    `${challengeType} must be labelled on the shared five-segment wheel`,
  );
}
for (const [index, challengeType] of REVIEW_CHALLENGE_TYPES.entries()) {
  const finalRotation = reviewWheelSpinRotation(0, challengeType, 5);
  assert.ok(finalRotation >= 1_800, "A full spin must travel through several complete turns");
  assert.equal(
    ((finalRotation + (index * 72)) % 360 + 360) % 360,
    0,
    `${challengeType} must land precisely beneath the fixed top pointer`,
  );
}
assert.equal(
  reviewWheelSelectionRotation(1_944, "reflection"),
  2_088,
  "An override should take the shortest visual path to the frozen selected segment",
);

const wheel = revealInitialWheelResult(snapshot, session);
assert.equal(wheel.ok, true);
if (!wheel.ok) throw new Error("Wheel should select the frozen initial challenge");
session = wheel.session;
assert.equal(session.selectedChallengeType, "stories");

for (const challengeType of REVIEW_CHALLENGE_TYPES) {
  const selection = selectReviewChallengePrompt(snapshot, session, challengeType);
  assert.equal(selection.ok, true, `${challengeType} must use the one shared activity engine`);
  if (!selection.ok) throw new Error("Governed prompt selection unexpectedly rejected");
  assert.equal(selection.session.selectedPromptVersionId, `${challengeType}-v1`);
}
assert.equal(
  selectReviewChallengePrompt(snapshot, session, "not-a-governed-challenge" as never).ok,
  false,
  "The selector must reject prompts that are not frozen in the snapshot",
);

const selected = selectReviewChallengePrompt(snapshot, session, "conundrums");
assert.equal(selected.ok, true);
if (!selected.ok) throw new Error("Conundrum selection unexpectedly rejected");
const started = beginCreativeWriting(snapshot, selected.session, 1_000);
assert.equal(started.ok, true);
if (!started.ok) throw new Error("Writing should start only after a governed prompt is selected");
session = saveWritingChallengeDraft(started.session, "A quiet afternoon became an adventure.");
assert.equal(remainingWritingSeconds(session, 1_000), 600);
assert.equal(remainingWritingSeconds(session, 999), 600, "A stale render timestamp cannot display extra writing time");

assert.equal(
  applyParentReauthenticatedExtension(session, 300, 1_000).ok,
  false,
  "An extension is offered only after creative writing time has expired",
);
const expired = expireCreativeWritingIfNeeded(session, 601_000);
assert.equal(expired.phase, "writing_time_finished");
assert.equal(expired.draftText, "A quiet afternoon became an adventure.");
assert.equal(expired.selectedChallengeType, "conundrums");
assert.equal(expired.writingFinishedAtMs, 601_000);

const extension = applyParentReauthenticatedExtension(expired, 300, 601_000);
assert.equal(extension.ok, true);
if (!extension.ok) throw new Error("The first parent-approved post-expiry extension should be accepted");
session = extension.session;
assert.equal(session.phase, "creative_writing");
assert.equal(session.writingFinishedAtMs, null);
assert.equal(remainingWritingSeconds(session, 601_000), 300);
assert.equal(applyParentReauthenticatedExtension(session, 600, 601_000).ok, false, "Only one extension is allowed");

const store = new MemoryDraftStore();
const envelope = createReviewWritingChallengeDraftEnvelope(snapshot, expired);
store.save("fixture", envelope);
assert.deepEqual(restoreReviewWritingChallengeDraft(store.load("fixture"), snapshot), expired);
assert.equal(
  restoreReviewWritingChallengeDraft({ ...envelope, snapshotFingerprint: "c".repeat(64) }, snapshot),
  null,
  "A draft from another frozen Review snapshot must not resume",
);

const writingMarkup = renderToStaticMarkup(
  createElement(ReviewFreeWritingActivity, { snapshot, initialSession: session }),
);
assert.match(writingMarkup, /Target Words: 0 \/ 2/);
assert.match(writingMarkup, /Play target word 1/);
assert.match(writingMarkup, /Play target word 2/);
for (const word of WORDS) {
  assert.doesNotMatch(writingMarkup, new RegExp(word, "i"), "Target spelling must never appear in the writing UI");
}
assert.match(writingMarkup, /spellcheck="false"/i);
assert.match(writingMarkup, /autocorrect="off"/i);
assert.match(writingMarkup, /A journey among the stars/);
assert.match(writingMarkup, /<section[^>]+aria-label="Challenge prompt"/);
assert.match(writingMarkup, /<aside[^>]+aria-label="Top Tip"/);
assert.match(writingMarkup, /Imagine a surprising turn &amp; explain it\./, "Render the authored tip unchanged and escaped");
const noTipMarkup = renderToStaticMarkup(createElement(ReviewFreeWritingActivity, {
  snapshot: { ...snapshot, promptCandidates: snapshot.promptCandidates.map((candidate) => ({
    ...candidate, configuration: { title: null, top_tip: { invalid: true } },
  })) },
  initialSession: session,
}));
assert.doesNotMatch(noTipMarkup, /aria-label="Top Tip"/, "Older snapshots without an authored text tip remain usable");

const finishedMarkup = renderToStaticMarkup(
  createElement(
    ReviewFreeWritingActivity,
    {
      snapshot,
      initialSession: expired,
      requestParentReauthenticatedExtension: async () => true,
    },
  ),
);
assert.match(finishedMarkup, /Your writing is safely preserved below/i);
assert.match(finishedMarkup, /Your saved Writing Challenge/i);
assert.match(finishedMarkup, /\+5 min/);

const componentSource = readFileSync(resolve(import.meta.dirname, "../components/adle/review/review-free-writing-activity.tsx"), "utf8");
assert.equal((componentSource.match(/export function ReviewFreeWritingActivity/g) ?? []).length, 1);
assert.doesNotMatch(componentSource, /canonicalSpelling/);
assert.doesNotMatch(componentSource, /Math\.random|crypto\.getRandomValues/, "The wheel must not choose its own result");
assert.match(componentSource, /prefers-reduced-motion: reduce/, "The wheel must support reduced motion");
assert.match(componentSource, /aria-live="polite"/, "The selected challenge must be announced accessibly");
assert.doesNotMatch(
  componentSource,
  /from\s+["'][^"']*(review-scheduler|composer-completions|assignment-writer|evidence)[^"']*["']/,
  "R2 must not invoke scheduling, evidence, completion, or assignment-writer paths",
);
for (const sourcePath of [
  "../lib/adle/review-v3/writing-challenge-session.ts",
  "../lib/adle/review-v3/writing-challenge-draft.ts",
]) {
  const source = readFileSync(resolve(import.meta.dirname, sourcePath), "utf8");
  assert.doesNotMatch(source, /review-scheduler|resolveBundleReview|submitAudioRetrievalCheck|setRepairState/);
}

console.log("PASS: ADLE Review R2 Writing Challenge shell is governed, spelling-safe, timer-bounded, resumable, and inactive");
