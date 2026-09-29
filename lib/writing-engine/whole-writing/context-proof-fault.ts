import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTEXT_SHADOW_TIMEOUT_MS } from "./context-shadow-policy";

export const CONTEXT_PROOF_FAULT_ACTIONS = ["SIMULATE_TIMEOUT", "SIMULATE_429", "SIMULATE_5XX",
  "PAUSE_BEFORE_ADMISSION", "PAUSE_AFTER_FETCH", "PAUSE_BEFORE_RECEIPT", "INTERRUPT_AFTER_FETCH"] as const;
export type ContextProofFaultAction = typeof CONTEXT_PROOF_FAULT_ACTIONS[number];
export class ContextProofFaultFailure extends Error {
  constructor() { super("AI_PROOF_HOOK_UNAVAILABLE"); }
}
export class ContextProofInterruption extends ContextProofFaultFailure {}

/** Bound by the DB to one registered fixture/claim/dispatch. Never supplied by a client payload. */
export async function bindContextProofFault(client: SupabaseClient, dispatchId: string, claimToken: string, workerDeadline: number) {
  const rpc = async (name: string, args: Record<string, unknown>, deadline = workerDeadline): Promise<unknown> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ContextProofFaultFailure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(client.rpc(name, args)).then((r) => {
          if (r.error) throw new ContextProofFaultFailure();
          return r.data;
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ContextProofFaultFailure()), remaining); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const coordinates = { p_dispatch_id: dispatchId, p_claim_token: claimToken };
  const bound = await rpc("bind_writing_context_proof_fault", coordinates) as {
    kind?: string; action?: string; expires_at?: string;
  } | null;
  if (bound?.kind === "NONE") return null;
  if (bound?.kind !== "BOUND" || !CONTEXT_PROOF_FAULT_ACTIONS.includes(bound.action as ContextProofFaultAction))
    throw new ContextProofFaultFailure();
  const action = bound.action as ContextProofFaultAction;
  const expiry = Date.parse(bound.expires_at ?? "");
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new ContextProofFaultFailure();
  const limit = (deadline: number) => Math.min(deadline, workerDeadline, expiry);
  const phase = async (name: string, deadline: number) => {
    if (await rpc("record_writing_context_proof_fault_phase", { ...coordinates, p_phase: name }, limit(deadline)) !== true)
      throw new ContextProofFaultFailure();
  };
  const status = async (deadline: number) => {
    const state = await rpc("writing_context_proof_fault_status", coordinates, limit(deadline)) as {
      authorised?: boolean; released?: boolean;
    } | null;
    if (state?.authorised !== true) throw new ContextProofFaultFailure();
    return state;
  };
  const barrier = async (name: string, deadline: number) => {
    await phase(name, deadline);
    for (;;) {
      if ((await status(deadline)).released === true) return;
      const remaining = limit(deadline) - Date.now();
      if (remaining <= 0) throw new ContextProofFaultFailure();
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)));
    }
  };
  return {
    action,
    simulated: action.startsWith("SIMULATE_"),
    async simulate() {
      await phase("SIMULATION_STARTED", workerDeadline);
      if (action === "SIMULATE_TIMEOUT") {
        if (Date.now() + CONTEXT_SHADOW_TIMEOUT_MS >= limit(workerDeadline)) throw new ContextProofFaultFailure();
        await new Promise((resolve) => setTimeout(resolve, CONTEXT_SHADOW_TIMEOUT_MS));
      }
      await status(workerDeadline);
      await phase("SIMULATED", workerDeadline);
      return `AI_PROOF_${action.replace("SIMULATE_", "SIMULATED_")}`;
    },
    async beforeAdmission() {
      if (action === "PAUSE_BEFORE_ADMISSION") await barrier("BEFORE_ADMISSION", workerDeadline);
    },
    async afterFetch(providerDeadline: number) {
      if (action === "PAUSE_AFTER_FETCH") await barrier("FETCH_INVOKED", providerDeadline);
      if (action === "INTERRUPT_AFTER_FETCH") {
        await phase("FETCH_INVOKED", providerDeadline);
        await phase("INTERRUPTED", providerDeadline);
        throw new ContextProofInterruption();
      }
    },
    async beforeReceipt() {
      if (action === "PAUSE_BEFORE_RECEIPT") await barrier("BEFORE_RECEIPT", workerDeadline);
    },
  };
}
