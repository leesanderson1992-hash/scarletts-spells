import type { SupabaseClient } from "@supabase/supabase-js";

import { getAssignmentLearningReflection, type ChildLearningReflection } from "../morphology/reflections";
import { getChildRewardReadModel } from "../../rewards/read-model";
import { deriveAdleSessionCelebration, type AdleSessionCelebrationModel } from "../../rewards/adle-session-celebration";

export async function loadAdleCompletedRouteDetails(input: {
  supabase: SupabaseClient;
  parentUserId: string;
  childId: string;
  assignmentId: string | null;
  planDate: string;
  traceId?: string;
}): Promise<{ celebration: AdleSessionCelebrationModel | null; reflection: ChildLearningReflection | null }> {
  const startedAt = performance.now();
  const rewardPromise = (async () => {
    try {
      const fiveDayCutoff = new Date();
      fiveDayCutoff.setDate(fiveDayCutoff.getDate() - 5);
      const rewardReadModel = await getChildRewardReadModel({
        supabase: input.supabase,
        parentUserId: input.parentUserId,
        childId: input.childId,
        todayDateOnly: input.planDate,
        lastFiveDaysSinceIso: fiveDayCutoff.toISOString(),
      });
      return deriveAdleSessionCelebration(rewardReadModel.childWordTreasures, input.planDate);
    } catch (rewardError) {
      console.error("[adle-session] reward celebration read failed (plain completed card shown)", rewardError);
      return null;
    }
  })();
  const reflectionPromise = (async () => {
    try {
      return await getAssignmentLearningReflection(input.supabase, {
        parentUserId: input.parentUserId,
        childId: input.childId,
        assignmentId: input.assignmentId,
      });
    } catch (reflectionError) {
      console.error("[adle-session] private reflection read failed", reflectionError);
      return null;
    }
  })();
  const [celebration, reflection] = await Promise.all([rewardPromise, reflectionPromise]);
  if (input.traceId && /^[0-9a-f-]{36}$/i.test(input.traceId)) {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    console.info(JSON.stringify({
      event: "adle_word_lab_completion_timing",
      traceId: input.traceId,
      outcome: "completed_route_render",
      totalMs: durationMs,
      stages: { completed_route_reads: durationMs },
    }));
  }
  return { celebration, reflection };
}
