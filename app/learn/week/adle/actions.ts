"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { randomUUID } from "node:crypto";

import { buildScopedPath, findChildById, getActiveChildIdFromCookies } from "@/lib/children";
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
  type CompletionWordPolicy,
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
import { isAttemptCorrect, isExactGovernedFormCorrect } from "@/lib/adle/session-correctness";
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
import { isDynamicPrefixRouteEnabled } from "@/lib/adle/morphology/dynamic-prefix-staging-access";
import { isDynamicSuffixRouteEnabled } from "@/lib/adle/morphology/dynamic-suffix-route-gate";
import { deriveDynamicAffixCompletionPolicy } from "@/lib/adle/morphology/dynamic-affix-completion-policy";
import { extractAuthoredTargetToken, type MorphologyLessonPayloadV1 } from "@/lib/adle/morphology/payload";
import { analyseDictationSentence } from "@/lib/adle/morphology/dictation-context";
import { isBaseWordFamilyPilotEnabledForChild } from "@/lib/adle/morphology/base-word-family-pilot-access";
import { BASE_WORD_FAMILY_ASSIGNMENT_SOURCE, BASE_WORD_FAMILY_ASSIGNMENT_TITLE } from "@/lib/adle/morphology/base-word-family-pilot-plan";
import { baseWordTransferMissWrites } from "@/lib/adle/base-word-transfer-evidence";
import { baseWordSlotAssignmentRole, baseWordSlotHasLearnerEvidence } from "@/lib/adle/morphology/base-word-family-payload";
import { persistBaseWordFamilyPilotCompletion } from "@/lib/adle/loaders/base-word-family-pilot-loader";
import { BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY, upsertChildLearningReflection } from "@/lib/adle/morphology/reflections";
import { safeCompletionTraceId, WordLabCompletionTimer } from "@/lib/adle/completion-timing";
import {
  persistReleaseBoundWordLabCompletion,
  persistWordLabCompletion,
  type WordLabReflectionWrite,
} from "@/lib/adle/loaders/word-lab-completion-loader";
import {
  emitLessonRouteResolutionEvent,
  resolvePersistedLessonRoute,
} from "@/lib/adle/composable-lesson/route-resolution";
import { baseWordAssignmentRuntimeAllowed, databaseActivatedAssignmentRuntimeAllowed } from "@/lib/adle/loaders/curriculum-release-authority";
import { extractAuthoredTargetSpan } from "@/lib/adle/morphology/dictation-target-span";
import { resolveSentenceDictationContract } from "@/lib/adle/sentence-dictation-contract";
import {
  buildGenericV3Checkpoint,
  loadGenericV3Checkpoints,
  persistGenericV3Checkpoint,
  reconcileGenericV3CompletionAttempts,
  type GenericV3CheckpointKind,
  type GenericV3DurableCheckpoint,
} from "@/lib/adle/generic-v3-attempt-checkpoints";

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
  const selectedChild = findChildById(children, childId);
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

function allSessionItems(readModel: Awaited<ReturnType<typeof getAdleDailyPlanReadModel>>): AdleSessionItem[] {
  return [...readModel.partOne.items, ...readModel.partTwo.items]
    .sort((left, right) => left.position - right.position);
}

/** A present generic snapshot is an assignment-wide contract. Validate it
 * before either part can write attempts, evidence, scheduler state, rewards,
 * or completion flags; a malformed snapshot must never degrade to item-row
 * compatibility. */
function blockInvalidGenericSnapshot(
  context: SessionActionContext,
  readModel: Awaited<ReturnType<typeof getAdleDailyPlanReadModel>>,
): void {
  if (readModel.genericSnapshotResolution?.status === "blocked") {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  }
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

function buildCompoundWordV2Reflection(
  context: SessionActionContext,
  lesson: import("@/lib/adle/morphology/resolved-compound-word-lesson-v2").ResolvedCompoundWordFirstImpressionV2,
  reflectionText: string | null,
): WordLabReflectionWrite {
  if (!reflectionText) throw new Error("Please write a reflection before finishing the Word Lab.");
  return {
    childId: context.childId,
    parentUserId: context.parentUserId,
    assignmentId: context.assignmentId,
    microSkillKey: lesson.microSkillKey,
    contentVersion: lesson.contentVersion,
    promptKey: lesson.reflection.promptKey,
    promptText: lesson.reflection.promptText,
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
  blockInvalidGenericSnapshot(context, readModel);
  if (!readModel.partOne.present) {
    finishWith(context, "There is no review part today.");
  }
  if (readModel.partOne.complete) {
    finishWith(context, "Today's review is already recorded.");
  }
  const routeResolution = resolvePersistedLessonRoute({
    lessonRouteMetadata: readModel.lessonRouteMetadata,
    compiledLessonSnapshot: readModel.compiledLessonSnapshot,
    items: allSessionItems(readModel),
    runtimeContext: {
      morphologyUnEnabled: isMorphologyUnPilotEnabledForChild(childId),
      dynamicPrefixEnabled: isDynamicPrefixRouteEnabled(),
      dynamicAffixEnabled: isDynamicSuffixRouteEnabled(),
      baseWordFamilyEnabled: isBaseWordFamilyPilotEnabledForChild(childId),
    },
  });
  emitLessonRouteResolutionEvent(
    routeResolution,
    readModel.assignmentGenerationSource,
  );
  if (routeResolution.status === "blocked") {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
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
  const microSkillKeysByWordId = new Map<string, readonly string[]>();
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
    const linkedSkillKeys = item.promptData.microSkillKeys;
    if (Array.isArray(linkedSkillKeys) && linkedSkillKeys.every((key) => typeof key === "string")) {
      microSkillKeysByWordId.set(canonicalWordId, [...new Set(linkedSkillKeys)].sort());
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
    microSkillKeysByWordId,
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

export async function recordGenericV3CheckpointAction(input: {
  childId: string;
  assignmentId: string;
  itemId: string;
  snapshotFingerprint: string;
  kind: GenericV3CheckpointKind;
  attemptText: string;
}): Promise<
  | { ok: true; checkpoint: GenericV3DurableCheckpoint }
  | { ok: false; code: "generic_v3_checkpoint_conflict" }
> {
  const formData = new FormData();
  formData.set("mode", "child");
  formData.set("childId", input.childId);
  formData.set("assignmentId", input.assignmentId);
  const context = await resolveSessionContext(formData);
  const readModel = await getAdleDailyPlanReadModel({
    userClient: context.userClient,
    parentUserId: context.parentUserId,
    childId: context.childId,
    planDate: context.planDate,
    assignmentId: context.assignmentId,
  });
  blockInvalidGenericSnapshot(context, readModel);
  const built = buildGenericV3Checkpoint({
    readModel,
    parentUserId: context.parentUserId,
    childId: context.childId,
    assignmentId: context.assignmentId,
    itemId: input.itemId,
    attemptText: input.attemptText,
  });
  if (built.checkpoint.kind !== input.kind
    || built.checkpoint.snapshotFingerprint !== input.snapshotFingerprint) {
    throw new Error("recordGenericV3CheckpointAction:frozen snapshot checkpoint mismatch");
  }
  const persisted = await persistGenericV3Checkpoint(context.serviceClient, built);
  if ("code" in persisted) return { ok: false, code: persisted.code };
  return { ok: true, checkpoint: persisted };
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
  blockInvalidGenericSnapshot(context, readModel);
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
  const routeResolution = resolvePersistedLessonRoute({
    lessonRouteMetadata: readModel.lessonRouteMetadata,
    compiledLessonSnapshot: readModel.compiledLessonSnapshot,
    items: allSessionItems(readModel),
    runtimeContext: {
      morphologyUnEnabled: isMorphologyUnPilotEnabledForChild(childId),
      dynamicPrefixEnabled: isDynamicPrefixRouteEnabled(),
      dynamicAffixEnabled: isDynamicSuffixRouteEnabled(),
      baseWordFamilyEnabled: isBaseWordFamilyPilotEnabledForChild(childId),
    },
  });
  emitLessonRouteResolutionEvent(
    routeResolution,
    readModel.assignmentGenerationSource,
  );
  if (
    routeResolution.status === "blocked" ||
    routeResolution.runtime.adapterKey === "base_word_family_v1"
  ) {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  }
  if (!(await databaseActivatedAssignmentRuntimeAllowed({
    client: serviceClient,
    lessonRouteMetadata: readModel.lessonRouteMetadata,
    assignmentCompleted: readModel.state === "completed",
  }))) {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  }
  const morphologyPilot =
    routeResolution.runtime.adapterKey === "morphology_guided_v1"
      ? routeResolution.runtime.payload
      : null;
  const dynamicPrefix =
    routeResolution.runtime.adapterKey === "dynamic_prefix_v2"
      ? routeResolution.runtime.payload
      : null;
  const dynamicSuffix =
    routeResolution.runtime.adapterKey === "dynamic_affix_v3"
      ? routeResolution.runtime.payload
      : null;
  const compoundRuntime =
    routeResolution.runtime.adapterKey === "closed_compound_v1"
      ? routeResolution.runtime.completionPayload
      : null;
  const compoundV2 =
    routeResolution.runtime.adapterKey === "compound_word_v2"
      ? routeResolution.runtime.payload
      : null;
  const compoundV2Resolved =
    routeResolution.runtime.adapterKey === "compound_word_v2"
      ? routeResolution.runtime.resolvedLesson
      : null;
  const wordLabPayload = compoundRuntime ?? dynamicSuffix ?? dynamicPrefix ?? morphologyPilot;
  const genericReflectionSpec = wordLabPayload === null
    ? readModel.partTwo.items.find((item) => item.canonicalActivitySpec?.concept === "LESSON_REFLECTION"
      && item.canonicalActivitySpec.mode === "standard_lesson_reflection")?.canonicalActivitySpec ?? null
    : null;
  const isGenericV3 = wordLabPayload === null
    && readModel.genericSnapshotResolution?.status === "resolved"
    && readModel.genericSnapshotResolution.source === "snapshot_v3";
  const dynamicAffixCompletionPolicy = dynamicSuffix !== null
    ? deriveDynamicAffixCompletionPolicy({
        allItems: allSessionItems(readModel),
        productionItems,
        frozenPayload: routeResolution.runtime.adapterKey === "dynamic_affix_v3"
          ? routeResolution.runtime.sourcePayload
          : undefined,
      })
    : null;
  if (dynamicAffixCompletionPolicy && !dynamicAffixCompletionPolicy.ok) {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  }
  const dynamicPrefixAuthenticIds = new Set(
    dynamicPrefix !== null
      ? productionItems
          .filter((item) => item.adleLearningItemRef !== null)
          .map((item) => item.canonicalWordId)
          .filter((canonicalWordId): canonicalWordId is string => canonicalWordId !== null)
      : [],
  );
  const rewardProductionItems = dynamicPrefix !== null
    ? productionItems.filter((item) =>
        item.canonicalWordId !== null
        && dynamicPrefixAuthenticIds.has(item.canonicalWordId),
      )
    : compoundV2 !== null
      ? productionItems.filter((item) => item.adleLearningItemRef !== null)
      : productionItems;
  const atomicWordLabCompletionEnabled = process.env.ADLE_WORD_LAB_ATOMIC_COMPLETION_ENABLED === "enabled";
  const learningReflection = readFormValue(formData, "learningReflection");
  if (readModel.partTwo.complete && wordLabPayload === null) {
    finishWith(context, "Today's lesson is already recorded.");
  }

  // Crash-retry guard: taught events for the deterministic lesson ref mean
  // the completion already landed — re-mark the items and stop.
  const taughtCompletionExists = await timer.measure("retry_guard", () =>
    hasTaughtEventsForSourceRef(serviceClient, childId, lessonSourceRef));
  if (taughtCompletionExists && wordLabPayload !== null && !atomicWordLabCompletionEnabled) {
    await timer.measure("reflection_persistence", () => persistMorphologyReflection(context, wordLabPayload, learningReflection));
    await timer.measure("assignment_completion", () => markItemsCompleted(context, readModel.partTwo.items));
    scheduleLessonReward(context, rewardProductionItems, timer);
    finishWith(context, "Today's lesson is already recorded.", completionTraceId, timer, "batched_retry");
  }
  if (taughtCompletionExists && wordLabPayload === null) {
    if (isGenericV3) {
      const durable = await loadGenericV3Checkpoints({
        client: serviceClient,
        readModel,
        parentUserId: context.parentUserId,
        childId,
        assignmentId: context.assignmentId,
      });
      reconcileGenericV3CompletionAttempts({ readModel, checkpoints: durable });
    }
    if (compoundV2 !== null) {
      await upsertChildLearningReflection(
        serviceClient,
        buildCompoundWordV2Reflection(context, compoundV2Resolved!, learningReflection),
      );
    }
    await markItemsCompleted(context, readModel.partTwo.items);
    finishWith(context, "Today's lesson is already recorded.");
  }

  let controlledAttempts = parseAttempts(formData, "attempts");
  let dictationAttempts = parseAttempts(formData, "dictationAttempts");
  let dictationSentenceAttempts = parseAttempts(formData, "dictationSentenceAttempts");
  const probeAttempts = parseAttempts(formData, "probeAttempts");
  const guidedAttempts = parseAttempts(formData, "guidedAttempts");

  if (isGenericV3) {
    const durable = await loadGenericV3Checkpoints({
      client: serviceClient,
      readModel,
      parentUserId: context.parentUserId,
      childId,
      assignmentId: context.assignmentId,
    });
    const reconciled = reconcileGenericV3CompletionAttempts({ readModel, checkpoints: durable });
    controlledAttempts = reconciled.controlledAttempts;
    dictationAttempts = reconciled.dictationAttempts;
    dictationSentenceAttempts = reconciled.dictationSentenceAttempts;
  }

  const dictationItems = readModel.partTwo.items.filter(
    (item) => item.sectionKey === "lesson_dictation" && item.canonicalWordId !== null,
  );
  // Both immutable Word Lab versions derive correctness from the reviewed
  // sentence token. Compound v2 carries the full authored span into the
  // shared release-bound completion transaction below.
  if (compoundV2 !== null) {
    const derived = new Map<string, string>();
    for (const word of compoundV2.words.lesson) {
      const rawAttempt = dictationSentenceAttempts.get(word.structure.wholeCanonicalWordId) ?? "";
      derived.set(
        word.structure.wholeCanonicalWordId,
        extractAuthoredTargetSpan(rawAttempt, word.dictation.targetSpan),
      );
    }
    dictationAttempts = derived;
  } else if (wordLabPayload !== null) {
    const sentenceActivity = wordLabPayload.activities.find((activity) => activity.type === "sentence_dictation");
    const derived = new Map<string, string>();
    for (const sentence of sentenceActivity?.sentences ?? []) {
      const rawAttempt = dictationSentenceAttempts.get(sentence.canonicalWordId) ?? "";
      const targetAttempt = dynamicPrefix !== null
        ? analyseDictationSentence(
            sentence.sentence,
            rawAttempt,
            sentence.targetTokenIndex,
          ).targetAttemptedToken ?? ""
        : extractAuthoredTargetToken(rawAttempt, sentence.targetTokenIndex);
      derived.set(sentence.canonicalWordId, targetAttempt);
    }
    dictationAttempts = derived;
  } else if (dictationSentenceAttempts.size > 0) {
    const derived = new Map<string, string>();
    for (const item of dictationItems) {
      const contract = resolveSentenceDictationContract(item.promptData, item.targetWord);
      if (!contract || item.canonicalWordId === null) continue;
      const rawAttempt = dictationSentenceAttempts.get(item.canonicalWordId) ?? "";
      derived.set(
        item.canonicalWordId,
        analyseDictationSentence(
          contract.sentence,
          rawAttempt,
          contract.targetTokenIndex,
        ).targetAttemptedToken ?? "",
      );
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
      correct: compoundV2 !== null
        ? isExactGovernedFormCorrect(attemptText, target)
        : isAttemptCorrect(attemptText, target),
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

  // Preserve each route's scheduling set independently from its evidence set.
  // Dynamic Prefix transfer words remain absent here while still appearing
  // in producedWords and the taught-history/evidence path below.
  const scheduledProductionItems = dynamicSuffix !== null
    ? productionItems.filter((item) =>
        dynamicAffixCompletionPolicy?.ok
        && item.canonicalWordId !== null
        && dynamicAffixCompletionPolicy.scheduledCanonicalWordIds.includes(item.canonicalWordId),
      )
    : dynamicPrefix !== null
      ? productionItems.filter((item) => item.adleLearningItemRef !== null)
      : productionItems;
  const completionWordPolicies: CompletionWordPolicy[] | undefined = dynamicSuffix !== null
    && dynamicAffixCompletionPolicy?.ok
    ? dynamicAffixCompletionPolicy.wordPolicies
    : dynamicPrefix !== null
    ? producedWords.map((word) => {
        const authentic = scheduledProductionItems.some(
          (item) => item.canonicalWordId === word.canonicalWordId,
        );
        return {
          canonicalWordId: word.canonicalWordId,
          evidenceEligible: true,
          scheduleEligible: authentic,
          learningItemTransitionEligible: authentic,
          rewardEligible: authentic,
        };
      })
    : compoundV2 !== null
    ? producedWords.map((word) => {
        const authentic = productionItems.some(
          (item) => item.canonicalWordId === word.canonicalWordId && item.adleLearningItemRef !== null,
        );
        return {
          canonicalWordId: word.canonicalWordId,
          evidenceEligible: true,
          scheduleEligible: authentic,
          learningItemTransitionEligible: authentic,
          rewardEligible: authentic,
        };
      })
    : undefined;
  const lessonResult = onLessonCompleted(policy, {
    childId,
    microSkillKey,
    completedOn: planDate,
    sourceRef: lessonSourceRef,
    bundleId: randomUUID(),
    scheduleAllProducedWords: dynamicSuffix !== null || compoundRuntime !== null || compoundV2 !== null,
    producedWords,
    ...(completionWordPolicies ? { wordPolicies: completionWordPolicies } : {}),
    learningItems,
  });
  const attemptEvents = buildLessonAttemptEvents({
    context,
    sourceRef: lessonSourceRef,
    items: readModel.partTwo.items,
    controlledAttempts,
    dictationAttempts,
    dictationRawAttempts: dictationSentenceAttempts.size > 0 ? dictationSentenceAttempts : undefined,
    guidedAttempts,
    probeAttempts,
    correctness: compoundV2 !== null ? "exact_governed_form" : "normalised_token",
  });

  if (compoundV2 !== null) {
    const result = await timer.measure("atomic_durable_completion", () =>
      persistReleaseBoundWordLabCompletion(serviceClient, {
        parentUserId: context.parentUserId,
        childId,
        assignmentId: context.assignmentId,
        planDate,
        microSkillKey,
        sourceRef: lessonSourceRef,
        assignmentItemIds: readModel.partTwo.items.map((item) => item.id),
        attempts: attemptEvents,
        lesson: lessonResult,
        reflection: buildCompoundWordV2Reflection(context, compoundV2Resolved!, learningReflection),
      }));
    scheduleLessonReward(context, rewardProductionItems, timer);
    finishWith(
      context,
      result.status === "already_completed"
        ? "Today's lesson is already recorded."
        : "Lesson finished. Your writing words join review tomorrow.",
      completionTraceId,
      timer,
      result.status,
    );
  }

  if (morphologyPilot !== null && dynamicPrefix === null && dynamicSuffix === null && compoundRuntime === null && atomicWordLabCompletionEnabled) {
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
    scheduleLessonReward(context, rewardProductionItems, timer);
    finishWith(
      context,
      result.status === "already_completed" ? "Today's lesson is already recorded." : "Lesson finished. New words join review tomorrow.",
      completionTraceId,
      timer,
      result.status,
    );
  }

  if (wordLabPayload !== null) {
    await Promise.all([
      timer.measure("attempt_persistence", () => insertAssignmentAttemptEvents(serviceClient, attemptEvents)),
      timer.measure("lesson_persistence", () => persistLessonCompletion(serviceClient, lessonResult, {
        requireSharedRouteStorage: dynamicSuffix !== null,
      })),
      timer.measure("reflection_persistence", () => persistMorphologyReflection(context, wordLabPayload, learningReflection)),
    ]);
    await timer.measure("assignment_completion", () => markItemsCompleted(context, readModel.partTwo.items));
    scheduleLessonReward(context, rewardProductionItems, timer);
    finishWith(context, "Lesson finished. New words join review tomorrow.", completionTraceId, timer, "instrumented_batched_completion");
  }

  // Generic ADLE lessons retain the existing independently idempotent writes.
  await Promise.all([
    timer.measure("attempt_persistence", () => insertAssignmentAttemptEvents(serviceClient, attemptEvents)),
    timer.measure("lesson_persistence", () => persistLessonCompletion(serviceClient, lessonResult)),
    ...(genericReflectionSpec ? [timer.measure("reflection_persistence", async () => {
      const promptSource = genericReflectionSpec.payload.promptSource;
      if (!learningReflection || !promptSource || typeof promptSource !== "object" || Array.isArray(promptSource)) {
        throw new Error("Please write a reflection before finishing the Word Lab.");
      }
      const governed = promptSource as Record<string, unknown>;
      if (typeof governed.contentVersion !== "string" || typeof governed.promptKey !== "string"
        || typeof genericReflectionSpec.payload.prompt !== "string") {
        throw new Error("This Word Lab reflection is missing its governed prompt contract.");
      }
      await upsertChildLearningReflection(serviceClient, {
        childId,
        parentUserId: context.parentUserId,
        assignmentId: context.assignmentId,
        microSkillKey,
        contentVersion: governed.contentVersion,
        promptKey: governed.promptKey,
        promptText: genericReflectionSpec.payload.prompt,
        reflectionText: learningReflection,
      });
    })] : []),
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

  scheduleLessonReward(context, rewardProductionItems);
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
  if (!(await baseWordAssignmentRuntimeAllowed({
    client: context.serviceClient,
    lessonRouteMetadata: readModel.lessonRouteMetadata,
    assignmentCompleted: readModel.state === "completed",
  }))) {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  }
  blockInvalidGenericSnapshot(context, readModel);
  const routeResolution = resolvePersistedLessonRoute({
    lessonRouteMetadata: readModel.lessonRouteMetadata,
    compiledLessonSnapshot: readModel.compiledLessonSnapshot,
    items: allSessionItems(readModel),
    runtimeContext: {
      morphologyUnEnabled: isMorphologyUnPilotEnabledForChild(context.childId),
      dynamicPrefixEnabled: isDynamicPrefixRouteEnabled(),
      dynamicAffixEnabled: isDynamicSuffixRouteEnabled(),
      baseWordFamilyEnabled: true,
    },
  });
  emitLessonRouteResolutionEvent(
    routeResolution,
    readModel.assignmentGenerationSource,
  );
  if (
    routeResolution.status === "blocked" ||
    routeResolution.runtime.adapterKey !== "base_word_family_v1" ||
    readModel.partTwo.items.length !== 18
  ) {
    finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  }
  const payload = routeResolution.runtime.payload;
  const controlledAttempts = parseAttempts(formData, "baseWordControlledAttempts");
  const sentenceAttempts = parseAttempts(formData, "baseWordSentenceAttempts");
  const reflection = readFormValue(formData, "baseWordReflection");
  if (!reflection) finishWith(context, "Please share what you noticed before finishing.");
  const finalAttempts = payload.independentWords.map((word) => {
    const rawSentence = sentenceAttempts.get(word.canonicalWordId) ?? "";
    const attemptText = extractAuthoredTargetToken(rawSentence, word.dictationTargetTokenIndex);
    return { canonicalWordId: word.canonicalWordId, attemptText, correct: isAttemptCorrect(attemptText, word.displayWord) };
  });
  const primaryIds = new Set(payload.independentSlots.filter((slot) => baseWordSlotAssignmentRole(slot) === "primary_authentic_target").map((slot) => slot.canonicalWordId));
  const learnerBackedIds = new Set(payload.independentSlots.filter(baseWordSlotHasLearnerEvidence).map((slot) => slot.canonicalWordId));
  const authenticProductionItems = readModel.partTwo.items.filter((item) => item.sectionKey === "lesson_production" && item.canonicalWordId !== null && primaryIds.has(item.canonicalWordId));
  if (authenticProductionItems.length !== 2 || learnerBackedIds.size < 2 || learnerBackedIds.size > 6) finishWith(context, "This Word Lab needs a grown-up check before it can continue.");
  const { data: learningItemRows, error: itemsError } = await context.serviceClient.from("adle_learning_items")
    .select("id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status")
    .eq("child_id", context.childId).eq("row_status", "active");
  if (itemsError) throw new Error(`completeBaseWordFamilyLessonAction:items: ${itemsError.message}`);
  const policy = await loadActiveReviewPolicy(context.serviceClient);
  const lesson = onLessonCompleted(policy, {
    childId: context.childId, microSkillKey: payload.microSkillKey, completedOn: context.planDate,
    sourceRef: `lesson:${context.childId}:${context.planDate}:${payload.microSkillKey}`,
    bundleId: randomUUID(),
    scheduleAllProducedWords: true,
    producedWords: finalAttempts.filter((attempt) => learnerBackedIds.has(attempt.canonicalWordId)),
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
    reflection: { childId: context.childId, parentUserId: context.parentUserId, assignmentId: context.assignmentId, microSkillKey: payload.microSkillKey, contentVersion: payload.contentVersion, promptKey: BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY, promptText: payload.reflectionPrompt, reflectionText: reflection },
    transferMisses: baseWordTransferMissWrites({ payload, childId: context.childId, lessonSourceRef: sourceRef, occurredOn: context.planDate as import("@/lib/adle/review-scheduler").IsoDate, finalAttempts }),
  });
  scheduleLessonReward(context, authenticProductionItems);
  finishWith(context, result.status === "already_completed" ? "Today's lesson is already recorded." : "Lesson finished. Your two writing words join review tomorrow.");
}
