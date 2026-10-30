import { createHash } from "node:crypto";
import { reconstructOccurrenceContext } from "@/lib/writing-engine/whole-writing/context-source";
import { sentenceContext } from "@/lib/writing-engine/whole-writing/sentence-context";
import type { SourceSnapshot } from "@/lib/writing-engine/whole-writing/source";
import type { V2Evidence } from "./v2";
import { normalizeContextWord } from "./homophone-context";

type Word = { id: string; normalised_word: string };
type Member = { micro_skill_key: string; member_normalized: string };
type Pair = { micro_skill_key: string; member_a: string; member_b: string };
type Snapshot = { id: string; occurred_at: string; envelope: Record<string, unknown> };
type Occurrence = { id: string; snapshot_id: string; observed_text: string; provenance: string; field_hash: string;
  field_path: string; start_utf16: number; end_utf16: number };
type Credit = { id: string; review_id: string; snapshot_id: string; canonical_word_id: string | null;
  occurrence_ids: string[]; observed_word: string; supplied_spelling: boolean };
type Review = { id: string; parent_action: string; snapshot_id: string | null };
type Decision = { id: string; occurrence_id: string; classification: string; intended_member: string | null;
  supersedes_decision_id: string | null };
type AddedCase = { id: string; occurrence_id: string; intended_member: string };
type CaseReview = { id: string; parent_added_case_id: string; case_status: string };
type CaseLink = { catalog_case_id: string; micro_skill_key: string };

/** Reviewed exact writing occurrences only. A generic word match never certifies contextual choice. */
export function homophoneWritingEvidence(input: { words: readonly Word[]; members: readonly Member[];
  pairs: readonly Pair[]; snapshots: readonly Snapshot[]; occurrences: readonly Occurrence[];
  credits: readonly Credit[]; reviews: readonly Review[]; decisions: readonly Decision[];
  addedCases: readonly AddedCase[]; caseReviews: readonly CaseReview[]; caseLinks: readonly CaseLink[];
}): Map<string, V2Evidence[]> {
  const result = new Map<string, V2Evidence[]>();
  const words = new Map(input.words.map(row => [row.id, normalizeContextWord(row.normalised_word)]));
  const wordIds = new Map(input.words.map(row => [normalizeContextWord(row.normalised_word), row.id]));
  const membership = new Map<string, Set<string>>();
  for (const row of input.members) {
    const set = membership.get(row.micro_skill_key) ?? new Set<string>();
    set.add(normalizeContextWord(row.member_normalized)); membership.set(row.micro_skill_key, set);
  }
  const pairs = new Set(input.pairs.flatMap(row => [
    `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_a)}\u0000${normalizeContextWord(row.member_b)}`,
    `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_b)}\u0000${normalizeContextWord(row.member_a)}`]));
  const snapshots = new Map(input.snapshots.map(row => [row.id, row]));
  const occurrences = new Map(input.occurrences.filter(row => row.provenance === "learner_response").map(row => [row.id, row]));
  const superseded = new Set(input.decisions.map(row => row.supersedes_decision_id).filter(Boolean));
  const decisions = new Map(input.decisions.filter(row => !superseded.has(row.id)).map(row => [row.occurrence_id, row]));
  const approvedReviews = new Map(input.reviews.filter(row => row.parent_action === "approved").map(row => [row.id, row]));
  const seenPositive = new Set<string>();
  const seenNegative = new Set<string>();
  const emit = (skill: string, event: V2Evidence) => result.set(skill, [...(result.get(skill) ?? []), event]);
  const onDate = (snapshotId: string) => {
    const stamp = snapshots.get(snapshotId)?.occurred_at;
    return stamp && /^\d{4}-\d{2}-\d{2}/.test(stamp) ? stamp.slice(0, 10) : null;
  };
  const contextKey = (occurrence: Occurrence) => {
    const snapshot = snapshots.get(occurrence.snapshot_id);
    if (!snapshot) return null;
    const context = reconstructOccurrenceContext({ snapshot: snapshot as SourceSnapshot,
      fieldPath: occurrence.field_path, fieldHash: occurrence.field_hash,
      startUtf16: occurrence.start_utf16, endUtf16: occurrence.end_utf16,
      observedText: occurrence.observed_text });
    if (context.status !== "ready") return null;
    const sentence = sentenceContext(context.fieldText, occurrence.start_utf16, occurrence.end_utf16)?.text;
    if (!sentence) return null;
    return `context:sentence:${createHash("sha256").update(sentence.toLocaleLowerCase("en-GB").replace(/\s+/g, " ")).digest("hex")}`;
  };
  for (const credit of input.credits) {
    const review = approvedReviews.get(credit.review_id);
    const expected = credit.canonical_word_id && words.get(credit.canonical_word_id);
    if (!review || review.snapshot_id !== credit.snapshot_id || credit.supplied_spelling
      || !expected || expected !== normalizeContextWord(credit.observed_word)) continue;
    const occurredOn = onDate(credit.snapshot_id);
    if (!occurredOn) continue;
    for (const occurrenceId of credit.occurrence_ids) {
      const occurrence = occurrences.get(occurrenceId);
      if (!occurrence || occurrence.snapshot_id !== credit.snapshot_id
        || normalizeContextWord(occurrence.observed_text) !== expected
        || decisions.get(occurrenceId)?.classification === "INVALID" || seenPositive.has(occurrenceId)) continue;
      seenPositive.add(occurrenceId);
      for (const [skill, members] of membership) if (members.has(expected)) emit(skill, {
        eventId: `homophone-writing:${occurrenceId}`, wordId: credit.canonical_word_id!,
        groupKey: `role:${expected}`, occurredOn, polarity: "positive", environment: "AUTHENTIC_WRITING",
        challengeKey: contextKey(occurrence),
        sourceKind: "approved_authentic_use_occurrence" });
    }
  }
  const negative = (sourceId: string, occurrenceId: string, intendedValue: string, skill: string) => {
    if (seenNegative.has(`${occurrenceId}\u0000${skill}`)) return;
    const occurrence = occurrences.get(occurrenceId);
    const intended = normalizeContextWord(intendedValue);
    const observed = occurrence && normalizeContextWord(occurrence.observed_text);
    const wordId = wordIds.get(intended);
    const occurredOn = occurrence && onDate(occurrence.snapshot_id);
    if (!observed || !wordId || !occurredOn || !membership.get(skill)?.has(intended)
      || !pairs.has(`${skill}\u0000${observed}\u0000${intended}`)) return;
    seenNegative.add(`${occurrenceId}\u0000${skill}`);
    emit(skill, { eventId: sourceId, wordId, groupKey: `role:${intended}`, occurredOn,
      polarity: "negative", environment: "AUTHENTIC_WRITING", challengeKey: null,
      sourceKind: "parent_confirmed_contextual_correction" });
  };
  for (const decision of decisions.values()) if (decision.classification === "INVALID" && decision.intended_member)
    for (const skill of membership.keys()) negative(`homophone-decision:${decision.id}`,
      decision.occurrence_id, decision.intended_member, skill);
  const added = new Map(input.addedCases.map(row => [row.id, row]));
  const reviewed = new Map(input.caseReviews.filter(row => row.case_status === "reviewed").map(row => [row.id, row]));
  for (const link of input.caseLinks) {
    const review = reviewed.get(link.catalog_case_id);
    const found = review && added.get(review.parent_added_case_id);
    if (found) negative(`homophone-added-case:${found.id}`, found.occurrence_id, found.intended_member, link.micro_skill_key);
  }
  return result;
}
