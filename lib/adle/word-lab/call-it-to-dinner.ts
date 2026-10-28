export const DINNER_ROUND_VERSION = "call_it_to_dinner_round_v1" as const;
import { isWeakVowelAudioSource } from "../weak-vowel/audio-source";
export const DINNER_ACTIVITY_VERSION = "call_it_to_dinner_activity_v1" as const;

export interface DinnerRoundV1 {
  schemaVersion: typeof DINNER_ROUND_VERSION;
  contentVersion: string;
  reviewStatus: "approved" | "candidate";
  canonicalWordId: string;
  spelling: string;
  microSkillKey: string;
  wordSense: string | null;
  pronunciationId: string;
  sourceFingerprint: string;
  recording: { src: string; sha256: string; reviewStatus: "approved" };
  spokenSyllableCount: number;
  /** Each inner array is one fully reviewed set of letter-gap indexes. */
  acceptedCutSets: readonly (readonly number[])[];
  target: {
    start: number;
    end: number;
    text: string;
    syllableIndex: number;
    soundType: "schwa" | "other_unstressed" | "unclassified_weak_vowel";
  };
  /** Activity answer for newly published rounds; absent in older frozen snapshots. */
  selectionTarget?: { start: number; end: number; text: string };
}

export interface DinnerActivityConfigV1 {
  schemaVersion: typeof DINNER_ACTIVITY_VERSION;
  rounds: readonly DinnerRoundV1[];
}

export type DinnerCutResult = "correct" | "wrong_count" | "wrong_boundaries";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cutsValidForTarget(cuts: readonly number[], round: DinnerRoundV1): boolean {
  if (cuts.length !== round.spokenSyllableCount - 1 || cuts.some((cut, i) =>
    !Number.isInteger(cut) || cut <= 0 || cut >= round.spelling.length || (i > 0 && cut <= cuts[i - 1]))) return false;
  const boundaries = [0, ...cuts, round.spelling.length];
  const start = boundaries[round.target.syllableIndex - 1];
  const end = boundaries[round.target.syllableIndex];
  return start <= round.target.start && round.target.end <= end;
}

function finalVowel(round: DinnerRoundV1): { vowel: "a" | "e" | "o"; ending: "ar" | "er" | "et" | "or" } | null {
  return round.microSkillKey === "D4_SCHWA_FINAL_ER_FINAL" ? { vowel: "e", ending: "er" } :
    round.microSkillKey === "D4_SCHWA_FINAL_ET" ? { vowel: "e", ending: "et" } :
    round.microSkillKey === "D4_SCHWA_FINAL_OR_FINAL" ? { vowel: "o", ending: "or" } :
      round.microSkillKey === "D4_SCHWA_FINAL_AR_FINAL" ? { vowel: "a", ending: "ar" } : null;
}

/** Derive a one-letter answer only from a reviewed final two-letter target span. */
export function reviewedDinnerFinalVowelSelection(round: DinnerRoundV1): { start: number; end: number; text: string } | null {
  const final = finalVowel(round);
  if (!final || round.target.text.toLocaleLowerCase("en-GB") !== final.ending ||
    round.target.start !== round.spelling.length - 2 || round.target.end !== round.spelling.length ||
    round.spelling.slice(-2).toLocaleLowerCase("en-GB") !== final.ending) return null;
  return { start: round.target.start, end: round.target.start + 1, text: round.spelling[round.target.start] };
}

export function dinnerAnswerTarget(round: DinnerRoundV1) {
  return round.selectionTarget ?? round.target;
}

/** Parse only the reviewed spelling and sound contract; never infer a span from a schwa flag. */
export function parseDinnerRound(value: unknown, allowCandidate = false): DinnerRoundV1 | null {
  if (!record(value) || value.schemaVersion !== DINNER_ROUND_VERSION ||
    !text(value.contentVersion) || !text(value.canonicalWordId) || !text(value.spelling) ||
    !text(value.microSkillKey) || !(value.wordSense === null || text(value.wordSense)) ||
    !text(value.pronunciationId) || !sha(value.sourceFingerprint) ||
    !(value.reviewStatus === "approved" || allowCandidate && value.reviewStatus === "candidate") ||
    !record(value.recording) || !isWeakVowelAudioSource(value.recording.src) ||
    !sha(value.recording.sha256) || value.recording.reviewStatus !== "approved" ||
    !Number.isInteger(value.spokenSyllableCount) || (value.spokenSyllableCount as number) < 1 ||
    !Array.isArray(value.acceptedCutSets) || value.acceptedCutSets.length < 1 ||
    !record(value.target) || !Number.isInteger(value.target.start) || !Number.isInteger(value.target.end) ||
    !text(value.target.text) || !Number.isInteger(value.target.syllableIndex) ||
    !(value.target.soundType === "schwa" || value.target.soundType === "other_unstressed" ||
      allowCandidate && value.target.soundType === "unclassified_weak_vowel")) return null;
  const round = value as unknown as DinnerRoundV1;
  if (!allowCandidate && round.pronunciationId.startsWith("candidate-")) return null;
  if (round.target.start < 0 || round.target.end > round.spelling.length ||
    round.target.start >= round.target.end ||
    round.spelling.slice(round.target.start, round.target.end) !== round.target.text ||
    round.target.syllableIndex < 1 || round.target.syllableIndex > round.spokenSyllableCount ||
    !round.acceptedCutSets.every((cuts) => Array.isArray(cuts) && cutsValidForTarget(cuts, round))) return null;
  if (round.selectionTarget !== undefined) {
    const selected = round.selectionTarget;
    const expected = reviewedDinnerFinalVowelSelection(round);
    if (!record(selected) || !Number.isInteger(selected.start) || !Number.isInteger(selected.end) ||
      !text(selected.text) || !expected || selected.start !== expected.start ||
      selected.end !== expected.end || selected.text !== expected.text) return null;
  }
  return round;
}

export function parseDinnerActivityConfig(value: unknown, allowCandidate = false): DinnerActivityConfigV1 | null {
  if (!record(value) || value.schemaVersion !== DINNER_ACTIVITY_VERSION ||
    !Array.isArray(value.rounds) || value.rounds.length < 1) return null;
  const rounds = value.rounds.map((round) => parseDinnerRound(round, allowCandidate));
  if (rounds.some((round) => !round)) return null;
  // One chosen pronunciation per word in this assignment; releases may hold several variants.
  const keys = rounds.map((round) => round!.canonicalWordId);
  if (new Set(keys).size !== keys.length) return null;
  return { schemaVersion: DINNER_ACTIVITY_VERSION, rounds: rounds as DinnerRoundV1[] };
}

export function scoreDinnerCuts(round: DinnerRoundV1, cuts: readonly number[]): DinnerCutResult {
  const sorted = [...new Set(cuts)].sort((a, b) => a - b);
  if (cuts.length !== sorted.length || sorted.some((cut) => !Number.isInteger(cut) || cut <= 0 || cut >= round.spelling.length) ||
    sorted.length !== round.spokenSyllableCount - 1) return "wrong_count";
  return round.acceptedCutSets.some((accepted) => accepted.length === sorted.length &&
    accepted.every((cut, index) => cut === sorted[index])) ? "correct" : "wrong_boundaries";
}

/** A child may make the reviewed cuts in any order. Reject a wrong gap immediately. */
export function isDinnerCutPrefix(round: DinnerRoundV1, cuts: readonly number[]): boolean {
  const selected = [...new Set(cuts)].sort((a, b) => a - b);
  return selected.length === cuts.length && round.acceptedCutSets.some((accepted) =>
    selected.length <= accepted.length && selected.every((cut) => accepted.includes(cut)));
}

export function scoreDinnerTarget(round: DinnerRoundV1, start: number | null, end: number | null): boolean {
  const target = dinnerAnswerTarget(round);
  return start === target.start && end === target.end;
}

export interface DinnerSelectionWord {
  canonicalWordId: string;
  spelling: string;
  microSkillKey: string;
  wordSense: string | null;
  assignmentStatus: string;
  sourceFingerprint: string;
  pronunciationId: string;
  recordingSha256: string;
}

/** The caller supplies current governed assignments and published rows, not a coded word list. */
export function resolveDinnerForSelectedWords(
  selected: readonly DinnerSelectionWord[],
  published: readonly unknown[],
): { ready: DinnerRoundV1[]; blockers: { canonicalWordId: string; reason: string }[] } {
  const ready: DinnerRoundV1[] = [];
  const blockers: { canonicalWordId: string; reason: string }[] = [];
  for (const word of selected) {
    if (word.assignmentStatus !== "assigned") {
      blockers.push({ canonicalWordId: word.canonicalWordId, reason: "not_assigned" });
      continue;
    }
    const matches = published.map((value) => parseDinnerRound(value)).filter((round): round is DinnerRoundV1 => !!round)
      .filter((round) => round.canonicalWordId === word.canonicalWordId && round.microSkillKey === word.microSkillKey && round.pronunciationId === word.pronunciationId);
    if (matches.length !== 1) {
      blockers.push({ canonicalWordId: word.canonicalWordId, reason: matches.length ? "ambiguous_dinner_content" : "dinner_content_not_approved" });
      continue;
    }
    const round = matches[0];
    if (finalVowel(round) && !round.selectionTarget) {
      blockers.push({ canonicalWordId: word.canonicalWordId, reason: "dinner_vowel_selection_not_published" });
      continue;
    }
    if (round.spelling !== word.spelling || round.wordSense !== word.wordSense ||
      round.sourceFingerprint !== word.sourceFingerprint || round.recording.sha256 !== word.recordingSha256) {
      blockers.push({ canonicalWordId: word.canonicalWordId, reason: "dinner_source_changed" });
      continue;
    }
    ready.push(round);
  }
  return { ready, blockers };
}
