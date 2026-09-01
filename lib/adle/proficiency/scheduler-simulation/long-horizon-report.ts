import {
  longHorizonAverage,
  longHorizonQuantile,
  type LongHorizonMatrix,
  type LongHorizonRun,
} from "./long-horizon";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function decimal(value: number): string {
  return value.toFixed(1);
}

function summarize(runs: readonly LongHorizonRun[]) {
  const attempts = runs.reduce((sum, run) => sum + run.reviewAttempts, 0);
  const words = runs.reduce((sum, run) => sum + run.wordsIntroduced, 0);
  const attended = runs.reduce((sum, run) => sum + run.attendedDays, 0);
  const trapped90 = runs.reduce((sum, run) => sum + run.trappedOver90Days, 0);
  const trapped180 = runs.reduce((sum, run) => sum + run.trappedOver180Days, 0);
  return {
    observedFailureRate: attempts === 0 ? 0 : runs.reduce((sum, run) => sum + run.reviewFailures, 0) / attempts,
    dailyLoad: longHorizonAverage(runs.map((run) => run.dailyReviewLoadMean)),
    queueP50: longHorizonAverage(runs.map((run) => run.queueP50)),
    queueP90: longHorizonAverage(runs.map((run) => run.queueP90)),
    queueP95: longHorizonAverage(runs.map((run) => run.queueP95)),
    queueMax: Math.max(0, ...runs.map((run) => run.queueMax)),
    reviewOnlyRate: attended === 0 ? 0 : runs.reduce((sum, run) => sum + run.reviewOnlyDays, 0) / attended,
    lessonFrequency: longHorizonAverage(runs.map((run) => run.lessonFrequency)),
    recoveriesPer1000Words: words === 0 ? 0 : 1000 * runs.reduce((sum, run) => sum + run.nextDayRecoveries, 0) / words,
    regressionsPer1000Words: words === 0 ? 0 : 1000 * runs.reduce((sum, run) => sum + run.rungRegressions, 0) / words,
    returnsPer1000Words: words === 0 ? 0 : 1000 * runs.reduce((sum, run) => sum + run.controlledReturns, 0) / words,
    reteachesPer1000Words: words === 0 ? 0 : 1000 * runs.reduce((sum, run) => sum + run.reteaches, 0) / words,
    timeToFinalP50: longHorizonAverage(runs.map((run) => run.timeToFinalRungP50).filter((value): value is number => value !== null)),
    timeToFinalP90: longHorizonAverage(runs.map((run) => run.timeToFinalRungP90).filter((value): value is number => value !== null)),
    retirementRate: longHorizonAverage(runs.map((run) => run.retirementRate)),
    matureRetirementRate: longHorizonAverage(runs.map((run) => run.matureRetirementRate)),
    trapped90Per1000: words === 0 ? 0 : 1000 * trapped90 / words,
    trapped180Per1000: words === 0 ? 0 : 1000 * trapped180 / words,
    runaway: runs.filter((run) => run.runawayBacklog).length,
  };
}

function row(label: string, runs: readonly LongHorizonRun[]): string {
  const value = summarize(runs);
  return `| ${label} | ${percent(value.observedFailureRate)} | ${decimal(value.dailyLoad)} | ${decimal(value.queueP50)} | ${decimal(value.queueP90)} | ${decimal(value.queueP95)} | ${value.queueMax} | ${percent(value.reviewOnlyRate)} | ${percent(value.lessonFrequency)} | ${decimal(value.recoveriesPer1000Words)} | ${decimal(value.regressionsPer1000Words)} | ${decimal(value.returnsPer1000Words)} | ${decimal(value.reteachesPer1000Words)} | ${decimal(value.timeToFinalP50)} | ${decimal(value.timeToFinalP90)} | ${percent(value.retirementRate)} | ${percent(value.matureRetirementRate)} | ${decimal(value.trapped90Per1000)} | ${decimal(value.trapped180Per1000)} | ${value.runaway} |`;
}

const HEADER = [
  "| Segment | Observed fail | Daily load | Q50 | Q90 | Q95 | Qmax | Review-only | Lesson frequency | Recoveries/1k words | Regressions/1k | Controlled returns/1k | Reteaches/1k | Days to final P50 | Days to final P90 | Retirement | Mature retirement | Trapped >90/1k | Trapped >180/1k | Runaway |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
];

export function formatLongHorizonReport(matrix: LongHorizonMatrix): string {
  const lines = [
    "# ADLE C2 long-horizon scheduler simulation",
    "",
    `Version: \`${matrix.version}\``,
    `Runs: ${matrix.runs.length}`,
    `Fingerprint: \`${matrix.fingerprint}\``,
    "",
    "## Duration and policy",
    "",
    ...HEADER,
  ];
  for (const duration of [30, 90, 180, 365]) {
    for (const policy of ["current", "target"] as const) {
      lines.push(row(`${duration}d ${policy}`, matrix.runs.filter((run) => run.durationDays === duration && run.policy === policy)));
    }
  }
  lines.push("", "## 365-day failure-rate comparison", "", ...HEADER);
  for (const rate of [0.05, 0.1, 0.15, 0.2, 0.3]) {
    for (const policy of ["current", "target"] as const) {
      lines.push(row(`${percent(rate)} ${policy}`, matrix.runs.filter((run) => run.durationDays === 365 && run.requestedFailureRate === rate && run.policy === policy)));
    }
  }
  lines.push("", "## Target profiles at 365 days", "", ...HEADER);
  for (const profile of ["strong", "typical", "fragile", "late_lapse", "persistent_misconception", "noisy"] as const) {
    lines.push(row(profile, matrix.runs.filter((run) => run.durationDays === 365 && run.policy === "target" && run.profile === profile)));
  }
  lines.push("", "## Target stress scenarios at 365 days", "", ...HEADER);
  for (const scenario of ["baseline", "missed_days", "holiday", "mixed_five_word_lessons", "same_micro_skill_clusters"] as const) {
    lines.push(row(scenario, matrix.runs.filter((run) => run.durationDays === 365 && run.policy === "target" && run.scenario === scenario)));
  }
  lines.push("", "## Anchor counterfactual at 365 days", "", ...HEADER);
  for (const anchor of ["rolling_from_completion", "fixed_calendar"] as const) {
    for (const policy of ["current", "target"] as const) {
      lines.push(row(`${anchor} ${policy}`, matrix.runs.filter((run) => run.durationDays === 365 && run.anchor === anchor && run.policy === policy)));
    }
  }
  const target365 = matrix.runs.filter((run) => run.durationDays === 365 && run.policy === "target");
  const dayOneRate = target365.reduce((sum, run) => sum + run.dayOneControlledReturns, 0)
    / Math.max(1, target365.reduce((sum, run) => sum + run.reviewAttempts, 0));
  const thirdRate = target365.reduce((sum, run) => sum + run.thirdFailureControlledReturns, 0)
    / Math.max(1, target365.reduce((sum, run) => sum + run.reviewAttempts, 0));
  lines.push(
    "",
    "## Punitive-routing audit",
    "",
    `- Target Day-1 controlled returns: ${percent(dayOneRate)} of review attempts.`,
    `- Target third-consecutive-failure controlled returns: ${percent(thirdRate)} of review attempts.`,
    `- Maximum target controlled-return rate in any run: ${percent(matrix.gate.maximumTargetControlledReturnRate)}.`,
    `- Maximum requested-versus-observed failure-rate deviation: ${percent(matrix.gate.maximumObservedFailureRateDeviation)}.`,
    `- Minimum target 365-day lesson frequency: ${percent(matrix.gate.minimumTargetLessonFrequency365)}.`,
    `- Minimum target mature-word retirement at requested failure <=20%: ${percent(matrix.gate.minimumTargetMatureRetirementRate365AtOrBelow20Percent)}.`,
    `- Maximum target 365-day review-only rate: ${percent(matrix.gate.maximumTargetReviewOnlyRate365)}.`,
    `- Maximum target 365-day final combined backlog: ${matrix.gate.maximumTargetFinalCombinedBacklog365} words.`,
    `- Runaway backlogs current/target: ${matrix.gate.currentRunawayCount}/${matrix.gate.targetRunawayCount}.`,
    "",
    "## Gate",
    "",
    matrix.gate.passed ? "`C2 LONG-HORIZON SIMULATION PASSED`" : "`C2 LONG-HORIZON SIMULATION FAILED`",
  );
  if (matrix.gate.reasons.length) {
    lines.push("", ...matrix.gate.reasons.map((reason) => `- ${reason}`));
  }
  return lines.join("\n");
}

export function longHorizonKeyPercentiles(matrix: LongHorizonMatrix): { targetQueueP95P95: number; targetQueueMax: number } {
  const target = matrix.runs.filter((run) => run.policy === "target");
  return {
    targetQueueP95P95: longHorizonQuantile(target.map((run) => run.queueP95), 0.95),
    targetQueueMax: Math.max(...target.map((run) => run.queueMax)),
  };
}
