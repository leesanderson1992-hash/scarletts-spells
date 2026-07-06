/**
 * ADLE Slice 3 (3C): reformed word-level learning items — pure, fact-fed
 * derivations and intake transitions over adle_learning_items facts.
 *
 * Policy sources: blueprint "Learning items are word-level" (one record per
 * child + word + primary micro-skill; clusters computed at composition time,
 * never stored) and the Slice 3 plan's intake paths (verified misspellings,
 * probe misses, scheduler ejections; stretch selections extend the enum so
 * every generated assignment item traces to an item — flagged for owner QA).
 *
 * Intake functions return complete facts with deterministic ids derived from
 * their source refs, so composition and fixtures stay byte-deterministic;
 * the storage layer may substitute uuids at persistence time (3E).
 */

import type { IsoDate, SchedulerRowStatus } from "./review-scheduler";

export type LearningItemStatus =
  | "pending"
  | "in_lesson"
  | "awaiting_review_outcome"
  | "resolved"
  | "pending_reteach"
  | "paused_parent_review";

export type LearningItemSourceKind =
  | "verified_misspelling"
  | "probe_miss"
  | "review_ejection"
  | "slippage_reentry"
  | "stretch_selection";

export interface LearningItemFact {
  learningItemId: string;
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  itemStatus: LearningItemStatus;
  sourceKind: LearningItemSourceKind;
  sourceRef: string;
  /** Raw child attempt for intake rows (owner decision 6, 2026-07-05).
   * Storage only — never read, priced, or analysed in this slice. */
  sourceAttemptText: string | null;
  reteachPriority: boolean;
  ejectedOn: IsoDate | null;
  intakeOn: IsoDate;
  rowStatus: SchedulerRowStatus;
}

/** Statuses that make an item "real and unresolved" for the selectability
 * gate and the 5-word fill (blueprint: >=2 real unresolved learning items).
 * awaiting_review_outcome words are in the scheduler's hands; paused words
 * are the parent's (skip reason word_pending_parent_review). */
export const SELECTABLE_ITEM_STATUSES: readonly LearningItemStatus[] = [
  "pending",
  "pending_reteach",
];

function isSelectable(item: LearningItemFact): boolean {
  return item.rowStatus === "active" && SELECTABLE_ITEM_STATUSES.includes(item.itemStatus);
}

export function compareOldestItemFirst(a: LearningItemFact, b: LearningItemFact): number {
  if (a.intakeOn !== b.intakeOn) {
    return a.intakeOn < b.intakeOn ? -1 : 1;
  }
  return a.learningItemId < b.learningItemId ? -1 : a.learningItemId > b.learningItemId ? 1 : 0;
}

export function selectableLearningItems(
  items: readonly LearningItemFact[],
): LearningItemFact[] {
  return items.filter(isSelectable).sort(compareOldestItemFirst);
}

/** Clusters are computed at call time from unresolved items sharing a
 * micro-skill (blueprint rule: clusters are not stored aggregates). Each
 * cluster is oldest-first. */
export function clustersBySkill(
  items: readonly LearningItemFact[],
): Map<string, LearningItemFact[]> {
  const clusters = new Map<string, LearningItemFact[]>();
  for (const item of selectableLearningItems(items)) {
    const cluster = clusters.get(item.microSkillKey);
    if (cluster) {
      cluster.push(item);
    } else {
      clusters.set(item.microSkillKey, [item]);
    }
  }
  return clusters;
}

/** Reteach demand per skill: the oldest ejection date among the skill's
 * selectable reteach-priority items (blueprint: reteach lessons always
 * outrank new clusters; oldest ejection first). */
export function reteachDemandBySkill(
  items: readonly LearningItemFact[],
): Map<string, IsoDate> {
  const demand = new Map<string, IsoDate>();
  for (const item of selectableLearningItems(items)) {
    if (!item.reteachPriority || item.itemStatus !== "pending_reteach" || item.ejectedOn === null) {
      continue;
    }
    const current = demand.get(item.microSkillKey);
    if (current === undefined || item.ejectedOn < current) {
      demand.set(item.microSkillKey, item.ejectedOn);
    }
  }
  return demand;
}

function deterministicItemId(sourceKind: LearningItemSourceKind, sourceRef: string, canonicalWordId: string, microSkillKey: string): string {
  return `li:${sourceKind}:${sourceRef}:${canonicalWordId}:${microSkillKey}`;
}

export interface ProbeMissIntakeParams {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  attemptText: string;
  probeSourceRef: string;
  missedOn: IsoDate;
}

/** Cold probe misses become learning items (blueprint probe rules). */
export function learningItemFromProbeMiss(params: ProbeMissIntakeParams): LearningItemFact {
  return {
    learningItemId: deterministicItemId("probe_miss", params.probeSourceRef, params.canonicalWordId, params.microSkillKey),
    childId: params.childId,
    canonicalWordId: params.canonicalWordId,
    microSkillKey: params.microSkillKey,
    itemStatus: "pending",
    sourceKind: "probe_miss",
    sourceRef: params.probeSourceRef,
    sourceAttemptText: params.attemptText,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: params.missedOn,
    rowStatus: "active",
  };
}

export interface EjectionIntakeParams {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  /** From the Slice 2 reteach_priority_flagged / ejected outcome events. */
  ejectedOn: IsoDate;
  ejectionSourceRef: string;
  attemptText: string | null;
}

/** A word ejected from catch-up re-enters as a pending-reteach item with
 * reteach priority. The reteach cycle count is not incremented here — it
 * lives on the Slice 2 schedule word at re-entry (onLessonCompleted passes
 * the incremented count to createReviewBundle). */
export function learningItemFromEjection(params: EjectionIntakeParams): LearningItemFact {
  return {
    learningItemId: deterministicItemId("review_ejection", params.ejectionSourceRef, params.canonicalWordId, params.microSkillKey),
    childId: params.childId,
    canonicalWordId: params.canonicalWordId,
    microSkillKey: params.microSkillKey,
    itemStatus: "pending_reteach",
    sourceKind: "review_ejection",
    sourceRef: params.ejectionSourceRef,
    sourceAttemptText: params.attemptText,
    reteachPriority: true,
    ejectedOn: params.ejectedOn,
    intakeOn: params.ejectedOn,
    rowStatus: "active",
  };
}

export interface SlippageIntakeParams {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  slippedOn: IsoDate;
  slipSourceRef: string;
  attemptText: string | null;
}

/** Slice 4: the third slip of a secure/retired/mastered word rejoins the
 * next lesson for its micro-skill as a priority item (blueprint deductions,
 * limit 2). The composer's existing reteach-demand tier consumes this
 * unchanged; ejectedOn carries the slip date so reteach ordering works. */
export function learningItemFromSlippage(params: SlippageIntakeParams): LearningItemFact {
  return {
    learningItemId: deterministicItemId("slippage_reentry", params.slipSourceRef, params.canonicalWordId, params.microSkillKey),
    childId: params.childId,
    canonicalWordId: params.canonicalWordId,
    microSkillKey: params.microSkillKey,
    itemStatus: "pending_reteach",
    sourceKind: "slippage_reentry",
    sourceRef: params.slipSourceRef,
    sourceAttemptText: params.attemptText,
    reteachPriority: true,
    ejectedOn: params.slippedOn,
    intakeOn: params.slippedOn,
    rowStatus: "active",
  };
}

export interface StretchIntakeParams {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  stretchSourceRef: string;
  selectedOn: IsoDate;
}

/** Stretch words get items created at composition so every generated
 * assignment item traces to an active learning item (composer contract: no
 * word-map row creates assignment content by itself). */
export function learningItemFromStretchSelection(params: StretchIntakeParams): LearningItemFact {
  return {
    learningItemId: deterministicItemId("stretch_selection", params.stretchSourceRef, params.canonicalWordId, params.microSkillKey),
    childId: params.childId,
    canonicalWordId: params.canonicalWordId,
    microSkillKey: params.microSkillKey,
    itemStatus: "pending",
    sourceKind: "stretch_selection",
    sourceRef: params.stretchSourceRef,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: params.selectedOn,
    rowStatus: "active",
  };
}

/** A word that entered a review bundle after its lesson: the item leaves the
 * selectable pool and waits on the scheduler. */
export function itemAwaitingReviewOutcome(item: LearningItemFact): LearningItemFact {
  return { ...item, itemStatus: "awaiting_review_outcome" };
}

export function resolveLearningItem(item: LearningItemFact): LearningItemFact {
  return { ...item, itemStatus: "resolved" };
}

export function pauseItemForParentReview(item: LearningItemFact): LearningItemFact {
  return { ...item, itemStatus: "paused_parent_review" };
}

// ---------------------------------------------------------------------------
// Slice 6: parent release of paused words (the previously missing exit path)
// ---------------------------------------------------------------------------

/** Parent resumes a paused word: it re-enters the queue as a reteach-priority
 * pending-reteach item, so the composer's existing reteach tier re-teaches it
 * through the normal lesson path — no new scheduling semantics. The release
 * date becomes the reteach-ordering anchor. */
export function resumeItemFromParentReview(
  item: LearningItemFact,
  releasedOn: IsoDate,
): LearningItemFact {
  if (item.itemStatus !== "paused_parent_review") {
    throw new Error("resumeItemFromParentReview: item is not paused for parent review");
  }
  return {
    ...item,
    itemStatus: "pending_reteach",
    reteachPriority: true,
    ejectedOn: item.ejectedOn ?? releasedOn,
  };
}

/** Parent retires a paused word from the queue entirely. The row leaves the
 * active set (rejected = a parent decision that this word/skill pairing is
 * not teachable right now), so it can never re-enter selectability or
 * clustering; re-mapping goes through the existing candidate-mapping flow,
 * never through a release action. */
export function retireItemFromParentReview(item: LearningItemFact): LearningItemFact {
  if (item.itemStatus !== "paused_parent_review") {
    throw new Error("retireItemFromParentReview: item is not paused for parent review");
  }
  return { ...item, rowStatus: "rejected" };
}

/** Slice 6 wiring of the 3+-wrong reopen rule (blueprint review session shape
 * rule 4): the failed skills' selectable items become reteach-priority
 * pending-reteach items so the NEXT composed day's reteach tier reopens the
 * micro-skill lesson. Items already carrying an ejection date keep it (their
 * demand is older); others anchor at the reopen date. Documented Slice 6 pin,
 * flagged for owner QA — consumes only existing item states. */
export function reopenItemsForMicroSkills(
  items: readonly LearningItemFact[],
  childId: string,
  microSkillKeys: readonly string[],
  reopenedOn: IsoDate,
): LearningItemFact[] {
  const skills = new Set(microSkillKeys);
  return items
    .filter(
      (item) =>
        item.childId === childId &&
        item.rowStatus === "active" &&
        skills.has(item.microSkillKey) &&
        SELECTABLE_ITEM_STATUSES.includes(item.itemStatus),
    )
    .map((item) => ({
      ...item,
      itemStatus: "pending_reteach" as LearningItemStatus,
      reteachPriority: true,
      ejectedOn: item.ejectedOn ?? reopenedOn,
    }));
}

// ---------------------------------------------------------------------------
// Verified-misspelling intake bridge (read-only; open question 2)
// ---------------------------------------------------------------------------

/** A parent-verified spelling candidate mapping fact (from the existing
 * parent_verified_spelling_candidate_mappings flow). */
export interface VerifiedMisspellingCandidateFact {
  candidateMappingId: string;
  childId: string;
  misspellingNormalised: string;
  correctSpellingNormalised: string;
  microSkillKey: string;
  candidateStatus: string;
  verifiedOn: IsoDate;
}

/** Candidate statuses that count as verified truth for ADLE intake: the
 * mapping has been promoted (parent-local or global). Pending/rejected
 * candidates never create items. */
export const VERIFIED_CANDIDATE_STATUSES: readonly string[] = [
  "parent_local_promoted",
  "global_canonical_promoted",
];

export interface VerifiedMisspellingBridgeResult {
  intakes: LearningItemFact[];
  /** Candidates whose corrected spelling has no active dictionary word —
   * they stay in the candidate-mapping flow; the bridge never invents
   * dictionary truth. */
  unresolved: VerifiedMisspellingCandidateFact[];
}

/** Read-only bridge from the verified-misspelling/candidate flows into ADLE
 * learning-item intake (source_kind 'verified_misspelling'). Pure: returns
 * intake facts, writes nothing. */
export function verifiedMisspellingIntakeBridge(
  candidates: readonly VerifiedMisspellingCandidateFact[],
  activeWordIdByNormalisedWord: ReadonlyMap<string, string>,
): VerifiedMisspellingBridgeResult {
  const intakes: LearningItemFact[] = [];
  const unresolved: VerifiedMisspellingCandidateFact[] = [];
  const seen = new Set<string>();
  const sorted = [...candidates].sort((a, b) =>
    a.candidateMappingId < b.candidateMappingId ? -1 : a.candidateMappingId > b.candidateMappingId ? 1 : 0,
  );
  for (const candidate of sorted) {
    if (!VERIFIED_CANDIDATE_STATUSES.includes(candidate.candidateStatus)) {
      continue;
    }
    const canonicalWordId = activeWordIdByNormalisedWord.get(candidate.correctSpellingNormalised);
    if (canonicalWordId === undefined) {
      unresolved.push(candidate);
      continue;
    }
    const dedupeKey = `${candidate.childId} ${canonicalWordId} ${candidate.microSkillKey}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    intakes.push({
      learningItemId: deterministicItemId(
        "verified_misspelling",
        candidate.candidateMappingId,
        canonicalWordId,
        candidate.microSkillKey,
      ),
      childId: candidate.childId,
      canonicalWordId,
      microSkillKey: candidate.microSkillKey,
      itemStatus: "pending",
      sourceKind: "verified_misspelling",
      sourceRef: candidate.candidateMappingId,
      sourceAttemptText: candidate.misspellingNormalised,
      reteachPriority: false,
      ejectedOn: null,
      intakeOn: candidate.verifiedOn,
      rowStatus: "active",
    });
  }
  return { intakes, unresolved };
}
