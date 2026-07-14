"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { buildScopedPath, getActiveChildIdFromCookies, selectChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ADLE_ASSIGNMENT_GENERATION_SOURCE,
  ADLE_DAILY_ASSIGNMENT_TITLE,
} from "@/lib/adle/assignment-persistence";
import {
  onLessonCompleted,
  onProbeCompleted,
  onReviewSessionCompleted,
  pauseItemsForParentReview,
  type ProbeWordOutcome,
  type ProducedWordAttempt,
  type ReviewItemOutcome,
} from "@/lib/adle/composer-completions";
import {
  buildLessonAttemptEvents,
  buildReviewAttemptEvents,
} from "@/lib/adle/assignment-attempt-events";
import { reopenItemsForMicroSkills } from "@/lib/adle/learning-items";
import { authenticUseProviderFromFacts } from "@/lib/adle/authentic-use";
import type { DueItemKind } from "@/lib/adle/review-due-queue";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";
import { loadActiveReviewPolicy } from "@/lib/adle/loaders/composer-facts-loader";
import {
  getAdleDailyPlanReadModel,
  type AdleSessionItem,
} from "@/lib/adle/loaders/daily-plan-surface";
import { advanceForgeForAdleTaughtWords } from "@/lib/rewards/adle-reward-bridge";
import {
  authenticUseEventFromRow,
  bundleFromRow,
  learningItemFromRow,
  scheduleWordFromRow,
  type AuthenticUseEventRow,
  type LearningItemRow,
  type ReviewBundleRow,
  type ScheduleWordRow,
} from "@/lib/adle/loaders/rows";
import {
  hasProductionOutcomeEventsOn,
  hasTaughtEventsForSourceRef,
  insertAssignmentAttemptEvents,
  markAssignmentCompletedIfAllItemsComplete,
  persistLessonCompletion,
  persistProbeCompletion,
  persistReviewSessionCompletion,
} from "@/lib/adle/loaders/session-completion-loader";
import { isMorphologyUnPilotEnabledForChild } from "@/lib/adle/morphology/pilot-access";
import { extractAuthoredTargetToken, resolveMorphologyPilotRuntime } from "@/lib/adle/morphology/payload";

function readFormValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The bridge/dictionary normalisation: lowercase, letters only. Correctness
 * is derived server-side against the item's canonical target word — the
 * client submits raw attempt text only. */

function parseAttempts(formData: FormData, key: string): Map<string, string> {
  const raw = formData.get(key);
  const attempts = new Map<string, string>();
  if (typeof raw !== "string" || raw.trim() === "") {
    return attempts;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (
          entry !== null &&
          typeof entry === "object" &&
          typeof (entry as { key?: unknown }).key === "string" &&
          typeof (entry as { attemptText?: unknown }).attemptText === "string"
        ) {
          attempts.set((entry as { key: string }).key, (entry as { attemptText: string }).attemptText);
        }
      }
    }
  } catch {
    // Malformed payloads fail closed to "no attempts" -> validation error.
  }
  return attempts;
}

interface SessionActionContext {
  userClient: Awaited<ReturnType<typeof createClient>>;
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  parentUserId: string;
  childId: string;
  assignmentId: string;
  planDate: string;
  sessionPath: string;
}

async function resolveSessionContext(formData: FormData): Promise<SessionActionContext> {
  const mode = readFormValue(formData, "mode");
  const childId = readFormValue(formData, "childId");
  const assignmentId = readFormValue(formData, "assignmentId");
  const fallbackChildId = childId ?? (await getActiveChildIdFromCookies());
  const sessionPath = buildScopedPath("/learn/week/adle", fallbackChildId, "child");

  if (mode !== "child" || !childId || !assignmentId) {
    redirect(sessionPath);
  }

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const children = await getActiveChildrenForUser(userClient, user.id);
  const selectedChild = selectChildById(children, childId);
  if (!selectedChild) {
    redirect(buildScopedPath("/learn/week", fallbackChildId, "child"));
  }

  const { data: header, error } = await userClient
    .from("daily_assignments")
    .select("id, assignment_date")
    .eq("id", assignmentId)
    .eq("parent_user_id", user.id)
    .eq("child_id", selectedChild.id)
    .eq("title", ADLE_DAILY_ASSIGNMENT_TITLE)
    .eq("assignment_generation_source", ADLE_ASSIGNMENT_GENERATION_SOURCE)
    .maybeSingle();
  if (error || !header) {
    redirect(withParam(sessionPath, "error", "We couldn't find today's ADLE plan."));
  }

  return {
    userClient,
    serviceClient: createServiceRoleClient(),
    parentUserId: user.id,
    childId: selectedChild.id,
    assignmentId,
    // planDate comes from the assignment row, never recomputed at submit
    // time (Slice 6 pin: a session finished after midnight still writes to
    // its own day and keeps the idempotence keys stable).
    planDate: (header as { assignment_date: string }).assignment_date,
    sessionPath: buildScopedPath("/learn/week/adle", selectedChild.id, "child"),
  };
}

async function markItemsCompleted(
  context: SessionActionContext,
  items: readonly AdleSessionItem[],
): Promise<void> {
  const ids = items.map((item) => item.id);
  if (ids.length === 0) {
    return;
  }
  const { error } = await context.userClient
    .from("assignment_items")
    .update({ status: "completed" })
    .eq("parent_user_id", context.parentUserId)
    .eq("child_id", context.childId)
    .in("id", ids);
  if (error) {
    throw new Error(`markItemsCompleted: ${error.message}`);
  }
  await markAssignmentCompletedIfAllItemsComplete(context.userClient, {
    parentUserId: context.parentUserId,
    childId: context.childId,
    assignmentId: context.assignmentId,
  });
}

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function finishWith(context: SessionActionContext, message: string): never {
  revalidatePath("/learn/week");
  revalidatePath("/learn/week/adle");
  redirect(withParam(context.sessionPath, "saved", message));
}

export async function completeAdleReviewPartAction(formData: FormData) {
  const context = await resolveSessionContext(formData);
  const { serviceClient, childId, planDate } = context;

  const readModel = await getAdleDailyPlanReadModel({
    userClient: context.userClient,
    parentUserId: context.parentUserId,
    childId,
    planDate,
    assignmentId: context.assignmentId,
  });
  if (!readModel.partOne.present) {
    finishWith(context, "There is no review part today.");
  }
  if (readModel.partOne.complete) {
    finishWith(context, "Today's review is already recorded.");
  }
  // Crash-retry guard: production events for this plan date mean the
  // scheduler writes already landed — re-mark the items and stop.
  if (await hasProductionOutcomeEventsOn(serviceClient, childId, planDate)) {
    await markItemsCompleted(context, readModel.partOne.items);
    finishWith(context, "Today's review is already recorded.");
  }

  const attempts = parseAttempts(formData, "attempts");
  const reflectionAttempts = parseAttempts(formData, "reflectionAttempts");
  const productionItems = readModel.partOne.items.filter(
    (item) => item.sectionKey === "review_production" && item.canonicalWordId !== null,
  );
  const reflectionItems = readModel.partOne.items.filter((item) => item.sectionKey === "review_reflection");
  const outcomes: ReviewItemOutcome[] = [];
  const microSkillKeyByWordId = new Map<string, string>();
  for (const item of productionItems) {
    const canonicalWordId = item.canonicalWordId as string;
    const attemptText = attempts.get(canonicalWordId) ?? "";
    const target = item.targetWord ?? "";
    const dueKind = item.promptData.dueKind;
    const bundleId = item.promptData.bundleId;
    if (typeof dueKind !== "string" || typeof bundleId !== "string") {
      throw new Error(`completeAdleReviewPartAction: item ${item.id} is missing due metadata`);
    }
    outcomes.push({
      canonicalWordId,
      bundleId,
      kind: dueKind as DueItemKind,
      passed: isAttemptCorrect(attemptText, target),
      attemptText,
    });
    if (item.microSkillKey !== null) {
      microSkillKeyByWordId.set(canonicalWordId, item.microSkillKey);
    }
  }
  if (outcomes.length === 0) {
    finishWith(context, "Nothing to record for today's review.");
  }
  await insertAssignmentAttemptEvents(
    serviceClient,
    buildReviewAttemptEvents({
      context,
      productionItems,
      reflectionItems,
      attempts,
      reflectionAttempts,
    }),
  );

  const [policy, bundleRows, scheduleWordRows, learningItemRows, authenticUseRows] = await Promise.all([
    loadActiveReviewPolicy(serviceClient),
    serviceClient
      .from("adle_review_bundles")
      .select("id, child_id, source_ref, interval_index, next_due_on, schedule_policy_version, bundle_status, row_status")
      .eq("child_id", childId)
      .eq("row_status", "active"),
    serviceClient
      .from("adle_review_schedule_words")
      .select(
        "child_id, canonical_word_id, bundle_id, membership_status, catch_up_stage, next_retest_due_on, failed_review_on, pre_retirement_check_due_on, last_28_day_review_on, reteach_cycle_count, taught_on, row_status",
      )
      .eq("child_id", childId)
      .eq("row_status", "active"),
    serviceClient
      .from("adle_learning_items")
      .select(
        "id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status",
      )
      .eq("child_id", childId)
      .eq("row_status", "active"),
    serviceClient
      .from("adle_authentic_use_events")
      .select("child_id, canonical_word_id, occurred_on, use_kind, parent_verified, piece_ref, source_ref, row_status")
      .eq("child_id", childId)
      .eq("row_status", "active"),
  ]);
  for (const result of [bundleRows, scheduleWordRows, learningItemRows, authenticUseRows]) {
    if (result.error) {
      throw new Error(`completeAdleReviewPartAction:load: ${result.error.message}`);
    }
  }
  const bundles = ((bundleRows.data ?? []) as ReviewBundleRow[]).map(bundleFromRow);
  const scheduleWords = ((scheduleWordRows.data ?? []) as ScheduleWordRow[]).map(scheduleWordFromRow);
  const learningItems = ((learningItemRows.data ?? []) as LearningItemRow[]).map(learningItemFromRow);
  const authenticUseEvents = ((authenticUseRows.data ?? []) as AuthenticUseEventRow[]).map(
    authenticUseEventFromRow,
  );

  const result = onReviewSessionCompleted(policy, {
    childId,
    completedOn: planDate,
    sourceRef: `review:${childId}:${planDate}`,
    bundles,
    scheduleWords,
    outcomes,
    microSkillKeyByWordId,
    authenticUse: authenticUseProviderFromFacts(authenticUseEvents),
  });

  for (const wordId of result.unmappedEjections) {
    console.warn(
      `[adle-review-completion] ejected word ${wordId} has no micro-skill mapping — surfaced, not guessed`,
    );
  }

  const pausedItems = pauseItemsForParentReview(learningItems, childId, result.pausedForParentReview);
  const reopenedItems = reopenItemsForMicroSkills(
    learningItems,
    childId,
    result.reopenMicroSkillKeys,
    planDate,
  );

  await persistReviewSessionCompletion(serviceClient, {
    updatedBundles: result.updatedBundles,
    updatedScheduleWords: result.updatedScheduleWords,
    outcomeEvents: result.outcomeEvents,
    itemIntakes: result.itemIntakes,
    pausedItems,
    reopenedItems,
  });
  await markItemsCompleted(context, readModel.partOne.items);

  finishWith(
    context,
    result.reopenMicroSkillKeys.length > 0
      ? "Review finished. We'll come back to the tricky pattern in another lesson soon."
      : "Review finished. Nice work.",
  );
}

export async function completeAdleLessonPartAction(formData: FormData) {
  const context = await resolveSessionContext(formData);
  const { serviceClient, childId, planDate } = context;

  const readModel = await getAdleDailyPlanReadModel({
    userClient: context.userClient,
    parentUserId: context.parentUserId,
    childId,
    planDate,
    assignmentId: context.assignmentId,
  });
  if (!readModel.partTwo.present) {
    finishWith(context, "There is no lesson today — review-only days are a good thing.");
  }
  if (readModel.partTwo.complete) {
    finishWith(context, "Today's lesson is already recorded.");
  }

  const productionItems = readModel.partTwo.items.filter(
    (item) => item.sectionKey === "lesson_production" && item.canonicalWordId !== null,
  );
  const microSkillKey = productionItems.find((item) => item.microSkillKey !== null)?.microSkillKey ?? null;
  if (productionItems.length === 0 || microSkillKey === null) {
    finishWith(context, "Nothing to record for today's lesson.");
  }
  const lessonSourceRef = `lesson:${childId}:${planDate}:${microSkillKey}`;

  // Crash-retry guard: taught events for the deterministic lesson ref mean
  // the completion already landed — re-mark the items and stop.
  if (await hasTaughtEventsForSourceRef(serviceClient, childId, lessonSourceRef)) {
    await markItemsCompleted(context, readModel.partTwo.items);
    finishWith(context, "Today's lesson is already recorded.");
  }

  const controlledAttempts = parseAttempts(formData, "attempts");
  let dictationAttempts = parseAttempts(formData, "dictationAttempts");
  const dictationSentenceAttempts = parseAttempts(formData, "dictationSentenceAttempts");
  const probeAttempts = parseAttempts(formData, "probeAttempts");
  const guidedAttempts = parseAttempts(formData, "guidedAttempts");

  const dictationItems = readModel.partTwo.items.filter(
    (item) => item.sectionKey === "lesson_dictation" && item.canonicalWordId !== null,
  );
  const morphologyPilot = resolveMorphologyPilotRuntime(
    isMorphologyUnPilotEnabledForChild(childId),
    readModel.partTwo.items,
  );
  if (morphologyPilot !== null) {
    const sentenceActivity = morphologyPilot.activities.find((activity) => activity.type === "sentence_dictation");
    const derived = new Map<string, string>();
    for (const sentence of sentenceActivity?.sentences ?? []) {
      const rawAttempt = dictationSentenceAttempts.get(sentence.canonicalWordId) ?? "";
      derived.set(sentence.canonicalWordId, extractAuthoredTargetToken(rawAttempt, sentence.targetTokenIndex));
    }
    dictationAttempts = derived;
  }
  const hasDictation = dictationItems.length > 0;

  const producedWords: ProducedWordAttempt[] = productionItems.map((item) => {
    const canonicalWordId = item.canonicalWordId as string;
    // The final production decides success: dictation when composed, else
    // controlled spelling (a probe day has no lesson dictation by design).
    const attemptText =
      (hasDictation ? dictationAttempts.get(canonicalWordId) : undefined) ??
      controlledAttempts.get(canonicalWordId) ??
      "";
    const target = item.targetWord ?? "";
    return {
      canonicalWordId,
      attemptText,
      correct: isAttemptCorrect(attemptText, target),
    };
  });

  const [policy, learningItemRows] = await Promise.all([
    loadActiveReviewPolicy(serviceClient),
    serviceClient
      .from("adle_learning_items")
      .select(
        "id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status",
      )
      .eq("child_id", childId)
      .eq("row_status", "active"),
  ]);
  if (learningItemRows.error) {
    throw new Error(`completeAdleLessonPartAction:items: ${learningItemRows.error.message}`);
  }
  const learningItems = ((learningItemRows.data ?? []) as LearningItemRow[]).map(learningItemFromRow);

  const lessonResult = onLessonCompleted(policy, {
    childId,
    microSkillKey,
    completedOn: planDate,
    sourceRef: lessonSourceRef,
    bundleId: randomUUID(),
    producedWords,
    learningItems,
  });
  await insertAssignmentAttemptEvents(
    serviceClient,
    buildLessonAttemptEvents({
      context,
      sourceRef: lessonSourceRef,
      items: readModel.partTwo.items,
      controlledAttempts,
      dictationAttempts,
      dictationRawAttempts: morphologyPilot === null ? undefined : dictationSentenceAttempts,
      guidedAttempts,
      probeAttempts,
    }),
  );
  await persistLessonCompletion(serviceClient, lessonResult);

  // Probe day: the diagnostic probe replaced the lesson dictation — record
  // it through its own completion helper (probe words are cold words with
  // canonical truth; misses become learning items).
  const probeItem = readModel.partTwo.items.find((item) => item.sectionKey === "lesson_probe");
  if (probeItem !== undefined) {
    const probeWords = Array.isArray(probeItem.promptData.words)
      ? (probeItem.promptData.words as { canonicalWordId?: unknown; targetWord?: unknown }[])
      : [];
    const words: ProbeWordOutcome[] = probeWords
      .filter(
        (word) => typeof word.canonicalWordId === "string" && typeof word.targetWord === "string",
      )
      .map((word) => {
        const canonicalWordId = word.canonicalWordId as string;
        const targetWord = word.targetWord as string;
        const attemptText = probeAttempts.get(canonicalWordId) ?? "";
        return {
          canonicalWordId,
          targetWord,
          attemptText,
          correct: isAttemptCorrect(attemptText, targetWord),
        };
      });
    if (words.length > 0) {
      const probeResult = onProbeCompleted({
        childId,
        microSkillKey,
        completedOn: planDate,
        sourceRef: `probe:${childId}:${planDate}:${microSkillKey}`,
        words,
      });
      for (const route of probeResult.candidateQueueRoutes) {
        console.info(
          `[adle-probe-completion] miss without canonical truth routed to candidate mapping: "${route.targetWord}" (attempt "${route.attemptText}")`,
        );
      }
      await persistProbeCompletion(serviceClient, probeResult);
    }
  }

  // ADLE Slice 7a (7a-C): reward loop. On lesson completion, move each taught
  // word's Golden Nugget into the Forge (reward-owned consumer; ADLE stays
  // event-only). Idempotent and boundary-respecting; a failure here can never
  // block completion (the words are already taught).
  try {
    await advanceForgeForAdleTaughtWords({
      supabase: serviceClient,
      parentUserId: context.parentUserId,
      childId,
      dailyAssignmentId: context.assignmentId,
      taughtWords: productionItems.map((item) => ({
        assignmentItemId: item.id,
        targetWord: item.targetWord ?? "",
      })),
    });
  } catch (forgeError) {
    console.error(
      `[adle-reward-bridge] forge advance failed for ${childId} ${planDate} (lesson completion unaffected)`,
      forgeError,
    );
  }

  await markItemsCompleted(context, readModel.partTwo.items);
  finishWith(context, "Lesson finished. New words join review tomorrow.");
}
