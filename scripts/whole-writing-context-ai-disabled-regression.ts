import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";
import { processContextualAdvisoryForSubmission } from "../lib/writing-engine/whole-writing/context-advisory-worker";

let queries = 0;
let providerCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { providerCalls++; throw new Error("unexpected provider call"); };
const client = {
  from(table: string) {
    queries++;
    assert.equal(table, "writing_context_advisory_control");
    return { select() { return { eq() { return { async maybeSingle() {
      return { data: { enabled: false, ai_mode: "disabled" }, error: null };
    } }; } }; } };
  },
} as unknown as SupabaseClient;

async function main() {
  try {
    const result = await processContextualAdvisoryForSubmission({
      client, submissionId: "test", parentUserId: "test", childId: "test", runKey: "test",
    });
    assert.deepEqual(result, { status: "disabled", occurrences: 0 });
    assert.equal(queries, 1);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("context AI disabled no-call regression passed");
}
void main();
