import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Preserve the observation submitted by the parent, including a historical
 * observation. A foreign or malformed identity fails rather than becoming null. */
export async function resolveReviewedContextObservation(input: {
  client: SupabaseClient;
  submittedObservationId: FormDataEntryValue | null;
  occurrenceId: string;
  parentUserId: string;
  childId: string;
  family: string;
}) {
  const id = input.submittedObservationId;
  if (id === null || id === "") return null;
  if (typeof id !== "string") throw new Error("Invalid reviewed observation identity.");
  const observation = await input.client.from("writing_context_advisory_observations")
    .select("id")
    .eq("id", id).eq("occurrence_id", input.occurrenceId)
    .eq("parent_user_id", input.parentUserId).eq("child_id", input.childId)
    .eq("family_key", input.family).maybeSingle();
  if (observation.error || observation.data?.id !== id) {
    throw new Error("The reviewed observation does not belong to this exact occurrence.");
  }
  return id;
}
