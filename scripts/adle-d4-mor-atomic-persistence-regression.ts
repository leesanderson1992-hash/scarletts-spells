import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("app/learn/week/adle/actions.ts", "utf8");
const wordLabLoader = readFileSync("lib/adle/loaders/word-lab-completion-loader.ts", "utf8");
const baseWordLoader = readFileSync("lib/adle/loaders/base-word-family-pilot-loader.ts", "utf8");
const genericPersistence = readFileSync("lib/adle/composable-lesson/generic-snapshot-v3-persistence.ts", "utf8");
const specialistPersistence = readFileSync("lib/adle/composable-lesson/specialist-snapshot-v3-persistence.ts", "utf8");
const cleanupMigration = readFileSync(
  "supabase/migrations/20260829133000_retire_verified_adle_legacy_database_functions.sql",
  "utf8",
);

assert(!wordLabLoader.includes("persistWordLabCompletion"), "dormant Word Lab v1 completion export is retired");
assert(!wordLabLoader.includes('rpc("complete_adle_word_lab_v1"'), "the application cannot invoke Word Lab v1 completion");
assert(wordLabLoader.includes('rpc("complete_adle_release_bound_word_lab_v2"'), "current release-bound Word Lab completion remains atomic");
assert(baseWordLoader.includes('rpc("complete_adle_base_word_family_pilot_v2"'), "current Base Word completion remains atomic");
assert(actions.includes("persistReleaseBoundWordLabCompletion"), "the governed Word Lab route retains its atomic completion boundary");
assert(actions.includes("persistBaseWordFamilyPilotCompletion"), "the governed Base Word route retains its historical/current completion boundary");

assert(genericPersistence.includes('rpc("persist_adle_generic_daily_plan_v3"'), "generic creation remains bound to the v3 atomic writer");
assert(specialistPersistence.includes('rpc("persist_adle_specialist_daily_plan_v3"'), "specialist creation remains bound to the v3 atomic writer");
for (const signature of [
  "persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)",
  "persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)",
  "complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)",
]) {
  assert(cleanupMigration.includes(`drop function public.${signature};`), `E7B exact drop remains present: ${signature}`);
}
assert(!cleanupMigration.match(/drop function[^;]+cascade/i), "atomic-boundary retirement never uses CASCADE");

console.log("ADLE atomic persistence regression passed: current v3 writers/completions retained and retired v1 boundaries unreachable");
