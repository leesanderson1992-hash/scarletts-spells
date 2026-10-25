import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const ref = "qkpjbajicacbrphthibk";
assert.equal(process.env.SUPABASE_STAGING_PROJECT_REF, ref);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");
const childId = process.argv[2];
assert.match(childId ?? "", /^[0-9a-f-]{36}$/i, "Synthetic staging child ID required");
const label = process.argv[3] ?? "baseline";
const skill = "D4_MOR_PREFIXES_UN";
const originalFetch = globalThis.fetch;
type RequestCount = { requests: number; decodedBodyBytes: number; errors: number;
  paths: Record<string, { requests: number; decodedBodyBytes: number }> };
let active: RequestCount | null = null;

globalThis.fetch = async (request, init) => {
  const response = await originalFetch(request, init);
  const url = typeof request === "string" ? request
    : request instanceof URL ? request.href : request.url;
  if (active && new URL(url).host === `${ref}.supabase.co`) {
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

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
}

async function main() {
  const [{ createServiceRoleClient }, { loadRouteWordStatuses },
    { loadDynamicPrefixProfiles }, { compareDynamicPrefixCandidates },
    { loadCurrentPairDeassignments }] = await Promise.all([
    import("../lib/supabase/service-role"),
    import("../lib/teaching-dictionary-manager/route-word-status-service"),
    import("../lib/adle/morphology/dynamic-prefix-profile-loader"),
    import("../lib/adle/morphology/prefix-candidate-shadow"),
    import("../lib/adle/word-skill-relationships/pair-decision-veto"),
  ]);
  const client = createServiceRoleClient();
  const samples: Array<{ durationMs: number; requests: number; decodedBodyBytes: number;
    statusDurationMs: number; statusRequests: number; statusBytes: number;
    nativeDurationMs: number; nativeRequests: number; nativeBytes: number;
    statusCount: number; nativePoolCount: number; nativeSelectedCount: number;
    selectedWithoutAdminAdmission: number }> = [];
  const totals: Record<string, { requests: number; decodedBodyBytes: number }> = {};
  for (let iteration = 0; iteration < 6; iteration++) {
    active = { requests: 0, decodedBodyBytes: 0, errors: 0, paths: {} };
    const started = performance.now();
    const status = await loadRouteWordStatuses({ routeId: "dynamic_prefix_word_lab", microSkillKey: skill });
    const statusElapsed = Math.round((performance.now() - started) * 10) / 10;
    const statusCounts = active;
    active = { requests: 0, decodedBodyBytes: 0, errors: 0, paths: {} };
    const nativeStarted = performance.now();
    const native = await loadDynamicPrefixProfiles(client, childId!, {
      microSkillKeys: [skill], allowStagingProfiles: true,
    });
    const withdrawn = await loadCurrentPairDeassignments({ client,
      environmentKey: "staging",
      pairs: native.profiles.flatMap((profile) => [...profile.wordsByCanonicalId.keys()]
        .map((canonicalWordId) => ({ canonicalWordId, microSkillKey: profile.microSkillKey }))),
    });
    const nativeElapsed = Math.round((performance.now() - nativeStarted) * 10) / 10;
    const nativeCounts = active;
    active = null;
    const compared = compareDynamicPrefixCandidates({ microSkillKey: skill,
      statuses: status.words.map((word) => word.status), profiles: native.profiles,
      learningItems: native.learningItems, deassignedPairs: withdrawn });
    const elapsed = Math.round((performance.now() - started) * 10) / 10;
    assert.equal(statusCounts.errors + nativeCounts.errors, 0,
      "Staging read returned an HTTP error");
    assert.ok(status.words.length >= 5, "The five-word fixture must be visible");
    assert.equal(compared.nativePoolIds.length, 4);
    assert.equal(compared.nativeSelectedIds.length, 4);
    if (iteration === 0) continue; // warm transport and module caches
    for (const counts of [statusCounts, nativeCounts]) for (const [path, value] of Object.entries(counts.paths)) {
      const previous = totals[path] ?? { requests: 0, decodedBodyBytes: 0 };
      totals[path] = { requests: previous.requests + value.requests,
        decodedBodyBytes: previous.decodedBodyBytes + value.decodedBodyBytes };
    }
    samples.push({ durationMs: elapsed,
      requests: statusCounts.requests + nativeCounts.requests,
      decodedBodyBytes: statusCounts.decodedBodyBytes + nativeCounts.decodedBodyBytes,
      statusDurationMs: statusElapsed, statusRequests: statusCounts.requests,
      statusBytes: statusCounts.decodedBodyBytes,
      nativeDurationMs: nativeElapsed, nativeRequests: nativeCounts.requests,
      nativeBytes: nativeCounts.decodedBodyBytes, statusCount: status.words.length,
      nativePoolCount: compared.nativePoolIds.length,
      nativeSelectedCount: compared.nativeSelectedIds.length,
      selectedWithoutAdminAdmission: compared.selectedWithoutAdminAdmission.length });
  }
  console.log(JSON.stringify({ event: "adle_prefix_status_performance_staging_v1",
    label, projectRef: ref, skill, sampleCount: samples.length,
    durationMs: summary(samples.map((sample) => sample.durationMs)),
    requests: summary(samples.map((sample) => sample.requests)),
    decodedBodyBytes: summary(samples.map((sample) => sample.decodedBodyBytes)),
    statusRead: { durationMs: summary(samples.map((sample) => sample.statusDurationMs)),
      requests: summary(samples.map((sample) => sample.statusRequests)),
      decodedBodyBytes: summary(samples.map((sample) => sample.statusBytes)) },
    nativeRead: { durationMs: summary(samples.map((sample) => sample.nativeDurationMs)),
      requests: summary(samples.map((sample) => sample.nativeRequests)),
      decodedBodyBytes: summary(samples.map((sample) => sample.nativeBytes)) },
    paths: Object.fromEntries(Object.entries(totals).sort((a, b) =>
      b[1].decodedBodyBytes - a[1].decodedBodyBytes).slice(0, 12)),
    decisions: samples.map(({ statusCount, nativePoolCount, nativeSelectedCount,
      selectedWithoutAdminAdmission }) => ({ statusCount, nativePoolCount,
      nativeSelectedCount, selectedWithoutAdminAdmission })),
  }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
