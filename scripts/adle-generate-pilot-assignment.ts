import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ensureAdleDailyPlan } from "../lib/adle/loaders/daily-plan-surface";
import { previewAdleDailyPlan } from "../lib/adle/loaders/daily-plan-preview";
import type { IsoDate } from "../lib/adle/review-scheduler";

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
