import { addDays } from "../../review-scheduler";
import { initialTargetScheduledState, targetNoFailureLineage } from "../../review-policy/target-regression-v1";
import type { ReviewRung, SchedulerRouteState } from "./contracts";
import { ROLLING_DUE_DATE_SIMULATION, simulateSchedulerEvent, simulationFingerprint } from "./simulator";

export const LONG_HORIZON_SIMULATION_VERSION = "ADLE_C2_LONG_HORIZON_SIMULATION_V1" as const;

export const LONG_HORIZON_DURATIONS = [30, 90, 180, 365] as const;
export const LONG_HORIZON_FAILURE_RATES = [0.05, 0.10, 0.15, 0.20, 0.30] as const;
export const LONG_HORIZON_PROFILES = [
  "strong", "typical", "fragile", "late_lapse", "persistent_misconception", "noisy",
] as const;
export const LONG_HORIZON_SCENARIOS = [
  "baseline", "missed_days", "holiday", "mixed_five_word_lessons", "same_micro_skill_clusters",
] as const;
export const LONG_HORIZON_ANCHORS = ["rolling_from_completion", "fixed_calendar"] as const;
export const LONG_HORIZON_POLICIES = ["current", "target"] as const;

export type LongHorizonProfile = (typeof LONG_HORIZON_PROFILES)[number];
export type LongHorizonScenario = (typeof LONG_HORIZON_SCENARIOS)[number];
export type LongHorizonAnchor = (typeof LONG_HORIZON_ANCHORS)[number];
export type LongHorizonPolicy = (typeof LONG_HORIZON_POLICIES)[number];

type CurrentRoute =
  | { mode: "SCHEDULED"; rung: ReviewRung; dueOn: string }
  | { mode: "CATCH_UP"; failedRung: ReviewRung; stage: 1 | 2; dueOn: string; failedOn: string }
  | { mode: "CONTROLLED_REACQUISITION" }
  | { mode: "RETIRED" };

type SimWord = {
  id: string;
  skillId: string;
  introducedOn: string;
  cycleAnchorOn: string;
  attemptOrdinal: number;
  scheduleVersion: number;
  targetRoute: SchedulerRouteState | null;
  currentRoute: CurrentRoute | null;
  finalRungReachedOn: string | null;
  retiredOn: string | null;
};

type DueEntry = { wordId: string; version: number; dueOn: string };

export type LongHorizonRun = {
  durationDays: number;
  requestedFailureRate: number;
  observedFailureRate: number;
  profile: LongHorizonProfile;
  scenario: LongHorizonScenario;
  anchor: LongHorizonAnchor;
  policy: LongHorizonPolicy;
  seed: number;
  wordsIntroduced: number;
  reviewAttempts: number;
  reviewFailures: number;
  dailyReviewLoadMean: number;
  queueP50: number;
  queueP90: number;
  queueP95: number;
  queueMax: number;
  combinedBacklogMax: number;
  finalCombinedBacklog: number;
  reviewOnlyDays: number;
  attendedDays: number;
  lessons: number;
  lessonFrequency: number;
  nextDayRecoveries: number;
  rungRegressions: number;
  controlledReturns: number;
  dayOneControlledReturns: number;
  thirdFailureControlledReturns: number;
  reteaches: number;
  finalRungReachedCount: number;
  timeToFinalRungP50: number | null;
  timeToFinalRungP90: number | null;
  retiredCount: number;
  retirementRate: number;
  matureRetirementRate: number;
  trappedOver90Days: number;
  trappedOver180Days: number;
  runawayBacklog: boolean;
};

export type LongHorizonMatrix = {
  version: typeof LONG_HORIZON_SIMULATION_VERSION;
  runs: LongHorizonRun[];
  fingerprint: string;
  gate: {
    passed: boolean;
    reasons: string[];
    targetRunawayCount: number;
    currentRunawayCount: number;
    maximumTargetControlledReturnRate: number;
    maximumObservedFailureRateDeviation: number;
    minimumTargetLessonFrequency365: number;
    minimumTargetMatureRetirementRate365AtOrBelow20Percent: number;
    maximumTargetReviewOnlyRate365: number;
    maximumTargetFinalCombinedBacklog365: number;
  };
};

const RUNG_INDEX: Record<ReviewRung, number> = {
  DAY_1: 0, DAY_3: 1, DAY_7: 2, DAY_14: 3, DAY_28: 4, DAY_56: 5,
};
const RUNGS: readonly ReviewRung[] = ["DAY_1", "DAY_3", "DAY_7", "DAY_14", "DAY_28", "DAY_56"];
const FIXED_CUMULATIVE_DAYS: Record<ReviewRung, number> = {
  DAY_1: 1, DAY_3: 4, DAY_7: 11, DAY_14: 25, DAY_28: 53, DAY_56: 109,
};
const SESSION_CAP = 10;
const LESSON_WORDS = 5;
const START_ON = "2026-01-05";

function clamp(value: number, minimum = 0.001, maximum = 0.98): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomUnit(seed: number, token: string): number {
  let value = hash32(`${seed}:${token}`) + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function quantile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(fraction * ordered.length) - 1))];
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isAttending(scenario: LongHorizonScenario, day: number, duration: number, seed: number): boolean {
  if (scenario === "missed_days") return (day + seed) % 7 !== 0;
  if (scenario === "holiday") {
    const length = duration <= 30 ? 7 : 14;
    const start = Math.max(5, Math.floor(duration * 0.35));
    return day < start || day >= start + length;
  }
  return true;
}

function routeContext(word: SimWord, policy: LongHorizonPolicy): { rung: ReviewRung; recovery: boolean } {
  if (policy === "target") {
    const route = word.targetRoute!;
    if (route.route.membership === "NEXT_DAY_RECOVERY") return { rung: route.route.failedRung, recovery: true };
    if (route.route.membership === "SCHEDULED") return { rung: route.route.rung, recovery: false };
  } else {
    const route = word.currentRoute!;
    if (route.mode === "CATCH_UP") return { rung: route.failedRung, recovery: true };
    if (route.mode === "SCHEDULED") return { rung: route.rung, recovery: false };
  }
  throw new Error("long_horizon_non_review_route");
}

function preserveMeanShock(base: number, shock: boolean, shockProbability: number, uplift: number): number {
  const high = clamp(base + uplift);
  const low = clamp((base - shockProbability * high) / (1 - shockProbability));
  return shock ? high : low;
}

function failureProbability(input: {
  word: SimWord;
  profile: LongHorizonProfile;
  scenario: LongHorizonScenario;
  requestedRate: number;
  rung: ReviewRung;
  recovery: boolean;
  day: number;
  seed: number;
}): number {
  let probability = input.requestedRate;
  const latent = randomUnit(input.seed, `latent:${input.word.id}`);
  if (input.profile === "typical") {
    probability *= [0.75, 0.9, 1, 1.1, 1.25][Math.min(4, Math.floor(latent * 5))];
  } else if (input.profile === "fragile") {
    probability *= input.recovery ? 1.45 : input.rung === "DAY_1" ? 1.3 : 0.8;
  } else if (input.profile === "late_lapse") {
    probability *= input.rung === "DAY_56" ? 1.7 : input.rung === "DAY_28" ? 1.45 : input.rung === "DAY_14" ? 1.1 : 0.7;
  } else if (input.profile === "persistent_misconception") {
    const hard = latent < 0.2;
    const high = clamp(input.requestedRate * 2.5);
    const low = clamp((input.requestedRate - 0.2 * high) / 0.8);
    probability = hard ? high : low;
  } else if (input.profile === "noisy") {
    const shocked = randomUnit(input.seed, `noise-day:${input.day}`) < 0.12;
    probability = preserveMeanShock(input.requestedRate, shocked, 0.12, 0.35);
  }
  if (input.scenario === "mixed_five_word_lessons") {
    const factor = [0.6, 0.8, 1, 1.2, 1.4][Number(input.word.id.split(":").at(-1)) % 5];
    probability *= factor;
  }
  if (input.scenario === "same_micro_skill_clusters") {
    const shocked = randomUnit(input.seed, `skill-day:${input.word.skillId}:${input.day}`) < 0.15;
    probability = preserveMeanShock(clamp(probability), shocked, 0.15, 0.4);
  }
  return clamp(probability);
}

function scheduledDueOn(anchor: LongHorizonAnchor, word: SimWord, completedOn: string, rung: ReviewRung): string {
  if (anchor === "rolling_from_completion") return addDays(completedOn, [1, 3, 7, 14, 28, 56][RUNG_INDEX[rung]]);
  const planned = addDays(word.cycleAnchorOn, FIXED_CUMULATIVE_DAYS[rung]);
  return planned > completedOn ? planned : addDays(completedOn, 1);
}

function targetDueOn(route: SchedulerRouteState): string | null {
  return route.route.membership === "SCHEDULED" || route.route.membership === "NEXT_DAY_RECOVERY"
    ? route.route.dueOn : null;
}

function currentDueOn(route: CurrentRoute): string | null {
  return route.mode === "SCHEDULED" || route.mode === "CATCH_UP" ? route.dueOn : null;
}

function nextRung(rung: ReviewRung): ReviewRung | null {
  return RUNGS[RUNG_INDEX[rung] + 1] ?? null;
}

function runOne(input: {
  durationDays: number;
  requestedFailureRate: number;
  profile: LongHorizonProfile;
  scenario: LongHorizonScenario;
  anchor: LongHorizonAnchor;
  policy: LongHorizonPolicy;
  seed: number;
}): LongHorizonRun {
  const words = new Map<string, SimWord>();
  const dueBuckets = new Map<string, DueEntry[]>();
  let backlog: DueEntry[] = [];
  const controlledQueue: string[] = [];
  const dailyLoads: number[] = [];
  const dailyQueues: number[] = [];
  const combinedBacklogs: number[] = [];
  const finalRungTimes: number[] = [];
  let nextWord = 0;
  let lessonOrdinal = 0;
  let attendedDays = 0;
  let reviewOnlyDays = 0;
  let lessons = 0;
  let reviewAttempts = 0;
  let reviewFailures = 0;
  let nextDayRecoveries = 0;
  let rungRegressions = 0;
  let controlledReturns = 0;
  let dayOneControlledReturns = 0;
  let thirdFailureControlledReturns = 0;
  let reteaches = 0;
  let probabilityCalibrationOffset = 0;

  const routeOf = (word: SimWord) => input.policy === "target" ? word.targetRoute : word.currentRoute;
  const schedule = (word: SimWord) => {
    const route = routeOf(word);
    const dueOn = route && input.policy === "target"
      ? targetDueOn(route as SchedulerRouteState)
      : route ? currentDueOn(route as CurrentRoute) : null;
    word.scheduleVersion += 1;
    if (!dueOn) return;
    dueBuckets.set(dueOn, [...(dueBuckets.get(dueOn) ?? []), { wordId: word.id, version: word.scheduleVersion, dueOn }]);
  };
  const markFinalRung = (word: SimWord, route: SchedulerRouteState | CurrentRoute, today: string) => {
    if (word.finalRungReachedOn) return;
    let atFinal = false;
    if (input.policy === "target") {
      const targetRoute = (route as SchedulerRouteState).route;
      atFinal = targetRoute.membership === "SCHEDULED" && targetRoute.rung === "DAY_56";
    } else {
      const currentRoute = route as CurrentRoute;
      atFinal = currentRoute.mode === "SCHEDULED" && currentRoute.rung === "DAY_56";
    }
    if (atFinal) {
      word.finalRungReachedOn = today;
      finalRungTimes.push(diffDays(word.introducedOn, today));
    }
  };
  const retire = (word: SimWord, today: string) => {
    word.retiredOn = today;
    word.scheduleVersion += 1;
    if (input.policy === "target") word.targetRoute = {
      route: { membership: "RETIRED_PRESERVED" },
      failureLineage: targetNoFailureLineage(),
      appliedEventIds: [],
    };
    else word.currentRoute = { mode: "RETIRED" };
  };
  const enterControlled = (word: SimWord, reason: "day1" | "third" | "current_ejection") => {
    controlledReturns += 1;
    if (reason === "day1") dayOneControlledReturns += 1;
    if (reason === "third") thirdFailureControlledReturns += 1;
    word.scheduleVersion += 1;
    controlledQueue.push(word.id);
  };
  const reviewWord = (word: SimWord, today: string, day: number) => {
    const context = routeContext(word, input.policy);
    const structuralProbability = failureProbability({
      word, profile: input.profile, scenario: input.scenario,
      requestedRate: input.requestedFailureRate, rung: context.rung,
      recovery: context.recovery, day, seed: input.seed,
    });
    // Robbins-Monro intercept calibration keeps each run's attempt-weighted
    // effective failure rate near the requested 5/10/15/20/30% while retaining
    // the profile's relative rung, word, day, and skill-cluster structure.
    const probability = clamp(structuralProbability + probabilityCalibrationOffset);
    const failed = randomUnit(input.seed, `review:${word.id}:${word.attemptOrdinal}`) < probability;
    probabilityCalibrationOffset = clamp(
      probabilityCalibrationOffset + 0.03 * (input.requestedFailureRate - (failed ? 1 : 0)),
      -0.95,
      0.95,
    );
    word.attemptOrdinal += 1;
    reviewAttempts += 1;
    if (failed) reviewFailures += 1;
    if (input.policy === "target") {
      const before = word.targetRoute!;
      const event = before.route.membership === "NEXT_DAY_RECOVERY"
        ? { eventId: `target:${word.id}:${word.attemptOrdinal}`, kind: "RECOVERY_CHECK" as const, failedRung: before.route.failedRung, outcome: failed ? "fail" as const : "pass" as const, occurredOn: today }
        : before.route.membership === "SCHEDULED"
          ? { eventId: `target:${word.id}:${word.attemptOrdinal}`, kind: "SCHEDULED_CHECK" as const, rung: before.route.rung, outcome: failed ? "fail" as const : "pass" as const, occurredOn: today }
          : null;
      if (!event) throw new Error("target_long_horizon_route_conflict");
      const dueDateScenario = input.anchor === "rolling_from_completion"
        ? ROLLING_DUE_DATE_SIMULATION
        : {
            scenarioVersion: "SIMULATION_FIXED_CALENDAR_COUNTERFACTUAL_V1",
            nextScheduledDueOn: (completedOn: string, rung: ReviewRung) => scheduledDueOn(input.anchor, word, completedOn, rung),
          };
      const after = simulateSchedulerEvent(before, event, dueDateScenario);
      if (before.route.membership === "SCHEDULED" && failed && after.route.membership === "NEXT_DAY_RECOVERY") nextDayRecoveries += 1;
      if (before.route.membership === "NEXT_DAY_RECOVERY" && failed && after.route.membership === "SCHEDULED") rungRegressions += 1;
      if (after.route.membership === "CONTROLLED_REACQUISITION") {
        const reason = after.route.requiredBecause === "DAY_1_FAILURE" ? "day1" : "third";
        word.targetRoute = after;
        enterControlled(word, reason);
        return;
      }
      if (after.route.membership === "FINAL_RUNG_DELEGATED") {
        retire(word, today);
        return;
      }
      word.targetRoute = after;
      markFinalRung(word, after, today);
      schedule(word);
      return;
    }
    const before = word.currentRoute!;
    if (before.mode === "SCHEDULED") {
      if (failed) {
        word.currentRoute = { mode: "CATCH_UP", failedRung: before.rung, stage: 1, dueOn: addDays(today, 1), failedOn: today };
        nextDayRecoveries += 1;
      } else {
        const forward = nextRung(before.rung);
        if (!forward) return retire(word, today);
        word.currentRoute = { mode: "SCHEDULED", rung: forward, dueOn: scheduledDueOn(input.anchor, word, today, forward) };
      }
    } else if (before.mode === "CATCH_UP") {
      if (!failed) {
        const forward = nextRung(before.failedRung);
        if (!forward) return retire(word, today);
        word.currentRoute = { mode: "SCHEDULED", rung: forward, dueOn: scheduledDueOn(input.anchor, word, today, forward) };
      } else if (before.stage === 1) {
        word.currentRoute = { ...before, stage: 2, dueOn: addDays(before.failedOn, 3) > today ? addDays(before.failedOn, 3) : addDays(today, 1) };
      } else {
        word.currentRoute = { mode: "CONTROLLED_REACQUISITION" };
        enterControlled(word, "current_ejection");
        return;
      }
    }
    markFinalRung(word, word.currentRoute!, today);
    schedule(word);
  };
  const performLesson = (today: string) => {
    lessons += 1;
    lessonOrdinal += 1;
    let slots = LESSON_WORDS;
    while (slots > 0 && controlledQueue.length > 0) {
      const word = words.get(controlledQueue.shift()!)!;
      const route = routeOf(word);
      const controlled = route && (input.policy === "target"
        ? (route as SchedulerRouteState).route.membership === "CONTROLLED_REACQUISITION"
        : (route as CurrentRoute).mode === "CONTROLLED_REACQUISITION");
      if (!controlled) continue;
      word.cycleAnchorOn = today;
      if (input.policy === "target") {
        const dueDateScenario = input.anchor === "rolling_from_completion"
          ? ROLLING_DUE_DATE_SIMULATION
          : {
              scenarioVersion: "SIMULATION_FIXED_CALENDAR_COUNTERFACTUAL_V1",
              nextScheduledDueOn: (completedOn: string, rung: ReviewRung) => scheduledDueOn(input.anchor, word, completedOn, rung),
            };
        const next = simulateSchedulerEvent(word.targetRoute!, {
          eventId: `reteach:${word.id}:${today}`, kind: "CONTROLLED_PASS", occurredOn: today,
        }, dueDateScenario);
        if (next.route.membership !== "SCHEDULED") throw new Error("target_reteach_did_not_enter_day1");
        word.targetRoute = next;
      } else {
        word.currentRoute = { mode: "SCHEDULED", rung: "DAY_1", dueOn: scheduledDueOn(input.anchor, word, today, "DAY_1") };
      }
      reteaches += 1;
      slots -= 1;
      schedule(word);
    }
    while (slots > 0) {
      const index = nextWord++;
      const id = `word:${index}`;
      const skillId = input.scenario === "same_micro_skill_clusters" ? `skill:lesson:${lessonOrdinal}` : `skill:${index % 17}`;
      const word: SimWord = {
        id, skillId, introducedOn: today, cycleAnchorOn: today,
        attemptOrdinal: 0, scheduleVersion: 0,
        targetRoute: input.policy === "target" ? initialTargetScheduledState({
          rung: "DAY_1",
          dueOn: scheduledDueOn(input.anchor, { cycleAnchorOn: today } as SimWord, today, "DAY_1"),
        }) : null,
        currentRoute: input.policy === "current" ? { mode: "SCHEDULED", rung: "DAY_1", dueOn: scheduledDueOn(input.anchor, { cycleAnchorOn: today } as SimWord, today, "DAY_1") } : null,
        finalRungReachedOn: null, retiredOn: null,
      };
      words.set(id, word);
      slots -= 1;
      schedule(word);
    }
  };

  for (let day = 0; day < input.durationDays; day += 1) {
    const today = addDays(START_ON, day);
    const newDue = (dueBuckets.get(today) ?? []).filter((entry) => {
      const word = words.get(entry.wordId);
      return word && word.scheduleVersion === entry.version;
    }).sort((left, right) => left.wordId.localeCompare(right.wordId));
    backlog = backlog.filter((entry) => words.get(entry.wordId)?.scheduleVersion === entry.version);
    backlog.push(...newDue);
    const queueAtStart = backlog.length;
    dailyQueues.push(queueAtStart);
    combinedBacklogs.push(queueAtStart + controlledQueue.length);
    if (!isAttending(input.scenario, day, input.durationDays, input.seed)) {
      dailyLoads.push(0);
      continue;
    }
    attendedDays += 1;
    const reviewOnly = queueAtStart > SESSION_CAP;
    if (reviewOnly) reviewOnlyDays += 1;
    const selected = backlog.slice(0, SESSION_CAP);
    backlog = backlog.slice(selected.length);
    for (const entry of selected) {
      const word = words.get(entry.wordId);
      if (word && word.scheduleVersion === entry.version) reviewWord(word, today, day);
    }
    dailyLoads.push(selected.length);
    if (!reviewOnly) performLesson(today);
  }
  backlog = backlog.filter((entry) => words.get(entry.wordId)?.scheduleVersion === entry.version);
  const endOn = addDays(START_ON, input.durationDays - 1);
  const wordList = [...words.values()];
  const trappedOver90Days = wordList.filter((word) => !word.retiredOn && diffDays(word.introducedOn, endOn) > 90).length;
  const trappedOver180Days = wordList.filter((word) => !word.retiredOn && diffDays(word.introducedOn, endOn) > 180).length;
  const mature = wordList.filter((word) => diffDays(word.introducedOn, endOn) >= 120);
  const retired = wordList.filter((word) => word.retiredOn !== null);
  const lastWindow = combinedBacklogs.slice(-14);
  const priorWindow = combinedBacklogs.slice(-28, -14);
  const growth = average(lastWindow) - average(priorWindow);
  const finalCombinedBacklog = backlog.length + controlledQueue.length;
  const runawayBacklog = finalCombinedBacklog > 50 && (growth > 7 || finalCombinedBacklog > 200);
  return {
    ...input,
    observedFailureRate: reviewAttempts === 0 ? 0 : reviewFailures / reviewAttempts,
    wordsIntroduced: words.size,
    reviewAttempts,
    reviewFailures,
    dailyReviewLoadMean: average(dailyLoads),
    queueP50: quantile(dailyQueues, 0.5),
    queueP90: quantile(dailyQueues, 0.9),
    queueP95: quantile(dailyQueues, 0.95),
    queueMax: Math.max(0, ...dailyQueues),
    combinedBacklogMax: Math.max(0, ...combinedBacklogs),
    finalCombinedBacklog,
    reviewOnlyDays,
    attendedDays,
    lessons,
    lessonFrequency: attendedDays === 0 ? 0 : lessons / attendedDays,
    nextDayRecoveries,
    rungRegressions,
    controlledReturns,
    dayOneControlledReturns,
    thirdFailureControlledReturns,
    reteaches,
    finalRungReachedCount: finalRungTimes.length,
    timeToFinalRungP50: finalRungTimes.length ? quantile(finalRungTimes, 0.5) : null,
    timeToFinalRungP90: finalRungTimes.length ? quantile(finalRungTimes, 0.9) : null,
    retiredCount: retired.length,
    retirementRate: words.size === 0 ? 0 : retired.length / words.size,
    matureRetirementRate: mature.length === 0 ? 0 : mature.filter((word) => word.retiredOn !== null).length / mature.length,
    trappedOver90Days,
    trappedOver180Days,
    runawayBacklog,
  };
}

export function runLongHorizonMatrix(): LongHorizonMatrix {
  const runs: LongHorizonRun[] = [];
  for (const durationDays of LONG_HORIZON_DURATIONS) {
    for (const requestedFailureRate of LONG_HORIZON_FAILURE_RATES) {
      for (const profile of LONG_HORIZON_PROFILES) {
        for (const scenario of LONG_HORIZON_SCENARIOS) {
          for (const anchor of LONG_HORIZON_ANCHORS) {
            const seed = hash32(`c2:${durationDays}:${requestedFailureRate}:${profile}:${scenario}:${anchor}`);
            for (const policy of LONG_HORIZON_POLICIES) {
              runs.push(runOne({ durationDays, requestedFailureRate, profile, scenario, anchor, policy, seed }));
            }
          }
        }
      }
    }
  }
  const target = runs.filter((run) => run.policy === "target");
  const current = runs.filter((run) => run.policy === "current");
  const target365 = target.filter((run) => run.durationDays === 365);
  const matureTarget365AtOrBelow20 = target365.filter((run) => run.requestedFailureRate <= 0.2);
  const targetRunawayCount = target.filter((run) => run.runawayBacklog).length;
  const currentRunawayCount = current.filter((run) => run.runawayBacklog).length;
  const maximumTargetControlledReturnRate = Math.max(0, ...target.map((run) =>
    run.reviewAttempts === 0 ? 0 : run.controlledReturns / run.reviewAttempts));
  const maximumObservedFailureRateDeviation = Math.max(0, ...runs.map((run) =>
    Math.abs(run.observedFailureRate - run.requestedFailureRate)));
  const minimumTargetLessonFrequency365 = Math.min(...target365.map((run) => run.lessonFrequency));
  const minimumTargetMatureRetirementRate365AtOrBelow20Percent = Math.min(
    ...matureTarget365AtOrBelow20.map((run) => run.matureRetirementRate),
  );
  const maximumTargetReviewOnlyRate365 = Math.max(...target365.map((run) =>
    run.attendedDays === 0 ? 0 : run.reviewOnlyDays / run.attendedDays));
  const maximumTargetFinalCombinedBacklog365 = Math.max(...target365.map((run) => run.finalCombinedBacklog));
  const reasons: string[] = [];
  if (targetRunawayCount > 0) reasons.push(`target runaway backlog in ${targetRunawayCount} runs`);
  if (maximumObservedFailureRateDeviation > 0.06) reasons.push("effective failure-rate calibration deviated by more than six percentage points");
  if (maximumTargetControlledReturnRate > 0.25) reasons.push("target controlled-return rate exceeded 25% of review attempts");
  if (minimumTargetLessonFrequency365 < 0.2) reasons.push("target lesson frequency fell below 20% of attended days");
  if (minimumTargetMatureRetirementRate365AtOrBelow20Percent < 0.8) reasons.push("target mature-word retirement fell below 80% at <=20% requested failure");
  if (maximumTargetReviewOnlyRate365 > 0.8) reasons.push("target review-only rate exceeded 80% of attended days");
  if (maximumTargetFinalCombinedBacklog365 > 50) reasons.push("target final combined backlog exceeded 50 words");
  return {
    version: LONG_HORIZON_SIMULATION_VERSION,
    runs,
    fingerprint: simulationFingerprint({ version: LONG_HORIZON_SIMULATION_VERSION, runs }),
    gate: {
      passed: reasons.length === 0,
      reasons,
      targetRunawayCount,
      currentRunawayCount,
      maximumTargetControlledReturnRate,
      maximumObservedFailureRateDeviation,
      minimumTargetLessonFrequency365,
      minimumTargetMatureRetirementRate365AtOrBelow20Percent,
      maximumTargetReviewOnlyRate365,
      maximumTargetFinalCombinedBacklog365,
    },
  };
}

export function longHorizonQuantile(values: readonly number[], fraction: number): number {
  return quantile(values, fraction);
}

export function longHorizonAverage(values: readonly number[]): number {
  return average(values);
}
