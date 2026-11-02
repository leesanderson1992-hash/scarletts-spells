import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { selectPartTwoSkill, type SkillSelectionFacts } from "./composer-skill-selection";
import type { DailyPlanFacts } from "./daily-assignment-composer";
import type { IsoDate } from "./review-scheduler";
import { prepareWeakVowelAssignment } from "./weak-vowel/assignment-writer";
import { weakVowelRouteSelectedForChild } from "./weak-vowel/readiness-loader";

/** Only used after the selected Base Word skill cannot form two reviewed
 * authentic families. The original needs remain queued for a future release. */
export function nextRankedSkillAfterBaseWordBlock(
  selectionFacts: SkillSelectionFacts,
  blockedMicroSkillKey: string,
): string | null {
  return selectPartTwoSkill({ ...selectionFacts,
    learningItems: selectionFacts.learningItems.filter((item) =>
      item.microSkillKey !== blockedMicroSkillKey),
  }).microSkillKey;
}

export async function prepareWeakVowelFallbackAfterBaseWordBlock(input: {
  client: SupabaseClient;
  childId: string;
  parentUserId: string;
  date: IsoDate;
  blockedMicroSkillKey: string;
  selectionFacts: SkillSelectionFacts;
  facts: DailyPlanFacts;
  environmentKey: "local" | "staging" | "production";
}): Promise<Extract<Awaited<ReturnType<typeof prepareWeakVowelAssignment>>, { status: "ready" }> | null> {
  const alternativeSkill = nextRankedSkillAfterBaseWordBlock(input.selectionFacts, input.blockedMicroSkillKey);
  if (!alternativeSkill || !await weakVowelRouteSelectedForChild({
    client: input.client, childId: input.childId,
    microSkillKey: alternativeSkill, environmentKey: input.environmentKey,
  })) return null;
  const prepared = await prepareWeakVowelAssignment({
    client: input.client, childId: input.childId, parentUserId: input.parentUserId,
    date: input.date, microSkillKey: alternativeSkill,
    facts: input.facts, environmentKey: input.environmentKey,
  });
  return prepared.status === "ready" ? prepared : null;
}
