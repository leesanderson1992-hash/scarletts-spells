import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ensureAdleDailyPlan, getExistingAdleDailyPlanId, persistComposedAdleDailyPlan } from "../lib/adle/loaders/daily-plan-surface";
import { previewAdleDailyPlan } from "../lib/adle/loaders/daily-plan-preview";
import type { IsoDate } from "../lib/adle/review-scheduler";
import { loadDailyPlanFacts } from "../lib/adle/loaders/composer-facts-loader";
import { composeDailyPlan } from "../lib/adle/daily-assignment-composer";
import { buildMorphologyUnPilotPlan } from "../lib/adle/morphology/pilot-plan";
import { validateMorphologyLessonPayload } from "../lib/adle/morphology/payload";

const CONFIRM_TOKEN = "ADLE-7P-GENERATE";

type ChildIdentityRow = {
  id: string;
  parent_user_id: string;
  is_archived: boolean | null;
};

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

function requiredArg(name: string): string {
  const value = readArg(name);
  if (!value) {
    throw new Error(`Missing ${name} <value>.`);
  }
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Run with --env-file=.env.local or set the environment explicitly.`);
  }
  return value;
}

function assertChildApprovedForGeneration(params: {
  rows: readonly ChildIdentityRow[];
  parentUserId: string;
  childId: string;
}): void {
  const { rows, parentUserId, childId } = params;
  if (rows.length === 0) {
    throw new Error(`Refusing to generate: unknown child ${childId}.`);
  }
  if (rows.length !== 1) {
    throw new Error(`Refusing to generate: expected exactly one child row for ${childId}, found ${rows.length}.`);
  }

  const child = rows[0];
  if (child.parent_user_id !== parentUserId) {
    throw new Error("Refusing to generate: child does not belong to --parent-user-id.");
  }
  if (child.is_archived === true) {
    throw new Error("Refusing to generate: child is archived.");
  }
}

async function verifyChildApprovedForGeneration(params: {
  client: SupabaseClient;
  parentUserId: string;
  childId: string;
}): Promise<void> {
  const { data, error } = await params.client
    .from("children")
    .select("id, parent_user_id, is_archived")
    .eq("id", params.childId);
  if (error) {
    throw new Error(`Refusing to generate: child identity check failed: ${error.message}`);
  }
  assertChildApprovedForGeneration({
    rows: (data ?? []) as ChildIdentityRow[],
    parentUserId: params.parentUserId,
    childId: params.childId,
  });
}

function runGuardSelfTest(): void {
  assertChildApprovedForGeneration({
    rows: [{ id: "child-1", parent_user_id: "parent-1", is_archived: false }],
    parentUserId: "parent-1",
    childId: "child-1",
  });

  let mismatchRefused = false;
  try {
    assertChildApprovedForGeneration({
      rows: [{ id: "child-1", parent_user_id: "parent-2", is_archived: false }],
      parentUserId: "parent-1",
      childId: "child-1",
    });
  } catch (error) {
    mismatchRefused =
      error instanceof Error &&
      error.message === "Refusing to generate: child does not belong to --parent-user-id.";
  }
  if (!mismatchRefused) {
    throw new Error("Guard self-test failed: parent-child mismatch was not refused.");
  }

  let unknownRefused = false;
  try {
    assertChildApprovedForGeneration({ rows: [], parentUserId: "parent-1", childId: "child-1" });
  } catch (error) {
    unknownRefused = error instanceof Error && error.message.includes("unknown child");
  }
  if (!unknownRefused) {
    throw new Error("Guard self-test failed: unknown child was not refused.");
  }

  let archivedRefused = false;
  try {
    assertChildApprovedForGeneration({
      rows: [{ id: "child-1", parent_user_id: "parent-1", is_archived: true }],
      parentUserId: "parent-1",
      childId: "child-1",
    });
  } catch (error) {
    archivedRefused = error instanceof Error && error.message === "Refusing to generate: child is archived.";
  }
  if (!archivedRefused) {
    throw new Error("Guard self-test failed: archived child was not refused.");
  }

  console.log("ADLE generate pilot assignment guard self-test passed.");
}

async function main(): Promise<void> {
  if (process.argv.includes("--self-test-guards")) {
    runGuardSelfTest();
    return;
  }

  const parentUserId = requiredArg("--parent-user-id");
  const childId = requiredArg("--child-id");
  const assignmentDate = requiredArg("--assignment-date") as IsoDate;
  const confirm = readArg("--confirm-generate");
  const approvedParentUserId = readArg("--approved-parent-user-id");
  const approvedChildId = readArg("--approved-child-id");
  const experience = readArg("--experience");

  if (confirm !== CONFIRM_TOKEN) {
    throw new Error(`Refusing to generate without --confirm-generate ${CONFIRM_TOKEN}.`);
  }
  if (approvedParentUserId !== parentUserId) {
    throw new Error("Refusing to generate: --approved-parent-user-id must match --parent-user-id.");
  }
  if (approvedChildId !== childId) {
    throw new Error("Refusing to generate: --approved-child-id must match --child-id.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await verifyChildApprovedForGeneration({ client, parentUserId, childId });

  if (experience === "d4-mor-un") {
    const allowlisted = new Set((process.env.ADLE_MORPHOLOGY_UN_PILOT_CHILD_IDS ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
    if (process.env.ADLE_MORPHOLOGY_UN_PILOT_ENABLED !== "enabled" || !allowlisted.has(childId)) {
      throw new Error("Refusing to generate: D4_MOR un- pilot gate or child allowlist is not enabled.");
    }
    const existing = await getExistingAdleDailyPlanId({ userClient: client, parentUserId, childId, planDate: assignmentDate });
    if (existing) throw new Error(`Refusing to generate: active ADLE assignment ${existing} already exists for ${assignmentDate}.`);
    const { facts } = await loadDailyPlanFacts(client, { childId, today: assignmentDate });
    const plan = buildMorphologyUnPilotPlan({ basePlan: composeDailyPlan(facts, assignmentDate), facts, planDate: assignmentDate });
    const root = plan.partTwo.sections.flatMap((section) => section.items).find((item) => item.payload.pilotActivityId === "intro-root");
    const payload = validateMorphologyLessonPayload(root?.payload.morphologyLesson);
    if (!payload) throw new Error("Refusing to generate: compiled morphology payload failed validation.");
    const assignmentId = await persistComposedAdleDailyPlan({ userClient: client, serviceClient: client, parentUserId, childId, planDate: assignmentDate, plan });
    console.log(JSON.stringify({ mode: "guarded_morphology_pilot_generated", assignmentId, experience, gateEnabled: true, schemaVersion: payload.schemaVersion, contentVersion: payload.contentVersion, wordBindings: payload.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, word: word.displayWord })) }, null, 2));
    return;
  }
  if (experience === "d4-mor-base-word-family") {
    const { generateGuardedBaseWordFamilyPilot } = await import("../lib/adle/loaders/base-word-family-pilot-loader");
    const { data: existingRows, error: existingError } = await client
      .from("daily_assignments")
      .select("id")
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId)
      .eq("assignment_date", assignmentDate)
      .in("assignment_generation_source", ["adle_composer_v1", "adle_base_word_family_pilot_v1"]);
    if (existingError) throw new Error(`Refusing to generate: existing assignment check failed: ${existingError.message}`);
    if ((existingRows ?? []).length > 0) throw new Error("Refusing to generate: an ADLE assignment already exists for this child and date.");
    const result = await generateGuardedBaseWordFamilyPilot({ client, parentUserId, childId, planDate: assignmentDate });
    console.log(JSON.stringify({ mode: result.assignmentId ? "guarded_base_word_family_pilot_generated" : "guarded_base_word_family_pilot_not_ready", experience, assignmentId: result.assignmentId, readinessReason: result.readinessReason }, null, 2));
    return;
  }
  if (experience !== null) throw new Error(`Unsupported --experience ${experience}.`);

  const preview = await previewAdleDailyPlan({
    userClient: client,
    serviceClient: client,
    parentUserId,
    childId,
    assignmentDate,
  });

  const blockingReasons: string[] = [];
  if (preview.persistence.action !== "insert") {
    blockingReasons.push(`persistence planner returned ${preview.persistence.action}:${preview.persistence.noopReason ?? "no reason"}`);
  }
  if (preview.persistence.items.length === 0) {
    blockingReasons.push("preview produced zero assignment items");
  }
  if (preview.wouldCreateDuplicateRowsIfExecuted) {
    blockingReasons.push("preview detected an existing ADLE assignment or planned source_entity_id collision");
  }
  if (!preview.wouldProducePartOneReview && !preview.wouldProducePartTwoLesson) {
    blockingReasons.push("preview produced neither Part 1 review nor Part 2 lesson");
  }

  if (blockingReasons.length > 0) {
    console.log(JSON.stringify({ mode: "guarded_generation_refused", blockingReasons, preview }, null, 2));
    process.exit(2);
  }

  const assignmentId = await ensureAdleDailyPlan({
    userClient: client,
    serviceClient: client,
    parentUserId,
    childId,
    planDate: assignmentDate,
  });

  const after = await previewAdleDailyPlan({
    userClient: client,
    serviceClient: client,
    parentUserId,
    childId,
    assignmentDate,
  });

  console.log(
    JSON.stringify(
      {
        mode: "guarded_generation_completed",
        assignmentId,
        generatedAt: new Date().toISOString(),
        before: {
          wouldProducePartOneReview: preview.wouldProducePartOneReview,
          wouldProducePartTwoLesson: preview.wouldProducePartTwoLesson,
          selectedReviewWords: preview.selectedReviewWords,
          selectedLessonWords: preview.selectedLessonWords,
          selectedMicroSkill: preview.selectedMicroSkill,
          assignmentItemsPlanned: preview.persistence.items.length,
          stretchLearningItemIntakesPlanned: preview.persistence.learningItemIntakes.length,
        },
        after: {
          existingAdleAssignment: after.existingAdleAssignment,
          existingAssignmentItemCount: after.existingAssignmentItemCount,
          persistenceActionAfterGeneration: after.persistence.action,
          noopReasonAfterGeneration: after.persistence.noopReason,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
