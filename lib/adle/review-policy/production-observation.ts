import "server-only";

import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { IsoDate } from "../review-scheduler";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "./contracts";
import {
  hydratePersistedReviewSchedule,
  equalPersistedTargetStatesForHistory,
  persistedTargetStateFromRow,
  targetPolicyConfigFromRegistry,
  type PersistedReviewPolicyRow,
  type PersistedReviewScheduleStateC2B2,
  type PersistedReviewScheduleWordRow,
  type PersistedTargetTransitionRow,
} from "./runtime-coexistence";
import {
  buildTargetReviewTransitionPlan,
  type TargetControlledPassSourceFact,
  type TargetReviewOutcomeSourceFact,
  type TargetTransitionSource,
} from "./target-transition-persistence";

export const C2B_PRODUCTION_OBSERVATION_VERSION =
  "ADLE_C2B_PRODUCTION_OBSERVATION_V1" as const;

export type ObservationClassification =
  | "PROGRESS"
  | "INTERESTING_EVIDENCE"
  | "ALERT"
  | "NO_CHANGE";

export type ObservationFinding = {
  classification: ObservationClassification;
  code: string;
  entityKind: string;
  entityId: string;
  detail: string;
};

export type ObservationTransitionRow = PersistedTargetTransitionRow & {
  id: string;
  child_id: string;
  canonical_word_id: string;
  idempotency_key: string;
  cutover_approval_reference: string | null;
  reducer_version: string;
  source_fingerprint: string;
  occurred_at: string | null;
  created_at: string;
};

export type ObservationOutcomeRow = TargetReviewOutcomeSourceFact & {
  review_session_id: string;
  review_encounter_id: string;
  event_type: string;
  result_source: string;
  frozen_due_on: IsoDate;
  assignment_practice_date: IsoDate;
  source_provenance: unknown;
  created_at: string;
};

export type ObservationEncounterRow = {
  id: string;
  review_session_id: string;
  schedule_word_id: string;
  canonical_word_id: string;
  target_order: number;
  original_outcome: string;
  original_outcome_source: string | null;
  review_outcome_event_id: string | null;
  repair_state: string;
  created_at: string;
};

export type ObservationSessionRow = {
  id: string;
  child_id: string;
  daily_assignment_id: string;
  assignment_date: IsoDate;
  snapshot_fingerprint: string;
  stage: string;
  state_version: number;
  completed_at: string | null;
  created_at: string;
  target_schedule_word_ids: string[];
  target_v2_schedule_word_ids: string[];
  target_snapshot_facts: Array<{
    scheduleWordId: string;
    schedulePolicyVersion: string;
    wordScheduleVersion: string;
    membershipStatus: string;
    intervalIndex: number;
    dueOn: IsoDate | null;
  }>;
};

export type ObservationCompletionReceiptRow = {
  id: string;
  review_session_id: string;
  snapshot_fingerprint: string;
  request_fingerprint: string;
  completed_at: string;
  review_completed_on: IsoDate;
  result_payload: unknown;
  created_at: string;
};

export type ObservationControlledReceiptRow = TargetControlledPassSourceFact & {
  daily_assignment_id: string;
  source_ref: string;
  controlled_cycle_kind: string;
  cover_write_attempt_event_id: string | null;
  cover_write_outcome: string | null;
  sentence_dictation_attempt_event_id: string | null;
  sentence_dictation_outcome: string | null;
  later_clean_attempt_event_id: string | null;
  later_clean_outcome: string | null;
  decision_reason: string;
  source_fingerprint: string;
  created_at: string;
};

export type ObservationLogFact = {
  id: string;
  occurredAt: string | null;
  level: string;
  statusCode: number | null;
  route: string | null;
  message: string;
  deploymentId: string | null;
};

export type ObservationInput = {
  observedAt: string;
  sourceBaseline: string;
  deploymentIdentity: string | null;
  productionProjectRef: string;
  learnerId: string;
  approvedTargetScheduleIds: readonly string[];
  targetSchedules: readonly PersistedReviewScheduleWordRow[];
  targetPolicy: PersistedReviewPolicyRow;
  transitions: readonly ObservationTransitionRow[];
  outcomes: readonly ObservationOutcomeRow[];
  encounters: readonly ObservationEncounterRow[];
  sessions: readonly ObservationSessionRow[];
  completionReceipts: readonly ObservationCompletionReceiptRow[];
  controlledReceipts: readonly ObservationControlledReceiptRow[];
  logs: readonly ObservationLogFact[];
  previous?: C2BProductionObservationReceipt | null;
};

export type ObservedTargetSchedule = {
  scheduleWordId: string;
  canonicalWordId: string;
  childId: string;
  membership: string;
  rung: string | null;
  dueOn: IsoDate | null;
  revision: number;
  consecutiveIndependentFailures: number;
  failureEpisodeId: string | null;
  hydration: "HYDRATED" | "REJECTED";
  rowFingerprint: string;
};

export type ObservedTargetTransition = {
  transitionEventId: string;
  scheduleWordId: string;
  sourceKind: ObservationTransitionRow["transition_kind"];
  sourceId: string | null;
  sourceReviewSessionId: string | null;
  immutableOutcome: "success" | "failure" | "controlled_pass" | "policy_cutover" | null;
  transitionReason: string;
  expectedRevision: number;
  appliedRevision: number;
  before: PersistedReviewScheduleStateC2B2 | Record<string, unknown>;
  after: PersistedReviewScheduleStateC2B2;
  reducerParity: "MATCH" | "NOT_APPLICABLE" | "MISMATCH" | "UNPROVABLE";
  occurredAt: string | null;
  recordFingerprint: string;
};

export type C2BProductionObservationReceipt = {
  observationVersion: typeof C2B_PRODUCTION_OBSERVATION_VERSION;
  observedAt: string;
  sourceBaseline: string;
  deploymentIdentity: string | null;
  productionProjectRef: string;
  learnerId: string;
  targetStateCensus: ObservedTargetSchedule[];
  newlyObservedReviewSessions: ObservationSessionRow[];
  newlyObservedTargetTransitions: ObservedTargetTransition[];
  newlyObservedCompletionReceipts: ObservationCompletionReceiptRow[];
  newlyObservedControlledReceipts: ObservationControlledReceiptRow[];
  c2bLogsSincePrevious: ObservationLogFact[];
  progress: ObservationFinding[];
  interestingEvidence: ObservationFinding[];
  alerts: ObservationFinding[];
  noChange: ObservationFinding[];
  invariantChecks: Array<{ code: string; passed: boolean; detail: string }>;
  policyState: {
    schedulePolicyVersion: string;
    isActive: boolean;
    isDefaultForNewSchedules: boolean;
  };
  stableRecordFingerprints: {
    transitions: Record<string, string>;
    outcomes: Record<string, string>;
    sessions: Record<string, string>;
    completionReceipts: Record<string, string>;
    controlledReceipts: Record<string, string>;
  };
  normalizedStateFingerprint: string;
};

function sorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function recordMap<T extends { id: string }>(values: readonly T[]): Record<string, string> {
  return Object.fromEntries(sorted(values, (value) => value.id).map((value) => [
    value.id,
    fingerprintSnapshotValue(value),
  ]));
}

function transitionSourceId(row: ObservationTransitionRow): string | null {
  return row.source_review_outcome_event_id
    ?? row.source_controlled_graduation_receipt_id
    ?? row.cutover_approval_reference
    ?? null;
}

function rungFrom(row: PersistedReviewScheduleWordRow): string | null {
  const rungs = ["DAY_1", "DAY_3", "DAY_7", "DAY_14", "DAY_28", "DAY_56"];
  return row.word_interval_index === null ? null : (rungs[row.word_interval_index] ?? null);
}

function findNew<T extends { id: string }>(
  values: readonly T[],
  previous: Record<string, string> | undefined,
): T[] {
  return sorted(values.filter((value) => !previous?.[value.id]), (value) => value.id);
}

function same(left: unknown, right: unknown): boolean {
  return fingerprintSnapshotValue(left) === fingerprintSnapshotValue(right);
}

function syntheticRowAtTransition(
  current: PersistedReviewScheduleWordRow,
  transition: ObservationTransitionRow,
): PersistedReviewScheduleWordRow | null {
  if (transition.transition_kind === "POLICY_CUTOVER_APPLIED") return null;
  const state = transition.from_state as PersistedReviewScheduleStateC2B2;
  return {
    ...current,
    membership_status: state.membershipStatus,
    word_schedule_version: state.stateShapeVersion,
    word_schedule_policy_version: state.schedulePolicyVersion,
    word_interval_index: state.wordIntervalIndex,
    word_next_due_on: state.wordNextDueOn,
    pre_retirement_check_due_on: state.preRetirementCheckDueOn,
    last_28_day_review_on: state.last28DayReviewOn,
    word_schedule_transition_count: transition.expected_state_revision,
    word_last_review_completed_on: state.wordLastReviewCompletedOn,
    word_last_review_completed_at: state.wordLastReviewCompletedAt,
    consecutive_independent_failures: state.consecutiveIndependentFailures,
    failure_episode_id: state.failureEpisodeId,
  };
}

function transitionParity(input: {
  row: PersistedReviewScheduleWordRow;
  transition: ObservationTransitionRow;
  allTransitions: readonly ObservationTransitionRow[];
  outcomes: readonly ObservationOutcomeRow[];
  controlledReceipts: readonly ObservationControlledReceiptRow[];
  targetPolicy: PersistedReviewPolicyRow;
}): "MATCH" | "NOT_APPLICABLE" | "MISMATCH" | "UNPROVABLE" {
  if (input.transition.transition_kind === "POLICY_CUTOVER_APPLIED") return "NOT_APPLICABLE";
  const synthetic = syntheticRowAtTransition(input.row, input.transition);
  const config = targetPolicyConfigFromRegistry(input.targetPolicy);
  if (!synthetic || !config) return "UNPROVABLE";
  const prefix = input.allTransitions.filter((candidate) =>
    candidate.schedule_word_id === input.row.id
    && candidate.applied_state_revision <= input.transition.expected_state_revision);
  const hydrated = hydratePersistedReviewSchedule({ row: synthetic, transitions: prefix });
  if (hydrated.disposition !== "HYDRATED") return "UNPROVABLE";
  let source: TargetTransitionSource | null = null;
  if (input.transition.transition_kind === "REVIEW_OUTCOME_APPLIED") {
    const outcome = input.outcomes.find((candidate) =>
      candidate.id === input.transition.source_review_outcome_event_id);
    if (outcome) source = { kind: "REVIEW_OUTCOME_APPLIED", outcome };
  } else {
    const receipt = input.controlledReceipts.find((candidate) =>
      candidate.id === input.transition.source_controlled_graduation_receipt_id);
    if (receipt?.decision === "PASS") source = { kind: "CONTROLLED_PASS_APPLIED", receipt };
  }
  if (!source) return "UNPROVABLE";
  const planned = buildTargetReviewTransitionPlan({
    schedule: hydrated.schedule,
    source,
    policyConfig: config,
  });
  if (planned.disposition !== "PLANNED") return "MISMATCH";
  return planned.value.decisionReason === input.transition.transition_reason
    && planned.value.reducerVersion === input.transition.reducer_version
    && planned.value.sourceFingerprint === input.transition.source_fingerprint
    && same(planned.value.toState, input.transition.to_state)
    ? "MATCH"
    : "MISMATCH";
}

export function buildC2BProductionObservation(
  input: ObservationInput,
): C2BProductionObservationReceipt {
  const findings: ObservationFinding[] = [];
  const checks: Array<{ code: string; passed: boolean; detail: string }> = [];
  const alert = (code: string, entityKind: string, entityId: string, detail: string) =>
    findings.push({ classification: "ALERT", code, entityKind, entityId, detail });
  const finding = (
    classification: Exclude<ObservationClassification, "ALERT" | "NO_CHANGE">,
    code: string,
    entityKind: string,
    entityId: string,
    detail: string,
  ) => findings.push({ classification, code, entityKind, entityId, detail });

  const transitions = sorted(input.transitions, (row) =>
    `${row.schedule_word_id}:${String(row.applied_state_revision).padStart(12, "0")}:${row.id}`);
  const targetSchedules = sorted(input.targetSchedules, (row) => row.id);
  const outcomeById = new Map(input.outcomes.map((row) => [row.id, row]));
  const encounterById = new Map(input.encounters.map((row) => [row.id, row]));
  const expectedIds = new Set(input.approvedTargetScheduleIds);

  for (const row of targetSchedules) {
    if (row.child_id !== input.learnerId || !expectedIds.has(row.id)) {
      alert("UNEXPECTED_TARGET_SCHEDULE", "schedule_word", row.id,
        "Target-v2 schedule is outside the learner-bounded approved cohort.");
    }
  }
  for (const id of expectedIds) {
    if (!targetSchedules.some((row) => row.id === id)) {
      alert("APPROVED_TARGET_SCHEDULE_MISSING", "schedule_word", id,
        "Previously approved target-v2 schedule is absent from the census.");
    }
  }

  const census: ObservedTargetSchedule[] = targetSchedules.map((row) => {
    const history = transitions.filter((event) => event.schedule_word_id === row.id);
    const firstExpected = history[0]?.expected_state_revision ?? row.word_schedule_transition_count;
    const revisionContinuous = history.every((event, index) =>
      event.expected_state_revision === firstExpected + index
      && event.applied_state_revision === firstExpected + index + 1)
      && (history.length === 0 || history.at(-1)?.applied_state_revision === row.word_schedule_transition_count);
    if (!revisionContinuous) {
      alert("REVISION_DISCONTINUITY", "schedule_word", row.id,
        "Transition expected/applied revisions are not a continuous chain ending at the persisted revision.");
    }
    const persisted = persistedTargetStateFromRow(row);
    if (history.length > 0 && (!persisted
      || !equalPersistedTargetStatesForHistory(history.at(-1)?.to_state, persisted))) {
      alert("PERSISTED_RESULTING_STATE_MISMATCH", "schedule_word", row.id,
        "Latest immutable transition result is not byte-canonical with the persisted target state.");
    }
    const hydration = hydratePersistedReviewSchedule({ row, transitions: history });
    if (hydration.disposition !== "HYDRATED" || hydration.schedule.kind !== "TARGET_REGRESSION_V1") {
      alert("TARGET_HYDRATION_REJECTED", "schedule_word", row.id,
        hydration.disposition === "REJECTED" ? hydration.reason : "wrong executor");
    }
    return {
      scheduleWordId: row.id,
      canonicalWordId: row.canonical_word_id,
      childId: row.child_id,
      membership: row.membership_status,
      rung: rungFrom(row),
      dueOn: row.word_next_due_on as IsoDate | null,
      revision: row.word_schedule_transition_count,
      consecutiveIndependentFailures: row.consecutive_independent_failures ?? -1,
      failureEpisodeId: row.failure_episode_id,
      hydration: hydration.disposition === "HYDRATED"
        && hydration.schedule.kind === "TARGET_REGRESSION_V1" ? "HYDRATED" : "REJECTED",
      rowFingerprint: fingerprintSnapshotValue(row),
    };
  });

  const observedTransitions: ObservedTargetTransition[] = transitions.map((transition) => {
    const row = targetSchedules.find((candidate) => candidate.id === transition.schedule_word_id);
    const outcome = transition.source_review_outcome_event_id
      ? outcomeById.get(transition.source_review_outcome_event_id) : undefined;
    const controlled = transition.source_controlled_graduation_receipt_id
      ? input.controlledReceipts.find((candidate) =>
        candidate.id === transition.source_controlled_graduation_receipt_id) : undefined;
    const parity = row ? transitionParity({
      row,
      transition,
      allTransitions: transitions,
      outcomes: input.outcomes,
      controlledReceipts: input.controlledReceipts,
      targetPolicy: input.targetPolicy,
    }) : "UNPROVABLE";
    if (parity === "MISMATCH" || parity === "UNPROVABLE") {
      alert(parity === "MISMATCH" ? "REDUCER_TRANSITION_MISMATCH" : "REDUCER_TRANSITION_UNPROVABLE",
        "transition_event", transition.id,
        `Persisted transition parity result is ${parity}.`);
    }
    return {
      transitionEventId: transition.id,
      scheduleWordId: transition.schedule_word_id,
      sourceKind: transition.transition_kind,
      sourceId: transitionSourceId(transition),
      sourceReviewSessionId: outcome?.review_session_id ?? null,
      immutableOutcome: outcome?.original_result
        ?? (controlled ? "controlled_pass" : transition.transition_kind === "POLICY_CUTOVER_APPLIED"
          ? "policy_cutover" : null),
      transitionReason: transition.transition_reason,
      expectedRevision: transition.expected_state_revision,
      appliedRevision: transition.applied_state_revision,
      before: transition.from_state as PersistedReviewScheduleStateC2B2 | Record<string, unknown>,
      after: transition.to_state as PersistedReviewScheduleStateC2B2,
      reducerParity: parity,
      occurredAt: transition.occurred_at,
      recordFingerprint: fingerprintSnapshotValue(transition),
    };
  });

  const transitionSources = new Map<string, ObservationTransitionRow[]>();
  for (const transition of transitions) {
    const sourceId = transitionSourceId(transition);
    if (!sourceId || transition.transition_kind === "POLICY_CUTOVER_APPLIED") continue;
    transitionSources.set(sourceId, [...(transitionSources.get(sourceId) ?? []), transition]);
  }
  for (const [sourceId, rows] of transitionSources) {
    if (rows.length > 1) alert("DUPLICATE_SOURCE_TRANSITION", "source_event", sourceId,
      `${rows.length} target transitions reference the same governed source.`);
  }

  for (const outcome of input.outcomes) {
    const linked = transitions.filter((row) => row.source_review_outcome_event_id === outcome.id);
    const encounter = encounterById.get(outcome.review_encounter_id);
    if (!encounter || encounter.review_outcome_event_id !== outcome.id) {
      alert("OUTCOME_ENCOUNTER_LINEAGE_CONFLICT", "outcome_event", outcome.id,
        "Outcome does not have one matching immutable encounter.");
    }
    if (linked.length === 0) alert("MISSING_TARGET_TRANSITION", "outcome_event", outcome.id,
      "Target-v2 learner outcome has no scheduler transition.");
    if (linked.length > 1) alert("DUPLICATE_TARGET_TRANSITION", "outcome_event", outcome.id,
      "Target-v2 learner outcome drove more than one scheduler transition.");
    if (outcome.schedule_policy_version !== TARGET_REVIEW_POLICY_VERSION
      || outcome.word_schedule_version !== TARGET_PER_WORD_STATE_SHAPE_VERSION) {
      alert("TARGET_OUTCOME_USED_V1_AUTHORITY", "outcome_event", outcome.id,
        "Target cohort outcome is not pinned to the target policy/state shape.");
    }
  }
  for (const transition of transitions.filter((row) => row.transition_kind === "REVIEW_OUTCOME_APPLIED")) {
    if (!transition.source_review_outcome_event_id
      || !outcomeById.has(transition.source_review_outcome_event_id)) {
      alert("TRANSITION_WITHOUT_GOVERNED_OUTCOME", "transition_event", transition.id,
        "Review transition has no governed immutable learner outcome.");
    }
  }

  for (const session of input.sessions) {
    for (const target of session.target_snapshot_facts) {
      if (target.schedulePolicyVersion !== TARGET_REVIEW_POLICY_VERSION
        || target.wordScheduleVersion !== TARGET_PER_WORD_STATE_SHAPE_VERSION) {
        alert("TARGET_SNAPSHOT_DISPATCH_MISMATCH", "review_session", session.id,
          `Target ${target.scheduleWordId} is frozen with an incompatible policy/state shape.`);
      }
      if (target.dueOn && target.dueOn > session.assignment_date) {
        alert("TARGET_WORD_APPEARED_BEFORE_DUE", "review_session", session.id,
          `${target.scheduleWordId} due ${target.dueOn} appeared on ${session.assignment_date}.`);
      }
    }
  }

  const policySafe = input.targetPolicy.schedule_policy_version === TARGET_REVIEW_POLICY_VERSION
    && input.targetPolicy.is_active === false
    && input.targetPolicy.is_default_for_new_schedules === false
    && targetPolicyConfigFromRegistry(input.targetPolicy) !== null;
  if (!policySafe) alert("TARGET_POLICY_REGISTRY_DRIFT", "policy",
    input.targetPolicy.schedule_policy_version,
    "Target policy is active/default or its governed configuration drifted.");

  const previousFingerprints = input.previous?.stableRecordFingerprints;
  const currentFingerprints = {
    transitions: recordMap(input.transitions),
    outcomes: recordMap(input.outcomes),
    sessions: recordMap(input.sessions),
    completionReceipts: recordMap(input.completionReceipts),
    controlledReceipts: recordMap(input.controlledReceipts),
  };
  if (previousFingerprints) {
    for (const kind of Object.keys(currentFingerprints) as Array<keyof typeof currentFingerprints>) {
      for (const [id, oldFingerprint] of Object.entries(previousFingerprints[kind])) {
        const current = currentFingerprints[kind][id];
        if (current && current !== oldFingerprint) alert("PROTECTED_HISTORY_REWRITTEN", kind, id,
          "An existing immutable observation record changed fingerprint.");
      }
    }
  }

  const newSessions = findNew(input.sessions, previousFingerprints?.sessions);
  const newTransitionsRaw = findNew(input.transitions, previousFingerprints?.transitions);
  const newTransitionIds = new Set(newTransitionsRaw.map((row) => row.id));
  const newTransitions = observedTransitions.filter((row) => newTransitionIds.has(row.transitionEventId));
  const newCompletionReceipts = findNew(input.completionReceipts,
    previousFingerprints?.completionReceipts);
  const newControlledReceipts = findNew(input.controlledReceipts,
    previousFingerprints?.controlledReceipts);

  for (const transition of newTransitions) {
    if (transition.sourceKind === "POLICY_CUTOVER_APPLIED") continue;
    const failed = transition.immutableOutcome === "failure";
    if (failed || transition.transitionReason.includes("RECOVERY")
      || transition.transitionReason.includes("CONTROLLED")) {
      finding("INTERESTING_EVIDENCE", transition.transitionReason, "transition_event",
        transition.transitionEventId,
        `${transition.immutableOutcome ?? "governed source"}: revision ${transition.expectedRevision} → ${transition.appliedRevision}.`);
    } else {
      finding("PROGRESS", transition.transitionReason, "transition_event",
        transition.transitionEventId,
        `Successful target progression revision ${transition.expectedRevision} → ${transition.appliedRevision}.`);
    }
  }
  for (const session of newSessions) {
    if (session.target_v2_schedule_word_ids.length > 0
      && session.target_schedule_word_ids.length > session.target_v2_schedule_word_ids.length) {
      finding("INTERESTING_EVIDENCE", "MIXED_V1_V2_SESSION", "review_session", session.id,
        `Session contained ${session.target_v2_schedule_word_ids.length} target-v2 and ${session.target_schedule_word_ids.length - session.target_v2_schedule_word_ids.length} v1 targets.`);
    }
  }
  for (const log of input.logs) {
    if (log.statusCode !== null && log.statusCode >= 500
      || /fingerprint|compare-and-swap|\bcas\b|hydrate|dispatch|finaliz|replay/i.test(log.message)) {
      alert("C2B_PRODUCTION_ERROR", "production_log", log.id,
        `${log.statusCode ?? log.level}: ${log.message}`);
    }
  }

  const check = (code: string, passed: boolean, detail: string) => checks.push({ code, passed, detail });
  check("TARGET_SCHEDULES_HYDRATE", census.every((row) => row.hydration === "HYDRATED"),
    `${census.filter((row) => row.hydration === "HYDRATED").length}/${census.length} hydrated.`);
  check("REVISION_SEQUENCE_CONTINUOUS",
    !findings.some((row) => row.code === "REVISION_DISCONTINUITY"),
    "Expected/applied revisions form a continuous chain ending at each persisted revision.");
  check("ONE_GOVERNED_SOURCE_PER_TRANSITION",
    !findings.some((row) => ["DUPLICATE_SOURCE_TRANSITION", "MISSING_TARGET_TRANSITION",
      "TRANSITION_WITHOUT_GOVERNED_OUTCOME"].includes(row.code)),
    "Outcome/transition source cardinality checked.");
  check("REDUCER_PARITY",
    observedTransitions.every((row) => ["MATCH", "NOT_APPLICABLE"].includes(row.reducerParity)),
    "Every pedagogical transition replays through the C2B.1 reducer; cutover is non-pedagogical.");
  check("POLICY_INACTIVE_NON_DEFAULT", policySafe,
    `is_active=${input.targetPolicy.is_active}; is_default_for_new_schedules=${input.targetPolicy.is_default_for_new_schedules}.`);
  check("NO_EARLY_TARGET_APPEARANCE",
    !findings.some((row) => row.code === "TARGET_WORD_APPEARED_BEFORE_DUE"),
    "Frozen Review snapshots checked against assignment practice date.");
  check("MIXED_R6_TARGET_ELIGIBILITY",
    census.every((row) => row.hydration === "HYDRATED"),
    census.every((row) => row.hydration === "HYDRATED")
      ? "All target rows satisfy the exact hydration prerequisite used by deployed mixed R6 selection."
      : "Deployed mixed R6 would fail closed because at least one target row cannot hydrate.");
  check("TIMESTAMP_FINGERPRINT_PARITY",
    observedTransitions.filter((row) => row.sourceKind !== "POLICY_CUTOVER_APPLIED")
      .every((row) => row.reducerParity === "MATCH"),
    "Every observed learner-performance transition reproduces its canonical C2B.1 fingerprint.");
  check("COMPLETED_REPLAY_IS_NON_EVENT",
    !findings.some((row) => row.code === "DUPLICATE_SOURCE_TRANSITION"),
    "No governed outcome was applied more than once; successful replay creates no new database fact.");
  check("PROTECTED_HISTORY_UNCHANGED",
    !findings.some((row) => row.code === "PROTECTED_HISTORY_REWRITTEN"),
    previousFingerprints ? "Previous immutable record fingerprints compared." : "No previous receipt supplied; baseline captured.");

  const alerts = sorted(findings.filter((row) => row.classification === "ALERT"),
    (row) => `${row.code}:${row.entityId}`);
  const progress = sorted(findings.filter((row) => row.classification === "PROGRESS"),
    (row) => `${row.code}:${row.entityId}`);
  const interestingEvidence = sorted(findings.filter((row) =>
    row.classification === "INTERESTING_EVIDENCE"), (row) => `${row.code}:${row.entityId}`);
  const noChange = newTransitions.length === 0 && newSessions.length === 0
    && newCompletionReceipts.length === 0 && newControlledReceipts.length === 0
    && input.logs.length === 0 && alerts.length === 0
    ? [{
        classification: "NO_CHANGE" as const,
        code: "NO_NEW_C2B_FACTS",
        entityKind: "observation",
        entityId: input.learnerId,
        detail: "Production state is unchanged since the supplied observation.",
      }]
    : [];

  const stable = {
    observationVersion: C2B_PRODUCTION_OBSERVATION_VERSION,
    sourceBaseline: input.sourceBaseline,
    deploymentIdentity: input.deploymentIdentity,
    productionProjectRef: input.productionProjectRef,
    learnerId: input.learnerId,
    targetStateCensus: census,
    allTransitions: observedTransitions,
    allSessions: sorted(input.sessions, (row) => row.id),
    allCompletionReceipts: sorted(input.completionReceipts, (row) => row.id),
    allControlledReceipts: sorted(input.controlledReceipts, (row) => row.id),
    policyState: {
      schedulePolicyVersion: input.targetPolicy.schedule_policy_version,
      isActive: input.targetPolicy.is_active,
      isDefaultForNewSchedules: input.targetPolicy.is_default_for_new_schedules,
    },
    stableRecordFingerprints: currentFingerprints,
  };

  return {
    observationVersion: C2B_PRODUCTION_OBSERVATION_VERSION,
    observedAt: input.observedAt,
    sourceBaseline: input.sourceBaseline,
    deploymentIdentity: input.deploymentIdentity,
    productionProjectRef: input.productionProjectRef,
    learnerId: input.learnerId,
    targetStateCensus: census,
    newlyObservedReviewSessions: newSessions,
    newlyObservedTargetTransitions: newTransitions,
    newlyObservedCompletionReceipts: newCompletionReceipts,
    newlyObservedControlledReceipts: newControlledReceipts,
    c2bLogsSincePrevious: sorted(input.logs, (row) => `${row.occurredAt}:${row.id}`),
    progress,
    interestingEvidence,
    alerts,
    noChange,
    invariantChecks: checks,
    policyState: stable.policyState,
    stableRecordFingerprints: currentFingerprints,
    normalizedStateFingerprint: fingerprintSnapshotValue(stable),
  };
}
