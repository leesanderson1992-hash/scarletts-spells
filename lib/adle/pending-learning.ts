export type PendingAdleLearningRoute = {
  learningItemId: string;
  canonicalWordId: string;
  canonicalWord: string;
  learnerSpelling: string | null;
  microSkillKey: string;
  microSkillName: string | null;
  itemStatus: string;
  lifecycleLabel: string;
  intakeOn: string | null;
};

export type PendingAdleLearningResult =
  | {
      status: "ready";
      routes: PendingAdleLearningRoute[];
    }
  | {
      status: "unavailable";
    };

const STATUS_ORDER: Record<string, number> = {
  pending_reteach: 0,
  pending: 1,
  in_lesson: 2,
  awaiting_review_outcome: 3,
  paused_parent_review: 4,
};

export const PENDING_ADLE_ITEM_STATUSES = Object.keys(STATUS_ORDER);

export function getPendingAdleLifecycleLabel(itemStatus: string) {
  switch (itemStatus) {
    case "pending_reteach":
      return "Reteach waiting";
    case "pending":
      return "Waiting to be scheduled";
    case "in_lesson":
      return "Lesson in progress";
    case "awaiting_review_outcome":
      return "In review cycle";
    case "paused_parent_review":
      return "Paused for parent review";
    default:
      return "Learning route active";
  }
}

export function sortPendingAdleLearningRoutes(routes: PendingAdleLearningRoute[]) {
  return [...routes].sort((left, right) => {
    const statusDifference =
      (STATUS_ORDER[left.itemStatus] ?? Number.MAX_SAFE_INTEGER) -
      (STATUS_ORDER[right.itemStatus] ?? Number.MAX_SAFE_INTEGER);
    if (statusDifference !== 0) {
      return statusDifference;
    }

    const leftIntake = left.intakeOn ?? "9999-12-31T23:59:59.999Z";
    const rightIntake = right.intakeOn ?? "9999-12-31T23:59:59.999Z";
    const intakeDifference = leftIntake.localeCompare(rightIntake);
    if (intakeDifference !== 0) {
      return intakeDifference;
    }

    return left.learningItemId.localeCompare(right.learningItemId);
  });
}
