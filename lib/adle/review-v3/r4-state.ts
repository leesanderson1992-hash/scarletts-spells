import type { CompiledReviewSnapshotV3, ReviewTargetSnapshotV3 } from "./contracts";
import { validateReviewGraphemeSpan } from "./graphemes";
import { participatesInReviewRepair, type ReviewR3SessionView } from "./r3-contracts";
import type {
  ReviewMemoryCueVersionView,
  ReviewR4EncounterSubmission,
  ReviewR4GatewayResult,
  ReviewR4MemoryCueSubmission,
  ReviewR4RetrySubmission,
  ReviewR4SessionView,
  ReviewR4TrickySpanSubmission,
  ReviewRepairEncounterView,
  ReviewRepairStage,
  ReviewRepairTerminalOutcome,
} from "./r4-contracts";
import { isExactReviewAudioResponse } from "./target-word-matcher";

export interface ReviewMemoryCueVersionState extends ReviewMemoryCueVersionView {
  childId: string;
  sourceReviewEncounterId: string;
  supersedesCueVersionId: string | null;
  status: "active" | "superseded";
  createdAt: string;
}

export interface ReviewRepairAttemptState {
  attemptNumber: 1 | 2;
  response: string;
  correct: boolean;
  idempotencyKey: string;
  createdAt: string;
}

export interface ReviewRepairEncounterState {
  encounterId: string;
  stage: ReviewRepairStage;
  revealedAt: string;
  trickyGraphemeStart: number | null;
  trickyGraphemeEnd: number | null;
  trickyText: string | null;
  cueVersionId: string | null;
  attempts: readonly ReviewRepairAttemptState[];
  terminalOutcome: ReviewRepairTerminalOutcome | null;
  terminalAt: string | null;
}

interface ReviewR4Receipt {
  idempotencyKey: string;
  kind: string;
  request: string;
}

export interface ReviewR4StoredState {
  childId: string;
  repairs: readonly ReviewRepairEncounterState[];
  cueVersions: readonly ReviewMemoryCueVersionState[];
  receipts: readonly ReviewR4Receipt[];
}

export function createReviewR4StoredState(input?: {
  childId?: string;
  cueVersions?: readonly ReviewMemoryCueVersionState[];
}): ReviewR4StoredState {
  return {
    childId: input?.childId ?? "dev-child",
    repairs: [],
    cueVersions: input?.cueVersions ?? [],
    receipts: [],
  };
}

function targetForEncounter(snapshot: CompiledReviewSnapshotV3, encounterId: string) {
  return snapshot.targets.find((target) => target.encounterId === encounterId) ?? null;
}

function cueView(cue: ReviewMemoryCueVersionState | null): ReviewMemoryCueVersionView | null {
  if (!cue) return null;
  return {
    cueVersionId: cue.cueVersionId,
    canonicalWordId: cue.canonicalWordId,
    spellingAuthorityReferenceId: cue.spellingAuthorityReferenceId,
    spellingAuthorityVersion: cue.spellingAuthorityVersion,
    graphemeStart: cue.graphemeStart,
    graphemeEnd: cue.graphemeEnd,
    selectedText: cue.selectedText,
    cueText: cue.cueText,
    versionNumber: cue.versionNumber,
  };
}

function activeCueForTarget(state: ReviewR4StoredState, target: ReviewTargetSnapshotV3) {
  return state.cueVersions.find((cue) =>
    cue.childId === state.childId &&
    cue.canonicalWordId === target.canonicalWordId &&
    cue.spellingAuthorityReferenceId === target.answerAuthority.referenceId &&
    cue.spellingAuthorityVersion === target.answerAuthority.version &&
    cue.status === "active" &&
    validateReviewGraphemeSpan(
      target.canonicalSpelling,
      cue.graphemeStart,
      cue.graphemeEnd,
      cue.selectedText,
    ) !== null
  ) ?? null;
}

function attemptedForm(reviewSession: ReviewR3SessionView, encounterId: string): string | null {
  const encounter = reviewSession.encounters.find((candidate) => candidate.encounterId === encounterId);
  return encounter?.confirmedWritingAttempt ?? encounter?.submittedAudioResponse ?? null;
}

function repairView(input: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
  repair: ReviewRepairEncounterState;
}): ReviewRepairEncounterView {
  const target = targetForEncounter(input.snapshot, input.repair.encounterId);
  if (!target) throw new Error("Review R4 encounter is absent from the frozen snapshot");
  const revealSpelling = ["compare", "tricky_part", "memory_cue", "look"].includes(input.repair.stage);
  const revealTricky = ["memory_cue", "look"].includes(input.repair.stage);
  const cue = input.state.cueVersions.find((candidate) =>
    candidate.cueVersionId === input.repair.cueVersionId,
  ) ?? null;
  return {
    encounterId: input.repair.encounterId,
    targetOrder: target.order,
    stage: input.repair.stage,
    attemptedForm: ["compare", "tricky_part", "memory_cue"].includes(input.repair.stage)
      ? attemptedForm(input.reviewSession, input.repair.encounterId)
      : null,
    correctSpellingReveal: revealSpelling ? target.canonicalSpelling : null,
    trickyTextReveal: revealTricky ? input.repair.trickyText : null,
    trickyGraphemeStart: input.repair.trickyGraphemeStart,
    trickyGraphemeEnd: input.repair.trickyGraphemeEnd,
    cueVersionUsed: cueView(cue),
    availableExistingCue: cueView(activeCueForTarget(input.state, target)),
    attempts: input.repair.attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      response: attempt.response,
      correct: attempt.correct,
    })),
    terminalOutcome: input.repair.terminalOutcome,
  };
}

function requiredEncounterIds(snapshot: CompiledReviewSnapshotV3, reviewSession: ReviewR3SessionView) {
  const encounterById = new Map(reviewSession.encounters.map((encounter) => [encounter.encounterId, encounter]));
  return [...snapshot.targets]
    .sort((left, right) => left.order - right.order)
    .filter((target) => {
      const encounter = encounterById.get(target.encounterId);
      return encounter ? participatesInReviewRepair(encounter) : false;
    })
    .map((target) => target.encounterId);
}

export function reviewR4SessionView(input: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
}): ReviewR4SessionView {
  const requiredIds = requiredEncounterIds(input.snapshot, input.reviewSession);
  const repairsById = new Map(input.state.repairs.map((repair) => [repair.encounterId, repair]));
  const firstPendingId = requiredIds.find((encounterId) =>
    repairsById.get(encounterId)?.stage !== "terminal",
  ) ?? null;
  const activeRepairState = firstPendingId === null ? null : repairsById.get(firstPendingId) ?? null;
  const terminalRepairs = requiredIds.flatMap((encounterId) => {
    const repair = repairsById.get(encounterId);
    return repair?.stage === "terminal"
      ? [repairView({ ...input, repair })]
      : [];
  });
  return {
    reviewSession: input.reviewSession,
    activeRepair: activeRepairState ? repairView({ ...input, repair: activeRepairState }) : null,
    nextRepairEncounterId: activeRepairState ? null : firstPendingId,
    terminalRepairs,
    allRequiredRepairsTerminal: requiredIds.every((encounterId) =>
      repairsById.get(encounterId)?.stage === "terminal",
    ),
  };
}

type Transition = { state: ReviewR4StoredState; result: ReviewR4GatewayResult };

function receiptRequest(kind: string, input: object) {
  return JSON.stringify({ kind, ...input });
}

function priorReceipt(
  state: ReviewR4StoredState,
  idempotencyKey: string,
  kind: string,
  request: string,
): "replay" | "conflict" | null {
  const receipt = state.receipts.find((candidate) => candidate.idempotencyKey === idempotencyKey);
  if (!receipt) return null;
  return receipt.kind === kind && receipt.request === request ? "replay" : "conflict";
}

function withReceipt(state: ReviewR4StoredState, idempotencyKey: string, kind: string, request: string) {
  return {
    ...state,
    receipts: [...state.receipts, { idempotencyKey, kind, request }],
  };
}

function transitionResult(
  snapshot: CompiledReviewSnapshotV3,
  reviewSession: ReviewR3SessionView,
  state: ReviewR4StoredState,
  replayed: boolean,
): ReviewR4GatewayResult {
  return { ok: true, session: reviewR4SessionView({ snapshot, reviewSession, state }), replayed };
}

function replaceRepair(state: ReviewR4StoredState, next: ReviewRepairEncounterState) {
  return {
    ...state,
    repairs: state.repairs.some((repair) => repair.encounterId === next.encounterId)
      ? state.repairs.map((repair) => repair.encounterId === next.encounterId ? next : repair)
      : [...state.repairs, next],
  };
}

function prepare(input: {
  kind: string;
  submission: ReviewR4EncounterSubmission;
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
}): { request: string; replay?: Transition; target: ReviewTargetSnapshotV3 | null } {
  const request = receiptRequest(input.kind, input.submission);
  const prior = priorReceipt(input.state, input.submission.idempotencyKey, input.kind, request);
  if (prior === "replay") return {
    request,
    target: targetForEncounter(input.snapshot, input.submission.encounterId),
    replay: { state: input.state, result: transitionResult(input.snapshot, input.reviewSession, input.state, true) },
  };
  if (prior === "conflict") return {
    request,
    target: null,
    replay: { state: input.state, result: { ok: false, code: "repair_transition_conflict" } },
  };
  return { request, target: targetForEncounter(input.snapshot, input.submission.encounterId) };
}

export function beginReviewRepair(input: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
  submission: ReviewR4EncounterSubmission;
  now?: string;
}): Transition {
  const prepared = prepare({ kind: "begin_repair", ...input });
  if (prepared.replay) return prepared.replay;
  if (!prepared.target) return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  const encounter = input.reviewSession.encounters.find((candidate) =>
    candidate.encounterId === input.submission.encounterId,
  );
  const expectedNext = reviewR4SessionView(input).nextRepairEncounterId;
  if (!encounter || encounter.originalOutcome !== "failure" || !encounter.repairRequired ||
    expectedNext !== encounter.encounterId || input.state.repairs.some((repair) => repair.encounterId === encounter.encounterId)) {
    return { state: input.state, result: { ok: false, code: "repair_not_eligible" } };
  }
  const next = replaceRepair(input.state, {
    encounterId: encounter.encounterId,
    stage: "compare",
    revealedAt: input.now ?? new Date().toISOString(),
    trickyGraphemeStart: null,
    trickyGraphemeEnd: null,
    trickyText: null,
    cueVersionId: null,
    attempts: [],
    terminalOutcome: null,
    terminalAt: null,
  });
  const receipted = withReceipt(next, input.submission.idempotencyKey, "begin_repair", prepared.request);
  return { state: receipted, result: transitionResult(input.snapshot, input.reviewSession, receipted, false) };
}

function advanceReviewRepair(input: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
  submission: ReviewR4EncounterSubmission;
  kind: "move_to_tricky_part" | "move_to_cover" | "move_to_try_again";
  from: ReviewRepairStage;
  to: ReviewRepairStage;
}): Transition {
  const prepared = prepare(input);
  if (prepared.replay) return prepared.replay;
  const repair = input.state.repairs.find((candidate) => candidate.encounterId === input.submission.encounterId);
  if (!prepared.target || !repair || repair.stage !== input.from) {
    return { state: input.state, result: { ok: false, code: "repair_transition_conflict" } };
  }
  const next = replaceRepair(input.state, { ...repair, stage: input.to });
  const receipted = withReceipt(next, input.submission.idempotencyKey, input.kind, prepared.request);
  return { state: receipted, result: transitionResult(input.snapshot, input.reviewSession, receipted, false) };
}

export function moveReviewRepairToTrickyPart(input: Omit<Parameters<typeof advanceReviewRepair>[0], "kind" | "from" | "to">) {
  return advanceReviewRepair({ ...input, kind: "move_to_tricky_part", from: "compare", to: "tricky_part" });
}

export function saveReviewRepairTrickySpan(input: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
  submission: ReviewR4TrickySpanSubmission;
}): Transition {
  const prepared = prepare({ kind: "save_tricky_part", ...input });
  if (prepared.replay) return prepared.replay;
  const repair = input.state.repairs.find((candidate) => candidate.encounterId === input.submission.encounterId);
  const span = prepared.target && validateReviewGraphemeSpan(
    prepared.target.canonicalSpelling,
    input.submission.graphemeStart,
    input.submission.graphemeEnd,
    input.submission.selectedText,
  );
  if (!prepared.target) return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  if (!repair || repair.stage !== "tricky_part") {
    return { state: input.state, result: { ok: false, code: "repair_transition_conflict" } };
  }
  if (!span) return { state: input.state, result: { ok: false, code: "invalid_grapheme_span" } };
  const next = replaceRepair(input.state, {
    ...repair,
    stage: "memory_cue",
    trickyGraphemeStart: span.graphemeStart,
    trickyGraphemeEnd: span.graphemeEnd,
    trickyText: span.selectedText,
  });
  const receipted = withReceipt(next, input.submission.idempotencyKey, "save_tricky_part", prepared.request);
  return { state: receipted, result: transitionResult(input.snapshot, input.reviewSession, receipted, false) };
}

export function saveReviewRepairMemoryCue(input: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
  submission: ReviewR4MemoryCueSubmission;
  now?: string;
}): Transition {
  const prepared = prepare({ kind: "save_memory_cue", ...input });
  if (prepared.replay) return prepared.replay;
  const repair = input.state.repairs.find((candidate) => candidate.encounterId === input.submission.encounterId);
  if (!prepared.target) return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  if (!repair || repair.stage !== "memory_cue" || repair.trickyGraphemeStart === null ||
    repair.trickyGraphemeEnd === null || repair.trickyText === null) {
    return { state: input.state, result: { ok: false, code: "repair_transition_conflict" } };
  }
  const activeCue = activeCueForTarget(input.state, prepared.target);
  let cueVersions = [...input.state.cueVersions];
  let cue: ReviewMemoryCueVersionState;
  if (input.submission.retainCueVersionId) {
    if (!activeCue || activeCue.cueVersionId !== input.submission.retainCueVersionId ||
      activeCue.graphemeStart !== repair.trickyGraphemeStart ||
      activeCue.graphemeEnd !== repair.trickyGraphemeEnd ||
      activeCue.selectedText !== repair.trickyText) {
      return { state: input.state, result: { ok: false, code: "memory_cue_not_eligible" } };
    }
    cue = activeCue;
  } else {
    const cueText = input.submission.cueText.normalize("NFC").trim();
    if (cueText.length === 0 || cueText.length > 240) {
      return { state: input.state, result: { ok: false, code: "invalid_memory_cue" } };
    }
    const matchingVersions = input.state.cueVersions.filter((candidate) =>
      candidate.childId === input.state.childId &&
      candidate.canonicalWordId === prepared.target!.canonicalWordId &&
      candidate.spellingAuthorityReferenceId === prepared.target!.answerAuthority.referenceId &&
      candidate.spellingAuthorityVersion === prepared.target!.answerAuthority.version
    );
    const versionNumber = Math.max(0, ...matchingVersions.map((candidate) => candidate.versionNumber)) + 1;
    cueVersions = cueVersions.map((candidate) => candidate.cueVersionId === activeCue?.cueVersionId
      ? { ...candidate, status: "superseded" as const }
      : candidate);
    cue = {
      cueVersionId: `review-cue:${prepared.target.canonicalWordId}:${versionNumber}`,
      childId: input.state.childId,
      canonicalWordId: prepared.target.canonicalWordId,
      spellingAuthorityReferenceId: prepared.target.answerAuthority.referenceId,
      spellingAuthorityVersion: prepared.target.answerAuthority.version,
      graphemeStart: repair.trickyGraphemeStart,
      graphemeEnd: repair.trickyGraphemeEnd,
      selectedText: repair.trickyText,
      cueText,
      versionNumber,
      sourceReviewEncounterId: repair.encounterId,
      supersedesCueVersionId: activeCue?.cueVersionId ?? null,
      status: "active",
      createdAt: input.now ?? new Date().toISOString(),
    };
    cueVersions.push(cue);
  }
  const next = replaceRepair({ ...input.state, cueVersions }, {
    ...repair,
    stage: "look",
    cueVersionId: cue.cueVersionId,
  });
  const receipted = withReceipt(next, input.submission.idempotencyKey, "save_memory_cue", prepared.request);
  return { state: receipted, result: transitionResult(input.snapshot, input.reviewSession, receipted, false) };
}

export function moveReviewRepairToCover(input: Omit<Parameters<typeof advanceReviewRepair>[0], "kind" | "from" | "to">) {
  return advanceReviewRepair({ ...input, kind: "move_to_cover", from: "look", to: "cover" });
}

export function moveReviewRepairToTryAgain(input: Omit<Parameters<typeof advanceReviewRepair>[0], "kind" | "from" | "to">) {
  return advanceReviewRepair({ ...input, kind: "move_to_try_again", from: "cover", to: "try_again" });
}

export function submitReviewRepairRetry(input: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  state: ReviewR4StoredState;
  submission: ReviewR4RetrySubmission;
  now?: string;
}): Transition {
  const prepared = prepare({ kind: "submit_repair_retry", ...input });
  if (prepared.replay) return prepared.replay;
  const repair = input.state.repairs.find((candidate) => candidate.encounterId === input.submission.encounterId);
  if (!prepared.target) return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  const response = input.submission.response.normalize("NFC").trim();
  if (!repair || repair.stage !== "try_again" || response.length === 0 || repair.attempts.length >= 2) {
    return { state: input.state, result: { ok: false, code: "repair_retry_not_eligible" } };
  }
  const attemptNumber = (repair.attempts.length + 1) as 1 | 2;
  const correct = isExactReviewAudioResponse(response, prepared.target);
  const attempts: ReviewRepairAttemptState[] = [...repair.attempts, {
    attemptNumber,
    response,
    correct,
    idempotencyKey: input.submission.idempotencyKey,
    createdAt: input.now ?? new Date().toISOString(),
  }];
  const terminalOutcome = correct
    ? "repair_completed"
    : attemptNumber === 2 ? "repair_attempted_not_secured" : null;
  const next = replaceRepair(input.state, {
    ...repair,
    stage: terminalOutcome ? "terminal" : "look",
    attempts,
    terminalOutcome,
    terminalAt: terminalOutcome ? input.now ?? new Date().toISOString() : null,
  });
  const receipted = withReceipt(next, input.submission.idempotencyKey, "submit_repair_retry", prepared.request);
  return { state: receipted, result: transitionResult(input.snapshot, input.reviewSession, receipted, false) };
}
