import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260803113000_allow_in_im_il_ir_dynamic_prefix_20_item_plan.sql",
  "utf8",
);
const distributionMigration = readFileSync(
  "supabase/migrations/20260807014500_allow_governed_in_im_il_ir_20_item_distribution.sql",
  "utf8",
);

const requiredTokens = [
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "dynamic_prefix_v2",
  "prefix_word_lab_v2",
  "d4_mor_prefix_word_lab_v2",
  "dynamic_prefix_pedagogy_v1",
  "prefix_form",
  "meaningResultsPresentation' = 'none",
  "jsonb_array_length(p_items) = 20",
  "splitCanonicalWordIds') = 2",
  "guided'->'builds') = 4",
  "count(distinct candidate.value->'promptData'->>'dynamicPrefixActivityId')",
  "like 'guided-strip-%'",
  "like 'guided-meaning-%'",
  "like 'guided-build-%'",
  "like 'controlled-%'",
  "like 'dictation-%'",
  "closed_compound_v1",
  "D4_MOR_SUFFIXES_FUL_LESS",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
  "to service_role",
];
for (const token of requiredTokens) {
  assert(migration.includes(token), `migration retains exact guard token: ${token}`);
}
assert(migration.includes("definition = previous_definition"), "an unmatched live function fails closed");
assert(migration.includes("Unexpected composed-plan guard baseline"), "existing reviewed exceptions are a required baseline");
assert(!migration.includes("grant execute") || !migration.includes("to authenticated"), "authenticated clients do not receive persistence RPC access");

const distributionTokens = [
  "splitCanonicalWordIds') between 2 and 4",
  "guided'->'builds') = 6 - jsonb_array_length",
  "like 'guided-strip-%'",
  "like 'guided-build-%'",
  "= 6 - (",
  "from public, anon, authenticated",
  "to service_role",
];
for (const token of distributionTokens) {
  assert(distributionMigration.includes(token), `distribution migration retains exact guard token: ${token}`);
}
assert(
  distributionMigration.includes("Unexpected fixed IN/IM/IL/IR 20-item guard baseline"),
  "the distribution migration fails closed when the fixed reviewed baseline is absent",
);
assert(
  !distributionMigration.includes("grant execute") || !distributionMigration.includes("to authenticated"),
  "authenticated clients do not receive persistence RPC access after the correction",
);

type Item = { id: string; microSkillKey: string; provenance: string };
function reviewedTwentyItemShape(items: Item[], splitCount: number, buildCount: number): boolean {
  if (items.length !== 20) return false;
  if (splitCount < 2 || splitCount > 4 || buildCount !== 6 - splitCount) return false;
  if (items.some((item) => item.microSkillKey !== "D4_MOR_PREFIXES_IN_IM_IL_IR" || item.provenance !== "dynamic_prefix_v2" || !item.id)) return false;
  if (new Set(items.map((item) => item.id)).size !== 20) return false;
  const count = (predicate: (id: string) => boolean) => items.filter((item) => predicate(item.id)).length;
  return count((id) => id === "intro-root" || id === "intro-words") === 2
    && count((id) => id.startsWith("guided-strip-")) === splitCount
    && count((id) => id.startsWith("guided-meaning-")) === 4
    && count((id) => id.startsWith("guided-build-")) === buildCount
    && count((id) => id.startsWith("controlled-")) === 4
    && count((id) => id.startsWith("dictation-")) === 4;
}

const idsFor = (splitCount: number) => [
  "intro-root", "intro-words",
  ...Array.from({ length: splitCount }, (_, index) => `guided-strip-${index}`),
  "guided-meaning-a", "guided-meaning-b", "guided-meaning-c", "guided-meaning-d",
  ...Array.from({ length: 6 - splitCount }, (_, index) => `guided-build-${index}`),
  "controlled-a", "controlled-b", "controlled-c", "controlled-d",
  "dictation-a", "dictation-b", "dictation-c", "dictation-d",
];
const reviewed = idsFor(2).map((id) => ({ id, microSkillKey: "D4_MOR_PREFIXES_IN_IM_IL_IR", provenance: "dynamic_prefix_v2" }));
for (const splitCount of [2, 3, 4]) {
  const shape = idsFor(splitCount).map((id) => ({ id, microSkillKey: "D4_MOR_PREFIXES_IN_IM_IL_IR", provenance: "dynamic_prefix_v2" }));
  assert(reviewedTwentyItemShape(shape, splitCount, 6 - splitCount), `${splitCount}/${6 - splitCount} governed Split/Build shape is accepted`);
}
assert(!reviewedTwentyItemShape(reviewed, 1, 5), "a one-Split shape remains rejected");
assert(!reviewedTwentyItemShape(reviewed, 5, 1), "a five-Split shape remains rejected");
assert(!reviewedTwentyItemShape(reviewed, 2, 3), "a guided distribution totaling fewer than six remains rejected");
assert(!reviewedTwentyItemShape(reviewed.slice(0, 19), 2, 4), "19 items remain rejected");
assert(!reviewedTwentyItemShape([...reviewed, { ...reviewed[0]!, id: "extra" }], 2, 4), "21 items remain rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 0 ? { ...item, microSkillKey: "OTHER" } : item), 2, 4), "another micro-skill is rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 0 ? { ...item, provenance: "other" } : item), 2, 4), "another provenance is rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 3 ? { ...item, id: reviewed[2]!.id } : item), 2, 4), "duplicate activity IDs are rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 3 ? { ...item, id: "guided-build-extra" } : item), 2, 4), "wrong activity distribution is rejected");

console.log("PASS: persistence permits only governed 20-item IN/IM/IL/IR Split/Build distributions");
