/** Review finalisation advances per-word schedules. The lesson gate must use
 * the workload frozen with the assignment before Review began. */
export type FrozenReviewWorkloadR6 = {
  daily_assignment_id: string;
  child_id: string;
  assignment_date: string;
  due_count_at_start: number;
  session_cap_at_start: number;
  lesson_allowed_at_start: boolean;
  authority_version: string;
};

export function isReviewOnlyR6Day(workload: FrozenReviewWorkloadR6): boolean {
  if (workload.authority_version !== "adle_r6_mixed_per_word_due_v1"
    || !Number.isInteger(workload.due_count_at_start) || workload.due_count_at_start < 1
    || !Number.isInteger(workload.session_cap_at_start)
    || workload.session_cap_at_start < 1 || workload.session_cap_at_start > 10
    || workload.lesson_allowed_at_start !==
      (workload.due_count_at_start <= workload.session_cap_at_start)) {
    throw new Error("review_r6_frozen_workload_invalid");
  }
  return !workload.lesson_allowed_at_start;
}
