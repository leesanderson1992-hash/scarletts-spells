import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findChildById, selectChildById } from "../lib/children";
import { getLondonPracticeDate } from "../lib/practice-date";
import {
  deriveParentAdleTodayState,
  isRecognizedAdleTodayHeader,
  resolveParentManualAdleRoute,
} from "../lib/adle/today-assignment-service";

assert.equal(
  getLondonPracticeDate(new Date("2026-01-10T00:30:00.000Z")),
  "2026-01-10",
);
assert.equal(
  getLondonPracticeDate(new Date("2026-07-10T22:30:00.000Z")),
  "2026-07-10",
);
assert.equal(
  getLondonPracticeDate(new Date("2026-07-10T23:30:00.000Z")),
  "2026-07-11",
);

const children = [{ id: "child-a" }, { id: "child-b" }, { id: "child-c" }];
assert.equal(selectChildById(children, "forged")?.id, "child-a");
assert.equal(findChildById(children, "forged"), null);
assert.equal(findChildById(children, "child-b")?.id, "child-b");

assert.equal(resolveParentManualAdleRoute("D4_MOR_PREFIXES_RE_PRE"), "dynamic_prefix_word_lab");
assert.equal(resolveParentManualAdleRoute("D4_MOR_SUFFIXES_LY"), "dynamic_affix_word_lab");
assert.equal(resolveParentManualAdleRoute("D4_MOR_BASE_WORDS_PRESERVE_BASE"), "base_word_lab");
assert.equal(resolveParentManualAdleRoute("D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS"), "closed_compound_word_lab");
assert.equal(resolveParentManualAdleRoute("D4_MOR_UNKNOWN"), null);

assert.equal(deriveParentAdleTodayState([]), "error");
assert.equal(deriveParentAdleTodayState(["ready", "completed"]), "ready");
assert.equal(deriveParentAdleTodayState(["completed", "completed"]), "completed");

assert.equal(isRecognizedAdleTodayHeader({
  id: "assignment-a",
  child_id: "child-a",
  title: "ADLE Daily Plan",
  assignment_generation_source: "adle_composer_v1",
}), true);
assert.equal(isRecognizedAdleTodayHeader({
  id: "assignment-b",
  child_id: "child-b",
  title: "ADLE Base-word Family Pilot",
  assignment_generation_source: "adle_base_word_family_pilot_v1",
}), true);
assert.equal(isRecognizedAdleTodayHeader({
  id: "assignment-c",
  child_id: "child-c",
  title: "QA fixture",
  assignment_generation_source: "qa",
}), false);

const root = resolve(import.meta.dirname, "..");
const action = readFileSync(resolve(root, "app/dashboard/todays-adle-actions.ts"), "utf8");
const ui = readFileSync(resolve(root, "app/dashboard/todays-adle-section.tsx"), "utf8");
const service = readFileSync(resolve(root, "lib/adle/today-assignment-service.ts"), "utf8");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260807120000_enforce_one_adle_session_per_child_day.sql"),
  "utf8",
);

assert.match(action, /\.eq\("id", childId\)/);
assert.match(action, /\.eq\("parent_user_id", user\.id\)/);
assert.match(action, /\.eq\("is_archived", false\)/);
assert.ok(action.indexOf("maybeSingle()") < action.indexOf("createServiceRoleClient()"));
assert.doesNotMatch(ui, /Choose|Prefix lesson|Affix lesson|name="route"|name="word"/);
assert.match(ui, /disabled=\{isPending\}/);
assert.match(service, /selectPartTwoSkill\(/);
assert.match(service, /candidate\.routeId !== "generic_composer"/);
assert.match(
  service,
  /process\.env\.ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "staging"/,
);
assert.match(service, /allowStagingProfiles,/);
assert.match(service, /generationTrigger: "parent_manual"/);
assert.match(migration, /create unique index if not exists/);
assert.match(migration, /child_id, assignment_date/);
assert.match(migration, /ADLE Base-word Family Pilot/);

console.log("parent dashboard ADLE generator regression: passed");
