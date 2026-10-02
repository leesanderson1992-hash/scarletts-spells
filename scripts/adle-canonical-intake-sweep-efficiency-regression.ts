import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runCanonicalIntakeReconciliationSweep } from "../lib/adle/loaders/canonical-intake-live";

type Candidate = {
  id: string;
  candidate_state: "pending_mapping" | "pending_content" | "error_retryable";
  last_evaluated_at: string | null;
  next_retry_at: string | null;
};

process.env.ADLE_CANONICAL_INTAKE_ENABLED = "enabled";

async function sweep(candidates: Candidate[]) {
  const enqueued: string[] = [];
  let claimCalls = 0;
  let dueFilter = "";
  const client = {
    from(table: string) {
      assert.equal(table, "adle_canonical_intake_candidates");
      return {
        select(columns: string) {
          assert.equal(columns, "id");
          return this;
        },
        in(column: string, states: string[]) {
          assert.equal(column, "candidate_state");
          assert.deepEqual(states, ["pending_mapping", "pending_content", "error_retryable"]);
          return this;
        },
        or(filter: string) {
          dueFilter = filter;
          return this;
        },
        order() { return this; },
        limit(limit: number) {
          const match = /^last_evaluated_at\.is\.null,last_evaluated_at\.lte\.([^,]+),next_retry_at\.lte\.(.+)$/.exec(dueFilter);
          assert.ok(match, "safety sweep must have a bounded recheck and explicit retry filter");
          const [, recheckBefore, now] = match;
          const due = candidates.filter((candidate) =>
            candidate.last_evaluated_at === null ||
            candidate.last_evaluated_at <= recheckBefore ||
            (candidate.next_retry_at !== null && candidate.next_retry_at <= now)
          );
          return Promise.resolve({ data: due.slice(0, limit).map(({ id }) => ({ id })), error: null });
        },
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "adle_enqueue_canonical_intake_candidate") {
        enqueued.push(args.p_candidate_id as string);
        return { data: null, error: null };
      }
      assert.equal(name, "adle_claim_canonical_intake_jobs");
      claimCalls += 1;
      return { data: [], error: null };
    },
  } as unknown as SupabaseClient;
  const result = await runCanonicalIntakeReconciliationSweep({
    serviceClient: client,
    leaseOwner: "sweep-efficiency-regression",
  });
  return { enqueued, claimCalls, result };
}

async function main() {
  const now = Date.now();
  const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();
  const recent = await sweep([
    { id: "recent-mapping", candidate_state: "pending_mapping", last_evaluated_at: hoursAgo(1), next_retry_at: null },
    { id: "recent-content", candidate_state: "pending_content", last_evaluated_at: hoursAgo(1), next_retry_at: null },
  ]);
  assert.deepEqual(recent.enqueued, [], "unchanged blockers do not create another queue job five minutes later");
  assert.equal(recent.result.safetySweepQueued, 0);
  assert.equal(recent.claimCalls, 1, "event-driven jobs remain claimable every scheduler run");

  const due = await sweep([
    { id: "stale", candidate_state: "pending_content", last_evaluated_at: hoursAgo(25), next_retry_at: null },
    { id: "never-evaluated", candidate_state: "pending_mapping", last_evaluated_at: null, next_retry_at: null },
    { id: "explicit-retry", candidate_state: "error_retryable", last_evaluated_at: hoursAgo(1), next_retry_at: hoursAgo(0.1) },
  ]);
  assert.deepEqual(due.enqueued, ["stale", "never-evaluated", "explicit-retry"]);
  assert.equal(due.result.safetySweepQueued, 3);
  assert.equal(due.claimCalls, 1);
  console.log("adle-canonical-intake-sweep-efficiency-regression: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
