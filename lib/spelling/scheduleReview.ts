export type ReviewStepLabel =
  | "Day 1"
  | "Day 2"
  | "Day 4"
  | "Day 7"
  | "Day 14"
  | "Day 30";

export type ReviewScheduleEntry = {
  label: ReviewStepLabel;
  offsetDays: number;
  date: string;
};

const REVIEW_STEPS: Array<[ReviewStepLabel, number]> = [
  ["Day 1", 1],
  ["Day 2", 2],
  ["Day 4", 4],
  ["Day 7", 7],
  ["Day 14", 14],
  ["Day 30", 30],
];

export function scheduleReview(startDate: Date | string = new Date()): ReviewScheduleEntry[] {
  const baseDate = typeof startDate === "string" ? new Date(startDate) : new Date(startDate);

  return REVIEW_STEPS.map(([label, offsetDays]) => {
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + offsetDays);

    return {
      label,
      offsetDays,
      date: nextDate.toISOString().slice(0, 10),
    };
  });
}
