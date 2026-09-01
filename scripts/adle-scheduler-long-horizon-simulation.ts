import assert from "node:assert/strict";

import {
  LONG_HORIZON_ANCHORS,
  LONG_HORIZON_DURATIONS,
  LONG_HORIZON_FAILURE_RATES,
  LONG_HORIZON_POLICIES,
  LONG_HORIZON_PROFILES,
  LONG_HORIZON_SCENARIOS,
  runLongHorizonMatrix,
} from "../lib/adle/proficiency/scheduler-simulation/long-horizon";
import { formatLongHorizonReport } from "../lib/adle/proficiency/scheduler-simulation/long-horizon-report";

const matrix = runLongHorizonMatrix();
assert.deepEqual(LONG_HORIZON_DURATIONS, [30, 90, 180, 365]);
assert.deepEqual(LONG_HORIZON_FAILURE_RATES, [0.05, 0.10, 0.15, 0.20, 0.30]);
assert.deepEqual(LONG_HORIZON_PROFILES, [
  "strong", "typical", "fragile", "late_lapse", "persistent_misconception", "noisy",
]);
assert.deepEqual(LONG_HORIZON_SCENARIOS, [
  "baseline", "missed_days", "holiday", "mixed_five_word_lessons", "same_micro_skill_clusters",
]);
assert.deepEqual(LONG_HORIZON_ANCHORS, ["rolling_from_completion", "fixed_calendar"]);
assert.deepEqual(LONG_HORIZON_POLICIES, ["current", "target"]);
assert.equal(matrix.runs.length,
  LONG_HORIZON_DURATIONS.length
  * LONG_HORIZON_FAILURE_RATES.length
  * LONG_HORIZON_PROFILES.length
  * LONG_HORIZON_SCENARIOS.length
  * LONG_HORIZON_ANCHORS.length
  * LONG_HORIZON_POLICIES.length);
console.log(formatLongHorizonReport(matrix));
if (!matrix.gate.passed) process.exitCode = 1;
