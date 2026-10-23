import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveSpecialistRouteR6 } from "../lib/adle/review-v3/r6-specialist-stage";

const CHILD = "11111111-1111-4111-8111-111111111111";
const OTHER_CHILD = "22222222-2222-4222-8222-222222222222";
const SKILL = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";

function activationClient(status: "enabled" | "disabled", allowedChildId: string): SupabaseClient {
  return { from(table: string) {
    const query = {
      select() { return query; },
      eq() { return query; },
      async maybeSingle() {
        if (table === "adle_route_activation_heads") return { data: { current_revision_id: "revision" }, error: null };
        if (table === "adle_route_activation_revisions") return { data: {
          activation_status: status,
          activation_route_key: "weak_vowel_word_lab:v1",
          readiness_report: { schemaVersion: 1, scope: { kind: "child_allowlist", childIds: [allowedChildId] },
            emergencyDisableAvailable: true },
        }, error: null };
        throw new Error(`Unexpected activation read: ${table}`);
      },
    };
    return query;
  } } as unknown as SupabaseClient;
}

async function main() {
  const request = { childId: CHILD, microSkillKey: SKILL, environmentKey: "production" as const };
  assert.equal(await resolveSpecialistRouteR6({ ...request, client: activationClient("enabled", CHILD) }),
    "weak_vowel_word_lab", "enabled child-scoped activation selects the governed weak-vowel route");
  assert.equal(await resolveSpecialistRouteR6({ ...request, client: activationClient("disabled", CHILD) }),
    null, "disabled activation cannot select the governed route");
  assert.equal(await resolveSpecialistRouteR6({ ...request, client: activationClient("enabled", OTHER_CHILD) }),
    null, "another child's activation cannot select the governed route");
  console.log("ADLE R6 weak-vowel activation route regression passed");
}

void main();
