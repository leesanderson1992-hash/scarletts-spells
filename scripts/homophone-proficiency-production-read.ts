/** Learner-scoped, read-only comparison. Prints aggregate findings, never raw writing or learner IDs. */
import assert from "node:assert/strict";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadParentV2Dashboard } from "../lib/parent-insights/proficiency-v2";

async function main() {
assert(process.argv.includes("--acknowledge-read-only-production"), "read-only Production acknowledgement required");
assert(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname === "wwohrqtunajrbwxyssjf.supabase.co",
  "Production host mismatch");
const client = createServiceRoleClient();
const children = await client.from("children").select("id,first_name,last_name").eq("first_name", "Scarlett").eq("last_name", "Sanderson");
if (children.error || children.data?.length !== 1) throw new Error("Scarlett learner identity unresolved");
const childId = children.data[0].id;
const asOf = new Date().toISOString().slice(0, 10);
process.env.PROFICIENCY_HOMOPHONE_CONTEXT_ENABLED = "false";
const prior = await loadParentV2Dashboard(childId, asOf);
process.env.PROFICIENCY_HOMOPHONE_CONTEXT_ENABLED = "true";
const next = await loadParentV2Dashboard(childId, asOf);
const oldSkills = new Map(prior.skills.map(row => [row.key, row.result]));
const homophones = next.skills.filter(row => row.familyKey === "D4_HOM");
const setRows = await client.from("contextual_micro_skill_members").select("micro_skill_key,member_normalized")
  .in("member_normalized", ["were", "where", "wear"]);
if (setRows.error) throw new Error("Approved contextual set unavailable");
const setKey = [...new Set((setRows.data ?? []).map(row => row.micro_skill_key))].find(key =>
  ["were", "where", "wear"].every(word => setRows.data?.some(row => row.micro_skill_key === key && row.member_normalized === word)));
const contextResult = homophones.find(row => row.key === setKey)?.result;
const differences = homophones.filter(row => oldSkills.get(row.key)?.level !== row.result.level);
const gateMismatch = homophones.filter(row => row.result.level !== null &&
  !row.result.levels.find(level => level.level === row.result.level)?.passed && !row.result.setbackHeld);
const held = homophones.filter(row => row.result.setbackHeld);
process.env.PROFICIENCY_HOMOPHONE_CONTEXT_ENABLED = "false";
const restored = await loadParentV2Dashboard(childId, asOf);
const oldRestored = restored.skills.filter(row => row.familyKey === "D4_HOM").every(row =>
  row.result.versions.inputFingerprint === oldSkills.get(row.key)?.versions.inputFingerprint);
console.log(JSON.stringify({ mode: "read_only_production", asOf, homophoneSkills: homophones.length,
  changedDisplayedLevels: differences.length, levels: [1, 2, 3, 4, 5].map(level =>
    homophones.filter(row => row.result.level === level).length),
  insufficient: homophones.filter(row => row.result.level === null).length,
  recentSlips: homophones.filter(row => row.result.recentSetback).length,
  heldLevels: held.length, gateMismatch: gateMismatch.length,
  contextualSet: contextResult?.level ?? null,
  contextualSetEvidence: contextResult?.sourceEventIds.length ?? 0,
  contextualSetReasons: contextResult?.reasonCodes ?? [],
  recentSlipSkills: homophones.filter(row => row.result.recentSetback).map(row => row.key),
  recentSlipSourceKinds: homophones.filter(row => row.result.recentSetback).map(row => ({
    skill: row.key, kinds: [...new Set(row.result.sourceEventIds.map(id => id.split(":")[0]))] })),
  savedGapEvidence: homophones.reduce((sum, row) => sum + row.result.sourceEventIds.filter(id =>
    id.startsWith("homophone-dictation:") || id.startsWith("homophone-checkpoint:")).length, 0),
  reviewedAdleWritingEvidence: homophones.reduce((sum, row) => sum + row.result.sourceEventIds.filter(id =>
    id.startsWith("homophone-adle-credit:")).length, 0),
  version: homophones[0]?.result.versions.model ?? null,
  oldRestored,
  learnerWrites: 0 }, null, 2));
if (gateMismatch.length || !oldRestored) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
