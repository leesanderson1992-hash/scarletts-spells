import type { SupabaseClient } from "@supabase/supabase-js";

export const MORPHOLOGY_REFLECTION_PROMPT_KEY = "word-lab-un-observation-v1";
export const BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY = "base-word-family-observation-v1";
export const MORPHOLOGY_REFLECTION_PROMPT = "What did you notice about what un- does in these words?";

export interface ChildLearningReflection {
  id: string;
  childId: string;
  assignmentId: string;
  microSkillKey: string;
  contentVersion: string;
  promptKey: string;
  promptText: string;
  reflectionText: string;
  createdAt: string;
  updatedAt: string;
  assignmentDate: string | null;
}

interface ReflectionRow {
  id: string;
  child_id: string;
  daily_assignment_id: string;
  micro_skill_key: string;
  content_version: string;
  prompt_key: string;
  prompt_text: string;
  reflection_text: string;
  created_at: string;
  updated_at: string;
  daily_assignments?: { assignment_date?: string | null } | null;
}

function fromRow(row: ReflectionRow): ChildLearningReflection {
  return {
    id: row.id,
    childId: row.child_id,
    assignmentId: row.daily_assignment_id,
    microSkillKey: row.micro_skill_key,
    contentVersion: row.content_version,
    promptKey: row.prompt_key,
    promptText: row.prompt_text,
    reflectionText: row.reflection_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignmentDate: row.daily_assignments?.assignment_date ?? null,
  };
}

export async function upsertChildLearningReflection(client: SupabaseClient, input: {
  childId: string;
  parentUserId: string;
  assignmentId: string;
  microSkillKey: string;
  contentVersion: string;
  promptKey: string;
  promptText: string;
  reflectionText: string;
}): Promise<void> {
  const reflectionText = input.reflectionText.trim();
  if (reflectionText.length === 0 || reflectionText.length > 2000) throw new Error("Reflection must contain between 1 and 2000 characters.");
  const { error } = await client.from("adle_child_learning_reflections").upsert({
    child_id: input.childId,
    parent_user_id: input.parentUserId,
    daily_assignment_id: input.assignmentId,
    micro_skill_key: input.microSkillKey,
    content_version: input.contentVersion,
    prompt_key: input.promptKey,
    prompt_text: input.promptText,
    reflection_text: reflectionText,
    updated_at: new Date().toISOString(),
  }, { onConflict: "daily_assignment_id,prompt_key" });
  if (error) throw new Error(`upsertChildLearningReflection: ${error.message}`);
}

export async function getChildLearningReflections(client: SupabaseClient, input: {
  parentUserId: string;
  childId: string;
  limit?: number;
}): Promise<ChildLearningReflection[]> {
  const { data, error } = await client
    .from("adle_child_learning_reflections")
    .select("id, child_id, daily_assignment_id, micro_skill_key, content_version, prompt_key, prompt_text, reflection_text, created_at, updated_at, daily_assignments(assignment_date)")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10);
  if (error) throw new Error(`getChildLearningReflections: ${error.message}`);
  return ((data ?? []) as unknown as ReflectionRow[]).map(fromRow);
}

export async function getAssignmentLearningReflection(client: SupabaseClient, input: {
  parentUserId: string;
  childId: string;
  assignmentId: string | null;
}): Promise<ChildLearningReflection | null> {
  if (!input.assignmentId) return null;
  const { data, error } = await client
    .from("adle_child_learning_reflections")
    .select("id, child_id, daily_assignment_id, micro_skill_key, content_version, prompt_key, prompt_text, reflection_text, created_at, updated_at, daily_assignments(assignment_date)")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("daily_assignment_id", input.assignmentId)
    .in("prompt_key", [MORPHOLOGY_REFLECTION_PROMPT_KEY, BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY])
    .maybeSingle();
  if (error) throw new Error(`getAssignmentLearningReflection: ${error.message}`);
  return data ? fromRow(data as unknown as ReflectionRow) : null;
}
