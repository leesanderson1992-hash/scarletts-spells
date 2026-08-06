import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  compileDynamicAffixWordLabDecision,
  type DynamicAffixCompilerMode,
} from "../lib/adle/morphology/dynamic-affix-compiler-rollout";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";

const PACKAGES = [
  "2026-07-27-dynamic-suffix-ness",
  "2026-07-27-dynamic-suffix-able-ible",
  "2026-07-27-dynamic-suffix-ment",
  "2026-07-28-dynamic-suffix-ful-less",
  "2026-07-28-dynamic-suffix-al",
  "2026-07-28-dynamic-suffix-ity",
  "2026-07-28-dynamic-suffix-ly",
  "2026-07-28-dynamic-suffix-ous",
  "2026-07-29-dynamic-suffix-tion",
  "2026-07-29-dynamic-suffix-sion",
] as const;
const MODES: readonly DynamicAffixCompilerMode[] = [
  "legacy_authoritative",
  "shadow",
  "enforced_parity",
  "shared_authoritative",
];
const WARMUPS = 200;
const ITERATIONS = 100;
const DECISIONS_PER_SAMPLE = 5;
const P95_LIMIT_MS = 10;
const P99_LIMIT_MS = 20;
const HEAP_DELTA_PER_DECISION_LIMIT_MB = 5;
const MEASURE_ONLY = process.argv.includes("--measure-only");

function percentile(values: readonly number[], percentileValue: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(percentileValue * ordered.length) - 1),
  );
  return Math.round(ordered[index]! * 1000) / 1000;
}

function benchmarkCase(directory: (typeof PACKAGES)[number], selectedMode: DynamicAffixCompilerMode) {
  const results = [];
  const fixture = loadReviewedAffixPackageFixture(
    `docs/implementation/seed-data/teaching-dictionary/candidates/${directory}/reviewed-staging-package.json`,
  );
  for (const mode of [selectedMode]) {
    for (let index = 0; index < WARMUPS; index += 1) {
      assert(compileDynamicAffixWordLabDecision(fixture.selection, { mode, sourceKind: "reviewed_fixture" }).ok);
    }
    const maxRssBeforeKb = process.resourceUsage().maxRSS;
    const durations: number[] = [];
    const incrementalDurations: number[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const cpuBefore = process.cpuUsage();
      for (let sampleDecision = 0; sampleDecision < DECISIONS_PER_SAMPLE; sampleDecision += 1) {
        const decision = compileDynamicAffixWordLabDecision(fixture.selection, {
          mode,
          sourceKind: "reviewed_fixture",
        });
        assert(decision.ok, `${fixture.profile.microSkillKey}:${mode}:${index}:${sampleDecision}`);
      }
      const cpu = process.cpuUsage(cpuBefore);
      const cpuMsPerDecision = (cpu.user + cpu.system) / 1000 / DECISIONS_PER_SAMPLE;
      durations.push(cpuMsPerDecision);
      incrementalDurations.push(mode === "legacy_authoritative" ? 0 : cpuMsPerDecision);
    }
    const maxRssAfterKb = process.resourceUsage().maxRSS;
    const result = {
      profileKey: fixture.profile.microSkillKey,
      mode,
      iterations: ITERATIONS * DECISIONS_PER_SAMPLE,
      samples: ITERATIONS,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      incrementalP95Ms: percentile(incrementalDurations, 0.95),
      heapDeltaPerDecisionMb: Math.round(
        (Math.max(0, maxRssAfterKb - maxRssBeforeKb) / (ITERATIONS * DECISIONS_PER_SAMPLE) / 1024) * 1000,
      ) / 1000,
    };
    if (!MEASURE_ONLY) {
      assert(result.p95Ms <= P95_LIMIT_MS, `${result.profileKey}:${mode}: p95 ${result.p95Ms}ms`);
      assert(result.incrementalP95Ms <= P95_LIMIT_MS, `${result.profileKey}:${mode}: incremental p95 ${result.incrementalP95Ms}ms`);
      assert(result.p99Ms <= P99_LIMIT_MS, `${result.profileKey}:${mode}: p99 ${result.p99Ms}ms`);
      assert(result.heapDeltaPerDecisionMb <= HEAP_DELTA_PER_DECISION_LIMIT_MB, `${result.profileKey}:${mode}: heap ${result.heapDeltaPerDecisionMb}MB`);
    }
    results.push(result);
  }
  return results;
}

const caseIndex = process.argv.indexOf("--profile");
if (caseIndex >= 0) {
  const directory = process.argv[caseIndex + 1] as (typeof PACKAGES)[number];
  const modeIndex = process.argv.indexOf("--mode");
  const mode = process.argv[modeIndex + 1] as DynamicAffixCompilerMode;
  assert(PACKAGES.includes(directory));
  assert(MODES.includes(mode));
  console.log(JSON.stringify({ status: "case_passed", directory, mode, results: benchmarkCase(directory, mode) }));
} else {
  const results = PACKAGES.flatMap((directory) => MODES.flatMap((mode) => {
    const child = spawnSync("npx", ["tsx", "scripts/adle-dynamic-affix-compiler-benchmark.ts", "--profile", directory, "--mode", mode], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const line = child.stdout.trim().split(/\r?\n/).at(-1);
    assert(line, `${directory}: benchmark child emitted no result`);
    const parsed = JSON.parse(line) as { status: string; results: ReturnType<typeof benchmarkCase> };
    assert.equal(parsed.status, "case_passed");
    return parsed.results;
  }));
  assert.equal(results.length, 40, "ten profiles x four compiler modes");
  console.log(JSON.stringify({
    status: "passed",
    profiles: PACKAGES.length,
    modeRuns: results.length,
    isolatedCaseProcesses: results.length,
    warmups: WARMUPS,
    decisionsPerSample: DECISIONS_PER_SAMPLE,
    measurementClock: "process_cpu",
    thresholds: {
      p95Ms: P95_LIMIT_MS,
      p99Ms: P99_LIMIT_MS,
      heapDeltaPerDecisionMb: HEAP_DELTA_PER_DECISION_LIMIT_MB,
    },
    maxima: {
      p95Ms: Math.max(...results.map((result) => result.p95Ms)),
      p99Ms: Math.max(...results.map((result) => result.p99Ms)),
      heapDeltaPerDecisionMb: Math.max(...results.map((result) => result.heapDeltaPerDecisionMb)),
    },
    results,
  }));
}
