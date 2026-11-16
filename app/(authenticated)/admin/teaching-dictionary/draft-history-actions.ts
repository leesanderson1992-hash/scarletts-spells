"use server";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

export async function loadDraftHistory(wordId: string) {
  await requireAdminUser();
  if (!isUuid(wordId)) throw new Error("Choose a dictionary word.");
  const { data, error } = await createServiceRoleClient().from("teaching_dictionary_manager_drafts")
    .select("id,source_reference,created_at").eq("canonical_word_id", wordId)
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error("Could not load draft history.");
  return data as { id: string; source_reference: string; created_at: string }[];
}
