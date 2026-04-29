"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  categoriseError,
  getSecondaryCategory,
} from "@/lib/spelling/categoriseError";
import {
  detectErrorPattern,
  selectTeachingFamilyForError,
} from "@/lib/spelling/errorPatterns";
import { findWordFamilyForWord } from "@/lib/spelling/wordFamilies";
import { createClient } from "@/lib/supabase/server";
import { stringifyAnalysisExtraMetadata } from "@/app/analyse/types";
import { maybeAwardTaskSubmissionApprovalCoins } from "@/lib/rewards/task-coins";

import { normaliseWordForLookup } from "./review-utils";

function buildRedirectWithMessage(
  path: string,
  key: "saved" | "error",
  value: string,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWordRange(text: string, word: string) {
  const exactPattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
  const exactMatch = exactPattern.exec(text);

  if (exactMatch?.index !== undefined) {
    return {
      start: exactMatch.index,
      end: exactMatch.index + exactMatch[0].length,
      raw: exactMatch[0],
    };
  }

  const looseIndex = text.toLowerCase().indexOf(word.toLowerCase());
  if (looseIndex >= 0) {
    return {
      start: looseIndex,
      end: looseIndex + word.length,
      raw: text.slice(looseIndex, looseIndex + word.length),
    };
  }

  return null;
}

async function getOwnedSubmission(
  submissionId: string,
  userId: string,
) {
  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, task_id, course_id, child_id, submitted_at")
    .eq("id", submissionId)
    .eq("parent_user_id", userId)
    .maybeSingle();

  return { supabase, submission };
}

export async function addMissedWordToSubmissionReview(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspelledWord = formData.get("misspelled_word");
  const correctedWord = formData.get("corrected_word");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof misspelledWord !== "string" ||
    !misspelledWord.trim() ||
    typeof correctedWord !== "string" ||
    !correctedWord.trim()
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Add both the word the child wrote and the correct spelling.",
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const safeMisspelledWord = normaliseWordForLookup(misspelledWord);
  const safeCorrectedWord = normaliseWordForLookup(correctedWord);

  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, child_id")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that submission anymore.",
      ),
    );
  }

  const { data: sample } = await supabase
    .from("writing_samples")
    .select("id, child_id, sample_text")
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!sample) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission does not have a writing sample to review.",
      ),
    );
  }

  const { data: existing } = await supabase
    .from("misspelling_instances")
    .select("id")
    .eq("writing_sample_id", sample.id)
    .eq("parent_user_id", user.id)
    .eq("misspelled_word", safeMisspelledWord)
    .eq("corrected_word", safeCorrectedWord)
    .maybeSingle();

  if (existing) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "That missed word is already on the review list.",
      ),
    );
  }

  const range = findWordRange(sample.sample_text, safeMisspelledWord);
  const detectedErrorPattern =
    detectErrorPattern(safeMisspelledWord, safeCorrectedWord) ??
    "tricky_whole_word_error";
  const category = categoriseError(
    safeMisspelledWord,
    safeCorrectedWord,
    detectedErrorPattern,
  );
  const secondaryCategory = getSecondaryCategory(
    safeMisspelledWord,
    safeCorrectedWord,
    category,
    detectedErrorPattern,
  );
  const selectedWordFamilyId =
    selectTeachingFamilyForError(
      safeMisspelledWord,
      safeCorrectedWord,
      detectedErrorPattern,
    ) ??
    findWordFamilyForWord(safeCorrectedWord)?.id ??
    null;

  const { error } = await supabase.from("misspelling_instances").insert({
    writing_sample_id: sample.id,
    child_id: sample.child_id,
    parent_user_id: user.id,
    misspelled_word: safeMisspelledWord,
    corrected_word: safeCorrectedWord,
    suggested_word: safeCorrectedWord,
    error_type: category,
    secondary_error_type: secondaryCategory,
    confidence_score: 1,
    is_false_positive: false,
    is_parent_overridden: false,
    word_family_id: null,
    context_text: range?.raw ?? safeMisspelledWord,
    position_start: range?.start ?? null,
    position_end: range?.end ?? null,
    notes: stringifyAnalysisExtraMetadata({
      detectedPrimaryCategory: category,
      parentOverrideCategory: null,
      parentOverrideFamilyId: null,
      parentOverrideDiagnosis: null,
      parentReviewedAt: null,
      markedCareless: false,
      detectedErrorPattern,
      selectedWordFamilyId,
    }),
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't add that missed word just yet.",
      ),
    );
  }

  revalidatePath("/courses/review");
  revalidatePath(safeRedirectPath);
  revalidatePath("/analyse");
  revalidatePath("/analyse/review");

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Missed word added to the review list.",
    ),
  );
}

export async function deleteSubmissionFromReview(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't find that submission."));
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

  const { data: linkedSamples } = await supabase
    .from("writing_samples")
    .select("id")
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id);

  const sampleIds = (linkedSamples ?? []).map((sample) => sample.id);

  if (sampleIds.length > 0) {
    await supabase
      .from("misspelling_instances")
      .delete()
      .eq("parent_user_id", user.id)
      .in("writing_sample_id", sampleIds);

    await supabase
      .from("writing_samples")
      .delete()
      .eq("parent_user_id", user.id)
      .in("id", sampleIds);
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, title, task_type, monthly_goal_total, gold_bar_rule, gold_coin_reward_amount")
    .eq("id", submission.task_id)
    .eq("course_id", submission.course_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find the task for that submission.",
      ),
    );
  }

  const { error } = await supabase
    .from("task_submissions")
    .delete()
    .eq("id", submission.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't delete that submission just yet.",
      ),
    );
  }

  await maybeAwardTaskSubmissionApprovalCoins({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    task,
    submissionId: submission.id,
  });

  revalidatePath("/courses/review");
  revalidatePath("/dashboard");
  revalidatePath("/insights");
  revalidatePath("/learn");
  revalidatePath("/learn/week");
  revalidatePath("/analyse");
  revalidatePath("/analyse/review");

  redirect(
    buildRedirectWithMessage(
      "/courses/review",
      "saved",
      "Submission deleted.",
    ),
  );
}

export async function returnSubmissionToChild(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const parentNote = formData.get("parent_review_note");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't find that submission."));
  }

  const safeParentNote =
    typeof parentNote === "string" && parentNote.trim().length > 0
      ? parentNote.trim().slice(0, 500)
      : null;

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

  const safeFieldFeedback = Object.fromEntries(
    Array.from(formData.entries())
      .filter(
        ([key, value]) =>
          key.startsWith("field_feedback__") &&
          typeof value === "string" &&
          value.trim().length > 0,
      )
      .map(([key, value]) => [
        key.replace("field_feedback__", ""),
        (value as string).trim().slice(0, 500),
      ]),
  );

  const { data: existingDraft } = await supabase
    .from("task_submission_drafts")
    .select("draft_text, draft_review_summary, draft_payload")
    .eq("task_id", submission.task_id)
    .eq("child_id", submission.child_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  const mergedDraftPayload =
    existingDraft?.draft_payload &&
    typeof existingDraft.draft_payload === "object" &&
    !Array.isArray(existingDraft.draft_payload)
      ? {
          ...(existingDraft.draft_payload as Record<string, unknown>),
          __field_feedback: safeFieldFeedback,
        }
      : { __field_feedback: safeFieldFeedback };

  const { error } = await supabase
    .from("task_submissions")
    .update({
      parent_review_status: "returned",
      parent_review_note: safeParentNote,
      parent_reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't send that submission back just yet.",
      ),
    );
  }

  await supabase
    .from("task_submission_drafts")
    .delete()
    .eq("task_id", submission.task_id)
    .eq("child_id", submission.child_id)
    .eq("parent_user_id", user.id);

  revalidatePath("/courses/review");
  revalidatePath("/dashboard");
  revalidatePath("/learn");
  revalidatePath("/learn/week");

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Sent back to child.",
    ),
  );
}

export async function approveSubmissionReview(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't find that submission."));
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

  const { error } = await supabase
    .from("task_submissions")
    .update({
      parent_review_status: "approved",
      parent_reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't approve that submission just yet.",
      ),
    );
  }

  await supabase
    .from("task_submission_drafts")
    .delete()
    .eq("task_id", submission.task_id)
    .eq("child_id", submission.child_id)
    .eq("parent_user_id", user.id);

  revalidatePath("/courses/review");
  revalidatePath("/dashboard");
  revalidatePath("/learn");
  revalidatePath("/learn/week");

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Submission approved.",
    ),
  );
}
