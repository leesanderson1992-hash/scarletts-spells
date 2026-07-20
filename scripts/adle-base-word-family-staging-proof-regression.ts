import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const source = readFileSync("scripts/adle-base-word-family-staging-proof.ts", "utf8");
assert(source.includes('const STAGING_REF = "jlhotktspjvffslvuyfz"') && source.includes('const PRODUCTION_REF = "wwohrqtunajrbwxyssjf"'), "proof names the staging target and permanently blocks production");
assert(source.includes('ADLE_BASE_WORD_ACCEPT_STAGING') && source.includes('disposable-data-only') && source.includes('ADLE_BASE_WORD_STAGING_SUPABASE_HOST'), "remote proof requires exact-host acknowledgement");
assert(source.includes('ADLE-BASE-WORD-STAGING-FIXTURE-V1') && source.includes('requires --apply'), "all mutation paths require explicit confirmation");
assert(source.includes('TARGET_KEYS = ["government_en_gb", "replayed_en_gb"]') && source.includes('source_kind: "verified_misspelling"'), "proof uses exactly the two synthetic verified authentic targets");
assert(source.includes('assignmentItems: 18') && source.includes('adle_base_word_transfer_miss_events'), "proof verifies the immutable binding count and transfer ledger");
assert(source.includes('verify-completed') && source.includes('verify-retry') && source.includes('completion has exactly one reflection') && source.includes('only two authentic targets are scheduled'), "proof has machine-readable completion and retry invariants");
assert(source.includes('canonical_teaching_dictionary_import_batches') && source.includes('source_folder_sha256'), "fixture writes are tracked by an import batch fingerprint");
assert(source.includes('baselineCounts') && source.includes('cleanup must restore preflight counts'), "cleanup proves the protected staging counts return to baseline");
assert(source.includes('input.families as string[]') && source.includes('.sort()'), "fixture-family validation is order-independent");
assert(source.includes('removeFixtureBatch') && source.includes('canonical_teaching_dictionary_readiness_reports') && source.includes('command === "recover"'), "partial fixture imports have an exact-batch recovery path");
assert(source.includes('ADLE_BASE_WORD_PROOF_ENABLE_TEMPORARY_CHILD') && source.includes('ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS = child.id'), "only the proof process can allowlist its newly created anonymous child");
assert(source.includes('adle-base-word-family-staging-proof-state.json') && !source.includes('adle-base-word-family-staging-proof/state.json'), "proof state survives the per-command build cleanup");
assert(source.includes('disable the local/preview pilot gate before cleanup') && source.includes('rmSync(STATE_PATH'), "cleanup disables access first and removes opaque local state");
console.log("adle-base-word-family-staging-proof-regression: ok");
