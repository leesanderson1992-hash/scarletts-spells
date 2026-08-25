import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildGenericV3Checkpoint,
  hydrateGenericV3CheckpointState,
  loadGenericV3Checkpoints,
  persistGenericV3Checkpoint,
  reconcileGenericV3CompletionAttempts,
} from "../lib/adle/generic-v3-attempt-checkpoints";
import type { AdleDailyPlanReadModel, AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";
import type { CompiledLessonSnapshotV3 } from "../lib/adle/composable-lesson/generic-snapshot-v3-contracts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT = "33333333-3333-4333-8333-333333333333";
const SKILL = "D4_MOR_PREFIXES_UN";
const FINGERPRINT = "a".repeat(64);

const items: AdleSessionItem[] = [
  {
    id: "cover-item", sourceEntityId: "cover-source", sectionKey: "lesson_production",
    templateKey: "CANONICAL_ACTIVITY_V3", position: 1, status: "pending", targetWord: "unfair",
    canonicalWordId: "word-unfair", microSkillKey: SKILL, adleLearningItemRef: null,
    promptData: {},
  },
  {
    id: "dictation-item", sourceEntityId: "dictation-source", sectionKey: "lesson_dictation",
    templateKey: "CANONICAL_ACTIVITY_V3", position: 2, status: "pending", targetWord: "unfair",
    canonicalWordId: "word-unfair", microSkillKey: SKILL, adleLearningItemRef: null,
    promptData: {},
  },
];

const snapshot = {
  snapshotSchemaVersion: 3,
  provenance: { sourceFingerprint: FINGERPRINT },
  activities: [
    {
      itemBinding: { sourceEntityId: "cover-source", position: 1 }, sectionKey: "lesson_production",
      canonical: { concept: "COVER_CHECK", mode: "whole_word" },
      payload: { canonicalWordId: "word-unfair", word: "unfair", splitPoints: [] },
    },
    {
      itemBinding: { sourceEntityId: "dictation-source", position: 2 }, sectionKey: "lesson_dictation",
      canonical: { concept: "DICTATION", mode: "whole_sentence" },
      payload: {
        canonicalWordId: "word-unfair", targetWord: "unfair", correctSentence: "The rule was unfair.",
        targetBinding: { kind: "token", tokenIndex: 3 },
      },
    },
  ],
} as unknown as CompiledLessonSnapshotV3;

const readModel: AdleDailyPlanReadModel = {
  state: "ready", planDate: "2026-08-23", assignmentId: ASSIGNMENT,
  lessonRouteMetadata: null, assignmentGenerationSource: "adle_composer_v1",
  snapshotCapability: null, compiledLessonSnapshot: snapshot,
  genericSnapshotResolution: {
    status: "resolved", mode: "off", source: "snapshot_v3", snapshot,
    items, blockers: [],
  },
  partOne: { items: [], present: false, complete: false },
  partTwo: { items, present: true, complete: false },
};

type Row = Record<string, unknown>;

class MemoryAttemptClient {
  rows: Row[] = [];
  tables = new Set<string>();

  from(table: string) {
    this.tables.add(table);
    assert(table === "adle_assignment_attempt_events", "checkpoint persistence touches only the attempt ledger");
    const rows = this.rows;
    return {
      async upsert(row: Row) {
        const key = `${row.assignment_item_id}:${row.attempt_kind}:${row.source_ref}`;
        const exists = rows.some((candidate) =>
          `${candidate.assignment_item_id}:${candidate.attempt_kind}:${candidate.source_ref}` === key);
        if (!exists) rows.push({ ...row });
        return { error: null };
      },
      select() {
        const filters: Array<(row: Row) => boolean> = [];
        const query = {
          eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
          in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
          async maybeSingle() {
            const matches = rows.filter((row) => filters.every((filter) => filter(row)));
            return { data: matches.length === 1 ? { ...matches[0] } : null, error: null };
          },
          then(resolve: (value: { data: Row[]; error: null }) => unknown) {
            return Promise.resolve(resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))).map((row) => ({ ...row })), error: null }));
          },
        };
        return query;
      },
    };
  }
}

async function main() {
  const client = new MemoryAttemptClient();
  const cover = buildGenericV3Checkpoint({
    readModel, parentUserId: PARENT, childId: CHILD, assignmentId: ASSIGNMENT,
    itemId: "cover-item", attemptText: "unfare",
  });
  const dictation = buildGenericV3Checkpoint({
    readModel, parentUserId: PARENT, childId: CHILD, assignmentId: ASSIGNMENT,
    itemId: "dictation-item", attemptText: "The rule was unfare.",
  });
  assert(cover.event.attemptKind === "lesson_production", "Cover Check derives governed evidence server-side");
  assert(dictation.event.attemptKind === "lesson_dictation" && dictation.checkpoint.targetAttempt === "unfare", "Dictation derives the governed target token server-side");

  const firstCover = await persistGenericV3Checkpoint(client as unknown as SupabaseClient, cover);
  assert(!("code" in firstCover), "first Cover Check persists");
  const retryCover = await persistGenericV3Checkpoint(client as unknown as SupabaseClient, cover);
  assert(!("code" in retryCover), "identical Cover Check retry is idempotent");
  const rowCountAfterRetry: number = client.rows.length;
  assert(rowCountAfterRetry === 1, "identical Cover Check retry does not duplicate the row");
  const conflictingCover = buildGenericV3Checkpoint({
    readModel, parentUserId: PARENT, childId: CHILD, assignmentId: ASSIGNMENT,
    itemId: "cover-item", attemptText: "unfair",
  });
  const conflict = await persistGenericV3Checkpoint(client as unknown as SupabaseClient, conflictingCover);
  assert("code" in conflict && conflict.code === "generic_v3_checkpoint_conflict", "conflicting retry is rejected");
  assert(client.rows[0].attempt_text === "unfare", "conflicting retry never replaces the first response");

  await persistGenericV3Checkpoint(client as unknown as SupabaseClient, dictation);
  assert(client.rows.length === 2 && [...client.tables].join() === "adle_assignment_attempt_events", "Check writes have no completion, scheduling, mastery, Reflection, or reward side effects");

  const reopened = await loadGenericV3Checkpoints({
    client: client as unknown as SupabaseClient, readModel, parentUserId: PARENT,
    childId: CHILD, assignmentId: ASSIGNMENT,
  });
  const hydrated = hydrateGenericV3CheckpointState(reopened);
  assert(hydrated.coveredItemIds.has("cover-item") && hydrated.coverAttempts.get("word-unfair") === "unfare", "fresh browser state permanently locks and restores Cover Check");
  assert(hydrated.checkedDictationItemIds.has("dictation-item") && hydrated.dictationSentenceAttempts.get("word-unfair") === "The rule was unfare.", "fresh browser state permanently locks and restores Dictation");

  const reconciled = reconcileGenericV3CompletionAttempts({ readModel, checkpoints: reopened });
  assert(reconciled.controlledAttempts.get("word-unfair") === "unfare", "completion reuses the original Cover Check response");
  assert(reconciled.dictationSentenceAttempts.get("word-unfair") === "The rule was unfare." && reconciled.dictationAttempts.get("word-unfair") === "unfare", "completion reuses the original Dictation response and derived target");
  assert(client.rows.length === 2, "completion reconciliation creates no duplicate attempts");

  let crossAssignmentRejected = false;
  try {
    buildGenericV3Checkpoint({
      readModel, parentUserId: PARENT, childId: CHILD,
      assignmentId: "44444444-4444-4444-8444-444444444444",
      itemId: "cover-item", attemptText: "unfair",
    });
  } catch { crossAssignmentRejected = true; }
  assert(crossAssignmentRejected, "cross-assignment attempt reuse is rejected");

  console.log("PASS: generic v3 insert-once checkpoints, fresh-session locks, isolation, and completion reconciliation");
}

void main();
