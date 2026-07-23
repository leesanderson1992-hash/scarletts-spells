/**
 * ADLE Slice 6: completion-time reads and the write-back of the Slice 3
 * completion helpers' outputs. The helpers stay pure; this module is the only
 * place their results meet storage. All ADLE writes here are wiring only —
 * every transition value comes from lib/adle, nothing is re-priced or
 * re-scheduled.
 *
 * Idempotence (documented Slice 6 pins, regression-covered where pure):
 * - lesson/probe completion is guarded by the deterministic taught-history
 *   source refs (`lesson:{child}:{date}:{skill}` / `probe:...`): existing
 *   rows for the ref mean the completion is already recorded.
 * - review completion is guarded by production outcome events dated the plan
 *   date (the ledger has no source ref column; one review session per child
 *   per day is the composed contract shape).
 * - learning-item intakes honour the unique active (child, word, skill)
 *   guard by superseding the existing active row before inserting (the
 *   Slice 2A storage note: re-entry supersedes and inserts, never resets).
 * - schedule words honour the unique active (child, word) guard the same way.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- additive route tables are intentionally ahead of generated Supabase types */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LearningItemFact } from "../learning-items";
import type {
  IsoDate,
  ReviewBundleFact,
  ReviewOutcomeEvent,
  ScheduleWordFact,
} from "../review-scheduler";
import type {
  OutcomeEventWithAttempt,
  ProbeRunRecord,
  TaughtWordHistoryWithAttempt,
} from "../composer-completions";
import type { AuthenticUseEventFact } from "../evidence-pricing";
import { ADLE_CANONICAL_INTAKE_FEATURE_FLAG } from "../canonical-intake";

type AdleClient = SupabaseClient;

function sharedRouteStorageEnabled(): boolean {
  return process.env[ADLE_CANONICAL_INTAKE_FEATURE_FLAG] === "enabled";
}

const PRODUCTION_EVENT_TYPES = [
  "review_pass",
  "review_fail",
  "retest_pass",
  "retest_fail",
  "retirement_check_pass",
  "retirement_check_fail",
] as const;

export type AssignmentAttemptKind =
  | "review_production"
  | "lesson_production"
  | "lesson_dictation"
  | "lesson_probe"
  | "guided_practice"
  | "reflection_retry";

export type AssignmentAttemptEvidenceClass =
  | "scheduled_review_attempt"
  | "first_exposure_lesson_attempt"
  | "diagnostic_probe_attempt"
  | "guided_practice_attempt"
  | "reflection_attempt";

export interface AssignmentAttemptEventWrite {
  childId: string;
  parentUserId: string;
  dailyAssignmentId: string;
  assignmentItemId: string;
  canonicalWordId: string | null;
  microSkillKey: string | null;
  sectionKey: string;
  templateKey: string | null;
  targetWord: string | null;
  attemptText: string | null;
  isCorrect: boolean | null;
  attemptKind: AssignmentAttemptKind;
  evidenceClass: AssignmentAttemptEvidenceClass;
  sourceRef: string;
}

type StoredRoute = { learning_item_id: string; micro_skill_key: string };

async function activeRoutesForWords(
  client: AdleClient,
  childId: string,
  canonicalWordIds: readonly string[],
): Promise<Map<string, StoredRoute[]>> {
  const result = new Map<string, StoredRoute[]>();
  if (canonicalWordIds.length === 0) return result;
  const { data: scheduleRows, error: scheduleError } = await client
    .from("adle_review_schedule_words")
    .select("id,canonical_word_id")
    .eq("child_id", childId)
    .in("canonical_word_id", [...new Set(canonicalWordIds)])
    .eq("row_status", "active");
  if (scheduleError) fail("activeRoutesForWords:schedules", scheduleError);
  const scheduleById = new Map(
    (scheduleRows ?? []).map((row: any) => [
      row.id as string,
      row.canonical_word_id as string,
    ]),
  );
  if (scheduleById.size === 0) return result;
  const { data: routeRows, error: routeError } = await client
    .from("adle_review_schedule_word_routes")
    .select("schedule_word_id,learning_item_id,micro_skill_key")
    .in("schedule_word_id", [...scheduleById.keys()])
    .eq("row_status", "active");
  if (routeError) fail("activeRoutesForWords:routes", routeError);
  for (const row of routeRows ?? []) {
    const wordId = scheduleById.get((row as any).schedule_word_id);
    if (!wordId) continue;
    const routes = result.get(wordId) ?? [];
    routes.push({
      learning_item_id: (row as any).learning_item_id,
      micro_skill_key: (row as any).micro_skill_key,
    });
    result.set(wordId, routes);
  }
  for (const routes of result.values())
    routes.sort((a, b) => a.micro_skill_key.localeCompare(b.micro_skill_key));
  return result;
}

async function attachAttemptRoutes(
  client: AdleClient,
  events: readonly AssignmentAttemptEventWrite[],
): Promise<void> {
  if (!sharedRouteStorageEnabled()) return;
  const reviewEvents = events.filter(
    (event) =>
      event.evidenceClass === "scheduled_review_attempt" &&
      event.canonicalWordId,
  );
  if (reviewEvents.length === 0) return;
  const assignmentItemIds = [
    ...new Set(reviewEvents.map((event) => event.assignmentItemId)),
  ];
  const { data: storedEvents, error } = await client
    .from("adle_assignment_attempt_events")
    .select("id,child_id,canonical_word_id,assignment_item_id")
    .in("assignment_item_id", assignmentItemIds)
    .eq("evidence_class", "scheduled_review_attempt");
  if (error) fail("attachAttemptRoutes:attempts", error);
  const byChild = new Map<string, any[]>();
  for (const event of storedEvents ?? []) {
    const list = byChild.get((event as any).child_id) ?? [];
    list.push(event);
    byChild.set((event as any).child_id, list);
  }
  const writes: Array<{
    attempt_event_id: string;
    learning_item_id: string;
    micro_skill_key: string;
  }> = [];
  for (const [childId, childEvents] of byChild) {
    const routes = await activeRoutesForWords(
      client,
      childId,
      childEvents.map((event) => event.canonical_word_id).filter(Boolean),
    );
    for (const event of childEvents) {
      for (const route of routes.get(event.canonical_word_id) ?? []) {
        writes.push({ attempt_event_id: event.id, ...route });
      }
    }
  }
  if (writes.length === 0) return;
  const { error: writeError } = await client
    .from("adle_assignment_attempt_event_routes")
    .upsert(writes, {
      onConflict: "attempt_event_id,learning_item_id",
      ignoreDuplicates: true,
    });
  if (writeError) fail("attachAttemptRoutes:writes", writeError);
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export async function insertAssignmentAttemptEvents(
  client: AdleClient,
  events: readonly AssignmentAttemptEventWrite[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }
  const { error } = await client.from("adle_assignment_attempt_events").upsert(
    events.map((event) => ({
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
    })),
    {
      onConflict: "assignment_item_id,attempt_kind,source_ref",
      ignoreDuplicates: true,
    },
  );
  if (error !== null) {
    fail("insertAssignmentAttemptEvents", error);
  }
  await attachAttemptRoutes(client, events);
}

export async function markAssignmentCompletedIfAllItemsComplete(
  client: AdleClient,
  params: {
    parentUserId: string;
    childId: string;
    assignmentId: string;
  },
): Promise<boolean> {
  const { count, error: countError } = await client
    .from("assignment_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_user_id", params.parentUserId)
    .eq("child_id", params.childId)
    .eq("daily_assignment_id", params.assignmentId)
    .neq("status", "completed");
  if (countError) {
    fail("markAssignmentCompletedIfAllItemsComplete:count", countError);
  }
  if ((count ?? 0) !== 0) {
    return false;
  }
  const { error: headerError } = await client
    .from("daily_assignments")
    .update({ status: "completed" })
    .eq("id", params.assignmentId)
    .eq("parent_user_id", params.parentUserId)
    .eq("child_id", params.childId);
  if (headerError) {
    fail("markAssignmentCompletedIfAllItemsComplete:header", headerError);
  }
  return true;
}

export async function hasTaughtEventsForSourceRef(
  client: AdleClient,
  childId: string,
  sourceRef: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("adle_taught_word_history")
    .select("id")
    .eq("child_id", childId)
    .eq("source_ref", sourceRef)
    .eq("row_status", "active")
    .limit(1);
  if (error) {
    fail("hasTaughtEventsForSourceRef", error);
  }
  return (data ?? []).length > 0;
}

export async function hasProductionOutcomeEventsOn(
  client: AdleClient,
  childId: string,
  occurredOn: IsoDate,
): Promise<boolean> {
  const { data, error } = await client
    .from("adle_review_outcome_events")
    .select("id")
    .eq("child_id", childId)
    .eq("occurred_on", occurredOn)
    .in("event_type", [...PRODUCTION_EVENT_TYPES])
    .limit(1);
  if (error) {
    fail("hasProductionOutcomeEventsOn", error);
  }
  return (data ?? []).length > 0;
}

async function insertTaughtEvents(
  client: AdleClient,
  events: readonly TaughtWordHistoryWithAttempt[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }
  const { error } = await client.from("adle_taught_word_history").insert(
    events.map((event) => ({
      child_id: event.childId,
      canonical_word_id: event.canonicalWordId,
      event_kind: event.eventKind,
      occurred_on: event.occurredOn,
      source_ref: event.sourceRef,
      row_status: "active",
      attempt_text: event.attemptText,
    })),
  );
  if (error) {
    fail("insertTaughtEvents", error);
  }
}

async function insertOutcomeEvents(
  client: AdleClient,
  events: readonly (ReviewOutcomeEvent & { attemptText?: string | null })[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }
  const { data, error } = await client
    .from("adle_review_outcome_events")
    .insert(
      events.map((event) => ({
        child_id: event.childId,
        canonical_word_id: event.canonicalWordId,
        bundle_id: event.bundleId,
        event_type: event.eventType,
        occurred_on: event.occurredOn,
        interval_index: event.intervalIndex,
        schedule_policy_version: event.schedulePolicyVersion,
        attempt_text: event.attemptText ?? null,
      })),
    )
    .select("id,child_id,canonical_word_id");
  if (error) {
    fail("insertOutcomeEvents", error);
  }
  const byChild = new Map<string, any[]>();
  for (const event of data ?? []) {
    const list = byChild.get((event as any).child_id) ?? [];
    list.push(event);
    byChild.set((event as any).child_id, list);
  }
  if (!sharedRouteStorageEnabled()) return;
  const routeWrites: Array<{
    outcome_event_id: string;
    learning_item_id: string;
    micro_skill_key: string;
  }> = [];
  for (const [childId, childEvents] of byChild) {
    const routes = await activeRoutesForWords(
      client,
      childId,
      childEvents.map((event) => event.canonical_word_id),
    );
    for (const event of childEvents) {
      for (const route of routes.get(event.canonical_word_id) ?? []) {
        routeWrites.push({ outcome_event_id: event.id, ...route });
      }
    }
  }
  if (routeWrites.length > 0) {
    const { error: routeError } = await client
      .from("adle_review_outcome_event_routes")
      .insert(routeWrites);
    if (routeError) fail("insertOutcomeEvents:routes", routeError);
  }
}

/** Supersede-then-insert under the unique active (child, word, skill) guard.
 * Existing active rows for the same pairing are superseded first (Slice 2A
 * storage note), so intake history is preserved, never reset. */
export async function insertLearningItemIntakes(
  client: AdleClient,
  intakes: readonly LearningItemFact[],
): Promise<void> {
  for (const intake of intakes) {
    const { error: supersedeError } = await client
      .from("adle_learning_items")
      .update({ row_status: "superseded" })
      .eq("child_id", intake.childId)
      .eq("canonical_word_id", intake.canonicalWordId)
      .eq("micro_skill_key", intake.microSkillKey)
      .eq("row_status", "active");
    if (supersedeError) {
      fail("insertLearningItemIntakes:supersede", supersedeError);
    }
    const { error } = await client.from("adle_learning_items").insert({
      child_id: intake.childId,
      canonical_word_id: intake.canonicalWordId,
      micro_skill_key: intake.microSkillKey,
      item_status: intake.itemStatus,
      source_kind: intake.sourceKind,
      source_ref: intake.sourceRef,
      source_attempt_text: intake.sourceAttemptText,
      reteach_priority: intake.reteachPriority,
      ejected_on: intake.ejectedOn,
      intake_on: intake.intakeOn,
      row_status: "active",
    });
    if (error) {
      fail("insertLearningItemIntakes:insert", error);
    }
  }
}

/** Update learning items loaded from storage (facts carry DB row ids). */
export async function updateLearningItems(
  client: AdleClient,
  items: readonly LearningItemFact[],
): Promise<void> {
  await Promise.all(
    items.map(async (item) => {
      const { error } = await client
        .from("adle_learning_items")
        .update({
          item_status: item.itemStatus,
          reteach_priority: item.reteachPriority,
          ejected_on: item.ejectedOn,
          row_status: item.rowStatus,
        })
        .eq("id", item.learningItemId);
      if (error) {
        fail("updateLearningItems", error);
      }
    }),
  );
}

async function updateScheduleWords(
  client: AdleClient,
  words: readonly ScheduleWordFact[],
): Promise<void> {
  await Promise.all(
    words.map(async (word) => {
      const { error } = await client
        .from("adle_review_schedule_words")
        .update({
          membership_status: word.membershipStatus,
          catch_up_stage: word.catchUpStage,
          next_retest_due_on: word.nextRetestDueOn,
          failed_review_on: word.failedReviewOn,
          pre_retirement_check_due_on: word.preRetirementCheckDueOn,
          last_28_day_review_on: word.last28DayReviewOn,
          reteach_cycle_count: word.reteachCycleCount,
        })
        .eq("child_id", word.childId)
        .eq("canonical_word_id", word.canonicalWordId)
        .eq("bundle_id", word.bundleId)
        .eq("row_status", "active");
      if (error) {
        fail("updateScheduleWords", error);
      }
    }),
  );
}

async function updateBundles(
  client: AdleClient,
  bundles: readonly ReviewBundleFact[],
): Promise<void> {
  for (const bundle of bundles) {
    const { error } = await client
      .from("adle_review_bundles")
      .update({
        interval_index: bundle.intervalIndex,
        next_due_on: bundle.nextDueOn,
        bundle_status: bundle.bundleStatus,
      })
      .eq("id", bundle.bundleId)
      .eq("row_status", "active");
    if (error) {
      fail("updateBundles", error);
    }
  }
}

export interface ReviewCompletionWrite {
  updatedBundles: readonly ReviewBundleFact[];
  updatedScheduleWords: readonly ScheduleWordFact[];
  outcomeEvents: readonly OutcomeEventWithAttempt[];
  itemIntakes: readonly LearningItemFact[];
  pausedItems: readonly LearningItemFact[];
  reopenedItems: readonly LearningItemFact[];
}

export async function persistReviewSessionCompletion(
  client: AdleClient,
  write: ReviewCompletionWrite,
): Promise<void> {
  await updateBundles(client, write.updatedBundles);
  await updateScheduleWords(client, write.updatedScheduleWords);
  await insertOutcomeEvents(client, write.outcomeEvents);
  await insertLearningItemIntakes(client, write.itemIntakes);
  await updateLearningItems(client, write.pausedItems);
  await updateLearningItems(client, write.reopenedItems);
}

export interface LessonCompletionWrite {
  bundle: ReviewBundleFact | null;
  scheduleWords: readonly ScheduleWordFact[];
  taughtEvents: readonly TaughtWordHistoryWithAttempt[];
  itemTransitions: readonly LearningItemFact[];
}

export async function persistLessonCompletion(
  client: AdleClient,
  write: LessonCompletionWrite,
): Promise<void> {
  if (write.bundle !== null) {
    const { error } = await client.from("adle_review_bundles").insert({
      id: write.bundle.bundleId,
      child_id: write.bundle.childId,
      source_ref: write.bundle.sourceRef,
      interval_index: write.bundle.intervalIndex,
      next_due_on: write.bundle.nextDueOn,
      schedule_policy_version: write.bundle.schedulePolicyVersion,
      bundle_status: write.bundle.bundleStatus,
      row_status: "active",
    });
    if (error) {
      fail("persistLessonCompletion:bundle", error);
    }
    // Reteach re-entry: supersede existing active schedule rows in one query,
    // then write the new rows together.  The unique active-row guard and the
    // historical semantics remain unchanged, while a four-word lesson avoids
    // four serial remote round trips.
    const canonicalWordIds = write.scheduleWords.map(
      (word) => word.canonicalWordId,
    );
    if (canonicalWordIds.length > 0) {
      const { data: previousScheduleRows, error: previousScheduleError } =
        await client
          .from("adle_review_schedule_words")
          .select("id,canonical_word_id")
          .eq("child_id", write.scheduleWords[0].childId)
          .in("canonical_word_id", canonicalWordIds)
          .eq("row_status", "active");
      if (previousScheduleError)
        fail(
          "persistLessonCompletion:previousSchedules",
          previousScheduleError,
        );
      const previousScheduleById = new Map(
        (previousScheduleRows ?? []).map((row: any) => [
          row.id as string,
          row.canonical_word_id as string,
        ]),
      );
      const oldRouteCounts = new Map<string, number>();
      if (sharedRouteStorageEnabled() && previousScheduleById.size > 0) {
        const { data: previousRoutes, error: previousRoutesError } =
          await client
            .from("adle_review_schedule_word_routes")
            .select("schedule_word_id,micro_skill_key")
            .in("schedule_word_id", [...previousScheduleById.keys()])
            .eq("row_status", "active");
        if (previousRoutesError)
          fail("persistLessonCompletion:previousRoutes", previousRoutesError);
        const oldSkills = new Map<string, Set<string>>();
        for (const route of previousRoutes ?? []) {
          const wordId = previousScheduleById.get(
            (route as any).schedule_word_id,
          );
          if (!wordId) continue;
          const skills = oldSkills.get(wordId) ?? new Set<string>();
          skills.add((route as any).micro_skill_key);
          oldSkills.set(wordId, skills);
        }
        for (const wordId of previousScheduleById.values())
          oldRouteCounts.set(wordId, oldSkills.get(wordId)?.size ?? 1);
        const { error: supersedeRoutesError } = await client
          .from("adle_review_schedule_word_routes")
          .update({ row_status: "superseded" })
          .in("schedule_word_id", [...previousScheduleById.keys()])
          .eq("row_status", "active");
        if (supersedeRoutesError)
          fail("persistLessonCompletion:supersedeRoutes", supersedeRoutesError);
      }
      const { error: supersedeError } = await client
        .from("adle_review_schedule_words")
        .update({ row_status: "superseded" })
        .eq("child_id", write.scheduleWords[0].childId)
        .in("canonical_word_id", canonicalWordIds)
        .eq("row_status", "active");
      if (supersedeError) {
        fail("persistLessonCompletion:supersedeWord", supersedeError);
      }
      const { error: insertError } = await client
        .from("adle_review_schedule_words")
        .insert(
          write.scheduleWords.map((word) => ({
            child_id: word.childId,
            canonical_word_id: word.canonicalWordId,
            bundle_id: word.bundleId,
            membership_status: word.membershipStatus,
            catch_up_stage: word.catchUpStage,
            next_retest_due_on: word.nextRetestDueOn,
            failed_review_on: word.failedReviewOn,
            pre_retirement_check_due_on: word.preRetirementCheckDueOn,
            last_28_day_review_on: word.last28DayReviewOn,
            reteach_cycle_count: word.reteachCycleCount,
            taught_on: word.taughtOn,
            row_status: "active",
          })),
        );
      if (insertError) {
        fail("persistLessonCompletion:insertWord", insertError);
      }

      if (sharedRouteStorageEnabled()) {
        const [
          { data: currentSchedules, error: currentSchedulesError },
          { data: activeItems, error: activeItemsError },
        ] = await Promise.all([
          client
            .from("adle_review_schedule_words")
            .select("id,canonical_word_id,taught_on,bundle_id")
            .eq("child_id", write.scheduleWords[0].childId)
            .in("canonical_word_id", canonicalWordIds)
            .eq("row_status", "active"),
          client
            .from("adle_learning_items")
            .select(
              "id,canonical_word_id,micro_skill_key,intake_on,item_status",
            )
            .eq("child_id", write.scheduleWords[0].childId)
            .in("canonical_word_id", canonicalWordIds)
            .eq("row_status", "active")
            .neq("item_status", "resolved"),
        ]);
        if (currentSchedulesError)
          fail(
            "persistLessonCompletion:currentSchedules",
            currentSchedulesError,
          );
        if (activeItemsError)
          fail("persistLessonCompletion:activeItems", activeItemsError);
        const scheduleByWord = new Map(
          (currentSchedules ?? []).map((row: any) => [
            row.canonical_word_id as string,
            row,
          ]),
        );
        const itemsByWord = new Map<string, any[]>();
        for (const item of activeItems ?? []) {
          const list = itemsByWord.get((item as any).canonical_word_id) ?? [];
          list.push(item);
          itemsByWord.set((item as any).canonical_word_id, list);
        }
        const routeWrites: any[] = [];
        const reactivations: ReviewOutcomeEvent[] = [];
        for (const [wordId, items] of itemsByWord) {
          const schedule = scheduleByWord.get(wordId);
          if (!schedule) continue;
          items.sort((a, b) =>
            a.intake_on !== b.intake_on
              ? `${a.intake_on}`.localeCompare(`${b.intake_on}`)
              : `${a.id}`.localeCompare(`${b.id}`),
          );
          items.forEach((item, index) =>
            routeWrites.push({
              schedule_word_id: schedule.id,
              learning_item_id: item.id,
              micro_skill_key: item.micro_skill_key,
              attached_on: schedule.taught_on,
              attachment_ordinal: index + 1,
              row_status: "active",
            }),
          );
          const newSkillCount = new Set(
            items.map((item) => item.micro_skill_key),
          ).size;
          if (
            (oldRouteCounts.get(wordId) ?? 0) > 0 &&
            newSkillCount > (oldRouteCounts.get(wordId) ?? 0)
          ) {
            reactivations.push({
              childId: write.scheduleWords[0].childId,
              canonicalWordId: wordId,
              bundleId: schedule.bundle_id,
              eventType: "reactivated_for_new_skill",
              occurredOn: schedule.taught_on,
              intervalIndex: 0,
              schedulePolicyVersion: write.bundle.schedulePolicyVersion,
            });
          }
        }
        if (routeWrites.length > 0) {
          const { error: routeWriteError } = await client
            .from("adle_review_schedule_word_routes")
            .insert(routeWrites);
          if (routeWriteError)
            fail("persistLessonCompletion:insertRoutes", routeWriteError);
        }
        await insertOutcomeEvents(client, reactivations);
      }
    }
  }
  await Promise.all([
    insertTaughtEvents(client, write.taughtEvents),
    updateLearningItems(client, write.itemTransitions),
  ]);
}

export interface ProbeCompletionWrite {
  probeRun: ProbeRunRecord;
  probedEvents: readonly TaughtWordHistoryWithAttempt[];
  itemIntakes: readonly LearningItemFact[];
}

export async function persistProbeCompletion(
  client: AdleClient,
  write: ProbeCompletionWrite,
): Promise<void> {
  const { error } = await client.from("adle_probe_runs").insert({
    child_id: write.probeRun.childId,
    micro_skill_key: write.probeRun.microSkillKey,
    run_on: write.probeRun.runOn,
    word_count: write.probeRun.wordCount,
    source_ref: write.probeRun.sourceRef,
    row_status: "active",
  });
  if (error) {
    fail("persistProbeCompletion:probeRun", error);
  }
  await insertTaughtEvents(client, write.probedEvents);
  await insertLearningItemIntakes(client, write.itemIntakes);
}

/** Live authentic-use emission (Slice 4 open-question-3, landed here): insert
 * bridge events under the storage's (child, word, piece, kind) uniqueness
 * guard. Existing rows (e.g. from the guarded batch bridge) are tolerated —
 * a unique violation is idempotent success, never an error. Returns the
 * number of rows the storage accepted. */
export async function persistAuthenticUseEvents(
  client: AdleClient,
  events: readonly AuthenticUseEventFact[],
  verifiedAtIso: string,
): Promise<number> {
  let inserted = 0;
  for (const event of events) {
    const { error } = await client.from("adle_authentic_use_events").insert({
      child_id: event.childId,
      canonical_word_id: event.canonicalWordId,
      occurred_on: event.occurredOn,
      use_kind: event.useKind,
      parent_verified: true,
      verified_at: verifiedAtIso,
      piece_ref: event.pieceRef,
      source_ref: event.sourceRef,
      row_status: "active",
    });
    if (error === null) {
      inserted += 1;
    } else if (!`${error.code ?? ""}`.startsWith("23505")) {
      fail("persistAuthenticUseEvents", error);
    }
  }
  return inserted;
}

export interface PausedScheduleWordRow {
  child_id: string;
  canonical_word_id: string;
  bundle_id: string;
}

/** Release write-back: the schedule word transition (from
 * releasePausedScheduleWord) plus its ledger events and the learning-item
 * transition(s) from resume/retire helpers. */
export async function persistPausedWordRelease(
  client: AdleClient,
  write: {
    word: ScheduleWordFact;
    events: readonly ReviewOutcomeEvent[];
    itemTransitions: readonly LearningItemFact[];
  },
): Promise<void> {
  await updateScheduleWords(client, [write.word]);
  await insertOutcomeEvents(client, write.events);
  await updateLearningItems(client, write.itemTransitions);
}
