import { createClient } from "@supabase/supabase-js";

import { previewAdleDailyPlan } from "../lib/adle/loaders/daily-plan-preview";
import type { IsoDate } from "../lib/adle/review-scheduler";

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

async function main(): Promise<void> {
  const parentUserId = requiredArg("--parent-user-id");
  const childId = requiredArg("--child-id");
  const assignmentDate = requiredArg("--assignment-date") as IsoDate;
  const json = process.argv.includes("--json");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const preview = await previewAdleDailyPlan({
    userClient: client,
    serviceClient: client,
    parentUserId,
    childId,
    assignmentDate,
  });

  if (json) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  console.log(`ADLE read-only preview for child ${childId} on ${assignmentDate}`);
  console.log(`Part 1 review: ${preview.wouldProducePartOneReview ? "yes" : "no"}`);
  console.log(`Part 2 lesson: ${preview.wouldProducePartTwoLesson ? "yes" : "no"}`);
  console.log(`Selected review words: ${preview.selectedReviewWords.join(", ") || "(none)"}`);
  console.log(
    `Selected lesson words: ${
      preview.selectedLessonWords.map((word) => word.displayWord ?? word.canonicalWordId).join(", ") || "(none)"
    }`,
  );
  console.log(`Selected micro-skill: ${preview.selectedMicroSkill ?? "(none)"}`);
  console.log(`Templates: ${preview.activityTemplates.join(", ") || "(none)"}`);
  console.log(
    `Persistence: ${preview.persistenceChecks.staticPlannerAction}${
      preview.persistenceChecks.noopReason ? ` (${preview.persistenceChecks.noopReason})` : ""
    }`,
  );
  console.log(`Would create duplicate rows if executed: ${preview.wouldCreateDuplicateRowsIfExecuted ? "yes" : "no"}`);
  console.log(`Missing/skip reasons: ${[...preview.skipReasons.partOne, ...preview.skipReasons.partTwo].map((skip) => skip.reason).join(", ") || "(none)"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
