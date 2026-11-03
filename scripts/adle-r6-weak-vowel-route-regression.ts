import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningItemFact } from "../lib/adle/learning-items";

import { resolveSpecialistRouteR6 } from "../lib/adle/review-v3/r6-specialist-stage";
import { baseWordFamilyDemandUnavailable, nextRankedSkillAfterBaseWordBlock } from "../lib/adle/base-word-weak-vowel-fallback";

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
  assert.equal(baseWordFamilyDemandUnavailable("two_distinct_authentic_families_required"), true);
  assert.equal(baseWordFamilyDemandUnavailable("authentic_target_missing_reviewed_family_member"), true);
  assert.equal(baseWordFamilyDemandUnavailable("selected_family_missing_transfer_word"), false);
  const baseSkill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
  const item = (skill: string, index: number): LearningItemFact => ({
    learningItemId: `item-${skill}-${index}`, childId: CHILD,
    canonicalWordId: `word-${skill}-${index}`, microSkillKey: skill,
    itemStatus: "pending", sourceKind: "verified_misspelling",
    sourceRef: `verified-${skill}-${index}`, sourceAttemptText: null,
    reteachPriority: false, ejectedOn: null, intakeOn: "2026-10-01", rowStatus: "active",
  });
  const selectionFacts = {
    learningItems: [...Array.from({ length: 4 }, (_, index) => item(baseSkill, index)),
      ...Array.from({ length: 3 }, (_, index) => item(SKILL, index))],
    skillFamilyKeyBySkill: new Map([[baseSkill, "base"], [SKILL, "weak_vowel"]]),
    prerequisiteKeysBySkill: new Map<string, string[]>(),
    frequencyBandByWordId: new Map<string, string | null>(),
    previousLessonFamilyKey: null,
  };
  assert.equal(nextRankedSkillAfterBaseWordBlock(selectionFacts, baseSkill), SKILL,
    "a blocked four-word Base Word cluster leaves the three-word weak-vowel skill next in the governed order");
  assert.equal(selectionFacts.learningItems.length, 7, "fallback never removes queued learning items");
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
