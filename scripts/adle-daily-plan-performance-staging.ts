import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

const projectRef = "qkpjbajicacbrphthibk";
assert.equal(process.env.SUPABASE_STAGING_PROJECT_REF, projectRef);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${projectRef}.supabase.co`);
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");
const childId = process.argv[2];
assert.match(childId ?? "", /^[0-9a-f-]{36}$/i, "Synthetic staging child ID required");
const label = process.argv[3] ?? "baseline";
const originalFetch = globalThis.fetch;
type Capture = { requests: number; decodedBodyBytes: number; errors: number;
  paths: Record<string, { requests: number; decodedBodyBytes: number }> };
let active: Capture | null = null;

globalThis.fetch = async (request, init) => {
  const response = await originalFetch(request, init);
  const url = typeof request === "string" ? request
    : request instanceof URL ? request.href : request.url;
  if (active && new URL(url).host === `${projectRef}.supabase.co`) {
    const path = new URL(url).pathname;
    const bytes = (await response.clone().arrayBuffer()).byteLength;
    active.requests += 1;
    if (!response.ok) active.errors += 1;
    active.decodedBodyBytes += bytes;
    const previous = active.paths[path] ?? { requests: 0, decodedBodyBytes: 0 };
    active.paths[path] = { requests: previous.requests + 1,
      decodedBodyBytes: previous.decodedBodyBytes + bytes };
  }
  return response;
};

const capture = (): Capture => ({ requests: 0, decodedBodyBytes: 0,
  errors: 0, paths: {} });
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
}

async function main() {
  const [{ createServiceRoleClient }, { loadDailyPlanFacts },
    { prepareDynamicPrefixAssignment }] = await Promise.all([
    import("../lib/supabase/service-role"),
    import("../lib/adle/loaders/composer-facts-loader"),
    import("../lib/adle/morphology/dynamic-prefix-assignment-writer"),
  ]);
  const serviceClient = createServiceRoleClient();
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const signedIn = await userClient.auth.signInWithPassword({
    email: process.env.STAGING_ADMIN_EMAIL!,
    password: process.env.STAGING_ADMIN_PASSWORD!,
  });
  if (signedIn.error || !signedIn.data.user) throw new Error("Synthetic staging sign-in failed");
  const phases = { facts: [] as Array<Capture & { durationMs: number }>,
    prepare: [] as Array<Capture & { durationMs: number }> };
  for (let iteration = 0; iteration < 6; iteration++) {
    active = capture();
    const factsStarted = performance.now();
    const facts = await loadDailyPlanFacts(serviceClient, {
      childId: childId!, today: "2026-11-09",
    });
    const factsElapsed = Math.round((performance.now() - factsStarted) * 10) / 10;
    const factsCapture = active;
    active = capture();
    const prepareStarted = performance.now();
    const prepared = await prepareDynamicPrefixAssignment({
      userClient, serviceClient, parentUserId: signedIn.data.user.id,
      childId: childId!, planDate: "2026-11-09",
      requiredProfileKey: "D4_MOR_PREFIXES_UN", allowStagingProfiles: true,
    });
    const prepareElapsed = Math.round((performance.now() - prepareStarted) * 10) / 10;
    const prepareCapture = active;
    active = null;
    assert.equal(factsCapture.errors + prepareCapture.errors, 0);
    assert.equal(facts.withdrawnLearningItems.length, 1);
    assert.equal(prepared.status, "ready");
    if (iteration === 0) continue;
    phases.facts.push({ ...factsCapture, durationMs: factsElapsed });
    phases.prepare.push({ ...prepareCapture, durationMs: prepareElapsed });
  }
  const results = Object.fromEntries(Object.entries(phases).map(([name, samples]) => {
    const paths: Record<string, { requests: number; decodedBodyBytes: number }> = {};
    for (const sample of samples) for (const [path, value] of Object.entries(sample.paths)) {
      const previous = paths[path] ?? { requests: 0, decodedBodyBytes: 0 };
      paths[path] = { requests: previous.requests + value.requests,
        decodedBodyBytes: previous.decodedBodyBytes + value.decodedBodyBytes };
    }
    return [name, { durationMs: summary(samples.map((sample) => sample.durationMs)),
      requests: summary(samples.map((sample) => sample.requests)),
      decodedBodyBytes: summary(samples.map((sample) => sample.decodedBodyBytes)),
      paths: Object.fromEntries(Object.entries(paths).sort((a, b) =>
        b[1].decodedBodyBytes - a[1].decodedBodyBytes).slice(0, 12)) }];
  }));
  console.log(JSON.stringify({ event: "adle_daily_plan_performance_staging_v1",
    label, projectRef, sampleCount: 5, results }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
