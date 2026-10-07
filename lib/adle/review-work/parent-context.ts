import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdleParentContextChoice = {
  id: string;
  startUtf16: number;
  endUtf16: number;
  observed: string;
  intended: string;
  sentence: string;
  decision: "pending" | "confirmed" | "dismissed";
};

export async function loadAdleParentContextChoices(input: {
  client: SupabaseClient;
  reviewSessionId: string;
  parentUserId: string;
  childId: string;
}): Promise<AdleParentContextChoice[]> {
  const read = await input.client.from("adle_review_parent_context_choices")
    .select("id,start_utf16,end_utf16,observed_text,intended_word,sentence_excerpt,decision")
    .eq("review_session_id", input.reviewSessionId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .order("start_utf16");
  if (read.error) throw new Error("ADLE_PARENT_CONTEXT_UNAVAILABLE");
  return (read.data ?? []).map((row) => ({
    id: row.id,
    startUtf16: row.start_utf16,
    endUtf16: row.end_utf16,
    observed: row.observed_text,
    intended: row.intended_word,
    sentence: row.sentence_excerpt,
    decision: row.decision as AdleParentContextChoice["decision"],
  }));
}
