"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
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
import { extractAuthoredTargetToken, resolveMorphologyPilotRuntime, type MorphologyLessonPayloadV1 } from "@/lib/adle/morphology/payload";
import { isBaseWordFamilyPilotEnabledForChild } from "@/lib/adle/morphology/base-word-family-pilot-access";
import { resolveBaseWordFamilyPilotRuntime } from "@/lib/adle/morphology/base-word-family-pilot-contract";
import { BASE_WORD_FAMILY_ASSIGNMENT_SOURCE, BASE_WORD_FAMILY_ASSIGNMENT_TITLE } from "@/lib/adle/morphology/base-word-family-pilot-plan";
import { baseWordTransferMissWrites } from "@/lib/adle/base-word-transfer-evidence";
import { persistBaseWordFamilyPilotCompletion } from "@/lib/adle/loaders/base-word-family-pilot-loader";
import { BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY, upsertChildLearningReflection } from "@/lib/adle/morphology/reflections";
import { safeCompletionTraceId, WordLabCompletionTimer } from "@/lib/adle/completion-timing";
import {
  persistWordLabCompletion,
  type WordLabReflectionWrite,
} from "@/lib/adle/loaders/word-lab-completion-loader";

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

async function resolveSessionContext(formData: FormData, assignmentKind: "standard" | "base_word_family" = "standard"): Promise<SessionActionContext> {
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
    .eq("title", assignmentKind === "base_word_family" ? BASE_WORD_FAMILY_ASSIGNMENT_TITLE : ADLE_DAILY_ASSIGNMENT_TITLE)
    .eq("assignment_generation_source", assignmentKind === "base_word_family" ? BASE_WORD_FAMILY_ASSIGNMENT_SOURCE : ADLE_ASSIGNMENT_GENERATION_SOURCE)
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

function finishWith(
  context: SessionActionContext,
  message: string,
  completionTraceId?: string,
  timer?: WordLabCompletionTimer,
  outcome = "redirected",
): never {
  const redirectStartedAt = performance.now();
  revalidatePath("/learn/week");
  revalidatePath("/learn/week/adle");
  if (timer) {
    timer.mark("redirect", redirectStartedAt);
    timer.emit(outcome);
  }
  const savedPath = withParam(context.sessionPath, "saved", message);
  redirect(completionTraceId ? withParam(savedPath, "completionTrace", completionTraceId) : savedPath);
}

function scheduleLessonReward(
  context: SessionActionContext,
  productionItems: readonly AdleSessionItem[],
  timer?: WordLabCompletionTimer,
): void {
  after(async () => {
    try {
      const run = () => advanceForgeForAdleTaughtWords({
        supabase: context.serviceClient,
        parentUserId: context.parentUserId,
        childId: context.childId,
        dailyAssignmentId: context.assignmentId,
        taughtWords: productionItems.map((item) => ({
          assignmentItemId: item.id,
          targetWord: item.targetWord ?? "",
        })),
      });
      if (timer) await timer.measure("reward_follow_up", run);
      else await run();
      timer?.emit("reward_follow_up_completed");
    } catch (forgeError) {
      console.error(
        "[adle-reward-bridge] Word Lab forge advance failed (lesson completion unaffected)",
        forgeError,
      );
      timer?.emit("reward_follow_up_failed");
    }
  });
}

function buildMorphologyReflection(context: SessionActionContext, payload: MorphologyLessonPayloadV1, reflectionText: string | null): WordLabReflectionWrite {
  const reflection = payload.activities.find((activity) => activity.type === "reflection");
  if (!reflectionText || !reflection?.promptKey || !reflection.promptText) throw new Error("Please write a reflection before finishing the Word Lab.");
  return {
    childId: context.childId,
    parentUserId: context.parentUserId,
    assignmentId: context.assignmentId,
    microSkillKey: payload.microSkillId,
    contentVersion: payload.contentVersion,
    promptKey: reflection.promptKey,
    promptText: reflection.promptText,
    reflectionText,
  };
}

async function persistMorphologyReflection(context: SessionActionContext, payload: MorphologyLessonPayloadV1, reflectionText: string | null): Promise<void> {
  await upsertChildLearningReflection(context.serviceClient, buildMorphologyReflection(context, payload, reflectionText));
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
  const completionTraceId = safeCompletionTraceId(formData.get("completionTraceId"), randomUUID());
  const timer = new WordLabCompletionTimer(completionTraceId);
  const context = await timer.measure("context_auth_ownership", () => resolveSessionContext(formData));
  const { serviceClient, childId, planDate } = context;

  const readModel = await timer.measure("plan_read_model", () => getAdleDailyPlanReadModel({
    userClient: context.userClient,
    parentUserId: context.parentUserId,
    childId,
    planDate,
    assignmentId: context.assignmentId,
  }));
  if (!readModel.partTwo.present) {
    finishWith(context, "There is no lesson today — review-only days are a good thing.");
  }

  const productionItems = readModel.partTwo.items.filter(
    (item) => item.sectionKey === "lesson_production" && item.canonicalWordId !== null,
  );
  const microSkillKey = productionItems.find((item) => item.microSkillKey !== null)?.microSkillKey ?? null;
  if (productionItems.length === 0 || microSkillKey === null) {
    finishWith(context, "Nothing to record for today's lesson.");
  }
  const lessonSourceRef = `lesson:${childId}:${planDate}:${microSkillKey}`;
  const morphologyPilot = resolveMorphologyPilotRuntime(
    isMorphologyUnPilotEnabledForChild(childId),
    readModel.partTwo.items,
  );
  const atomicWordLabCompletionEnabled = process.env.ADLE_WORD_LAB_ATOMIC_COMPLETION_ENABLED === "enabled";
  const learningReflection = readFormValue(formData, "learningReflection");
  if (readModel.partTwo.complete && morphologyPilot === null) {
    finishWith(context, "Today's lesson is already recorded.");
  }

  // Crash-retry guard: taught events for the deterministic lesson ref mean
  // the completion already landed — re-mark the items and stop.
  const taughtCompletionExists = await timer.measure("retry_guard", () =>
    hasTaughtEventsForSourceRef(serviceClient, childId, lessonSourceRef));
  if (taughtCompletionExists && morphologyPilot !== null && !atomicWordLabCompletionEnabled) {
    await timer.measure("reflection_persistence", () => persistMorphologyReflection(context, morphologyPilot, learningReflection));
    await timer.measure("assignment_completion", () => markItemsCompleted(context, readModel.partTwo.items));
    scheduleLessonReward(context, productionItems, timer);
    finishWith(context, "Today's lesson is already recorded.", completionTraceId, timer, "batched_retry");
  }
  if (taughtCompletionExists && morphologyPilot === null) {
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
  if (morphologyPilot !== null && atomicWordLabCompletionEnabled) {
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

  const [policy, learningItemRows] = await timer.measure("policy_learning_items", () => Promise.all([
    loadActiveReviewPolicy(serviceClient),
    serviceClient
      .from("adle_learning_items")
      .select(
        "id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status",
      )
      .eq("child_id", childId)
      .eq("row_status", "active"),
  ]));
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
  const attemptEvents = buildLessonAttemptEvents({
    context,
    sourceRef: lessonSourceRef,
    items: readModel.partTwo.items,
    controlledAttempts,
    dictationAttempts,
    dictationRawAttempts: morphologyPilot === null ? undefined : dictationSentenceAttempts,
    guidedAttempts,
    probeAttempts,
  });

  if (morphologyPilot !== null && atomicWordLabCompletionEnabled) {
    const reflection = buildMorphologyReflection(context, morphologyPilot, learningReflection);
    const result = await timer.measure("atomic_durable_completion", () => persistWordLabCompletion(serviceClient, {
      parentUserId: context.parentUserId,
      childId,
      assignmentId: context.assignmentId,
      planDate,
      microSkillKey,
      sourceRef: lessonSourceRef,
      assignmentItemIds: readModel.partTwo.items.map((item) => item.id),
      attempts: attemptEvents,
      lesson: lessonResult,
      reflection,
    }));
    scheduleLessonReward(context, productionItems, timer);
    finishWith(
      context,
      result.status === "already_completed" ? "Today's lesson is already recorded." : "Lesson finished. New words join review tomorrow.",
      completionTraceId,
      timer,
      result.status,
    );
  }

  if (morphologyPilot !== null) {
    await Promise.all([
      timer.measure("attempt_persistence", () => insertAssignmentAttemptEvents(serviceClient, attemptEvents)),
      timer.measure("lesson_persistence", () => persistLessonCompletion(serviceClient, lessonResult)),
      timer.measure("reflection_persistence", () => persistMorphologyReflection(context, morphologyPilot, learningReflection)),
    ]);
    await timer.measure("assignment_completion", () => markItemsCompleted(context, readModel.partTwo.items));
    scheduleLessonReward(context, productionItems, timer);
    finishWith(context, "Lesson finished. New words join review tomorrow.", completionTraceId, timer, "instrumented_batched_completion");
  }

  // Generic ADLE lessons retain the existing independently idempotent writes.
  await Promise.all([
    timer.measure("attempt_persistence", () => insertAssignmentAttemptEvents(serviceClient, attemptEvents)),
    timer.measure("lesson_persistence", () => persistLessonCompletion(serviceClient, lessonResult)),
  ]);

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

  scheduleLessonReward(context, productionItems);
  await timer.measure("assignment_completion", () => markItemsCompleted(context, readModel.partTwo.items));
  finishWith(context, "Lesson finished. New words join review tomorrow.");
}

/** Separate from generic ADLE: transfer words must never reach its scheduler path. */
export async function completeBaseWordFamilyLessonAction(formData: FormData) {
  const context = await resolveSessionContext(formData, "base_word_family");
  if (!isBaseWordFamilyPilotEnabledForChild(context.childId)) {
    finishWith(context, "This Word Lab is not available right now.");
  }
  const readModel = await getAdleDailyPlanReadModel({
    userClient: context.userClient, parentUserId: context.parentUserId, childId: context.childId,
    planDate: context.planDate, assignmentId: context.assignmentId,
  });
  const payload = resolveBaseWordFamilyPilotRuntime(true, readModel.partTwo.items);
  if (!payload || readModel.partTwo.items.length !== 18) {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  }
  const controlledAttempts = parseAttempts(formData, "baseWordControlledAttempts");
  const sentenceAttempts = parseAttempts(formData, "baseWordSentenceAttempts");
  const reflection = readFormValue(formData, "baseWordReflection");
  if (!reflection) finishWith(context, "Please share what you noticed before finishing.");
  const finalAttempts = payload.independentWords.map((word) => {
    const rawSentence = sentenceAttempts.get(word.canonicalWordId) ?? "";
    const attemptText = extractAuthoredTargetToken(rawSentence, word.dictationTargetTokenIndex);
    return { canonicalWordId: word.canonicalWordId, attemptText, correct: isAttemptCorrect(attemptText, word.displayWord) };
  });
  const authenticIds = new Set(payload.independentSlots.filter((slot) => slot.provenance === "authentic_target").map((slot) => slot.canonicalWordId));
  const authenticProductionItems = readModel.partTwo.items.filter((item) => item.sectionKey === "lesson_production" && item.canonicalWordId !== null && authenticIds.has(item.canonicalWordId));
  if (authenticProductionItems.length !== 2) finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  const { data: learningItemRows, error: itemsError } = await context.serviceClient.from("adle_learning_items")
    .select("id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status")
    .eq("child_id", context.childId).eq("row_status", "active");
  if (itemsError) throw new Error(`completeBaseWordFamilyLessonAction:items: ${itemsError.message}`);
  const policy = await loadActiveReviewPolicy(context.serviceClient);
  const lesson = onLessonCompleted(policy, {
    childId: context.childId, microSkillKey: payload.microSkillKey, completedOn: context.planDate,
    sourceRef: `lesson:${context.childId}:${context.planDate}:${payload.microSkillKey}`,
    bundleId: randomUUID(),
    producedWords: finalAttempts.filter((attempt) => authenticIds.has(attempt.canonicalWordId)),
    learningItems: ((learningItemRows ?? []) as LearningItemRow[]).map(learningItemFromRow),
  });
  const sourceRef = `lesson:${context.childId}:${context.planDate}:${payload.microSkillKey}`;
  const attempts = buildLessonAttemptEvents({
    context, sourceRef, items: readModel.partTwo.items, controlledAttempts,
    dictationAttempts: new Map(finalAttempts.map((attempt) => [attempt.canonicalWordId, attempt.attemptText])),
    dictationRawAttempts: sentenceAttempts,
    guidedAttempts: new Map(readModel.partTwo.items.filter((item) => item.sectionKey === "lesson_intro" || item.sectionKey === "guided_practice").map((item) => [item.id, "completed"])),
    probeAttempts: new Map(),
  });
  if (attempts.length !== 18) throw new Error("completeBaseWordFamilyLessonAction: expected six guided and twelve independent attempts");
  const result = await persistBaseWordFamilyPilotCompletion({
    client: context.serviceClient, parentUserId: context.parentUserId, childId: context.childId,
    assignmentId: context.assignmentId, planDate: context.planDate, microSkillKey: payload.microSkillKey,
    sourceRef, assignmentItemIds: readModel.partTwo.items.map((item) => item.id), attempts, lesson,
    transferMisses: baseWordTransferMissWrites({ payload, childId: context.childId, lessonSourceRef: sourceRef, occurredOn: context.planDate as import("@/lib/adle/review-scheduler").IsoDate, finalAttempts }),
  });
  await upsertChildLearningReflection(context.serviceClient, {
    childId: context.childId, parentUserId: context.parentUserId, assignmentId: context.assignmentId,
    microSkillKey: payload.microSkillKey, contentVersion: payload.contentVersion,
    promptKey: BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY, promptText: payload.reflectionPrompt, reflectionText: reflection,
  });
  scheduleLessonReward(context, authenticProductionItems);
  finishWith(context, result.status === "already_completed" ? "Today's lesson is already recorded." : "Lesson finished. Your two writing words join review tomorrow.");
}
