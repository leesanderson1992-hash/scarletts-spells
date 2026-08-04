import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loader = readFileSync(
  "lib/adle/loaders/canonical-intake-live.ts",
  "utf8",
);
const cron = readFileSync(
  "app/api/internal/adle-canonical-intake/reconcile/route.ts",
  "utf8",
);
const dictionaryRelease = readFileSync(
  "scripts/teaching-dictionary-release.ts",
  "utf8",
);
const prefixRelease = readFileSync(
  "scripts/adle-dynamic-prefix-pedagogy-release.ts",
  "utf8",
);
const stagingProof = readFileSync(
  "scripts/adle-canonical-intake-staging-proof.ts",
  "utf8",
);
const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};

assert.match(loader, /adle_record_canonical_intake_blocked/);
assert.match(loader, /adle_claim_canonical_intake_jobs/);
assert.match(loader, /adle_enqueue_canonical_intake_candidate/);
assert.match(loader, /adle_seed_canonical_intake_candidate/);
assert.match(loader, /candidateMappingIds:/);
assert.match(loader, /pendingContent/);
assert.match(loader, /pendingMapping/);
assert.match(loader, /attemptCount >= 5/);
assert.doesNotMatch(loader, /\.from\("daily_assignments"\)|\.from\("assignment_items"\)/);
assert.match(cron, /CRON_SECRET/);
assert.match(cron, /timingSafeEqual/);
assert.match(cron, /runCanonicalIntakeReconciliationSweep/);
assert.match(dictionaryRelease, /adle_enqueue_canonical_intake_by_target/);
assert.match(prefixRelease, /adle_enqueue_canonical_intake_by_target/);
assert.match(stagingProof, /\.in\("source_ref", proofSourceRefs\)/);
assert.match(stagingProof, /proofOwnedItemIds/);
assert.doesNotMatch(
  stagingProof,
  /deleteIn\("adle_learning_items", "id", state\.learningItemIds\)/,
);
assert.deepEqual(
  config.crons.find(
    (entry) => entry.path === "/api/internal/adle-canonical-intake/reconcile",
  ),
  {
    path: "/api/internal/adle-canonical-intake/reconcile",
    schedule: "*/5 * * * *",
  },
);

console.log("adle-canonical-intake-reconciliation-regression: ok");
