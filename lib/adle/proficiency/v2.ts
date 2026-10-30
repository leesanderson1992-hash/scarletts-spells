import { createHash } from "node:crypto";

export const PROFICIENCY_V2_VERSION = "ADLE_PROFICIENCY_MODEL_V2_2026_10_23";
export const HOMOPHONE_PROFICIENCY_VERSION = "ADLE_PROFICIENCY_MODEL_V2_HOM_CONTEXT_2026_10_30";

export type ProficiencyEnvironment = "CONTROLLED_LESSON" | "ISOLATED_RETRIEVAL" | "CONTEXTUAL_TRANSFER" | "AUTHENTIC_WRITING";
export type ProficiencyTrend = "improving" | "steady" | "needs_practice" | "insufficient_history";
export type ProficiencyConfidence = "strong" | "developing" | "limited" | "unresolved";

export interface V2Evidence {
  eventId: string;
  wordId: string;
  groupKey: string;
  occurredOn: string;
  polarity: "positive" | "negative";
  environment: ProficiencyEnvironment;
  /** A governed task/word property, never generic word length. */
  challengeKey: string | null;
  sourceKind: string;
}

export interface V2SkillInput {
  learnerId: string;
  skillKey: string;
  familyKey: string;
  asOf: string;
  /** Governed child-appropriate group pool. Observed advanced groups may still contribute. */
  requiredGroupKeys: readonly string[];
  evidence: readonly V2Evidence[];
  unscoredCount: number;
  unresolvedGroupCount: number;
  relationshipFingerprint: string;
  evidenceFingerprint: string;
  groupFingerprint: string;
  homophoneTwoDateSetback?: boolean;
}

export interface V2Gate {
  dimension: "accuracy" | "breadth" | "retention" | "challenge";
  observed: number;
  required: number;
  passed: boolean;
  detail: string;
}

export interface V2Level {
  level: number;
  passed: boolean;
  gates: V2Gate[];
  contentLimited: boolean;
}

export interface V2SkillResult {
  skillKey: string;
  familyKey: string;
  level: number | null;
  status: "calculated" | "ready_to_discover" | "insufficient_evidence" | "content_limited" | "unresolved";
  trend: ProficiencyTrend;
  confidence: ProficiencyConfidence;
  recentSetback?: boolean;
  setbackHeld?: boolean;
  nextRequirement: string;
  levels: V2Level[];
  observed: { accuracyCorrect: number; accuracyTotal: number; groups: number; dates: number; challenges: number; unscored: number };
  sourceEventIds: string[];
  reasonCodes: string[];
  versions: { model: string; inputFingerprint: string };
}

const DAY = 86_400_000;
const ACCURACY = [{ total: 1, correct: 1 }, { total: 4, correct: 3 }, { total: 6, correct: 5 }, { total: 10, correct: 8 }, { total: 12, correct: 10 }] as const;
const RETENTION = [{ dates: 1, span: 0 }, { dates: 2, span: 3 }, { dates: 2, span: 7 }, { dates: 3, span: 21 }, { dates: 4, span: 56 }] as const;
const CHALLENGES = [0, 0, 1, 2, 3] as const;

function dateMs(value: string): number { return Date.parse(`${value}T00:00:00Z`); }
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const milliseconds = dateMs(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value;
}
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function groupTarget(level: number, size: number, closed: boolean): { nominal: number; target: number } {
  const nominal = closed
    ? level === 1 ? 1 : level === 2 ? Math.min(2, size) : size
    : level === 1 ? 1 : level === 2 ? 2 : level === 3
      ? Math.min(6, Math.max(3, Math.ceil(.2 * size)))
      : level === 4 ? Math.min(10, Math.max(4, Math.ceil(.35 * size)))
        : Math.min(16, Math.max(6, Math.ceil(.5 * size)));
  return { nominal, target: Math.min(size, nominal) };
}

type Unit = { key: string; date: string; correct: boolean; environment: ProficiencyEnvironment };

function scoredUnits(events: readonly V2Evidence[]): Unit[] {
  const byGroupDay = new Map<string, Unit>();
  for (const event of events) {
    const key = `${event.groupKey}\u0000${event.occurredOn}`;
    const previous = byGroupDay.get(key);
    byGroupDay.set(key, {
      key, date: event.occurredOn,
      correct: event.polarity === "positive" && (previous?.correct ?? true),
      environment: event.environment,
    });
  }
  // A date boundary can cut the latest-N window. Keep misses in that window
  // before choosing among same-date correct groups.
  return [...byGroupDay.values()].sort((a, b) => a.date.localeCompare(b.date) ||
    Number(b.correct) - Number(a.correct) || a.key.localeCompare(b.key));
}

function evaluated(input: V2SkillInput, events: readonly V2Evidence[]): { levels: V2Level[]; level: number | null; units: Unit[] } {
  const closed = input.familyKey === "D4_HOM";
  const poolSize = new Set(input.requiredGroupKeys).size;
  const units = scoredUnits(events);
  const successfulUnits = new Set(units.filter((unit) => unit.correct).map((unit) => unit.key));
  const positives = events.filter((event) => event.polarity === "positive" &&
    successfulUnits.has(`${event.groupKey}\u0000${event.occurredOn}`));
  const groups = new Set(positives.map((event) => event.groupKey));
  const dates = [...new Set(positives.map((event) => event.occurredOn))].sort();
  const span = dates.length < 2 ? 0 : Math.round((dateMs(dates.at(-1)!) - dateMs(dates[0])) / DAY);
  const challengeUnits = new Set(positives.filter((event) => event.challengeKey)
    .map((event) => `${event.groupKey}\u0000${event.occurredOn}`));
  const challengeKinds = new Set(positives.map((event) => event.challengeKey).filter(Boolean));
  const challengeDates = new Set(positives.filter((event) => event.challengeKey).map((event) => event.occurredOn));
  const levels: V2Level[] = [];
  let priorPassed = true;
  for (let index = 0; index < 5; index += 1) {
    const level = index + 1;
    const accuracy = ACCURACY[index];
    const recent = units.slice(-accuracy.total);
    const correct = recent.filter((unit) => unit.correct).length;
    const breadth = groupTarget(level, poolSize, closed);
    const retention = RETENTION[index];
    const independent = positives.some((event) => event.environment !== "CONTROLLED_LESSON");
    const distinctChallengeKinds = level >= 4 ? CHALLENGES[index] : 0;
    const gates: V2Gate[] = [
      { dimension: "accuracy", observed: correct, required: accuracy.correct,
        passed: recent.length >= accuracy.total && correct >= accuracy.correct,
        detail: `${correct} correct from ${recent.length} of ${accuracy.total} required distinct group/day assessments` },
      { dimension: "breadth", observed: groups.size, required: breadth.target,
        passed: breadth.target > 0 && groups.size >= breadth.target,
        detail: `${groups.size} distinct governed families or roles` },
      { dimension: "retention", observed: dates.length, required: retention.dates,
        passed: dates.length >= retention.dates && span >= retention.span,
        detail: `${dates.length} positive dates spanning ${span} of ${retention.span} required days` },
      { dimension: "challenge", observed: challengeUnits.size, required: CHALLENGES[index],
        passed: (level === 1 || independent) && challengeUnits.size >= CHALLENGES[index] &&
          challengeKinds.size >= distinctChallengeKinds && (level < 5 || challengeDates.size >= 3),
        detail: level === 1 ? "controlled application" : level === 2 ? "independent retrieval" :
          `${challengeUnits.size} relevant transfer assessments across ${challengeKinds.size} contexts` },
    ];
    const passed: boolean = priorPassed && gates.every((gate) => gate.passed);
    levels.push({ level, passed, gates, contentLimited: !closed && poolSize < breadth.nominal });
    priorPassed = passed;
  }
  return { levels, level: levels.filter((row) => row.passed).at(-1)?.level ?? null, units };
}

export function calculateProficiencyV2(input: V2SkillInput): V2SkillResult {
  if (!validDate(input.asOf)) throw new Error("v2_invalid_calculation_date");
  const events = input.evidence.filter((event) => event.occurredOn <= input.asOf && validDate(event.occurredOn))
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.eventId.localeCompare(b.eventId));
  const evaluatedNow = evaluated(input, events);
  const rawLevel = evaluatedNow.level;
  const setbackStart = new Date(dateMs(input.asOf) - 28 * DAY).toISOString().slice(0, 10);
  const recentMissDates = [...new Set(evaluatedNow.units.filter(unit => !unit.correct && unit.date > setbackStart)
    .map(unit => unit.date))].sort();
  const priorToMiss = recentMissDates.length === 1
    ? evaluated(input, events.filter(event => event.occurredOn < recentMissDates[0])).level : null;
  const heldForOneMiss = input.familyKey === "D4_HOM" && input.homophoneTwoDateSetback === true
    && recentMissDates.length === 1 && (priorToMiss ?? 0) > (rawLevel ?? 0);
  const current = heldForOneMiss ? priorToMiss : rawLevel;
  const previousDate = new Date(dateMs(input.asOf) - 28 * DAY).toISOString().slice(0, 10);
  const prior = evaluated(input, events.filter((event) => event.occurredOn <= previousDate));
  const nowWindow = evaluatedNow.units.filter((unit) => unit.date > previousDate);
  const priorWindow = prior.units.filter((unit) => unit.date > new Date(dateMs(previousDate) - 28 * DAY).toISOString().slice(0, 10));
  const nowRate = nowWindow.length ? nowWindow.filter((unit) => unit.correct).length / nowWindow.length : 0;
  const priorRate = priorWindow.length ? priorWindow.filter((unit) => unit.correct).length / priorWindow.length : 0;
  const twoMissDates = new Set(nowWindow.filter((unit) => !unit.correct).map((unit) => unit.date)).size >= 2;
  const comparable = nowWindow.length >= 4 && priorWindow.length >= 4;
  const trend: ProficiencyTrend = current !== null && current > (prior.level ?? 0) ? "improving"
    : comparable && (nowRate - priorRate >= .15) ? "improving"
      : twoMissDates || comparable && (priorRate - nowRate >= .15) ? "needs_practice"
        : comparable ? "steady" : "insufficient_history";
  const successfulUnits = new Set(evaluatedNow.units.filter((unit) => unit.correct).map((unit) => unit.key));
  const positive = events.filter((event) => event.polarity === "positive" &&
    successfulUnits.has(`${event.groupKey}\u0000${event.occurredOn}`));
  const dates = new Set(positive.map((event) => event.occurredOn));
  const environments = new Set(positive.map((event) => event.environment));
  const noPool = input.requiredGroupKeys.length === 0;
  const confidence: ProficiencyConfidence = noPool ? "unresolved"
    : input.unscoredCount > 0 || input.unresolvedGroupCount > 0 ? "limited"
      : current !== null && dates.size >= 3 && environments.size >= 2 ? "strong"
        : current !== null ? "developing" : "limited";
  const next = evaluatedNow.levels.find((row) => !row.passed);
  const firstMissing = next?.gates.find((gate) => !gate.passed);
  const status: V2SkillResult["status"] = noPool ? "unresolved" : current !== null ? "calculated"
    : events.length === 0 ? "ready_to_discover"
      : next?.contentLimited ? "content_limited" : "insufficient_evidence";
  const reasonCodes = [
    ...(noPool ? ["governed_group_pool_unavailable"] : []),
    ...(input.unscoredCount ? ["unscored_or_uncertain_evidence"] : []),
    ...(input.unresolvedGroupCount ? ["group_derivation_incomplete"] : []),
    ...(next?.contentLimited ? ["pool_below_nominal_breadth"] : []),
    ...(heldForOneMiss ? ["single_date_setback_level_held"] : []),
  ];
  const modelVersion = input.familyKey === "D4_HOM" && input.homophoneTwoDateSetback
    ? HOMOPHONE_PROFICIENCY_VERSION : PROFICIENCY_V2_VERSION;
  const inputFingerprint = hash({ model: modelVersion, learnerId: input.learnerId, skillKey: input.skillKey,
    asOf: input.asOf, requiredGroupKeys: [...input.requiredGroupKeys].sort(), events,
    homophoneTwoDateSetback: input.homophoneTwoDateSetback ?? false,
    relationship: input.relationshipFingerprint, evidence: input.evidenceFingerprint, groups: input.groupFingerprint });
  const latestAccuracy = evaluatedNow.units.slice(-12);
  return {
    skillKey: input.skillKey, familyKey: input.familyKey, level: current, status, trend, confidence,
    recentSetback: input.familyKey === "D4_HOM" && input.homophoneTwoDateSetback === true && recentMissDates.length > 0,
    setbackHeld: heldForOneMiss,
    nextRequirement: noPool ? "A reviewed word and skill relationship is needed"
      : heldForOneMiss ? "Show the right choice in a fresh independent context on another day"
      : !next ? "Keep applying this skill in new contexts"
      : firstMissing?.dimension === "accuracy" ? "Practise independently on another day to build reliable accuracy"
        : firstMissing?.dimension === "breadth" ? "Apply this skill in another word family or meaning role"
          : firstMissing?.dimension === "retention" ? "Show the skill again after more time has passed"
            : "Use the skill in a new independent context",
    levels: evaluatedNow.levels,
    observed: { accuracyCorrect: latestAccuracy.filter((unit) => unit.correct).length,
      accuracyTotal: latestAccuracy.length, groups: new Set(positive.map((event) => event.groupKey)).size,
      dates: dates.size, challenges: new Set(positive.filter((event) => event.challengeKey)
        .map((event) => `${event.groupKey}\u0000${event.occurredOn}`)).size, unscored: input.unscoredCount },
    sourceEventIds: [...new Set(events.map((event) => event.eventId))].sort(), reasonCodes,
    versions: { model: modelVersion, inputFingerprint },
  };
}
