import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const loader = readFileSync("lib/adle/loaders/canonical-intake-live.ts", "utf8");
const featureGate = loader.indexOf(
  'if (process.env[ADLE_CANONICAL_INTAKE_FEATURE_FLAG] !== "enabled")',
);
const firstRead = loader.indexOf('.from("parent_verified_spelling_candidate_mappings")');

assert(featureGate >= 0, "canonical intake has an explicit enabled-only gate");
assert(firstRead > featureGate, "the feature gate returns before the first database read");
assert(
  loader.includes("if (!params.dryRun)") &&
    loader.includes("const inserted = await persistEligibleIntake(client, resolution)"),
  "dry-run intake never invokes the atomic persistence RPC",
);
assert(
  loader.includes('client.rpc("adle_persist_canonical_intake"'),
  "eligible intake persists only through the atomic database boundary",
);

console.log("adle-canonical-intake-live-regression: ok");
