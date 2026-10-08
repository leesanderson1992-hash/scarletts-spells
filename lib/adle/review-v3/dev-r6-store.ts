import "server-only";

import type { ReviewR6GatewayRequest } from "@/app/learn/week/adle/review-r6-actions";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../morphology/base-word-family-preview-fixture";
import { normaliseBaseWordFamilyResume } from "../morphology/base-word-family-resume";
import type { CompiledReviewSnapshotV3 } from "./contracts";
import { createReviewDevelopmentStore, type ReviewDevelopmentStoredState } from "./dev-store";
import type { ReviewR6QaScenario } from "./dev-r6-scenarios";
import { reviewR6QaSnapshot } from "./dev-r6-snapshot";
import type { AdleMajorStage, ReviewR6WritingSessionView } from "./r6-session-contracts";
import {
  applyParentReauthenticatedExtension, beginCreativeWriting, createReviewWritingChallengeSession,
  expireCreativeWritingIfNeeded, finishCreativeWriting, saveWritingChallengeDraft,
  selectReviewChallengePrompt, type ReviewWritingChallengeSessionV1, type ReviewWritingChallengeTransition,
} from "./writing-challenge-session";

/** Local fixture persistence only. No schedule, reward, database or rollout adapter. */
export interface ReviewR6QaState {
  schemaVersion: 1;
  scenario: ReviewR6QaScenario;
  run: string;
  snapshot: CompiledReviewSnapshotV3;
  writing: ReviewWritingChallengeSessionV1;
  writingVersion: number;
  review: ReviewDevelopmentStoredState;
  stage: AdleMajorStage;
  specialistCheckpoint: unknown;
  reviewFinalized: boolean;
  completionReceipts: number;
}

function accepted(result: ReviewWritingChallengeTransition): ReviewWritingChallengeSessionV1 {
  if (!result.ok) throw new Error(result.code);
  return result.session;
}
function checked<T extends { ok: boolean }>(result: T): T {
  if (!result.ok) throw new Error("QA seed transition rejected");
  return result;
}

const DRAFT = "On Wednesday, our class opened a tiny business in the library. It was necessary to agree on a plan before anybody built the stall. I wanted to sell maps of imaginary planets, but my friend thought visitors would prefer stories. We listened to each other and decided to make both.\n\nThe first customer was a dragon wearing a striped scarf. He unfolded a map, sneezed a small cloud of silver smoke, and asked whether the moon had a dentist. Nobody had expected that question. I drew a little door beside a crater and promised that the dentist would be very gentle.\n\nBy lunchtime the table was covered with paper stars. We had made mistakes, changed our minds, and laughed together. When the dragon returned, he brought a thank-you note instead of a coin. I pinned it beside our sign because it mattered more than any sale. Tomorrow we would add another planet and leave plenty of room for surprises.";

export function createReviewR6QaState(scenario: ReviewR6QaScenario, run: string, now = Date.now()): ReviewR6QaState {
  const snapshot = reviewR6QaSnapshot(scenario, run);
  const state: ReviewR6QaState = {
    schemaVersion: 1, scenario, run, snapshot, writing: createReviewWritingChallengeSession(snapshot),
    writingVersion: 0, review: createReviewDevelopmentStore(snapshot).exportState(),
    stage: scenario === "nothing-due" ? "empty" : scenario === "lesson-only" || scenario === "lesson-reflection" ? "specialist_lesson" : "review",
    specialistCheckpoint: null, reviewFinalized: false, completionReceipts: 0,
  };
  if (scenario === "existing-cue") {
    const target = snapshot.targets[0];
    state.review.r4 = { ...state.review.r4, cueVersions: [{
      childId: "dev-child", cueVersionId: `dev-r6-cue-${run}`, canonicalWordId: target.canonicalWordId,
      spellingAuthorityReferenceId: target.answerAuthority.referenceId, spellingAuthorityVersion: target.answerAuthority.version,
      graphemeStart: 2, graphemeEnd: 3, selectedText: "c", cueText: "One collar and two sleeves on my space suit.",
      versionNumber: 1, sourceReviewEncounterId: "dev-r6-earlier-encounter", supersedesCueVersionId: null,
      status: "active", createdAt: new Date(now - 86_400_000).toISOString(),
    }] };
  }
  const store = createReviewDevelopmentStore(snapshot, state.review);
  const first = snapshot.targets[0].encounterId;
  const seed = (suffix: string) => ({ encounterId: first, idempotencyKey: `qa-seed-${run}-${suffix}` });
  const start = () => {
    state.writing = accepted(selectReviewChallengePrompt(snapshot, state.writing, snapshot.initialChallengeType));
    state.writing = accepted(beginCreativeWriting(snapshot, state.writing, now - 120_000));
    state.writingVersion = 2;
  };
  const submit = (text: string) => {
    start();
    state.writing = accepted(finishCreativeWriting(saveWritingChallengeDraft(state.writing, text), now));
    checked(store.submitReviewR3DevWriting({ finalWriting: text, idempotencyKey: `qa-seed-${run}-writing` }));
  };
  const repairScenarios = ["known-misspelling", "resume-compare", "resume-cue", "resume-look", "resume-cover", "resume-try", "retry-second-success", "retry-second-failure"];
  if (repairScenarios.includes(scenario)) submit("It was neccesary on Wednesday for our business.");
  if (scenario === "learner-confirmed") submit("Necessary on Wensday, the business opened its doors.");
  if (scenario === "suggested-candidate") submit("The buisness was necessary on Wednesday.");
  if (scenario === "audio-failure" || scenario === "existing-cue" || scenario === "audio-sequence") {
    submit(scenario === "audio-sequence" ? "The dragon opened a little shop." : "Wednesday was a busy day for our business.");
    for (const target of snapshot.targets) {
      const pending = store.hydrateReviewR3DevSession().encounters.find((row) => row.encounterId === target.encounterId);
      if (pending?.writingAttributionPrompt?.kind === "ask_attempt") checked(store.answerReviewR31DevAttemptQuestion({
        encounterId: target.encounterId, decision: "no", idempotencyKey: `qa-seed-${run}-no-${target.order}`,
      }));
    }
    if (scenario === "audio-failure") checked(store.submitReviewR3DevAudio({ ...seed("audio"), response: "neccesary" }));
  }
  if (repairScenarios.includes(scenario) && scenario !== "known-misspelling") {
    checked(store.beginReviewR4DevRepair(seed("begin")));
    if (scenario !== "resume-compare") {
      checked(store.moveReviewR4DevToTrickyPart(seed("tricky")));
      checked(store.saveReviewR4DevTrickySpan({ ...seed("span"), graphemeStart: 2, graphemeEnd: 3, selectedText: "c" }));
      if (scenario !== "resume-cue") {
        checked(store.saveReviewR4DevMemoryCue({ ...seed("cue"), cueText: "One collar and two sleeves on my space suit." }));
        if (scenario !== "resume-look") {
          checked(store.moveReviewR4DevToCover(seed("cover")));
          if (scenario !== "resume-cover") {
            checked(store.moveReviewR4DevToTryAgain(seed("try")));
            if (scenario !== "resume-try") {
              checked(store.submitReviewR4DevRetry({ ...seed("retry-1"), response: "neccesary" }));
              if (scenario === "retry-second-failure") {
                checked(store.moveReviewR4DevToCover(seed("cover-2")));
                checked(store.moveReviewR4DevToTryAgain(seed("try-2")));
                checked(store.submitReviewR4DevRetry({ ...seed("retry-2"), response: "neccesary" }));
              }
            }
          }
        }
      }
    }
  }
  if (["resume-writing", "timer-warning", "timer-expired"].includes(scenario)) {
    start();
    state.writing = saveWritingChallengeDraft(state.writing, DRAFT);
    if (scenario.startsWith("timer-")) {
      const remaining = scenario === "timer-warning" ? 25_000 : -1_000;
      state.writing = { ...state.writing, writingStartedAtMs: now + remaining - 600_000, writingDeadlineAtMs: now + remaining };
      state.writing = expireCreativeWritingIfNeeded(state.writing, now);
    }
  }
  if (scenario === "review-finalized" || scenario === "celebration") {
    submit("Necessary business on Wednesday.");
    if (!store.canFinalize()) throw new Error("QA finalized fixture must satisfy R5 completion readiness");
    state.reviewFinalized = true;
    state.stage = scenario === "celebration" ? "session_complete" : "specialist_generation";
    state.completionReceipts = scenario === "celebration" ? 1 : 0;
  }
  if (scenario === "lesson-reflection") {
    state.specialistCheckpoint = {
      stage: "reflect", teachingPageIndex: 2, familyIndex: 0, cleaveIndex: 0, cleaveStep: 0,
      cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0, controlledIndex: 0, dictationIndex: 0,
      controlledAttempts: Object.fromEntries(BASE_WORD_FAMILY_PREVIEW_PAYLOAD.independentWords.map((word) => [word.canonicalWordId, word.displayWord])),
      controlledChecked: Object.fromEntries(BASE_WORD_FAMILY_PREVIEW_PAYLOAD.independentWords.map((word) => [word.canonicalWordId, true])),
      sentenceAttempts: Object.fromEntries(BASE_WORD_FAMILY_PREVIEW_PAYLOAD.independentWords.map((word) => [word.canonicalWordId, word.dictationSentence])),
      sentenceChecked: true, reflectionText: "",
    };
  }
  state.review = store.exportState();
  return state;
}

function writingView(state: ReviewR6QaState): ReviewR6WritingSessionView {
  return {
    reviewSessionId: `dev-r6-session-${state.run}`, stateVersion: state.writingVersion,
    selectedChallengeType: state.writing.selectedChallengeType, draftText: state.writing.draftText,
    stage: state.writing.phase, writingStartedAt: state.writing.writingStartedAtMs === null ? null : new Date(state.writing.writingStartedAtMs).toISOString(),
    writingDeadlineAt: state.writing.writingDeadlineAtMs === null ? null : new Date(state.writing.writingDeadlineAtMs).toISOString(),
    extensionSeconds: state.writing.extensionSeconds, submittedWritingText: state.review.r3.submittedWritingText,
    completedAt: state.reviewFinalized ? "2026-08-26T12:00:00.000Z" : null,
  };
}

export function applyReviewR6QaRequest(state: ReviewR6QaState, request: ReviewR6GatewayRequest, now = Date.now()): unknown {
  if (request.assignmentId !== state.snapshot.assignment.assignmentId || request.reviewSessionId !== `dev-r6-session-${state.run}`
    || request.snapshotFingerprint !== state.snapshot.provenance.sourceFingerprint) throw new Error("QA fixture identity mismatch");
  const store = createReviewDevelopmentStore(state.snapshot, state.review);
  const persist = (value: unknown) => { state.review = store.exportState(); return value; };
  if (request.action === "hydrate_writing") return writingView(state);
  if (request.action === "hydrate_r3") return store.hydrateReviewR3DevSession();
  if (request.action === "hydrate_r4") return store.hydrateReviewR4DevSession();
  if (request.action === "finalize") {
    if (!store.canFinalize()) throw new Error("Original checks and required repairs must be terminal");
    const lessonDue = state.scenario === "review-lesson" || state.scenario === "review-finalized";
    if (!state.reviewFinalized) {
      state.reviewFinalized = true;
      state.stage = lessonDue ? "specialist_lesson" : "session_complete";
      if (!lessonDue) state.completionReceipts = 1;
    }
    return { specialistOutcome: lessonDue ? "ready" : "not_due" };
  }
  if (state.stage !== "review" || state.reviewFinalized) throw new Error("QA Review is finalized");
  switch (request.action) {
    case "submit_writing": {
      if (state.writing.writingStartedAtMs === null) throw new Error("Writing has not started");
      const result = store.submitReviewR3DevWriting(request);
      if (result.ok) state.writing = { ...accepted(finishCreativeWriting(state.writing, now)), draftText: request.finalWriting };
      return persist(result);
    }
    case "submit_audio": return persist(store.submitReviewR3DevAudio(request));
    case "confirm_suggestion": return persist(store.answerReviewR31DevSuggestion(request));
    case "answer_attempt": return persist(store.answerReviewR31DevAttemptQuestion(request));
    case "confirm_span": return persist(store.confirmReviewR31DevWritingSpan(request));
    case "begin_repair": return persist(store.beginReviewR4DevRepair(request));
    case "move_tricky": return persist(store.moveReviewR4DevToTrickyPart(request));
    case "save_tricky": return persist(store.saveReviewR4DevTrickySpan(request));
    case "save_cue": return persist(store.saveReviewR4DevMemoryCue(request));
    case "move_cover": return persist(store.moveReviewR4DevToCover(request));
    case "move_try": return persist(store.moveReviewR4DevToTryAgain(request));
    case "repair_retry": return persist(store.submitReviewR4DevRetry(request));
  }
  if (state.review.r3.submittedWritingText !== null) throw new Error("Submitted writing is frozen");
  if (request.expectedStateVersion !== state.writingVersion) throw new Error("QA writing version conflict");
  state.writing = expireCreativeWritingIfNeeded(state.writing, now);
  switch (request.action) {
    case "select_prompt": state.writing = accepted(selectReviewChallengePrompt(state.snapshot, state.writing, request.challengeType)); break;
    case "start_writing":
      state.writing = accepted(selectReviewChallengePrompt(state.snapshot, state.writing, request.challengeType));
      state.writing = accepted(beginCreativeWriting(state.snapshot, state.writing, now)); break;
    case "save_draft": state.writing = saveWritingChallengeDraft(state.writing, request.draftText); break;
    case "extend_writing":
      if (request.password !== "qa-parent") throw new Error("Use the disposable QA passphrase only");
      state.writing = accepted(applyParentReauthenticatedExtension(state.writing, request.extensionSeconds, now)); break;
    default: throw new Error("Unsupported QA Review action");
  }
  state.writingVersion += 1;
  return writingView(state);
}

export function saveReviewR6QaSpecialistCheckpoint(state: ReviewR6QaState, checkpoint: unknown) {
  if (state.stage !== "specialist_lesson") throw new Error("Specialist is not open");
  const normalized = normaliseBaseWordFamilyResume(checkpoint, BASE_WORD_FAMILY_PREVIEW_PAYLOAD);
  if (!normalized) throw new Error("Invalid specialist fixture checkpoint");
  state.specialistCheckpoint = normalized;
}

export function completeReviewR6QaSpecialist(state: ReviewR6QaState) {
  if (state.stage === "session_complete") return;
  const checkpoint = normaliseBaseWordFamilyResume(state.specialistCheckpoint, BASE_WORD_FAMILY_PREVIEW_PAYLOAD);
  if (state.stage !== "specialist_lesson" || checkpoint?.stage !== "reflect" || !checkpoint.reflectionText.trim()) {
    throw new Error("Finish the specialist reflection first");
  }
  state.stage = "session_complete";
  state.completionReceipts = 1;
}
