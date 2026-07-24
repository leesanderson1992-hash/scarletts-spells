import { readFileSync } from "node:fs";
import { inspectRegisteredRouteCompatibility } from "../lib/adle/curriculum-readiness/route-selection";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const action = readFileSync("app/learn/week/adle/actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260717120000_add_adle_word_lab_atomic_completion_rpc.sql", "utf8");
const payload = readFileSync("lib/adle/morphology/payload.ts", "utf8");
const resume = readFileSync("lib/adle/morphology/resume.ts", "utf8");
const environment = readFileSync(".env.example", "utf8");

assert(action.includes("isMorphologyUnPilotEnabledForChild") && action.includes("resolveMorphologyPilotRuntime"), "atomic completion remains behind allowlist and valid-payload resolution");
assert(action.includes('ADLE_WORD_LAB_ATOMIC_COMPLETION_ENABLED === "enabled"'), "atomic completion has an explicit default-off comparison switch");
assert(action.includes("if (morphologyPilot !== null && dynamicPrefix === null && atomicWordLabCompletionEnabled)"), "the legacy-only atomic RPC must never receive a generic v2 payload");
assert(action.includes("persistWordLabCompletion") && action.includes("extractAuthoredTargetToken(rawAttempt, sentence.targetTokenIndex)"), "Word Lab uses the atomic helper and authored target-token correctness");
assert(environment.includes("ADLE_MORPHOLOGY_UN_PILOT_ENABLED=disabled") && environment.includes("ADLE_WORD_LAB_ATOMIC_COMPLETION_ENABLED=disabled"), "pilot and atomic boundary default disabled");

for (const contract of [
  "for update",
  "jsonb_array_length(p_attempts) <> 14",
  "guided_practice') <> 6",
  "lesson_production') <> 4",
  "lesson_dictation') <> 4",
  "value->>'childId' is distinct from p_child_id::text",
  "or value->>'parentUserId' is distinct from p_parent_user_id::text",
  "position(' ' in coalesce(value->>'attemptText', '')) = 0",
  "v_guided_count <> 6 or v_controlled_count <> 4 or v_dictation_count <> 4",
  "jsonb_array_length(coalesce(p_lesson->'scheduleWords'",
  "jsonb_array_length(coalesce(p_lesson->'taughtEvents'",
  "jsonb_array_length(coalesce(p_lesson->'itemTransitions'",
  "on conflict (assignment_item_id, attempt_kind, source_ref) do nothing",
  "on conflict (daily_assignment_id, prompt_key) do update",
  "already_completed",
  "Word Lab durable contract verification failed",
  "grant execute on function public.complete_adle_word_lab_v1",
]) assert(migration.toLocaleLowerCase().includes(contract.toLocaleLowerCase()), `migration pins ${contract}`);

assert(payload.includes('value.schemaVersion !== 1') && payload.includes('value.experienceProfile !== "word_lab_v1"'), "unsupported payloads fail closed");
assert(payload.includes("expectedActivityIds") && payload.includes("entry.canonicalWordId !== lesson[index].canonicalWordId"), "v1 snapshots retain renderer and authored-token structural invariants");
assert(resume.includes("schemaVersion: 1") && resume.includes("MORPHOLOGY_RESUME_TTL_MS") && resume.includes("parsed.contentVersion !== contentVersion"), "resume stays schema/content-version scoped and expiring");

const routeInspection = inspectRegisteredRouteCompatibility({
  childId: "fixture-child",
  canonicalWordId: "fixture-word",
  microSkillKey: "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  routeId: "base_word_lab",
  routeVersion: "v2",
  routes: ADLE_CURRICULUM_ROUTE_REGISTRY,
});
assert(routeInspection.ready, "registered route inspection reports a supported micro-skill without selecting or compiling a lesson");
const unsupportedInspection = inspectRegisteredRouteCompatibility({
  ...routeInspection,
  microSkillKey: "D4_MOR_PREFIXES_UN",
  routes: ADLE_CURRICULUM_ROUTE_REGISTRY,
});
assert(!unsupportedInspection.ready && unsupportedInspection.selectorBlockers.includes("ROUTE_MICRO_SKILL_UNSUPPORTED"), "route inspection reports unsupported micro-skills without falling through to another route");

console.log("ADLE Word Lab completion contract regression passed");
