import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { baseWordFamilyPilotBindingSpecs, canGenerateBaseWordFamilyPilot, resolveBaseWordFamilyPilotRuntime } from "../lib/adle/morphology/base-word-family-pilot-contract";
import { buildBaseWordFamilyPilotItems } from "../lib/adle/morphology/base-word-family-pilot-plan";
import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const payload = BASE_WORD_FAMILY_PREVIEW_PAYLOAD;
const items = baseWordFamilyPilotBindingSpecs(payload).map((spec, index) => ({
  id: `item-${index}`, sectionKey: spec.sectionKey, templateKey: spec.templateKey,
  canonicalWordId: spec.canonicalWordId, targetWord: spec.targetWord,
  promptData: { pilotActivityId: spec.binding, ...(spec.binding === "strategy-intro" ? { baseWordFamilyLesson: payload } : {}) },
}));
assert(items.length === 13, "base-word pilot binds exactly thirteen assignment items");
assert(resolveBaseWordFamilyPilotRuntime(true, items) !== null, "valid gated base-word payload resolves");
assert(resolveBaseWordFamilyPilotRuntime(false, items) === null, "disabled gate falls back safely");
assert(resolveBaseWordFamilyPilotRuntime(true, items.slice(0, -1)) === null, "missing binding falls back safely");
assert(resolveBaseWordFamilyPilotRuntime(true, items.map((item, index) => index === 3 ? { ...item, canonicalWordId: "wrong" } : item)) === null, "incorrect word binding falls back safely");
assert(canGenerateBaseWordFamilyPilot(0) && canGenerateBaseWordFamilyPilot(4) && !canGenerateBaseWordFamilyPilot(5), "server cap stops a sixth lesson");
assert(buildBaseWordFamilyPilotItems({ payload, childId: "child", parentUserId: "parent", planDate: "2026-07-18" }).length === 13, "compiler persists the exact bound shape");
const migration = readFileSync("supabase/migrations/20260718110000_add_adle_base_word_family_pilot_guard.sql", "utf8");
assert(migration.includes("pilot_lesson_number between 1 and 5") && migration.includes("v_run_number > 5"), "database owns the five-lesson cap");
assert(migration.includes("service_role") && migration.includes("enable row level security"), "pilot persistence remains service-only behind RLS");
assert(migration.includes("complete_adle_base_word_family_pilot_v1") && migration.includes("exactly two authentic targets"), "base-word completion has its own atomic boundary");
assert(migration.includes("Transfer words cannot enter base-word pilot scheduling") && migration.includes("record_adle_base_word_transfer_miss_v1"), "transfer misses are ledgered without adding transfer review work");
console.log("adle-base-word-family-pilot-contract-regression: ok");
