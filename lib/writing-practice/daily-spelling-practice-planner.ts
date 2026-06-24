import {
  LEARNING_ITEM_PRACTICE_ROUTES,
  type LearningItemPracticeRoute,
  type LearningItemRow,
} from "./types";

export const DAILY_SPELLING_PRACTICE_PLANNER_DEFAULTS = {
  maxTotalItems: 6,
  maxNewPracticeItems: 2,
  minNewPracticeItems: 1,
  maxAllowedNewPracticeItems: 3,
} as const;

export type DailySpellingPracticePlannerLearningItem = Pick<
  LearningItemRow,
  | "id"
  | "child_id"
  | "parent_user_id"
  | "micro_skill_key"
  | "mastery_domain_key"
  | "skill_family_key"
  | "practice_route"
  | "progress_state"
  | "is_active"
  | "review_due_at"
  | "last_meaningful_success_at"
  | "last_meaningful_failure_at"
  | "created_at"
  | "updated_at"
>;

export type DailySpellingPracticeSelectedReason =
  | "due_review"
  | "new_practice_from_learning_item";

export type DailySpellingPracticeSkippedReason =
  | "wrong_child_or_parent"
  | "inactive_learning_item"
  | "unknown_micro_skill"
  | "missing_spelling_taxonomy"
  | "unsupported_practice_route"
  | "not_due_or_new_practice"
  | "daily_capacity_reached"
  | "new_practice_cap_reached";

export type DailySpellingPracticeSelectedItem = {
  learningItemId: string;
  childId: string;
  parentUserId: string;
  microSkillKey: string;
  practiceRoute: LearningItemPracticeRoute;
  progressState: LearningItemRow["progress_state"];
  reviewDueAt: string | null;
  selectionReason: DailySpellingPracticeSelectedReason;
  explanation: string;
};

export type DailySpellingPracticeSkippedItem = {
  learningItemId: string;
  childId: string;
  parentUserId: string;
  microSkillKey: string;
  skipReason: DailySpellingPracticeSkippedReason;
  explanation: string;
};

export type DailySpellingPracticePlan = {
  childId: string;
  parentUserId: string;
  practiceDate: string;
  dueReviewCutoffIso: string;
  selectedItems: DailySpellingPracticeSelectedItem[];
  skippedItems: DailySpellingPracticeSkippedItem[];
  selectedLearningItemIds: string[];
  selectedByMicroSkillKey: Array<{
    microSkillKey: string;
    learningItemIds: string[];
  }>;
  config: {
    maxTotalItems: number;
    maxNewPracticeItems: number;
  };
};

export type PlanDailySpellingPracticeInput = {
  childId: string;
  parentUserId: string;
  practiceDate: string | Date;
  learningItems: DailySpellingPracticePlannerLearningItem[];
  maxTotalItems?: number;
  maxNewPracticeItems?: number;
};

type EligibleLearningItem = DailySpellingPracticePlannerLearningItem & {
  practice_route: LearningItemPracticeRoute;
};

const supportedPracticeRoutes = new Set<string>(LEARNING_ITEM_PRACTICE_ROUTES);

function toDateOnly(value: string | Date) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

function getEndOfPracticeDateIso(value: string | Date) {
  const dateOnly = toDateOnly(value);
  const [year, month, day] = dateOnly.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    throw new Error("Practice date must be a Date or YYYY-MM-DD-like string.");
  }

  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).toISOString();
}

function clampMaxTotalItems(value: number | undefined) {
  if (value === undefined) {
    return DAILY_SPELLING_PRACTICE_PLANNER_DEFAULTS.maxTotalItems;
  }

  return Math.max(0, Math.floor(value));
}

function clampMaxNewPracticeItems(value: number | undefined) {
  const nextValue =
    value ?? DAILY_SPELLING_PRACTICE_PLANNER_DEFAULTS.maxNewPracticeItems;

  return Math.min(
    DAILY_SPELLING_PRACTICE_PLANNER_DEFAULTS.maxAllowedNewPracticeItems,
    Math.max(
      DAILY_SPELLING_PRACTICE_PLANNER_DEFAULTS.minNewPracticeItems,
      Math.floor(nextValue),
    ),
  );
}

function isFailurePriority(item: DailySpellingPracticePlannerLearningItem) {
  if (!item.last_meaningful_failure_at) {
    return false;
  }

  return (
    !item.last_meaningful_success_at ||
    item.last_meaningful_failure_at > item.last_meaningful_success_at
  );
}

function compareText(left: string | null, right: string | null) {
  return (left ?? "").localeCompare(right ?? "");
}

function compareDueItems(left: EligibleLearningItem, right: EligibleLearningItem) {
  const comparisons = [
    compareText(left.review_due_at, right.review_due_at),
    Number(isFailurePriority(right)) - Number(isFailurePriority(left)),
    compareText(right.updated_at, left.updated_at),
    left.id.localeCompare(right.id),
  ];

  return comparisons.find((value) => value !== 0) ?? 0;
}

function compareNewPracticeItems(
  left: EligibleLearningItem,
  right: EligibleLearningItem,
) {
  const comparisons = [
    compareText(right.updated_at, left.updated_at),
    compareText(left.created_at, right.created_at),
    left.id.localeCompare(right.id),
  ];

  return comparisons.find((value) => value !== 0) ?? 0;
}

function selectWithMicroSkillBreadth<T extends EligibleLearningItem>(
  items: T[],
  remainingCapacity: number,
) {
  if (remainingCapacity <= 0) {
    return [] as T[];
  }

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const selectedMicroSkillKeys = new Set<string>();

  for (const item of items) {
    if (selected.length >= remainingCapacity) {
      break;
    }

    if (selectedMicroSkillKeys.has(item.micro_skill_key)) {
      continue;
    }

    selected.push(item);
    selectedIds.add(item.id);
    selectedMicroSkillKeys.add(item.micro_skill_key);
  }

  for (const item of items) {
    if (selected.length >= remainingCapacity) {
      break;
    }

    if (selectedIds.has(item.id)) {
      continue;
    }

    selected.push(item);
    selectedIds.add(item.id);
  }

  return selected;
}

function buildSkippedItem(
  item: DailySpellingPracticePlannerLearningItem,
  skipReason: DailySpellingPracticeSkippedReason,
  explanation: string,
): DailySpellingPracticeSkippedItem {
  return {
    learningItemId: item.id,
    childId: item.child_id,
    parentUserId: item.parent_user_id,
    microSkillKey: item.micro_skill_key,
    skipReason,
    explanation,
  };
}

function getEligibilitySkipReason(input: {
  item: DailySpellingPracticePlannerLearningItem;
  childId: string;
  parentUserId: string;
}): DailySpellingPracticeSkippedItem | null {
  const { item, childId, parentUserId } = input;

  if (item.child_id !== childId || item.parent_user_id !== parentUserId) {
    return buildSkippedItem(
      item,
      "wrong_child_or_parent",
      "Skipped because this learning item belongs to a different child or parent.",
    );
  }

  if (!item.is_active) {
    return buildSkippedItem(
      item,
      "inactive_learning_item",
      "Skipped because this learning item is not active.",
    );
  }

  if (item.micro_skill_key === "unknown" || item.micro_skill_key.trim() === "") {
    return buildSkippedItem(
      item,
      "unknown_micro_skill",
      "Skipped because this learning item does not have an assignable micro-skill key.",
    );
  }

  if (item.mastery_domain_key !== "D4" || !item.skill_family_key) {
    return buildSkippedItem(
      item,
      "missing_spelling_taxonomy",
      "Skipped because this learning item is not a complete spelling practice-unit row.",
    );
  }

  if (
    !item.practice_route ||
    !supportedPracticeRoutes.has(item.practice_route)
  ) {
    return buildSkippedItem(
      item,
      "unsupported_practice_route",
      "Skipped because this learning item's practice route is missing or unsupported by the current daily spelling planner.",
    );
  }

  return null;
}

function isDueReview(
  item: DailySpellingPracticePlannerLearningItem,
  dueReviewCutoffIso: string,
) {
  return Boolean(item.review_due_at && item.review_due_at <= dueReviewCutoffIso);
}

function toSelectedItem(input: {
  item: EligibleLearningItem;
  selectionReason: DailySpellingPracticeSelectedReason;
}) {
  const { item, selectionReason } = input;

  return {
    learningItemId: item.id,
    childId: item.child_id,
    parentUserId: item.parent_user_id,
    microSkillKey: item.micro_skill_key,
    practiceRoute: item.practice_route,
    progressState: item.progress_state,
    reviewDueAt: item.review_due_at,
    selectionReason,
    explanation:
      selectionReason === "due_review"
        ? "Selected because this active spelling learning item is due for review on or before the practice date."
        : "Selected as new daily practice from an active learning item currently in the golden_nugget practice state.",
  } satisfies DailySpellingPracticeSelectedItem;
}

function buildSelectedByMicroSkillKey(
  selectedItems: DailySpellingPracticeSelectedItem[],
) {
  const grouped = new Map<string, string[]>();

  for (const item of selectedItems) {
    grouped.set(item.microSkillKey, [
      ...(grouped.get(item.microSkillKey) ?? []),
      item.learningItemId,
    ]);
  }

  return Array.from(grouped.entries()).map(([microSkillKey, learningItemIds]) => ({
    microSkillKey,
    learningItemIds,
  }));
}

export function planDailySpellingPractice(
  input: PlanDailySpellingPracticeInput,
): DailySpellingPracticePlan {
  const practiceDate = toDateOnly(input.practiceDate);
  const dueReviewCutoffIso = getEndOfPracticeDateIso(input.practiceDate);
  const maxTotalItems = clampMaxTotalItems(input.maxTotalItems);
  const maxNewPracticeItems = clampMaxNewPracticeItems(
    input.maxNewPracticeItems,
  );
  const skippedItems: DailySpellingPracticeSkippedItem[] = [];
  const eligibleItems: EligibleLearningItem[] = [];

  for (const item of input.learningItems) {
    const skip = getEligibilitySkipReason({
      item,
      childId: input.childId,
      parentUserId: input.parentUserId,
    });

    if (skip) {
      skippedItems.push(skip);
      continue;
    }

    eligibleItems.push({
      ...item,
      practice_route: item.practice_route as LearningItemPracticeRoute,
    });
  }

  const dueReviewItems = eligibleItems
    .filter((item) => isDueReview(item, dueReviewCutoffIso))
    .sort(compareDueItems);
  const selectedDueItems = selectWithMicroSkillBreadth(
    dueReviewItems,
    maxTotalItems,
  );
  const selectedDueIds = new Set(selectedDueItems.map((item) => item.id));
  const remainingCapacity = Math.max(maxTotalItems - selectedDueItems.length, 0);
  const newPracticeItems = eligibleItems
    .filter(
      (item) =>
        !selectedDueIds.has(item.id) &&
        item.progress_state === "golden_nugget",
    )
    .sort(compareNewPracticeItems);
  const selectedNewPracticeItems = selectWithMicroSkillBreadth(
    newPracticeItems,
    Math.min(remainingCapacity, maxNewPracticeItems),
  );
  const selectedIds = new Set([
    ...selectedDueItems.map((item) => item.id),
    ...selectedNewPracticeItems.map((item) => item.id),
  ]);

  for (const item of eligibleItems) {
    if (selectedIds.has(item.id)) {
      continue;
    }

    if (
      item.progress_state === "golden_nugget" &&
      !isDueReview(item, dueReviewCutoffIso) &&
      selectedNewPracticeItems.length >= maxNewPracticeItems
    ) {
      skippedItems.push(
        buildSkippedItem(
          item,
          "new_practice_cap_reached",
          "Skipped because the daily cap for new practice items from golden_nugget learning items was already reached.",
        ),
      );
      continue;
    }

    if (selectedIds.size >= maxTotalItems) {
      skippedItems.push(
        buildSkippedItem(
          item,
          "daily_capacity_reached",
          "Skipped because the daily spelling practice plan had already reached its item cap.",
        ),
      );
      continue;
    }

    skippedItems.push(
      buildSkippedItem(
        item,
        "not_due_or_new_practice",
        "Skipped because this active learning item is not due for review and is not a new golden_nugget practice-state item.",
      ),
    );
  }

  const selectedItems = [
    ...selectedDueItems.map((item) =>
      toSelectedItem({ item, selectionReason: "due_review" }),
    ),
    ...selectedNewPracticeItems.map((item) =>
      toSelectedItem({
        item,
        selectionReason: "new_practice_from_learning_item",
      }),
    ),
  ];

  return {
    childId: input.childId,
    parentUserId: input.parentUserId,
    practiceDate,
    dueReviewCutoffIso,
    selectedItems,
    skippedItems,
    selectedLearningItemIds: selectedItems.map((item) => item.learningItemId),
    selectedByMicroSkillKey: buildSelectedByMicroSkillKey(selectedItems),
    config: {
      maxTotalItems,
      maxNewPracticeItems,
    },
  };
}
