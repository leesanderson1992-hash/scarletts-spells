import { createHash } from "node:crypto";

export const R6_ACTIVE_REVIEW_MEMBERSHIPS = [
  "scheduled",
  "catch_up",
  "awaiting_pre_retirement_check",
  "paused_parent_review",
] as const;

export type R6ReviewMembership = typeof R6_ACTIVE_REVIEW_MEMBERSHIPS[number]
  | "ejected_pending_reteach"
  | "retired";

export interface R6GateBWordFact {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  bundleId: string;
  membershipStatus: R6ReviewMembership;
  catchUpStage: 0 | 1 | 2;
  nextRetestDueOn: string | null;
  failedReviewOn: string | null;
  preRetirementCheckDueOn: string | null;
  last28DayReviewOn: string | null;
  reteachCycleCount: number;
  taughtOn: string;
  rowStatus: "draft" | "active" | "rejected" | "superseded";
  bundleChildId: string;
  bundleSourceRef: string;
  bundleIntervalIndex: number;
  bundleNextDueOn: string;
  bundlePolicyVersion: string;
  bundleStatus: "active" | "completed";
  bundleRowStatus: "draft" | "active" | "rejected" | "superseded";
  canonicalRowStatus: "draft" | "active" | "rejected" | "superseded";
  taughtHistoryReferences: readonly string[];
  routeProvenanceReferences: readonly string[];
  sourceAssignmentItemReferences: readonly string[];
  outcomeReferences: readonly string[];
  wordScheduleVersion: string | null;
  wordIntervalIndex: number | null;
  wordNextDueOn: string | null;
  wordSchedulePolicyVersion: string | null;
}

export interface R6GateBAuditRow {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  activeSchedule: boolean;
  classification: "legacy_authoritative" | "already_per_word_authoritative" | "ambiguous" | "excluded";
  schedulerState: R6ReviewMembership;
  effectiveDueOn: string | null;
  protectedState: Record<string, unknown>;
  authorityState: Record<string, unknown>;
  ambiguityCodes: readonly string[];
}

export interface R6GateBAudit {
  contractVersion: "adle_review_r6_authority_cutover_v1";
  scope: readonly string[];
  auditOn: string;
  rows: readonly R6GateBAuditRow[];
  counts: {
    totalActiveScheduleRows: number;
    canonicalWords: number;
    legacyAuthoritative: number;
    alreadyPerWordAuthoritative: number;
    excluded: number;
    overdue: number;
    dueToday: number;
    futureDue: number;
    catchUpStage1: number;
    catchUpStage2: number;
    preRetirement: number;
    ambiguity: number;
  };
  stateCounts: Record<typeof R6_ACTIVE_REVIEW_MEMBERSHIPS[number], number>;
  activeRowIds: readonly string[];
  canonicalWordIds: readonly string[];
  outcomeReferenceCount: number;
  protectedStateDigest: string;
  fingerprint: string;
}

export interface R6GateBCutoverReceipt {
  cutoverVersion: string;
  idempotencyKey: string;
  scope: readonly string[];
  auditOn: string;
  auditFingerprint: string;
  protectedBeforeDigest: string;
  protectedAfterDigest: string;
  initializedAuthorityRows: number;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function isLiveMembership(value: R6ReviewMembership): value is typeof R6_ACTIVE_REVIEW_MEMBERSHIPS[number] {
  return (R6_ACTIVE_REVIEW_MEMBERSHIPS as readonly string[]).includes(value);
}

function effectiveDueOn(word: R6GateBWordFact): string | null {
  if (word.membershipStatus === "scheduled") return word.wordNextDueOn ?? word.bundleNextDueOn;
  if (word.membershipStatus === "catch_up") return word.nextRetestDueOn;
  if (word.membershipStatus === "awaiting_pre_retirement_check") return word.preRetirementCheckDueOn;
  return null;
}

function protectedState(word: R6GateBWordFact): Record<string, unknown> {
  return {
    scheduleWordId: word.scheduleWordId,
    childId: word.childId,
    canonicalWordId: word.canonicalWordId,
    bundleId: word.bundleId,
    membershipStatus: word.membershipStatus,
    effectiveDueOn: effectiveDueOn(word),
    effectiveIntervalIndex: word.wordIntervalIndex ?? word.bundleIntervalIndex,
    effectivePolicyVersion: word.wordSchedulePolicyVersion ?? word.bundlePolicyVersion,
    catchUpStage: word.catchUpStage,
    nextRetestDueOn: word.nextRetestDueOn,
    failedReviewOn: word.failedReviewOn,
    preRetirementCheckDueOn: word.preRetirementCheckDueOn,
    last28DayReviewOn: word.last28DayReviewOn,
    reteachCycleCount: word.reteachCycleCount,
    taughtOn: word.taughtOn,
    rowStatus: word.rowStatus,
    bundle: {
      childId: word.bundleChildId,
      sourceRef: word.bundleSourceRef,
      intervalIndex: word.bundleIntervalIndex,
      nextDueOn: word.bundleNextDueOn,
      policyVersion: word.bundlePolicyVersion,
      status: word.bundleStatus,
      rowStatus: word.bundleRowStatus,
    },
    canonicalRowStatus: word.canonicalRowStatus,
    taughtHistoryReferences: sortedUnique(word.taughtHistoryReferences),
    routeProvenanceReferences: sortedUnique(word.routeProvenanceReferences),
    sourceAssignmentItemReferences: sortedUnique(word.sourceAssignmentItemReferences),
    outcomeReferences: sortedUnique(word.outcomeReferences),
  };
}

function auditRow(word: R6GateBWordFact): R6GateBAuditRow {
  const liveMembership = isLiveMembership(word.membershipStatus);
  const activeSchedule = word.rowStatus === "active" && word.bundleStatus === "active" &&
    word.bundleRowStatus === "active" && word.canonicalRowStatus === "active" && liveMembership;
  const ambiguityCodes: string[] = [];
  if (word.rowStatus === "active" && liveMembership) {
    if (word.bundleStatus !== "active" || word.bundleRowStatus !== "active") {
      ambiguityCodes.push("live_word_has_inactive_bundle");
    }
    if (word.canonicalRowStatus !== "active") ambiguityCodes.push("live_word_has_inactive_canonical_word");
    if (word.bundleChildId !== word.childId) ambiguityCodes.push("schedule_bundle_child_mismatch");
  }
  if (activeSchedule && word.membershipStatus === "scheduled" &&
    (word.catchUpStage !== 0 || word.nextRetestDueOn !== null || word.failedReviewOn !== null ||
      word.preRetirementCheckDueOn !== null)) ambiguityCodes.push("invalid_normal_scheduled_state");
  if (activeSchedule && word.membershipStatus === "catch_up" &&
    (![1, 2].includes(word.catchUpStage) || word.nextRetestDueOn === null || word.failedReviewOn === null)) {
    ambiguityCodes.push("invalid_catch_up_state");
  }
  if (activeSchedule && word.membershipStatus === "awaiting_pre_retirement_check" &&
    (word.preRetirementCheckDueOn === null || word.catchUpStage !== 0 || word.nextRetestDueOn !== null)) {
    ambiguityCodes.push("invalid_pre_retirement_state");
  }
  if (activeSchedule && word.membershipStatus === "paused_parent_review" &&
    (word.catchUpStage !== 0 || word.nextRetestDueOn !== null)) {
    ambiguityCodes.push("invalid_paused_parent_state");
  }
  const legacyAuthority = word.wordScheduleVersion === null && word.wordIntervalIndex === null &&
    word.wordNextDueOn === null && word.wordSchedulePolicyVersion === null;
  const exactAuthority = word.wordScheduleVersion === "adle_review_per_word_schedule_v1" &&
    word.wordIntervalIndex === word.bundleIntervalIndex &&
    word.wordSchedulePolicyVersion === word.bundlePolicyVersion &&
    (word.membershipStatus === "scheduled"
      ? word.wordNextDueOn === word.bundleNextDueOn
      : word.wordNextDueOn === null);
  if (activeSchedule && !legacyAuthority && !exactAuthority) ambiguityCodes.push("conflicting_per_word_authority");
  if (activeSchedule && word.taughtHistoryReferences.length === 0) ambiguityCodes.push("missing_active_taught_history");
  if (activeSchedule && word.routeProvenanceReferences.length === 0 && word.bundleSourceRef.trim() === "") {
    ambiguityCodes.push("missing_source_or_route_provenance");
  }
  return {
    scheduleWordId: word.scheduleWordId,
    childId: word.childId,
    canonicalWordId: word.canonicalWordId,
    activeSchedule,
    classification: ambiguityCodes.length > 0 ? "ambiguous"
      : !activeSchedule ? "excluded"
      : legacyAuthority ? "legacy_authoritative"
      : "already_per_word_authoritative",
    schedulerState: word.membershipStatus,
    effectiveDueOn: effectiveDueOn(word),
    protectedState: protectedState(word),
    authorityState: {
      wordScheduleVersion: word.wordScheduleVersion,
      wordIntervalIndex: word.wordIntervalIndex,
      wordNextDueOn: word.wordNextDueOn,
      wordSchedulePolicyVersion: word.wordSchedulePolicyVersion,
    },
    ambiguityCodes,
  };
}

export function auditR6GateBAuthority(input: {
  words: readonly R6GateBWordFact[];
  childScope: readonly string[];
  auditOn: string;
}): R6GateBAudit {
  const scope = sortedUnique(input.childScope);
  if (scope.length === 0 || scope.length !== input.childScope.length) throw new Error("invalid_gate_b_scope");
  const scopeSet = new Set(scope);
  const rows = input.words.filter((word) => scopeSet.has(word.childId)).map(auditRow)
    .sort((left, right) => left.childId.localeCompare(right.childId) ||
      left.scheduleWordId.localeCompare(right.scheduleWordId));
  const active = rows.filter((row) => row.activeSchedule);
  const stateCounts = Object.fromEntries(R6_ACTIVE_REVIEW_MEMBERSHIPS.map((state) => [
    state,
    active.filter((row) => row.schedulerState === state).length,
  ])) as R6GateBAudit["stateCounts"];
  const counts = {
    totalActiveScheduleRows: active.length,
    canonicalWords: new Set(active.map((row) => row.canonicalWordId)).size,
    legacyAuthoritative: active.filter((row) => row.classification === "legacy_authoritative").length,
    alreadyPerWordAuthoritative: active.filter((row) => row.classification === "already_per_word_authoritative").length,
    excluded: rows.filter((row) => row.classification === "excluded").length,
    overdue: active.filter((row) => row.effectiveDueOn !== null && row.effectiveDueOn < input.auditOn).length,
    dueToday: active.filter((row) => row.effectiveDueOn === input.auditOn).length,
    futureDue: active.filter((row) => row.effectiveDueOn !== null && row.effectiveDueOn > input.auditOn).length,
    catchUpStage1: active.filter((row) => row.schedulerState === "catch_up" &&
      row.protectedState.catchUpStage === 1).length,
    catchUpStage2: active.filter((row) => row.schedulerState === "catch_up" &&
      row.protectedState.catchUpStage === 2).length,
    preRetirement: active.filter((row) => row.schedulerState === "awaiting_pre_retirement_check").length,
    ambiguity: rows.filter((row) => row.classification === "ambiguous").length,
  };
  const base = {
    contractVersion: "adle_review_r6_authority_cutover_v1" as const,
    scope,
    auditOn: input.auditOn,
    rows,
    counts,
    stateCounts,
    activeRowIds: active.map((row) => row.scheduleWordId),
    canonicalWordIds: active.map((row) => row.canonicalWordId),
    outcomeReferenceCount: active.reduce((total, row) => total +
      (row.protectedState.outcomeReferences as readonly string[]).length, 0),
    protectedStateDigest: digest(active.map((row) => row.protectedState)),
  };
  return { ...base, fingerprint: digest(base) };
}

export function applyR6GateBAuthorityCutover(input: {
  words: readonly R6GateBWordFact[];
  childScope: readonly string[];
  auditOn: string;
  approvedFingerprint: string;
  cutoverVersion: string;
  idempotencyKey: string;
  receipts?: readonly R6GateBCutoverReceipt[];
  forceFailureAfterMutation?: boolean;
}): { words: R6GateBWordFact[]; receipt: R6GateBCutoverReceipt; replayed: boolean } {
  const scope = sortedUnique(input.childScope);
  const existing = input.receipts?.find((receipt) => receipt.idempotencyKey === input.idempotencyKey);
  if (existing) {
    if (canonical(existing.scope) !== canonical(scope) || existing.auditOn !== input.auditOn ||
      existing.auditFingerprint !== input.approvedFingerprint || existing.cutoverVersion !== input.cutoverVersion) {
      throw new Error("adle_review_r6_authority_cutover_idempotency_conflict");
    }
    return { words: input.words.map((word) => ({ ...word })), receipt: existing, replayed: true };
  }
  if (input.receipts?.some((receipt) => receipt.cutoverVersion === input.cutoverVersion)) {
    throw new Error("adle_review_r6_authority_cutover_receipt_conflict");
  }
  const before = auditR6GateBAuthority({ words: input.words, childScope: scope, auditOn: input.auditOn });
  if (before.fingerprint !== input.approvedFingerprint) throw new Error("adle_review_r6_authority_audit_fingerprint_drift");
  if (before.counts.ambiguity !== 0) throw new Error("adle_review_r6_authority_inventory_ambiguous");
  const activeIds = new Set(before.activeRowIds);
  const next = input.words.map((word) => activeIds.has(word.scheduleWordId) && word.wordScheduleVersion === null
    ? {
        ...word,
        wordScheduleVersion: "adle_review_per_word_schedule_v1",
        wordIntervalIndex: word.bundleIntervalIndex,
        wordNextDueOn: word.membershipStatus === "scheduled" ? word.bundleNextDueOn : null,
        wordSchedulePolicyVersion: word.bundlePolicyVersion,
      }
    : { ...word });
  if (input.forceFailureAfterMutation) throw new Error("forced_transaction_failure");
  const after = auditR6GateBAuthority({ words: next, childScope: scope, auditOn: input.auditOn });
  if (after.counts.legacyAuthoritative !== 0 || after.counts.ambiguity !== 0 ||
    canonical(after.activeRowIds) !== canonical(before.activeRowIds) ||
    canonical(after.canonicalWordIds) !== canonical(before.canonicalWordIds) ||
    after.protectedStateDigest !== before.protectedStateDigest ||
    after.outcomeReferenceCount !== before.outcomeReferenceCount) {
    throw new Error("adle_review_r6_authority_cutover_protected_state_changed");
  }
  const receipt: R6GateBCutoverReceipt = {
    cutoverVersion: input.cutoverVersion,
    idempotencyKey: input.idempotencyKey,
    scope,
    auditOn: input.auditOn,
    auditFingerprint: input.approvedFingerprint,
    protectedBeforeDigest: before.protectedStateDigest,
    protectedAfterDigest: after.protectedStateDigest,
    initializedAuthorityRows: before.counts.legacyAuthoritative,
  };
  return { words: next, receipt, replayed: false };
}
