import type { SupabaseClient } from "@supabase/supabase-js";

import { composeDailyPlan, type ComposedDailyPlan, type PlanItemCandidate } from "../daily-assignment-composer";
import {
  ADLE_DAILY_ASSIGNMENT_TITLE,
  planAssignmentPersistence,
  type AssignmentPersistencePlan,
  type ExistingAssignmentHeaderFact,
} from "../assignment-persistence";
import type { IsoDate } from "../review-scheduler";
import { loadDailyPlanFacts } from "./composer-facts-loader";

type Client = SupabaseClient;

export interface ExistingAssignmentPreview {
  id: string;
  childId: string;
  assignmentDate: IsoDate;
  title: string;
  status: string;
  assignmentGenerationSource: string | null;
}

export interface PlannedSectionPreview {
  sectionKey: string;
  itemCount: number;
  templateKeys: string[];
  targetWords: string[];
}

export interface AdleDailyPlanPreview {
  mode: "read_only_preview";
  childId: string;
  parentUserId: string;
  assignmentDate: IsoDate;
  generatedAt: string;
  existingAssignments: ExistingAssignmentPreview[];
  existingAdleAssignment: ExistingAssignmentPreview | null;
  existingAssignmentItemCount: number;
  plan: ComposedDailyPlan;
  persistence: AssignmentPersistencePlan;
  duplicateRisk: {
    hasExistingAdleAssignment: boolean;
    plannedSourceEntityIds: string[];
    existingPlannedSourceEntityIds: string[];
  };
  wouldPersist: boolean;
  wouldCreateDuplicateRowsIfExecuted: boolean;
  wouldProducePartOneReview: boolean;
  wouldProducePartTwoLesson: boolean;
  selectedReviewWords: string[];
  selectedLessonWords: {
    canonicalWordId: string;
    displayWord: string | null;
    provenance: string;
    learningItemId: string | null;
    complexityLevel: number | null;
  }[];
  selectedMicroSkill: string | null;
  activityTemplates: string[];
  sections: {
    partOne: PlannedSectionPreview[];
    partTwo: PlannedSectionPreview[];
  };
  skipReasons: {
    partOne: ComposedDailyPlan["partOne"]["skips"];
    partTwo: ComposedDailyPlan["partTwo"]["skips"];
  };
  missingData: ComposedDailyPlan["partOne"]["skips"];
  composerInputs: {
    reviewBundleCount: number;
    reviewScheduleWordCount: number;
    reviewWordFactCount: number;
    adleLearningItemCount: number;
    activeFamilyMethodCount: number;
    activeActivityTemplateCount: number;
    activeTeachingContentCount: number;
    dictionaryWordCount: number;
    dictionarySupportCount: number;
  };
  persistenceChecks: {
    staticPlannerAction: AssignmentPersistencePlan["action"];
    noopReason: AssignmentPersistencePlan["noopReason"];
    headerWouldBeInserted: boolean;
    assignmentItemsWouldBeInserted: number;
    stretchLearningItemIntakesWouldBeInserted: number;
    rlsNotVerifiedByPreview: true;
  };
  legacyVsAdleLearningItems: {
    legacyLearningItemsNote: string;
    adleLearningItemsNote: string;
  };
}

async function rows<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
  return (data ?? []) as T[];
}

function sectionPreview(sections: ComposedDailyPlan["partOne"]["sections"]): PlannedSectionPreview[] {
  return sections.map((section) => ({
    sectionKey: section.sectionKey,
    itemCount: section.items.length,
    templateKeys: [...new Set(section.items.map((item) => item.templateKey))].sort(),
    targetWords: section.items
      .map((item) => item.targetWord)
      .filter((word): word is string => word !== null),
  }));
}

function allCandidates(plan: ComposedDailyPlan): PlanItemCandidate[] {
  return [...plan.partOne.sections, ...plan.partTwo.sections]
    .flatMap((section) => section.items)
    .sort((a, b) => a.position - b.position);
}

function missingSkips(plan: ComposedDailyPlan): ComposedDailyPlan["partOne"]["skips"] {
  return [...plan.partOne.skips, ...plan.partTwo.skips].filter((skip) =>
    [
      "missing_teaching_metadata",
      "missing_activity_strategy",
      "missing_required_words",
      "unknown_micro_skill",
      "no_diagnostic_eligible_words",
      "insufficient_real_learning_items",
    ].includes(skip.reason),
  );
}

export async function previewAdleDailyPlan(params: {
  userClient: Client;
  serviceClient: Client;
  parentUserId: string;
  childId: string;
  assignmentDate: IsoDate;
}): Promise<AdleDailyPlanPreview> {
  const { userClient, serviceClient, parentUserId, childId, assignmentDate } = params;

  const [{ facts, displayWordByWordId }, assignmentRows] = await Promise.all([
    loadDailyPlanFacts(serviceClient, { childId, today: assignmentDate }),
    rows<{
      id: string;
      child_id: string;
      assignment_date: IsoDate;
      title: string | null;
      status: string;
      assignment_generation_source: string | null;
    }>(
      userClient
        .from("daily_assignments")
        .select("id, child_id, assignment_date, title, status, assignment_generation_source")
        .eq("parent_user_id", parentUserId)
        .eq("child_id", childId)
        .eq("assignment_date", assignmentDate),
      "previewAdleDailyPlan:existingAssignments",
    ),
  ]);

  const existingAssignments: ExistingAssignmentPreview[] = assignmentRows.map((row) => ({
    id: row.id,
    childId: row.child_id,
    assignmentDate: row.assignment_date,
    title: row.title ?? "",
    status: row.status,
    assignmentGenerationSource: row.assignment_generation_source,
  }));
  const existingHeaders: ExistingAssignmentHeaderFact[] = existingAssignments.map((row) => ({
    childId: row.childId,
    assignmentDate: row.assignmentDate,
    title: row.title,
    status: row.status,
  }));

  const plan = composeDailyPlan(facts, assignmentDate);
  const persistence = planAssignmentPersistence(plan, { parentUserId, existingHeaders });
  const plannedSourceEntityIds = persistence.items.map((item) => item.sourceEntityId);

  const sourceClashRows =
    plannedSourceEntityIds.length === 0
      ? []
      : await rows<{ source_entity_id: string }>(
          userClient
            .from("assignment_items")
            .select("source_entity_id")
            .eq("parent_user_id", parentUserId)
            .eq("child_id", childId)
            .in("source_entity_id", plannedSourceEntityIds),
          "previewAdleDailyPlan:sourceClashes",
        );

  const existingAssignmentIds = existingAssignments.map((row) => row.id);
  let existingAssignmentItemCount = 0;
  if (existingAssignmentIds.length > 0) {
    const { count, error } = await userClient
      .from("assignment_items")
      .select("id", { count: "exact", head: true })
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId)
      .in("daily_assignment_id", existingAssignmentIds);
    if (error) {
      throw new Error(`previewAdleDailyPlan:existingAssignmentItemCount: ${error.message}`);
    }
    existingAssignmentItemCount = count ?? 0;
  }

  const candidates = allCandidates(plan);
  const existingAdleAssignment =
    existingAssignments.find((row) => row.title === ADLE_DAILY_ASSIGNMENT_TITLE) ?? null;
  const existingPlannedSourceEntityIds = sourceClashRows.map((row) => row.source_entity_id).sort();
  const activityTemplates = [...new Set(candidates.map((item) => item.templateKey))].sort();

  return {
    mode: "read_only_preview",
    childId,
    parentUserId,
    assignmentDate,
    generatedAt: new Date().toISOString(),
    existingAssignments,
    existingAdleAssignment,
    existingAssignmentItemCount,
    plan,
    persistence,
    duplicateRisk: {
      hasExistingAdleAssignment: existingAdleAssignment !== null,
      plannedSourceEntityIds,
      existingPlannedSourceEntityIds,
    },
    wouldPersist: persistence.action === "insert",
    wouldCreateDuplicateRowsIfExecuted:
      existingAdleAssignment !== null || existingPlannedSourceEntityIds.length > 0,
    wouldProducePartOneReview: plan.partOne.sections.some((section) => section.items.length > 0),
    wouldProducePartTwoLesson: plan.partTwo.composed && plan.partTwo.sections.some((section) => section.items.length > 0),
    selectedReviewWords: persistence.header?.reviewWords ?? [],
    selectedLessonWords: plan.partTwo.lessonWords.map((word) => ({
      canonicalWordId: word.canonicalWordId,
      displayWord: displayWordByWordId.get(word.canonicalWordId) ?? null,
      provenance: word.provenance,
      learningItemId: word.learningItemId,
      complexityLevel: word.complexityLevel,
    })),
    selectedMicroSkill: plan.partTwo.microSkillKey,
    activityTemplates,
    sections: {
      partOne: sectionPreview(plan.partOne.sections),
      partTwo: sectionPreview(plan.partTwo.sections),
    },
    skipReasons: {
      partOne: plan.partOne.skips,
      partTwo: plan.partTwo.skips,
    },
    missingData: missingSkips(plan),
    composerInputs: {
      reviewBundleCount: facts.bundles.length,
      reviewScheduleWordCount: facts.scheduleWords.length,
      reviewWordFactCount: facts.reviewWordFacts.size,
      adleLearningItemCount: facts.learningItems.length,
      activeFamilyMethodCount: facts.familyMethods.filter((row) => row.rowStatus === "active").length,
      activeActivityTemplateCount: facts.activityTemplates.filter((row) => row.rowStatus === "active").length,
      activeTeachingContentCount: facts.teachingContent.size,
      dictionaryWordCount: facts.dictionary.words.length,
      dictionarySupportCount: facts.dictionary.supports.length,
    },
    persistenceChecks: {
      staticPlannerAction: persistence.action,
      noopReason: persistence.noopReason,
      headerWouldBeInserted: persistence.header !== null,
      assignmentItemsWouldBeInserted: persistence.items.length,
      stretchLearningItemIntakesWouldBeInserted: persistence.learningItemIntakes.length,
      rlsNotVerifiedByPreview: true,
    },
    legacyVsAdleLearningItems: {
      legacyLearningItemsNote:
        "Legacy daily practice reads the old learning_items table and writes assignment_items.learning_item_id; ADLE persistence intentionally leaves that FK null.",
      adleLearningItemsNote:
        "ADLE composition reads adle_learning_items and carries linkage through assignment_items.metadata.adleLearningItemRef plus persisted adle_learning_items rows.",
    },
  };
}
