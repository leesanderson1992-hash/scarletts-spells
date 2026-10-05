import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Reward-owned consumer. The transaction locks the treasure and writes its
 * use, threshold award and corresponding bar ledger entry with the receipt. */
export async function deliverFirstSubmissionAuthenticUseForRewards(client: SupabaseClient, creditId: string, claimToken: string) {
  const response = await client.rpc("deliver_authentic_use_gold", { p_credit_id: creditId, p_claim_token: claimToken });
  if (response.error) throw new Error("AUTHENTIC_USE_GOLD_FAILED");
  return response;
}
