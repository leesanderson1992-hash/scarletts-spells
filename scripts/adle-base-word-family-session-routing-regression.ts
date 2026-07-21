import { readFileSync } from "node:fs";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { baseWordFamilyPilotBindingSpecs, resolveBaseWordFamilyPilotRuntime } from "../lib/adle/morphology/base-word-family-pilot-contract";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const payload = BASE_WORD_FAMILY_PREVIEW_PAYLOAD;
const items = baseWordFamilyPilotBindingSpecs(payload).map((spec, index) => ({
  id: `item-${index}`, sectionKey: spec.sectionKey, templateKey: spec.templateKey,
  canonicalWordId: spec.canonicalWordId, targetWord: spec.targetWord,
  promptData: { pilotActivityId: spec.binding, ...(spec.binding === "strategy-intro" ? { baseWordFamilyLesson: payload } : {}) },
}));
assert(resolveBaseWordFamilyPilotRuntime(true, items) !== null, "validated 18-item assignment reaches the dedicated route");
assert(resolveBaseWordFamilyPilotRuntime(false, items) === null, "disabled base-word gate uses the normal safe fallback");
assert(resolveBaseWordFamilyPilotRuntime(true, [...items, { ...items[0], id: "duplicate" }]) === null, "duplicate binding fails closed");

const page = readFileSync("app/learn/week/adle/page.tsx", "utf8");
const runner = readFileSync("components/adle-session-runner.tsx", "utf8");
const actions = readFileSync("app/learn/week/adle/actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260718110000_add_adle_base_word_family_pilot_guard.sql", "utf8");
assert(page.includes("getExistingAdleSessionPlanId") && page.includes("resolveBaseWordFamilyPilotRuntime"), "ADLE page resolves the separate assignment only through its validator");
assert(runner.includes("completeBaseWordFamilyLessonAction") && runner.includes("baseWordSentenceAttempts"), "renderer submits only the base-word independent attempt contract");
assert(actions.includes("completeBaseWordFamilyLessonAction") && actions.includes("authenticIds") && actions.includes("baseWordTransferMissWrites"), "completion schedules authentic targets and isolates transfer evidence");
assert(!actions.slice(actions.indexOf("completeBaseWordFamilyLessonAction")).includes("completeAdleLessonPartAction(formData)"), "base-word completion never delegates to generic lesson completion");
assert(migration.includes("complete_adle_base_word_family_pilot_v1") && migration.includes("Transfer words cannot enter base-word pilot scheduling"), "database boundary rejects transfer scheduling");
console.log("adle-base-word-family-session-routing-regression: ok");
