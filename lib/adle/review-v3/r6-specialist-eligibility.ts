import type { DailyPlanFacts } from "../daily-assignment-composer";
import { throttlePredicate } from "../review-due-queue";
import type { IsoDate } from "../review-scheduler";

/** Review completion must respect the same uncapped daily lesson throttle as
 * the composer before dispatching any specialist or generic lesson route. */
export function isReviewOnlyR6Day(
  facts: Pick<DailyPlanFacts, "reviewPolicy" | "bundles" | "scheduleWords">,
  date: IsoDate,
): boolean {
  return !throttlePredicate(facts.reviewPolicy, facts.bundles, facts.scheduleWords, date).lessonAllowed;
}
