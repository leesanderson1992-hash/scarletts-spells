"use server";

import { createClient } from "@/lib/supabase/server";
import { isHomophoneSnapshotV3, validateHomophoneSnapshotV3 } from "@/lib/adle/homophone/snapshot";

async function assignedHomophone(childId: string, assignmentId: string, microSkillKey: string) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("homophone_best_not_authenticated");
  const assignment = await client.from("daily_assignments").select("compiled_lesson_snapshot")
    .eq("id", assignmentId).eq("child_id", childId).eq("parent_user_id", user.id).maybeSingle();
  if (assignment.error || !assignment.data) throw new Error("homophone_best_assignment_not_owned");
  const validation = validateHomophoneSnapshotV3(assignment.data.compiled_lesson_snapshot);
  if (!validation.ok || !isHomophoneSnapshotV3(validation.snapshot)
    || validation.snapshot.taxonomy.microSkillKey !== microSkillKey) throw new Error("homophone_best_lesson_mismatch");
  return client;
}

export async function getHomophoneBalloonBest(childId: string, assignmentId: string, microSkillKey: string): Promise<number> {
  const client = await assignedHomophone(childId, assignmentId, microSkillKey);
  const result = await client.from("adle_homophone_balloon_bests").select("best_score").eq("child_id", childId).eq("micro_skill_key", microSkillKey).maybeSingle();
  if (result.error) throw new Error("homophone_best_unavailable");
  return result.data?.best_score ?? 0;
}

export async function recordHomophoneBalloonBest(childId: string, assignmentId: string, microSkillKey: string, score: number): Promise<number> {
  if (!Number.isInteger(score) || score < 0 || score > 1000) throw new Error("homophone_score_invalid");
  const client = await assignedHomophone(childId, assignmentId, microSkillKey);
  const result = await client.rpc("record_adle_homophone_balloon_best", { p_child_id: childId, p_micro_skill_key: microSkillKey, p_score: score });
  if (result.error || typeof result.data !== "number") throw new Error("homophone_score_not_saved");
  return result.data;
}
