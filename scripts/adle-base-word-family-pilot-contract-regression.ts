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
assert(items.length === 18, "base-word pilot binds exactly eighteen assignment items");
assert(resolveBaseWordFamilyPilotRuntime(true, items) !== null, "valid gated base-word payload resolves");
assert(resolveBaseWordFamilyPilotRuntime(false, items) === null, "disabled gate falls back safely");
assert(resolveBaseWordFamilyPilotRuntime(true, items.slice(0, -1)) === null, "missing binding falls back safely");
assert(resolveBaseWordFamilyPilotRuntime(true, items.map((item, index) => index === 3 ? { ...item, canonicalWordId: "wrong" } : item)) === null, "incorrect word binding falls back safely");
assert(canGenerateBaseWordFamilyPilot(0) && canGenerateBaseWordFamilyPilot(5) && canGenerateBaseWordFamilyPilot(500), "reviewed base-word route has no per-child lesson cap");
assert(buildBaseWordFamilyPilotItems({ payload, childId: "child", parentUserId: "parent", planDate: "2026-07-18" }).length === 18, "compiler persists the exact bound shape");
const migration = readFileSync("supabase/migrations/20260718110000_add_adle_base_word_family_pilot_guard.sql", "utf8");
const interactiveMigration = readFileSync("supabase/migrations/20260719113000_update_adle_base_word_family_pilot_to_18_items.sql", "utf8");
const expansionMigration = readFileSync("supabase/migrations/20260721130000_expand_base_word_family_runtime.sql", "utf8");
assert(migration.includes("pilot_lesson_number between 1 and 5") && migration.includes("v_run_number > 5"), "database owns the five-lesson cap");
assert(migration.includes("service_role") && migration.includes("enable row level security"), "pilot persistence remains service-only behind RLS");
assert(migration.includes("complete_adle_base_word_family_pilot_v1") && migration.includes("exactly two authentic targets"), "base-word completion has its own atomic boundary");
assert(migration.includes("Transfer words cannot enter base-word pilot scheduling") && migration.includes("record_adle_base_word_transfer_miss_v1"), "transfer misses are ledgered without adding transfer review work");
assert(interactiveMigration.includes("p_items) <> 18") && interactiveMigration.includes("p_attempts) <> 18") && interactiveMigration.includes("lesson_production') <> 6"), "forward migration upgrades only the guarded pilot to the 18-item interactive shape");
assert(expansionMigration.includes("pilot_lesson_number > 0") && expansionMigration.includes("D4_MOR_BASE_WORDS_IDENTIFY_BASE") && expansionMigration.includes("five-lesson cap"), "forward migration removes the cap and allows only the reviewed base-word micro-skills");
console.log("adle-base-word-family-pilot-contract-regression: ok");
