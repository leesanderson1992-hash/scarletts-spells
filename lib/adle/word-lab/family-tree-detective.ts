export const DETECTIVE_ROUND_VERSION = "family_tree_detective_round_v1" as const;
export const DETECTIVE_ACTIVITY_VERSION = "family_tree_detective_activity_v1" as const;

export type VowelTile = "A" | "E" | "I" | "O" | "U";
export type DetectiveClue = "clearer_sound" | "meaningful_part" | "same_spelling" | "no_helpful_clue";

export interface DetectiveRecordingV1 {
  src: string;
  sha256: string;
  reviewStatus: "approved";
}

export interface DetectiveFamilyMemberV1 {
  canonicalWordId: string;
  spelling: string;
  recording: DetectiveRecordingV1 | null;
  /** Only an existing reviewed morphology fact may populate this. */
  morphologyNote: string | null;
  /** Optional reviewed spelling alignment; never derived from character matching. */
  alignedVowelSpan: { start: number; end: number } | null;
}

export interface DetectiveFamilyV1 {
  authorityId: string;
  sourceFingerprint: string;
  reviewStatus: "approved" | "candidate";
  /** Older snapshots omit this and retain their existing family-tree presentation. */
  relationKind?: "base_to_derived";
  name: string;
  members: readonly DetectiveFamilyMemberV1[];
  /** Reviewed spelling or morphology explanation; no inferred sound-change claim. */
  explanation: string | null;
}

export interface DetectiveRoundV1 {
  schemaVersion: typeof DETECTIVE_ROUND_VERSION;
  contentVersion: string;
  reviewStatus: "approved" | "candidate";
  canonicalWordId: string;
  spelling: string;
  microSkillKey: string;
  wordSense: string | null;
  pronunciationId: string;
  sourceFingerprint: string;
  recording: DetectiveRecordingV1;
  target: { start: number; end: number; text: string; soundType: "schwa" | "other_unstressed" };
  /** Required only where the reviewed full target has more than one vowel letter. */
  reviewedVowelIndex: number | null;
  family: DetectiveFamilyV1 | null;
}

export interface DetectiveActivityConfigV1 {
  schemaVersion: typeof DETECTIVE_ACTIVITY_VERSION;
  rounds: readonly DetectiveRoundV1[];
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const SHA = /^[a-f0-9]{64}$/;
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function validRecording(value: unknown): value is DetectiveRecordingV1 {
  return record(value) && nonEmpty(value.src) && value.src.startsWith("/audio/") &&
    typeof value.sha256 === "string" && SHA.test(value.sha256) && value.reviewStatus === "approved";
}

/** A schwa flag or the first matching character is never sufficient to locate the gap. */
export function missingVowelIndex(round: Pick<DetectiveRoundV1, "spelling" | "target" | "reviewedVowelIndex">): number | null {
  const { start, end, text } = round.target;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end ||
    end > round.spelling.length || round.spelling.slice(start, end) !== text) return null;
  const candidates = Array.from({ length: end - start }, (_, offset) => start + offset)
    .filter((index) => VOWELS.has(round.spelling[index].toUpperCase()));
  if (round.reviewedVowelIndex !== null) {
    return Number.isInteger(round.reviewedVowelIndex) && candidates.includes(round.reviewedVowelIndex)
      ? round.reviewedVowelIndex : null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function maskedDetectiveWord(round: DetectiveRoundV1): string | null {
  const index = missingVowelIndex(round);
  return index === null ? null : `${round.spelling.slice(0, index)}_${round.spelling.slice(index + 1)}`;
}

export function correctVowelTile(round: DetectiveRoundV1): VowelTile | null {
  const index = missingVowelIndex(round);
  return index === null ? null : round.spelling[index].toUpperCase() as VowelTile;
}

export function toggleDetectiveClue(existing: readonly DetectiveClue[], clue: DetectiveClue): DetectiveClue[] {
  if (clue === "no_helpful_clue") return existing.includes(clue) ? [] : [clue];
  return existing.includes(clue)
    ? existing.filter((item) => item !== clue)
    : [...existing.filter((item) => item !== "no_helpful_clue"), clue];
}

export function parseDetectiveRound(value: unknown, allowCandidate = false): DetectiveRoundV1 | null {
  if (!record(value) || value.schemaVersion !== DETECTIVE_ROUND_VERSION ||
    !nonEmpty(value.contentVersion) || !nonEmpty(value.canonicalWordId) || !nonEmpty(value.spelling) ||
    !nonEmpty(value.microSkillKey) || !(value.wordSense === null || nonEmpty(value.wordSense)) ||
    !nonEmpty(value.pronunciationId) || typeof value.sourceFingerprint !== "string" || !SHA.test(value.sourceFingerprint) ||
    !(value.reviewStatus === "approved" || allowCandidate && value.reviewStatus === "candidate") ||
    !validRecording(value.recording) || !record(value.target) ||
    !(value.target.soundType === "schwa" || value.target.soundType === "other_unstressed") ||
    !(value.reviewedVowelIndex === null || Number.isInteger(value.reviewedVowelIndex))) return null;
  const round = value as unknown as DetectiveRoundV1;
  if (!allowCandidate && round.pronunciationId.startsWith("candidate-")) return null;
  if (missingVowelIndex(round) === null) return null;
  if (round.family === null) return round;
  const family = round.family;
  if (!record(family) || !nonEmpty(family.authorityId) ||
    !SHA.test(family.sourceFingerprint) ||
    !(family.relationKind === undefined || family.relationKind === "base_to_derived") ||
    !(family.reviewStatus === "approved" || allowCandidate && family.reviewStatus === "candidate") ||
    !nonEmpty(family.name) || !Array.isArray(family.members) || family.members.length < 2 ||
    !(family.explanation === null || nonEmpty(family.explanation))) return null;
  const memberIds = new Set<string>();
  for (const member of family.members) {
    if (!record(member) || !nonEmpty(member.canonicalWordId) || !nonEmpty(member.spelling) ||
      memberIds.has(member.canonicalWordId) ||
      !(member.recording === null || validRecording(member.recording)) ||
      !(member.morphologyNote === null || nonEmpty(member.morphologyNote)) ||
      !(member.alignedVowelSpan === null || record(member.alignedVowelSpan) &&
        Number.isInteger(member.alignedVowelSpan.start) && Number.isInteger(member.alignedVowelSpan.end) &&
        (member.alignedVowelSpan.start as number) >= 0 &&
        (member.alignedVowelSpan.end as number) > (member.alignedVowelSpan.start as number) &&
        (member.alignedVowelSpan.end as number) <= member.spelling.length)) return null;
    memberIds.add(member.canonicalWordId);
  }
  if (!memberIds.has(round.canonicalWordId) ||
    family.members.find((member) => member.canonicalWordId === round.canonicalWordId)?.spelling !== round.spelling) return null;
  return round;
}

export function parseDetectiveActivityConfig(value: unknown, allowCandidate = false): DetectiveActivityConfigV1 | null {
  if (!record(value) || value.schemaVersion !== DETECTIVE_ACTIVITY_VERSION ||
    !Array.isArray(value.rounds) || value.rounds.length < 1) return null;
  const rounds = value.rounds.map((round) => parseDetectiveRound(round, allowCandidate));
  if (rounds.some((round) => !round)) return null;
  if (new Set(rounds.map((round) => round!.canonicalWordId)).size !== rounds.length) return null;
  return { schemaVersion: DETECTIVE_ACTIVITY_VERSION, rounds: rounds as DetectiveRoundV1[] };
}

export interface DetectiveSelectionWord {
  canonicalWordId: string;
  spelling: string;
  microSkillKey: string;
  wordSense: string | null;
  assignmentStatus: string;
  pronunciationId: string;
  sourceFingerprint: string;
  recordingSha256: string;
}

export interface CurrentDetectiveFamilyAuthority {
  authorityId: string;
  sourceFingerprint: string;
  memberWordIds: readonly string[];
}

/** Demand stays selected when its content is incomplete; the caller reports these blockers. */
export function resolveDetectiveForSelectedWords(
  selected: readonly DetectiveSelectionWord[],
  published: readonly unknown[],
  currentFamilies: readonly CurrentDetectiveFamilyAuthority[],
) {
  const ready: DetectiveRoundV1[] = [];
  const blockers: { canonicalWordId: string; reason: string }[] = [];
  for (const word of selected) {
    if (word.assignmentStatus !== "assigned") { blockers.push({ canonicalWordId: word.canonicalWordId, reason: "not_assigned" }); continue; }
    const matches = published.map((value) => parseDetectiveRound(value)).filter((round): round is DetectiveRoundV1 => !!round)
      .filter((round) => round.canonicalWordId === word.canonicalWordId && round.microSkillKey === word.microSkillKey && round.pronunciationId === word.pronunciationId);
    if (matches.length !== 1) { blockers.push({ canonicalWordId: word.canonicalWordId, reason: matches.length ? "ambiguous_detective_content" : "detective_content_not_approved" }); continue; }
    const round = matches[0];
    if (round.spelling !== word.spelling || round.wordSense !== word.wordSense || round.sourceFingerprint !== word.sourceFingerprint ||
      round.recording.sha256 !== word.recordingSha256) { blockers.push({ canonicalWordId: word.canonicalWordId, reason: "detective_source_changed" }); continue; }
    if (round.family) {
      const current = currentFamilies.filter((family) => family.authorityId === round.family!.authorityId &&
        family.sourceFingerprint === round.family!.sourceFingerprint &&
        round.family!.members.every((member) => family.memberWordIds.includes(member.canonicalWordId)));
      // A withdrawn or changed family does not erase a reviewed missing-vowel target.
      ready.push(current.length === 1 ? round : { ...round, family: null });
    } else ready.push(round);
  }
  return { ready, blockers };
}
