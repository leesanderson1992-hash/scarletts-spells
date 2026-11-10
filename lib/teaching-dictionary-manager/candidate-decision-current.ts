import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { LESSON_CANDIDATE_RULE_REVISION } from "./lesson-candidate";
import type { DictionarySenseSet } from "./senses";

export type CandidateDecisionEvent = {
  action: string;
  sense_id: string;
  pronunciation_id: string | null;
  rule_revision: string;
  fact_snapshot: unknown;
};

/** A released word-skill pair does not keep its sense approval when the
 * reviewed Overview revision, family links or rule has changed. */
export function candidateDecisionIsCurrent(input: {
  event: CandidateDecisionEvent | null;
  senseId: string;
  senseSet: DictionarySenseSet | null;
  morphologyId: string | null;
  familyLinkIds: readonly string[];
}): boolean {
  const { event, senseId, senseSet, morphologyId } = input;
  if (!event || event.action !== "approve" || event.rule_revision !== LESSON_CANDIDATE_RULE_REVISION
    || event.sense_id !== senseId || !senseSet || !morphologyId) return false;
  const snapshot = event.fact_snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const facts = snapshot as Record<string, unknown>;
  if (facts.senseId !== senseId || facts.morphologyId !== morphologyId
    || !facts.senseSet || typeof facts.senseSet !== "object" || Array.isArray(facts.senseSet)
    || !Array.isArray(facts.familyLinkIds) || facts.familyLinkIds.some(id => typeof id !== "string"))
    return false;
  const approvedSet = facts.senseSet as DictionarySenseSet;
  if (!Array.isArray(approvedSet.senses) || !Array.isArray(approvedSet.pronunciations)) return false;
  const sense = senseSet.senses.find(item => item.id === senseId);
  const approvedSense = approvedSet.senses.find(item => item.id === senseId);
  if (!sense || !approvedSense || event.pronunciation_id !== sense.pronunciationId) return false;
  const pronunciation = senseSet.pronunciations.find(item => item.id === sense.pronunciationId) ?? null;
  const approvedPronunciation = approvedSet.pronunciations.find(item => item.id === approvedSense.pronunciationId) ?? null;
  const currentLinks = [...input.familyLinkIds].sort();
  const approvedLinks = [...facts.familyLinkIds].sort();
  return fingerprintSnapshotValue(approvedSense) === fingerprintSnapshotValue(sense)
    && fingerprintSnapshotValue(approvedPronunciation) === fingerprintSnapshotValue(pronunciation)
    && fingerprintSnapshotValue(approvedLinks) === fingerprintSnapshotValue(currentLinks);
}
