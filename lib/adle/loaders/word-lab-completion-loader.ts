import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssignmentAttemptEventWrite, LessonCompletionWrite } from "./session-completion-loader";

export interface WordLabReflectionWrite {
  childId: string;
  parentUserId: string;
  assignmentId: string;
  microSkillKey: string;
  contentVersion: string;
  promptKey: string;
  promptText: string;
  reflectionText: string;
}

export interface WordLabCompletionCounts {
  header: 1;
  items: 16;
  attempts: 14;
  guided: 6;
  controlled: 4;
  dictation: 4;
  reflection: 1;
  learningItems: 4;
  taught: 4;
  schedule: 4;
}

export interface WordLabCompletionResult {
  status: "completed" | "already_completed";
  committedAt: string;
  counts: WordLabCompletionCounts;
}

export interface ReleaseBoundWordLabCompletionCounts {
  header: 1;
  items: 18;
  attempts: 18;
  evidenceRoutes: number;
  guided: 10;
  controlled: 4;
  dictation: 4;
  reflection: 1;
  learningItems: number;
  taught: 4;
  schedule: number;
}

export async function persistWordLabCompletion(
  client: SupabaseClient,
  input: {
    parentUserId: string;
    childId: string;
    assignmentId: string;
    planDate: string;
    microSkillKey: string;
    sourceRef: string;
    assignmentItemIds: readonly string[];
    attempts: readonly AssignmentAttemptEventWrite[];
    lesson: LessonCompletionWrite;
    reflection: WordLabReflectionWrite;
  },
): Promise<WordLabCompletionResult> {
  const { data, error } = await client.rpc("complete_adle_word_lab_v1", {
    p_parent_user_id: input.parentUserId,
    p_child_id: input.childId,
    p_assignment_id: input.assignmentId,
    p_plan_date: input.planDate,
    p_micro_skill_key: input.microSkillKey,
    p_source_ref: input.sourceRef,
    p_assignment_item_ids: input.assignmentItemIds,
    p_attempts: input.attempts,
    p_lesson: input.lesson,
    p_reflection: input.reflection,
  });
  if (error) throw new Error(`persistWordLabCompletion: ${error.message}`);
  if (!data || typeof data !== "object") throw new Error("persistWordLabCompletion: invalid RPC response");
  return data as WordLabCompletionResult;
}

export async function persistReleaseBoundWordLabCompletion(
  client: SupabaseClient,
  input: {
    parentUserId: string;
    childId: string;
    assignmentId: string;
    planDate: string;
    microSkillKey: string;
    sourceRef: string;
    assignmentItemIds: readonly string[];
    attempts: readonly AssignmentAttemptEventWrite[];
    lesson: LessonCompletionWrite;
    reflection: WordLabReflectionWrite;
  },
): Promise<{ status: "completed" | "already_completed"; committedAt: string; counts: ReleaseBoundWordLabCompletionCounts }> {
  const { data, error } = await client.rpc("complete_adle_release_bound_word_lab_v2", {
    p_parent_user_id: input.parentUserId,
    p_child_id: input.childId,
    p_assignment_id: input.assignmentId,
    p_plan_date: input.planDate,
    p_micro_skill_key: input.microSkillKey,
    p_source_ref: input.sourceRef,
    p_assignment_item_ids: input.assignmentItemIds,
    p_attempts: input.attempts,
    p_lesson: input.lesson,
    p_reflection: input.reflection,
  });
  if (error) throw new Error(`persistReleaseBoundWordLabCompletion: ${error.message}`);
  if (!data || typeof data !== "object") throw new Error("persistReleaseBoundWordLabCompletion: invalid RPC response");
  return data as { status: "completed" | "already_completed"; committedAt: string; counts: ReleaseBoundWordLabCompletionCounts };
}
