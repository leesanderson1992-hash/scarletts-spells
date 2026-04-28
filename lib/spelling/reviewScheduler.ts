export const REVIEW_INTERVALS = [1, 3, 7, 14] as const;

export type ReviewStage = 0 | 1 | 2 | 3;

type ReviewWordProgressLike = {
  target_word: string;
  review_stage: number | null;
  last_assigned_at: string | null;
  last_practised_at: string | null;
  mastered_at: string | null;
};

function normaliseDateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getClampedReviewStage(stage: number | null | undefined): ReviewStage {
  if (typeof stage !== "number" || Number.isNaN(stage)) {
    return 0;
  }

  return Math.max(0, Math.min(stage, REVIEW_INTERVALS.length - 1)) as ReviewStage;
}

export function calculateNextReviewDate(
  reviewStage: number | null | undefined,
  referenceDate: string | Date,
) {
  const stage = getClampedReviewStage(reviewStage);
  const baseDate =
    typeof referenceDate === "string"
      ? normaliseDateOnly(referenceDate.slice(0, 10))
      : normaliseDateOnly(formatDateOnly(referenceDate));

  return formatDateOnly(addDays(baseDate, REVIEW_INTERVALS[stage]));
}

function isDueOnOrBeforeToday(nextReviewDate: string, today: string) {
  return normaliseDateOnly(nextReviewDate).getTime() <= normaliseDateOnly(today).getTime();
}

export function advanceReviewStage(
  reviewStage: number | null | undefined,
): ReviewStage {
  const stage = getClampedReviewStage(reviewStage);
  return Math.min(stage + 1, REVIEW_INTERVALS.length - 1) as ReviewStage;
}

export function repeatReviewStage(
  reviewStage: number | null | undefined,
): ReviewStage {
  return getClampedReviewStage(reviewStage);
}

export function regressReviewStage(
  reviewStage: number | null | undefined,
): ReviewStage {
  const stage = getClampedReviewStage(reviewStage);

  if (stage <= 1) {
    return 0;
  }

  return (stage - 1) as ReviewStage;
}

export function getWordsDueToday(
  rows: ReviewWordProgressLike[],
  today: string,
) {
  return rows.filter((row) => {
    if (!row.target_word || row.mastered_at) {
      return false;
    }

    const anchorDate = row.last_practised_at ?? row.last_assigned_at;
    if (!anchorDate) {
      return true;
    }

    return isDueOnOrBeforeToday(
      calculateNextReviewDate(row.review_stage, anchorDate),
      today,
    );
  });
}
