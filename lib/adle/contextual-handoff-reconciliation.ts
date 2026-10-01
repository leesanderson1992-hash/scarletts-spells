import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const PENDING_STATES = [
  "PENDING_CANONICAL_WORD",
  "PENDING_WORD_SUPPORT",
  "PENDING_TEACHING_CONTENT",
] as const;

type Handoff = {
  writing_issue_id: string;
  parent_user_id: string;
  child_id: string;
};

/** Revisit governed needs after word, support, or content release. The RPC
 * remains the sole authority for admission; this sweep never creates items. */
export async function reconcilePendingContextualHandoffs(params: {
  serviceClient: SupabaseClient;
  childId?: string;
  limit: number;
}): Promise<{ examined: number; ready: number; stillPending: number; hasMore: boolean }> {
  // Leave one result slot for hasMore under the default PostgREST 1,000-row cap.
  if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 999) {
    throw new Error("contextual_handoff_invalid_limit");
  }
  let query = params.serviceClient
    .from("writing_context_learning_handoffs")
    .select("writing_issue_id,parent_user_id,child_id")
    .in("handoff_state", [...PENDING_STATES])
    .order("updated_at", { ascending: true })
    .order("writing_issue_id", { ascending: true })
    .limit(params.limit + 1);
  if (params.childId) query = query.eq("child_id", params.childId);
  const { data, error } = await query;
  if (error) throw new Error("contextual_handoff_read_failed");

  const rows = (data ?? []) as Handoff[];
  let ready = 0;
  for (const row of rows.slice(0, params.limit)) {
    const { data: result, error: rpcError } = await params.serviceClient.rpc(
      "reconcile_contextual_adle_learning_need",
      {
        p_writing_issue_id: row.writing_issue_id,
        p_parent_user_id: row.parent_user_id,
        p_child_id: row.child_id,
      },
    );
    if (rpcError || !result || typeof result !== "object" ||
        typeof result.handoff_state !== "string") {
      throw new Error("contextual_handoff_reconcile_failed");
    }
    if (result.handoff_state === "READY") ready += 1;
    else if (![...PENDING_STATES, "PENDING_EXISTING_ITEM_REVIEW"].includes(result.handoff_state)) {
      throw new Error("contextual_handoff_unexpected_state");
    }
  }
  return {
    examined: Math.min(rows.length, params.limit),
    ready,
    stillPending: Math.min(rows.length, params.limit) - ready,
    hasMore: rows.length > params.limit,
  };
}
