import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- S8 tables precede generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ContextReviewDelivery = {
  id: string;
  resultId: string;
  occurrenceId: string;
  observedText: string;
  suggestedReplacement: string;
  contextExcerpt: string;
  familyKey: string;
  reasonCode: string;
  sourceFieldPath: string;
  deliveredAt: string;
};

export async function loadPendingContextReviewDeliveries(input: {
  client: SupabaseClient;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
}): Promise<ContextReviewDelivery[]> {
  const deliveries = await input.client
    .from("writing_context_current_review_deliveries")
    .select("id,result_id,delivered_at")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("task_submission_id", input.taskSubmissionId)
    .order("delivered_at", { ascending: true });
  if (deliveries.error) {
    if (["42P01", "PGRST205"].includes(deliveries.error.code)) return [];
    throw new Error("CONTEXT_REVIEW_DELIVERY_READ_FAILED");
  }
  const rows = (deliveries.data ?? []) as any[];
  if (!rows.length) return [];
  const results = await input.client
    .from("writing_context_current_results")
    .select("id,occurrence_id,alternative_member,context_excerpt,family_key,reason_code")
    .in("id", rows.map((row) => row.result_id));
  if (results.error) throw new Error("CONTEXT_REVIEW_RESULT_READ_FAILED");
  const resultRows = (results.data ?? []) as any[];
  const occurrences = await input.client
    .from("writing_occurrences")
    .select("id,observed_text,field_path")
    .in("id", resultRows.map((row) => row.occurrence_id));
  if (occurrences.error) throw new Error("CONTEXT_REVIEW_OCCURRENCE_READ_FAILED");
  const resultById = new Map(resultRows.map((row) => [row.id, row]));
  const occurrenceById = new Map(((occurrences.data ?? []) as any[]).map((row) => [row.id, row]));
  return rows.flatMap((delivery): ContextReviewDelivery[] => {
    const result = resultById.get(delivery.result_id);
    const occurrence = result ? occurrenceById.get(result.occurrence_id) : null;
    if (!result || !occurrence || typeof result.alternative_member !== "string") return [];
    return [{
      id: delivery.id,
      resultId: result.id,
      occurrenceId: result.occurrence_id,
      observedText: occurrence.observed_text,
      suggestedReplacement: result.alternative_member,
      contextExcerpt: result.context_excerpt,
      familyKey: result.family_key,
      reasonCode: result.reason_code,
      sourceFieldPath: occurrence.field_path,
      deliveredAt: delivery.delivered_at,
    }];
  });
}
