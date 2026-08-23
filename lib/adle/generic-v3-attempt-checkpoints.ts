import type { SupabaseClient } from "@supabase/supabase-js";

import { extractCanonicalSentenceTarget, type CanonicalSentenceDictationTargetBinding } from "./sentence-dictation-contract";
import { isAttemptCorrect } from "./session-correctness";
import type { AdleDailyPlanReadModel, AdleSessionItem } from "./loaders/daily-plan-surface";
import type { AssignmentAttemptEventWrite } from "./loaders/session-completion-loader";
import type { CanonicalActivitySnapshotV3, CompiledLessonSnapshotV3 } from "./composable-lesson/generic-snapshot-v3-contracts";

export type GenericV3CheckpointKind = "cover_check" | "dictation";

export interface GenericV3DurableCheckpoint {
  kind: GenericV3CheckpointKind;
  assignmentItemId: string;
  canonicalWordId: string;
  attemptText: string;
  targetAttempt: string;
  isCorrect: boolean;
  snapshotFingerprint: string;
}

export interface GenericV3CheckpointConflict {
  code: "generic_v3_checkpoint_conflict";
}

export function hydrateGenericV3CheckpointState(checkpoints: readonly GenericV3DurableCheckpoint[]): {
  coverAttempts: Map<string, string>;
  coveredItemIds: Set<string>;
  dictationTargetAttempts: Map<string, string>;
  dictationSentenceAttempts: Map<string, string>;
  checkedDictationItemIds: Set<string>;
} {
  const covers = checkpoints.filter((entry) => entry.kind === "cover_check");
  const dictations = checkpoints.filter((entry) => entry.kind === "dictation");
  return {
    coverAttempts: new Map(covers.map((entry) => [entry.canonicalWordId, entry.attemptText])),
    coveredItemIds: new Set(covers.map((entry) => entry.assignmentItemId)),
    dictationTargetAttempts: new Map(dictations.map((entry) => [entry.canonicalWordId, entry.targetAttempt])),
    dictationSentenceAttempts: new Map(dictations.map((entry) => [entry.canonicalWordId, entry.attemptText])),
    checkedDictationItemIds: new Set(dictations.map((entry) => entry.assignmentItemId)),
  };
}

type StoredAttemptRow = {
  child_id: string;
  parent_user_id: string;
  daily_assignment_id: string;
  assignment_item_id: string;
  canonical_word_id: string | null;
  micro_skill_key: string | null;
  section_key: string;
  template_key: string | null;
  target_word: string | null;
  attempt_text: string | null;
  is_correct: boolean | null;
  attempt_kind: string;
  evidence_class: string;
  source_ref: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`genericV3Checkpoint:${label}`);
  }
  return value;
}

function snapshotV3(readModel: AdleDailyPlanReadModel): CompiledLessonSnapshotV3 {
  const resolution = readModel.genericSnapshotResolution;
  if (resolution?.status !== "resolved" || resolution.source !== "snapshot_v3"
    || resolution.snapshot.snapshotSchemaVersion !== 3) {
    throw new Error("genericV3Checkpoint:resolved frozen Snapshot v3 required");
  }
  return resolution.snapshot;
}

function activityForItem(snapshot: CompiledLessonSnapshotV3, item: AdleSessionItem): CanonicalActivitySnapshotV3 {
  const matches = snapshot.activities.filter((activity) =>
    activity.itemBinding.sourceEntityId === item.sourceEntityId
    && activity.itemBinding.position === item.position,
  );
  if (matches.length !== 1) throw new Error("genericV3Checkpoint:exact snapshot activity binding required");
  return matches[0];
}

function dictationBinding(payload: Record<string, unknown>): CanonicalSentenceDictationTargetBinding {
  const value = record(payload.targetBinding);
  if (value?.kind === "token" && Number.isInteger(value.tokenIndex)) {
    return { kind: "token", tokenIndex: Number(value.tokenIndex) };
  }
  if (value?.kind === "span" && Number.isInteger(value.startTokenIndex)
    && Number.isInteger(value.endTokenIndexExclusive) && typeof value.exactAnswer === "string") {
    return {
      kind: "span",
      startTokenIndex: Number(value.startTokenIndex),
      endTokenIndexExclusive: Number(value.endTokenIndexExclusive),
      exactAnswer: value.exactAnswer,
    };
  }
  throw new Error("genericV3Checkpoint:governed dictation target binding required");
}

export function buildGenericV3Checkpoint(input: {
  readModel: AdleDailyPlanReadModel;
  parentUserId: string;
  childId: string;
  assignmentId: string;
  itemId: string;
  attemptText: string;
}): { event: AssignmentAttemptEventWrite; checkpoint: GenericV3DurableCheckpoint } {
  const snapshot = snapshotV3(input.readModel);
  const item = input.readModel.partTwo.items.find((candidate) => candidate.id === input.itemId);
  if (!item || input.readModel.assignmentId !== input.assignmentId) {
    throw new Error("genericV3Checkpoint:assignment item ownership mismatch");
  }
  const activity = activityForItem(snapshot, item);
  const payload = activity.payload as Record<string, unknown>;
  const canonicalWordId = requiredText(payload.canonicalWordId, "canonical word");
  if (item.canonicalWordId !== canonicalWordId) {
    throw new Error("genericV3Checkpoint:item canonical word mismatch");
  }
  const microSkillKey = requiredText(item.microSkillKey, "micro-skill");
  const rawAttempt = input.attemptText;
  if (rawAttempt.trim() === "") throw new Error("genericV3Checkpoint:attempt required");

  let kind: GenericV3CheckpointKind;
  let targetWord: string;
  let targetAttempt: string;
  let attemptKind: "lesson_production" | "lesson_dictation";
  if (activity.canonical.concept === "COVER_CHECK" && activity.canonical.mode === "whole_word"
    && activity.sectionKey === "lesson_production") {
    kind = "cover_check";
    targetWord = requiredText(payload.word, "cover target word");
    targetAttempt = rawAttempt;
    attemptKind = "lesson_production";
  } else if (activity.canonical.concept === "DICTATION" && activity.canonical.mode === "whole_sentence"
    && activity.sectionKey === "lesson_dictation") {
    kind = "dictation";
    targetWord = requiredText(payload.targetWord, "dictation target word");
    requiredText(payload.correctSentence, "dictation sentence");
    targetAttempt = extractCanonicalSentenceTarget(rawAttempt, dictationBinding(payload));
    attemptKind = "lesson_dictation";
  } else {
    throw new Error("genericV3Checkpoint:activity is not checkpoint-authorized");
  }
  if (item.targetWord !== targetWord) throw new Error("genericV3Checkpoint:item target mismatch");

  const sourceRef = `lesson:${input.childId}:${input.readModel.planDate}:${microSkillKey}`;
  const isCorrect = isAttemptCorrect(targetAttempt, targetWord);
  return {
    event: {
      childId: input.childId,
      parentUserId: input.parentUserId,
      dailyAssignmentId: input.assignmentId,
      assignmentItemId: item.id,
      canonicalWordId,
      microSkillKey,
      sectionKey: item.sectionKey,
      templateKey: item.templateKey || null,
      targetWord,
      attemptText: rawAttempt,
      isCorrect,
      attemptKind,
      evidenceClass: "first_exposure_lesson_attempt",
      sourceRef,
    },
    checkpoint: {
      kind,
      assignmentItemId: item.id,
      canonicalWordId,
      attemptText: rawAttempt,
      targetAttempt,
      isCorrect,
      snapshotFingerprint: snapshot.provenance.sourceFingerprint,
    },
  };
}

function databaseRow(event: AssignmentAttemptEventWrite): StoredAttemptRow {
  return {
    child_id: event.childId,
    parent_user_id: event.parentUserId,
    daily_assignment_id: event.dailyAssignmentId,
    assignment_item_id: event.assignmentItemId,
    canonical_word_id: event.canonicalWordId,
    micro_skill_key: event.microSkillKey,
    section_key: event.sectionKey,
    template_key: event.templateKey,
    target_word: event.targetWord,
    attempt_text: event.attemptText,
    is_correct: event.isCorrect,
    attempt_kind: event.attemptKind,
    evidence_class: event.evidenceClass,
    source_ref: event.sourceRef,
  };
}

function rowsEquivalent(stored: StoredAttemptRow, expected: StoredAttemptRow): boolean {
  return (Object.keys(expected) as Array<keyof StoredAttemptRow>)
    .every((key) => stored[key] === expected[key]);
}

export async function persistGenericV3Checkpoint(
  client: SupabaseClient,
  built: { event: AssignmentAttemptEventWrite; checkpoint: GenericV3DurableCheckpoint },
): Promise<GenericV3DurableCheckpoint | GenericV3CheckpointConflict> {
  const expected = databaseRow(built.event);
  const { error: insertError } = await client.from("adle_assignment_attempt_events").upsert(expected, {
    onConflict: "assignment_item_id,attempt_kind,source_ref",
    ignoreDuplicates: true,
  });
  if (insertError) throw new Error(`persistGenericV3Checkpoint:insert: ${insertError.message}`);
  const { data, error } = await client
    .from("adle_assignment_attempt_events")
    .select("child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,micro_skill_key,section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref")
    .eq("daily_assignment_id", expected.daily_assignment_id)
    .eq("assignment_item_id", expected.assignment_item_id)
    .eq("attempt_kind", expected.attempt_kind)
    .eq("source_ref", expected.source_ref)
    .maybeSingle();
  if (error || !data) throw new Error(`persistGenericV3Checkpoint:reload: ${error?.message ?? "missing stored attempt"}`);
  return rowsEquivalent(data as StoredAttemptRow, expected)
    ? built.checkpoint
    : { code: "generic_v3_checkpoint_conflict" };
}

export async function loadGenericV3Checkpoints(input: {
  client: SupabaseClient;
  readModel: AdleDailyPlanReadModel;
  parentUserId: string;
  childId: string;
  assignmentId: string;
}): Promise<GenericV3DurableCheckpoint[]> {
  const snapshot = snapshotV3(input.readModel);
  if (input.readModel.assignmentId !== input.assignmentId) throw new Error("loadGenericV3Checkpoints:assignment mismatch");
  const { data, error } = await input.client
    .from("adle_assignment_attempt_events")
    .select("child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,micro_skill_key,section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("daily_assignment_id", input.assignmentId)
    .eq("evidence_class", "first_exposure_lesson_attempt")
    .in("attempt_kind", ["lesson_production", "lesson_dictation"]);
  if (error) throw new Error(`loadGenericV3Checkpoints: ${error.message}`);
  const checkpoints: GenericV3DurableCheckpoint[] = [];
  for (const raw of data ?? []) {
    const stored = raw as StoredAttemptRow;
    const built = buildGenericV3Checkpoint({
      readModel: input.readModel,
      parentUserId: input.parentUserId,
      childId: input.childId,
      assignmentId: input.assignmentId,
      itemId: stored.assignment_item_id,
      attemptText: stored.attempt_text ?? "",
    });
    if (!rowsEquivalent(stored, databaseRow(built.event))
      || built.checkpoint.snapshotFingerprint !== snapshot.provenance.sourceFingerprint) {
      throw new Error("loadGenericV3Checkpoints:stored attempt does not match frozen snapshot");
    }
    checkpoints.push(built.checkpoint);
  }
  return checkpoints.sort((left, right) => left.assignmentItemId.localeCompare(right.assignmentItemId));
}

export function reconcileGenericV3CompletionAttempts(input: {
  readModel: AdleDailyPlanReadModel;
  checkpoints: readonly GenericV3DurableCheckpoint[];
}): {
  controlledAttempts: Map<string, string>;
  dictationAttempts: Map<string, string>;
  dictationSentenceAttempts: Map<string, string>;
} {
  snapshotV3(input.readModel);
  const expectedItems = input.readModel.partTwo.items.filter((item) =>
    item.sectionKey === "lesson_production" || item.sectionKey === "lesson_dictation",
  );
  if (input.checkpoints.length !== expectedItems.length) {
    throw new Error("reconcileGenericV3CompletionAttempts:complete durable checkpoint set required");
  }
  const byItem = new Map(input.checkpoints.map((checkpoint) => [checkpoint.assignmentItemId, checkpoint]));
  const controlledAttempts = new Map<string, string>();
  const dictationAttempts = new Map<string, string>();
  const dictationSentenceAttempts = new Map<string, string>();
  for (const item of expectedItems) {
    const checkpoint = byItem.get(item.id);
    if (!checkpoint || checkpoint.canonicalWordId !== item.canonicalWordId) {
      throw new Error("reconcileGenericV3CompletionAttempts:checkpoint item mismatch");
    }
    if (item.sectionKey === "lesson_production" && checkpoint.kind === "cover_check") {
      controlledAttempts.set(checkpoint.canonicalWordId, checkpoint.attemptText);
    } else if (item.sectionKey === "lesson_dictation" && checkpoint.kind === "dictation") {
      dictationAttempts.set(checkpoint.canonicalWordId, checkpoint.targetAttempt);
      dictationSentenceAttempts.set(checkpoint.canonicalWordId, checkpoint.attemptText);
    } else {
      throw new Error("reconcileGenericV3CompletionAttempts:checkpoint kind mismatch");
    }
  }
  return { controlledAttempts, dictationAttempts, dictationSentenceAttempts };
}
