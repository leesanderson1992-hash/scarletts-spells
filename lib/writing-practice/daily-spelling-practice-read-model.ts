import type { createClient } from "../supabase/server";
import { DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE } from "../writing-engine/persistence/daily-spelling-practice-assignments";
import type {
  WritingEngineAssignmentItemStatus,
  WritingEngineAssignmentItemType,
  WritingEngineDomainModule,
  WritingEngineSourceType,
} from "../writing-engine/types";
import type { LearningItemProgressState } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const DAILY_SPELLING_PRACTICE_CHILD_COPY = {
  title: "Today's spelling practice",
  ready: "A few words to practise",
  dueReview: "Review first",
  newPractice: "New practice",
  done: "Done for today",
  empty: "Nothing new today",
  readyForToday: "Ready for today",
} as const;

export type DailySpellingPracticeReadModelState =
  | "missing"
  | "empty"
  | "ready"
  | "completed"
  | "skipped"
  | "blocked";

export type DailySpellingPracticeItemGroup =
  | "due_review"
  | "new_practice"
  | "practice";

export type DailySpellingPracticeReadAssignmentStatus =
  | "pending"
  | "completed"
  | "skipped";

export type DailySpellingPracticeReadAssignmentRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  assignment_date: string;
  status: DailySpellingPracticeReadAssignmentStatus;
  assignment_generation_source: string | null;
  source_learning_item_ids: string[] | null;
};

export type DailySpellingPracticeReadAssignmentItemRow = {
  id: string;
  daily_assignment_id: string | null;
  child_id: string;
  parent_user_id: string;
  domain_module: WritingEngineDomainModule | string;
  item_type: WritingEngineAssignmentItemType | string;
  source_type: WritingEngineSourceType | string;
  source_entity_id: string;
  learning_item_id: string | null;
  template_key: string | null;
  target_word: string | null;
  prompt_data: Record<string, unknown>;
  expected_answer: Record<string, unknown> | null;
  position: number;
  status: WritingEngineAssignmentItemStatus;
  metadata: Record<string, unknown>;
};

export type DailySpellingPracticeReadLearningItemRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  micro_skill_key: string;
  progress_state: LearningItemProgressState;
  review_due_at: string | null;
};

export type DailySpellingPracticeReadCatalogRow = {
  micro_skill_key: string;
  display_name: string;
};

export type DailySpellingPracticeReadItem = {
  id: string;
  dailyAssignmentId: string;
  childId: string;
  parentUserId: string;
  domainModule: string;
  itemType: string;
  sourceType: string;
  sourceEntityId: string;
  learningItemId: string | null;
  templateKey: string | null;
  targetWord: string | null;
  promptData: Record<string, unknown>;
  expectedAnswer: Record<string, unknown> | null;
  position: number;
  status: WritingEngineAssignmentItemStatus;
  metadata: Record<string, unknown>;
  group: DailySpellingPracticeItemGroup;
  groupLabel: string;
  microSkillKey: string | null;
  microSkillLabel: string | null;
  isSupportedForChildSurface: boolean;
};

export type DailySpellingPracticeReadModel = {
  state: DailySpellingPracticeReadModelState;
  practiceDate: string;
  assignment: {
    id: string;
    status: DailySpellingPracticeReadAssignmentStatus;
    assignmentGenerationSource: "learning_items";
    sourceLearningItemIds: string[];
  } | null;
  items: DailySpellingPracticeReadItem[];
  groups: {
    dueReview: DailySpellingPracticeReadItem[];
    newPractice: DailySpellingPracticeReadItem[];
    practice: DailySpellingPracticeReadItem[];
  };
  counts: {
    total: number;
    dueReview: number;
    newPractice: number;
    practice: number;
    ready: number;
    completed: number;
    unsupported: number;
  };
  childCopy: typeof DAILY_SPELLING_PRACTICE_CHILD_COPY;
};

export type DailySpellingPracticeReadModelRepositories = {
  findDailyAssignment(input: {
    parentUserId: string;
    childId: string;
    practiceDate: string;
  }): Promise<DailySpellingPracticeReadAssignmentRow | null>;
  getAssignmentItems(input: {
    parentUserId: string;
    childId: string;
    dailyAssignmentId: string;
  }): Promise<DailySpellingPracticeReadAssignmentItemRow[]>;
  getLearningItems(input: {
    parentUserId: string;
    childId: string;
    learningItemIds: string[];
  }): Promise<DailySpellingPracticeReadLearningItemRow[]>;
  getCatalogRows(input: {
    microSkillKeys: string[];
  }): Promise<DailySpellingPracticeReadCatalogRow[]>;
};

export type GetDailySpellingPracticeReadModelInput = {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  practiceDate: string;
};

export type GetDailySpellingPracticeReadModelWithRepositoriesInput = Omit<
  GetDailySpellingPracticeReadModelInput,
  "supabase"
> & {
  repositories: DailySpellingPracticeReadModelRepositories;
};

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function normalizePromptData(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeExpectedAnswer(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isDueForReview(
  learningItem: DailySpellingPracticeReadLearningItemRow | null,
  practiceDate: string,
) {
  if (!learningItem?.review_due_at) {
    return false;
  }

  return learningItem.review_due_at.slice(0, 10) <= practiceDate;
}

function getItemGroup(input: {
  learningItem: DailySpellingPracticeReadLearningItemRow | null;
  practiceDate: string;
}): DailySpellingPracticeItemGroup {
  if (isDueForReview(input.learningItem, input.practiceDate)) {
    return "due_review";
  }

  if (input.learningItem?.progress_state === "golden_nugget") {
    return "new_practice";
  }

  return "practice";
}

function getGroupLabel(group: DailySpellingPracticeItemGroup) {
  if (group === "due_review") {
    return DAILY_SPELLING_PRACTICE_CHILD_COPY.dueReview;
  }

  if (group === "new_practice") {
    return DAILY_SPELLING_PRACTICE_CHILD_COPY.newPractice;
  }

  return DAILY_SPELLING_PRACTICE_CHILD_COPY.readyForToday;
}

function isSupportedForChildSurface(
  row: DailySpellingPracticeReadAssignmentItemRow,
) {
  return row.domain_module === "spelling" && row.item_type === "controlled_spelling";
}

function getState(input: {
  assignment: DailySpellingPracticeReadAssignmentRow;
  items: DailySpellingPracticeReadItem[];
}): DailySpellingPracticeReadModelState {
  if (input.assignment.status === "completed") {
    return "completed";
  }

  if (input.assignment.status === "skipped") {
    return "skipped";
  }

  if (input.items.length === 0) {
    return "empty";
  }

  if (!input.items.some((item) => item.isSupportedForChildSurface)) {
    return "blocked";
  }

  const supportedItems = input.items.filter((item) => item.isSupportedForChildSurface);
  if (
    supportedItems.length > 0 &&
    supportedItems.every((item) => item.status === "completed")
  ) {
    return "completed";
  }

  return "ready";
}

export function buildMissingDailySpellingPracticeReadModel(
  practiceDate: string,
): DailySpellingPracticeReadModel {
  return {
    state: "missing",
    practiceDate,
    assignment: null,
    items: [],
    groups: {
      dueReview: [],
      newPractice: [],
      practice: [],
    },
    counts: {
      total: 0,
      dueReview: 0,
      newPractice: 0,
      practice: 0,
      ready: 0,
      completed: 0,
      unsupported: 0,
    },
    childCopy: DAILY_SPELLING_PRACTICE_CHILD_COPY,
  };
}

function buildCounts(items: DailySpellingPracticeReadItem[]) {
  return {
    total: items.length,
    dueReview: items.filter((item) => item.group === "due_review").length,
    newPractice: items.filter((item) => item.group === "new_practice").length,
    practice: items.filter((item) => item.group === "practice").length,
    ready: items.filter((item) => item.status === "ready").length,
    completed: items.filter((item) => item.status === "completed").length,
    unsupported: items.filter((item) => !item.isSupportedForChildSurface).length,
  };
}

function buildGroups(items: DailySpellingPracticeReadItem[]) {
  return {
    dueReview: items.filter((item) => item.group === "due_review"),
    newPractice: items.filter((item) => item.group === "new_practice"),
    practice: items.filter((item) => item.group === "practice"),
  };
}

export function createSupabaseDailySpellingPracticeReadModelRepositories(
  supabase: SupabaseServerClient,
): DailySpellingPracticeReadModelRepositories {
  return {
    async findDailyAssignment(input) {
      const { data, error } = await supabase
        .from("daily_assignments")
        .select(
          "id, child_id, parent_user_id, assignment_date, status, assignment_generation_source, source_learning_item_ids",
        )
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .eq("assignment_date", input.practiceDate)
        .eq("title", DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE)
        .eq("assignment_generation_source", "learning_items")
        .maybeSingle();

      if (error) {
        throw new Error("Failed to read daily spelling practice assignment.");
      }

      return (data as DailySpellingPracticeReadAssignmentRow | null) ?? null;
    },
    async getAssignmentItems(input) {
      const { data, error } = await supabase
        .from("assignment_items")
        .select(
          [
            "id",
            "daily_assignment_id",
            "child_id",
            "parent_user_id",
            "domain_module",
            "item_type",
            "source_type",
            "source_entity_id",
            "learning_item_id",
            "template_key",
            "target_word",
            "prompt_data",
            "expected_answer",
            "position",
            "status",
            "metadata",
          ].join(", "),
        )
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .eq("daily_assignment_id", input.dailyAssignmentId)
        .order("position", { ascending: true });

      if (error) {
        throw new Error("Failed to read daily spelling practice items.");
      }

      return (data ?? []) as unknown as DailySpellingPracticeReadAssignmentItemRow[];
    },
    async getLearningItems(input) {
      if (input.learningItemIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("learning_items")
        .select(
          "id, child_id, parent_user_id, micro_skill_key, progress_state, review_due_at",
        )
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .in("id", input.learningItemIds);

      if (error) {
        throw new Error("Failed to read daily spelling practice learning items.");
      }

      return (data ?? []) as DailySpellingPracticeReadLearningItemRow[];
    },
    async getCatalogRows(input) {
      if (input.microSkillKeys.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("micro_skill_catalog")
        .select("micro_skill_key, display_name")
        .in("micro_skill_key", input.microSkillKeys);

      if (error) {
        throw new Error("Failed to read daily spelling practice catalog labels.");
      }

      return (data ?? []) as DailySpellingPracticeReadCatalogRow[];
    },
  };
}

export async function getDailySpellingPracticeReadModelWithRepositories(
  input: GetDailySpellingPracticeReadModelWithRepositoriesInput,
): Promise<DailySpellingPracticeReadModel> {
  const assignment = await input.repositories.findDailyAssignment({
    parentUserId: input.parentUserId,
    childId: input.childId,
    practiceDate: input.practiceDate,
  });

  if (!assignment) {
    return buildMissingDailySpellingPracticeReadModel(input.practiceDate);
  }

  const assignmentSourceLearningItemIds =
    assignment.source_learning_item_ids ?? [];
  const itemRows = await input.repositories.getAssignmentItems({
    parentUserId: input.parentUserId,
    childId: input.childId,
    dailyAssignmentId: assignment.id,
  });
  const itemLearningItemIds = unique(
    itemRows
      .map((item) => item.learning_item_id)
      .filter((id): id is string => Boolean(id)),
  );
  const scopedLearningItemIds = itemLearningItemIds.filter((id) =>
    assignmentSourceLearningItemIds.includes(id),
  );
  const learningItems = await input.repositories.getLearningItems({
    parentUserId: input.parentUserId,
    childId: input.childId,
    learningItemIds: scopedLearningItemIds,
  });
  const learningItemById = new Map(learningItems.map((item) => [item.id, item]));
  const catalogRows = await input.repositories.getCatalogRows({
    microSkillKeys: unique(learningItems.map((item) => item.micro_skill_key)),
  });
  const catalogByMicroSkillKey = new Map(
    catalogRows.map((row) => [row.micro_skill_key, row]),
  );
  const items = [...itemRows]
    .sort((left, right) => left.position - right.position)
    .map((row): DailySpellingPracticeReadItem => {
    const learningItem = row.learning_item_id
      ? learningItemById.get(row.learning_item_id) ?? null
      : null;
    const group = getItemGroup({
      learningItem,
      practiceDate: input.practiceDate,
    });
    const microSkillKey = learningItem?.micro_skill_key ?? null;

    return {
      id: row.id,
      dailyAssignmentId: assignment.id,
      childId: row.child_id,
      parentUserId: row.parent_user_id,
      domainModule: row.domain_module,
      itemType: row.item_type,
      sourceType: row.source_type,
      sourceEntityId: row.source_entity_id,
      learningItemId: row.learning_item_id,
      templateKey: row.template_key,
      targetWord: row.target_word,
      promptData: normalizePromptData(row.prompt_data),
      expectedAnswer: normalizeExpectedAnswer(row.expected_answer),
      position: row.position,
      status: row.status,
      metadata: normalizePromptData(row.metadata),
      group,
      groupLabel: getGroupLabel(group),
      microSkillKey,
      microSkillLabel: microSkillKey
        ? catalogByMicroSkillKey.get(microSkillKey)?.display_name ?? null
        : null,
      isSupportedForChildSurface: isSupportedForChildSurface(row),
    };
    });

  return {
    state: getState({ assignment, items }),
    practiceDate: input.practiceDate,
    assignment: {
      id: assignment.id,
      status: assignment.status,
      assignmentGenerationSource: "learning_items",
      sourceLearningItemIds: assignmentSourceLearningItemIds,
    },
    items,
    groups: buildGroups(items),
    counts: buildCounts(items),
    childCopy: DAILY_SPELLING_PRACTICE_CHILD_COPY,
  };
}

export async function getDailySpellingPracticeReadModel(
  input: GetDailySpellingPracticeReadModelInput,
) {
  return getDailySpellingPracticeReadModelWithRepositories({
    parentUserId: input.parentUserId,
    childId: input.childId,
    practiceDate: input.practiceDate,
    repositories: createSupabaseDailySpellingPracticeReadModelRepositories(
      input.supabase,
    ),
  });
}
