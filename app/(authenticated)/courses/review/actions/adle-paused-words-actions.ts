import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resumeItemFromParentReview,
  retireItemFromParentReview,
} from "@/lib/adle/learning-items";
import {
  releasePausedScheduleWord,
  type PausedWordReleaseDecision,
} from "@/lib/adle/review-scheduler";
import { loadActiveReviewPolicy } from "@/lib/adle/loaders/composer-facts-loader";
import {
  learningItemFromRow,
  scheduleWordFromRow,
  type LearningItemRow,
  type ScheduleWordRow,
} from "@/lib/adle/loaders/rows";
import { persistPausedWordRelease } from "@/lib/adle/loaders/session-completion-loader";

import { buildRedirectWithMessage } from "./_shared";

/**
 * ADLE Slice 6: parent release of a paused word, inside the existing Review
 * Work surface. Two decisions: resume (back to the reteach path) or retire
 * (out of the queue). Re-mapping is the existing candidate-mapping flow's
 * job — never a release decision. The word_pending_parent_review composer
 * skip lifts automatically once the statuses change.
 */
export async function releaseAdlePausedWordImpl(formData: FormData) {
  const childId = formData.get("child_id");
  const canonicalWordId = formData.get("canonical_word_id");
  const decisionRaw = formData.get("decision");
  const redirectPath = formData.get("redirect_path");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (
    typeof childId !== "string" ||
    !childId ||
    typeof canonicalWordId !== "string" ||
    !canonicalWordId ||
    (decisionRaw !== "resume" && decisionRaw !== "retire")
  ) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't read that release request."));
  }
  const decision = decisionRaw as PausedWordReleaseDecision;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const children = await getActiveChildrenForUser(supabase, user.id);
  if (!children.some((child) => child.id === childId)) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "That child isn't part of this family."));
  }

  const serviceClient = createServiceRoleClient();
  const [policy, wordRows, itemRows] = await Promise.all([
    loadActiveReviewPolicy(serviceClient),
    serviceClient
      .from("adle_review_schedule_words")
      .select(
        "child_id, canonical_word_id, bundle_id, membership_status, catch_up_stage, next_retest_due_on, failed_review_on, pre_retirement_check_due_on, last_28_day_review_on, reteach_cycle_count, taught_on, row_status",
      )
      .eq("child_id", childId)
      .eq("canonical_word_id", canonicalWordId)
      .eq("membership_status", "paused_parent_review")
      .eq("row_status", "active"),
    serviceClient
      .from("adle_learning_items")
      .select(
        "id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status",
      )
      .eq("child_id", childId)
      .eq("canonical_word_id", canonicalWordId)
      .eq("item_status", "paused_parent_review")
      .eq("row_status", "active"),
  ]);
  if (wordRows.error || itemRows.error) {
    redirect(
      buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't load that paused word just yet."),
    );
  }
  const words = ((wordRows.data ?? []) as ScheduleWordRow[]).map(scheduleWordFromRow);
  if (words.length === 0) {
    redirect(
      buildRedirectWithMessage(safeRedirectPath, "error", "That word is no longer paused for review."),
    );
  }

  const releasedOn = getDateOnly();
  const release = releasePausedScheduleWord(policy, words[0], decision, releasedOn);
  const items = ((itemRows.data ?? []) as LearningItemRow[]).map(learningItemFromRow);
  const itemTransitions = items.map((item) =>
    decision === "resume" ? resumeItemFromParentReview(item, releasedOn) : retireItemFromParentReview(item),
  );

  await persistPausedWordRelease(serviceClient, {
    word: release.word,
    events: release.events,
    itemTransitions,
  });

  revalidatePath("/courses/review");
  revalidatePath("/learn/week");
  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      decision === "resume"
        ? "Word resumed — it will be retaught in an upcoming lesson."
        : "Word retired from the spelling queue.",
    ),
  );
}
