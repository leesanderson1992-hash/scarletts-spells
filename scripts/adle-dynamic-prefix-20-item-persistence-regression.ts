import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260803113000_allow_in_im_il_ir_dynamic_prefix_20_item_plan.sql",
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

type Item = { id: string; microSkillKey: string; provenance: string };
function reviewedTwentyItemShape(items: Item[]): boolean {
  if (items.length !== 20) return false;
  if (items.some((item) => item.microSkillKey !== "D4_MOR_PREFIXES_IN_IM_IL_IR" || item.provenance !== "dynamic_prefix_v2" || !item.id)) return false;
  if (new Set(items.map((item) => item.id)).size !== 20) return false;
  const count = (predicate: (id: string) => boolean) => items.filter((item) => predicate(item.id)).length;
  return count((id) => id === "intro-root" || id === "intro-words") === 2
    && count((id) => id.startsWith("guided-strip-")) === 2
    && count((id) => id.startsWith("guided-meaning-")) === 4
    && count((id) => id.startsWith("guided-build-")) === 4
    && count((id) => id.startsWith("controlled-")) === 4
    && count((id) => id.startsWith("dictation-")) === 4;
}

const ids = [
  "intro-root", "intro-words",
  "guided-strip-a", "guided-strip-b",
  "guided-meaning-a", "guided-meaning-b", "guided-meaning-c", "guided-meaning-d",
  "guided-build-a", "guided-build-b", "guided-build-c", "guided-build-d",
  "controlled-a", "controlled-b", "controlled-c", "controlled-d",
  "dictation-a", "dictation-b", "dictation-c", "dictation-d",
];
const reviewed = ids.map((id) => ({ id, microSkillKey: "D4_MOR_PREFIXES_IN_IM_IL_IR", provenance: "dynamic_prefix_v2" }));
assert(reviewedTwentyItemShape(reviewed), "the exact reviewed 20-item shape is accepted");
assert(!reviewedTwentyItemShape(reviewed.slice(0, 19)), "19 items remain rejected");
assert(!reviewedTwentyItemShape([...reviewed, { ...reviewed[0]!, id: "extra" }]), "21 items remain rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 0 ? { ...item, microSkillKey: "OTHER" } : item)), "another micro-skill is rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 0 ? { ...item, provenance: "other" } : item)), "another provenance is rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 3 ? { ...item, id: reviewed[2]!.id } : item)), "duplicate activity IDs are rejected");
assert(!reviewedTwentyItemShape(reviewed.map((item, index) => index === 3 ? { ...item, id: "guided-build-extra" } : item)), "wrong activity distribution is rejected");

console.log("PASS: persistence permits only the reviewed 20-item IN/IM/IL/IR Dynamic Prefix shape");
