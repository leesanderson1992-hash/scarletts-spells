/**
 * ADLE Slice 3 (3E): persistence planner — turns a composed daily plan into
 * the exact rows to append to the existing assignment_items table under a
 * daily_assignments transitional header (composer contract persistence
 * boundary). Pure: the planner decides insert-vs-noop from injected facts;
 * DB access stays in loaders/scripts.
 *
 * Authorized by owner sign-off of the read-model QA artefact
 * (adle-slice-3-composed-plan-samples-2026-07-05.md) per the composer
 * contract's read-model-first rule.
 *
 * Idempotence per (child, day): re-planning an unchanged day against a
 * persisted header is a no-op; the DB uniqueness guard is the existing
 * daily_assignments unique constraint on (child_id, assignment_date,
 * title) with the pinned ADLE title, so a concurrent duplicate insert
 * fails instead of duplicating.
 *
 * Documented pins:
 * - assignment_items.learning_item_id stays null for ADLE rows: that FK
 *   points at the legacy learning_items table (live writing-engine
 *   consumers, untouched by this slice). ADLE learning-item linkage is
 *   preserved in metadata.adleLearningItemRef (the deterministic lib id)
 *   plus the persisted adle_learning_items rows.
 * - plan-level skip reasons live on the composed plan value (read model /
 *   telemetry), not on the persisted rows; items only persist for composed
 *   sections. daily_assignments has no metadata column to carry them.
 *
 * Persistence writes nothing else: no evidence, no proficiency, no Word
 * Treasure, no scheduler state (scheduler writes happen at completion, 3D).
 */

import type { LearningItemFact } from "./learning-items";
import type { ComposedDailyPlan, PlanItemCandidate } from "./daily-assignment-composer";
import type { IsoDate } from "./review-scheduler";

export const ADLE_DAILY_ASSIGNMENT_TITLE = "ADLE Daily Plan";
export const ADLE_ASSIGNMENT_GENERATION_SOURCE = "adle_composer_v1";
export const ADLE_ASSIGNMENT_SOURCE_TYPE = "adle_composer";
export const ADLE_ASSIGNMENT_DOMAIN_MODULE = "spelling";

export interface ExistingAssignmentHeaderFact {
  childId: string;
  assignmentDate: IsoDate;
  title: string;
  status: string;
}

export interface AssignmentHeaderDraft {
  childId: string;
  parentUserId: string;
  assignmentDate: IsoDate;
  title: string;
  status: "pending";
  /** Part 2 lesson words (display), empty on review-only days. */
  targetWords: string[];
  /** Part 1 review words (display) in session-mix presentation order. */
  reviewWords: string[];
  assignmentGenerationSource: string;
}

export interface AssignmentItemDraft {
  childId: string;
  parentUserId: string;
  domainModule: string;
  itemType: string;
  sourceType: string;
  /** Deterministic per (child, day, position) — the provenance key that
   * makes accidental double-append visible and auditable. */
  sourceEntityId: string;
  templateKey: string;
  targetWord: string | null;
  position: number;
  status: "ready";
  promptData: Record<string, unknown>;
  metadata: {
    planDate: IsoDate;
    sectionKey: string;
    provenance: string;
    microSkillKey: string | null;
    canonicalWordId: string | null;
    expectedEvidenceKind: string | null;
    adleLearningItemRef: string | null;
    composerPolicyVersion: string;
    schedulePolicyVersion: string;
  };
}

export type PersistenceNoopReason = "existing_active_plan" | "empty_plan";

export interface AssignmentPersistencePlan {
  action: "insert" | "noop";
  noopReason: PersistenceNoopReason | null;
  header: AssignmentHeaderDraft | null;
  items: AssignmentItemDraft[];
  /** Stretch-word learning items the composition created: persisted in the
   * same transaction so every generated item traces to an active
   * adle_learning_items row. The storage layer inserts them idempotently
   * under the unique active (child, word, skill) guard. */
  learningItemIntakes: LearningItemFact[];
}

export interface PersistencePlanParams {
  parentUserId: string;
  /** Existing daily_assignments rows for this child and date (any title). */
  existingHeaders: readonly ExistingAssignmentHeaderFact[];
}

function itemDraft(
  plan: ComposedDailyPlan,
  parentUserId: string,
  candidate: PlanItemCandidate,
): AssignmentItemDraft {
  return {
    childId: plan.childId,
    parentUserId,
    domainModule: ADLE_ASSIGNMENT_DOMAIN_MODULE,
    itemType: `adle_${candidate.sectionKey}`,
    sourceType: ADLE_ASSIGNMENT_SOURCE_TYPE,
    sourceEntityId: `adle:${plan.childId}:${plan.planDate}:${candidate.position}`,
    templateKey: candidate.templateKey,
    targetWord: candidate.targetWord,
    position: candidate.position,
    status: "ready",
    promptData: candidate.payload,
    metadata: {
      planDate: plan.planDate,
      sectionKey: candidate.sectionKey,
      provenance: candidate.provenance,
      microSkillKey: candidate.microSkillKey,
      canonicalWordId: candidate.canonicalWordId,
      expectedEvidenceKind: candidate.expectedEvidenceKind,
      adleLearningItemRef: candidate.learningItemId,
      composerPolicyVersion: plan.composerPolicyVersion,
      schedulePolicyVersion: plan.schedulePolicyVersion,
    },
  };
}

export function planAssignmentPersistence(
  plan: ComposedDailyPlan,
  params: PersistencePlanParams,
): AssignmentPersistencePlan {
  // Idempotence: an existing ADLE header for (child, day) means the day is
  // already persisted — re-composition of an unchanged day is a no-op.
  const existing = params.existingHeaders.some(
    (header) =>
      header.childId === plan.childId &&
      header.assignmentDate === plan.planDate &&
      header.title === ADLE_DAILY_ASSIGNMENT_TITLE,
  );
  if (existing) {
    return {
      action: "noop",
      noopReason: "existing_active_plan",
      header: null,
      items: [],
      learningItemIntakes: [],
    };
  }

  const candidates = [
    ...plan.partOne.sections.flatMap((section) => section.items),
    ...plan.partTwo.sections.flatMap((section) => section.items),
  ].sort((a, b) => a.position - b.position);

  if (candidates.length === 0) {
    return {
      action: "noop",
      noopReason: "empty_plan",
      header: null,
      items: [],
      learningItemIntakes: [],
    };
  }

  const reviewWords: string[] = [];
  for (const section of plan.partOne.sections) {
    if (section.sectionKey === "review_production") {
      for (const entry of section.items) {
        if (entry.targetWord !== null) {
          reviewWords.push(entry.targetWord);
        }
      }
    }
  }
  const targetWords: string[] = [];
  for (const section of plan.partTwo.sections) {
    if (section.sectionKey === "lesson_production") {
      for (const entry of section.items) {
        if (entry.targetWord !== null) {
          targetWords.push(entry.targetWord);
        }
      }
    }
  }

  return {
    action: "insert",
    noopReason: null,
    header: {
      childId: plan.childId,
      parentUserId: params.parentUserId,
      assignmentDate: plan.planDate,
      title: ADLE_DAILY_ASSIGNMENT_TITLE,
      status: "pending",
      targetWords,
      reviewWords,
      assignmentGenerationSource: ADLE_ASSIGNMENT_GENERATION_SOURCE,
    },
    items: candidates.map((candidate) => itemDraft(plan, params.parentUserId, candidate)),
    learningItemIntakes: plan.partTwo.composed ? [...plan.partTwo.stretchItemIntakes] : [],
  };
}
