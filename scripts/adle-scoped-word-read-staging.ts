import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { composeDailyPlan } from "../lib/adle/daily-assignment-composer";
import { loadDailyPlanFacts } from "../lib/adle/loaders/composer-facts-loader";

const ref = "qkpjbajicacbrphthibk";
assert.equal(process.env.SUPABASE_STAGING_PROJECT_REF, ref);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");

const originalFetch = globalThis.fetch;
let capture: { requests: number; decodedBytes: number } | null = null;
globalThis.fetch = async (request, init) => {
  const response = await originalFetch(request, init);
  const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
  if (capture && new URL(url).host === `${ref}.supabase.co`) {
    capture.requests++;
    capture.decodedBytes += (await response.clone().arrayBuffer()).byteLength;
  }
  return response;
};

async function main() {
  const client = createServiceRoleClient();
  const today = "2026-11-09";
  const childId = process.argv[2];
  assert.match(childId ?? "", /^[0-9a-f-]{36}$/i, "Synthetic staging child ID required");
  const results = [];
  for (const mode of ["full", "scoped"] as const) {
    capture = { requests: 0, decodedBytes: 0 };
    const start = performance.now();
    const loaded = await loadDailyPlanFacts(client, { childId, today, wordReadMode: mode });
    const durationMs = Math.round(performance.now() - start);
    const measured = capture;
    capture = null;
    results.push({ mode, loaded, measured, durationMs, plan: composeDailyPlan(loaded.facts, today) });
  }
  const [full, scoped] = results;
  assert.deepEqual(scoped.plan, full.plan, "Composed assignment changed after word scope");
  assert.deepEqual(scoped.loaded.proficiencyReports, full.loaded.proficiencyReports, "Proficiency changed after word scope");
  assert.deepEqual(scoped.loaded.wordStates, full.loaded.wordStates, "Word mastery changed after word scope");
  const pairKeys = (value: typeof full.loaded.proficiencyRelationships) => value
    .map((pair) => `${pair.canonicalWordId}:${pair.microSkillKey}`).sort();
  assert.deepEqual(pairKeys(scoped.loaded.proficiencyRelationships), pairKeys(full.loaded.proficiencyRelationships), "Relationship projection changed after word scope");
  assert.deepEqual(scoped.loaded.withdrawnLearningItems, full.loaded.withdrawnLearningItems, "Withdrawal handling changed after word scope");
  assert.deepEqual(scoped.loaded.wordNextReviewDueByWordId, full.loaded.wordNextReviewDueByWordId, "Review queue changed after word scope");
  console.log(JSON.stringify({ event: "adle_scoped_word_read_staging_v1", passed: true,
    childHasActiveLearningItem: full.loaded.facts.learningItems.length > 0,
    modes: results.map(({ mode, loaded, measured, durationMs }) => ({ mode,
      requests: measured?.requests, decodedBytes: measured?.decodedBytes, durationMs,
      dictionaryWords: loaded.facts.dictionary.words.length,
      supports: loaded.facts.dictionary.supports.length,
      learningItems: loaded.facts.learningItems.length,
      reviewWords: loaded.facts.scheduleWords.length,
    })),
    fullFingerprintPresent: full.loaded.proficiencyFingerprint !== null,
    scopedFingerprintAbsent: scoped.loaded.proficiencyFingerprint === null,
  }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
