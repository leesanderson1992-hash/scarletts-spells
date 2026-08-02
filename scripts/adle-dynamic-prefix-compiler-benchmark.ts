import assert from "node:assert/strict";

import { compileDynamicPrefixWordLabDecision } from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import { selectReviewedPrefixFixture, loadReviewedPrefixPackageFixtures } from "./lib/adle-reviewed-prefix-package-fixture";

const WARMUPS = 50;
const ITERATIONS = 500;
const P95_LIMIT_MS = 10;
const P99_LIMIT_MS = 20;
const HEAP_DELTA_PER_DECISION_LIMIT_MB = 5;

function percentile(values: readonly number[], percentileValue: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(percentileValue * ordered.length) - 1),
  );
  return Math.round(ordered[index]! * 1000) / 1000;
}

const results: Array<{
  profileKey: string;
  mode: "shadow" | "enforced_parity" | "shared_authoritative";
  iterations: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  incrementalP95Ms: number;
  heapDeltaPerDecisionMb: number;
}> = [];

for (const fixture of loadReviewedPrefixPackageFixtures()) {
  const selection = selectReviewedPrefixFixture(fixture.profile, fixture.words[0]!);
  for (const mode of ["shadow", "enforced_parity", "shared_authoritative"] as const) {
    for (let index = 0; index < WARMUPS; index += 1) {
      const decision = compileDynamicPrefixWordLabDecision(selection, {
        mode,
        sourceKind: "reviewed_fixture",
      });
      assert(decision.ok, `${fixture.profile.microSkillKey}:${mode}: warmup`);
    }
    const heapBefore = process.memoryUsage().heapUsed;
    let peakHeap = heapBefore;
    const durations: number[] = [];
    const incrementalDurations: number[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const decision = compileDynamicPrefixWordLabDecision(selection, {
        mode,
        sourceKind: "reviewed_fixture",
      });
      assert(decision.ok, `${fixture.profile.microSkillKey}:${mode}:${index}`);
      durations.push(decision.metrics.totalMs);
      incrementalDurations.push(Math.max(
        0,
        decision.metrics.totalMs - decision.metrics.legacyMs,
      ));
      peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    }
    const result = {
      profileKey: fixture.profile.microSkillKey,
      mode,
      iterations: ITERATIONS,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      incrementalP95Ms: percentile(incrementalDurations, 0.95),
      heapDeltaPerDecisionMb: Math.round(
        (Math.max(0, peakHeap - heapBefore) / ITERATIONS / 1024 / 1024) * 1000,
      ) / 1000,
    };
    assert(
      result.p95Ms <= P95_LIMIT_MS,
      `${result.profileKey}:${mode}: p95 ${result.p95Ms}ms exceeds ${P95_LIMIT_MS}ms`,
    );
    assert(
      result.incrementalP95Ms <= P95_LIMIT_MS,
      `${result.profileKey}:${mode}: incremental p95 ${result.incrementalP95Ms}ms exceeds ${P95_LIMIT_MS}ms`,
    );
    assert(
      result.p99Ms <= P99_LIMIT_MS,
      `${result.profileKey}:${mode}: p99 ${result.p99Ms}ms exceeds ${P99_LIMIT_MS}ms`,
    );
    assert(
      result.heapDeltaPerDecisionMb <= HEAP_DELTA_PER_DECISION_LIMIT_MB,
      `${result.profileKey}:${mode}: heap ${result.heapDeltaPerDecisionMb}MB exceeds ${HEAP_DELTA_PER_DECISION_LIMIT_MB}MB`,
    );
    results.push(result);
  }
}

console.log(JSON.stringify({
  status: "passed",
  warmups: WARMUPS,
  thresholds: {
    p95Ms: P95_LIMIT_MS,
    p99Ms: P99_LIMIT_MS,
    heapDeltaPerDecisionMb: HEAP_DELTA_PER_DECISION_LIMIT_MB,
  },
  results,
}));
