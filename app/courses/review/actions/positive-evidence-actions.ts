import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { confirmPositiveEvidenceSuggestions } from "@/lib/writing-practice/positive-evidence";

import {
  buildRedirectWithMessage,
  getOwnedSubmission,
  parseSuggestionIdsFromFormData,
  revalidateReviewDetailAndInsights,
} from "./_shared";

async function dismissSubmissionHelperSuggestions(input: {
  parentUserId: string;
  redirectPath: string;
  submissionId: string;
  suggestionIds: string[];
}) {
  const { supabase, submission } = await getOwnedSubmission(
    input.submissionId,
    input.parentUserId,
  );

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        input.redirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const nowIso = new Date().toISOString();
  const { data: dismissedRows, error } = await supabase
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "rejected",
      rejected_at: nowIso,
      resolved_at: nowIso,
    })
    .eq("parent_user_id", input.parentUserId)
    .eq("task_submission_id", input.submissionId)
    .in("id", input.suggestionIds)
    .in("source_type", ["historic_mistake", "micro_skill_watchlist", "transfer_failure_watchlist"])
    .eq("suggestion_status", "pending")
    .select("id");

  if (error) {
    redirect(
      buildRedirectWithMessage(
        input.redirectPath,
        "error",
        "We couldn't dismiss those watchouts just yet.",
      ),
    );
  }

  revalidateReviewDetailAndInsights(input.redirectPath);
  const dismissedCount = dismissedRows?.length ?? 0;

  redirect(
    buildRedirectWithMessage(
      input.redirectPath,
      dismissedCount > 0 ? "saved" : "error",
      dismissedCount > 0
        ? `Dismissed ${dismissedCount} watchout${dismissedCount === 1 ? "" : "s"}.`
        : "No pending watchouts were ready to dismiss.",
    ),
  );
}

export async function confirmSubmissionPositiveEvidenceImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionId = formData.get("suggestion_id");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof suggestionId !== "string" ||
    !suggestionId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that transfer evidence to confirm.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { supabase, submission } = await getOwnedSubmission(submissionId, user.id);

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const summary = await confirmPositiveEvidenceSuggestions({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    suggestionIds: [suggestionId],
    surface: "review_detail",
    maxConfirmCount: 1,
  });

  revalidateReviewDetailAndInsights(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      summary.confirmedCount > 0 ? "saved" : "error",
      summary.confirmedCount > 0
        ? summary.promotedLevel5Count > 0 || summary.promotedLevel4Count > 0
          ? "Transfer evidence confirmed. This strengthens the mini-skill record with real-writing evidence."
          : "Transfer evidence confirmed."
        : "That transfer evidence could not be confirmed from this review signal.",
    ),
  );
}

export async function bulkConfirmSubmissionPositiveEvidenceImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionIds = parseSuggestionIdsFromFormData(formData);

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId || suggestionIds.length === 0) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Select at least one watchout before confirming.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { supabase, submission } = await getOwnedSubmission(submissionId, user.id);

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const summary = await confirmPositiveEvidenceSuggestions({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    suggestionIds,
    surface: "review_detail",
    maxConfirmCount: 5,
  });

  revalidateReviewDetailAndInsights(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      summary.confirmedCount > 0 ? "saved" : "error",
      summary.confirmedCount > 0
        ? `Confirmed ${summary.confirmedCount} transfer match${
            summary.confirmedCount === 1 ? "" : "es"
          }.`
        : "No eligible transfer matches were ready to confirm.",
    ),
  );
}

export async function dismissSubmissionPositiveEvidenceImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionId = formData.get("suggestion_id");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof suggestionId !== "string" ||
    !suggestionId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that watchout to dismiss.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await dismissSubmissionHelperSuggestions({
    parentUserId: user.id,
    redirectPath: safeRedirectPath,
    submissionId,
    suggestionIds: [suggestionId],
  });
}

export async function bulkDismissSubmissionPositiveEvidenceImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionIds = parseSuggestionIdsFromFormData(formData);

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId || suggestionIds.length === 0) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Select at least one watchout before dismissing.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await dismissSubmissionHelperSuggestions({
    parentUserId: user.id,
    redirectPath: safeRedirectPath,
    submissionId,
    suggestionIds,
  });
}
