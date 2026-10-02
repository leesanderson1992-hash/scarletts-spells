import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueContextShadowForSubmission } from "./context-advisory-worker";

/** A client payload cannot classify a proof. Registration remains effective after expiry. */
export async function enqueueDisposableProviderProof(
  client: SupabaseClient, childId: string, submissionId: string,
): Promise<boolean> {
  const proof = await client.rpc("context_provider_proof_child", { p_child: childId });
  if (proof.error || typeof proof.data !== "boolean") throw new Error("CONTEXT_PROOF_CLASSIFICATION_UNAVAILABLE");
  if (!proof.data) return false;
  // Provider execution is independent. Even an outbox failure cannot enter educational processing.
  try {
    await enqueueContextShadowForSubmission(client, submissionId);
  } catch {
    console.error("[context-shadow] enqueue unavailable", { code: "CONTEXT_SHADOW_ENQUEUE_UNAVAILABLE" });
  }
  return true;
}
