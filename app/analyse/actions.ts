"use server";

import { redirect } from "next/navigation";

import { generateDailyAssignmentPlan } from "@/lib/spelling/generateDailyAssignment";
import { createClient } from "@/lib/supabase/server";
import type { SpellingCategory } from "@/lib/spelling/categoriseError";
import {
  normaliseErrorPattern,
  type ErrorPattern,
} from "@/lib/spelling/errorPatterns";
import { normaliseWordFamilyId } from "@/lib/spelling/wordFamilies";
import { getWordsDueToday } from "@/lib/spelling/reviewScheduler";

import { replaceAnalysisForSample } from "./analysis";
import {
  parseAnalysisRow,
  stringifyAnalysisExtraMetadata,
} from "./types";

function buildRedirectUrl(
  params: Record<string, string | null>,
  basePath = "/analyse",
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function getFriendlyDatabaseError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't save today's assignment.";
  }

  if (message.includes("review_words")) {
    return "The daily_assignments table is missing the review_words column. Run the review_words migration in Supabase first.";
  }

  if (message.includes("focus_word") || message.includes("selected_family_slug")) {
    return "The daily_assignments table is missing the latest family metadata columns. Run the latest assignment metadata migration in Supabase first.";
  }

  if (message.includes("word_family_id")) {
    return "The daily_assignments table schema doesn't match the app yet. Please check the latest assignment migration in Supabase.";
  }

  if (message.includes("on conflict") || message.includes("constraint")) {
    return "The daily_assignments table is missing the expected unique constraint for child_id, assignment_date, and title.";
  }

  return `We couldn't save today's assignment. ${message}`;
}

function getDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function syncReviewedMisspellingsIntoQueue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentUserId: string,
  childId: string,
) {
  const { data: reviewedInstances } = await supabase
    .from("misspelling_instances")
    .select(
      "misspelled_word, corrected_word, error_type, is_false_positive, notes",
    )
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId);

  const reviewedMisspellings = (reviewedInstances ?? [])
    .map((instance) => ({
      instance,
      parsed: parseAnalysisRow(
        {
          suggested_word: instance.corrected_word,
          error_type: instance.error_type,
          secondary_error_type: null,
          confidence_score: null,
          is_parent_overridden: null,
          is_false_positive: instance.is_false_positive,
          notes: instance.notes,
        },
        instance.corrected_word,
      ),
    }))
    .filter(({ parsed }) => !parsed.isFalsePositive && Boolean(parsed.extra.parentReviewedAt))
    .map(({ instance, parsed }) => ({
      misspelledWord: instance.misspelled_word,
      correctedWord: instance.corrected_word,
      category: parsed.effectiveCategory,
      errorPattern: parsed.effectiveDiagnosis,
      selectedWordFamilyId:
        parsed.extra.parentOverrideFamilyId ?? parsed.extra.selectedWordFamilyId,
    }));

  const uniqueReviewedMisspellings = Array.from(
    new Map(
      reviewedMisspellings.map((item) => [item.correctedWord.trim().toLowerCase(), item]),
    ).values(),
  );

  const targetWords = uniqueReviewedMisspellings.map((item) => item.correctedWord.trim().toLowerCase());

  let skippedActiveWords = 0;

  if (targetWords.length > 0) {
    const { data: existingProgress } = await supabase
      .from("word_progress")
      .select("id, target_word, times_assigned, review_stage, mastered_at")
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId)
      .in("target_word", targetWords);

    const existingByWord = new Map(
      (existingProgress ?? []).map((row) => [row.target_word.trim().toLowerCase(), row]),
    );

    for (const word of targetWords) {
      const existing = existingByWord.get(word);

      if (existing && !existing.mastered_at) {
        skippedActiveWords += 1;
        continue;
      }

      if (existing) {
        await supabase
          .from("word_progress")
          .update({
            times_assigned: (existing.times_assigned ?? 0) + 1,
            review_stage: 0,
            mastered_at: null,
            last_assigned_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("parent_user_id", parentUserId);
        continue;
      }

      await supabase.from("word_progress").insert({
        child_id: childId,
        parent_user_id: parentUserId,
        target_word: word,
        word_family_id: null,
        times_assigned: 1,
        review_stage: 0,
        last_assigned_at: new Date().toISOString(),
      });
    }
  }

  const today = getDateOnly(new Date());
  const [{ data: progressRows }, { data: wordFamilyRows }, { data: existingAssignment }] =
    await Promise.all([
      supabase
        .from("word_progress")
        .select("target_word, review_stage, last_assigned_at, last_practised_at, mastered_at")
        .eq("parent_user_id", parentUserId)
        .eq("child_id", childId),
      supabase
        .from("word_families")
        .select("*"),
      supabase
        .from("daily_assignments")
        .select("id, status")
        .eq("parent_user_id", parentUserId)
        .eq("child_id", childId)
        .eq("assignment_date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const reviewWords = getWordsDueToday(progressRows ?? [], today).map(
    (row) => row.target_word,
  );
  const plan = generateDailyAssignmentPlan(
    uniqueReviewedMisspellings,
    reviewWords,
    (wordFamilyRows ?? []) as Array<Record<string, unknown>>,
  );

  if (plan.targetWords.length === 0 && plan.reviewWords.length === 0) {
    return {
      queuedCount: Math.max(targetWords.length - skippedActiveWords, 0),
      skippedActiveWords,
      assignmentUpdated: false,
    };
  }

  const assignmentPayload = {
    child_id: childId,
    parent_user_id: parentUserId,
    assignment_date: today,
    title: plan.title,
    instructions: plan.instructions,
    focus_word: plan.focusWord,
    selected_family_slug: plan.familyId,
    target_words: plan.targetWords,
    review_words: plan.reviewWords,
    status:
      existingAssignment?.status && existingAssignment.status !== "completed"
        ? existingAssignment.status
        : "pending",
    word_family_id: null,
  };

  if (existingAssignment) {
    await supabase
      .from("daily_assignments")
      .update(assignmentPayload)
      .eq("id", existingAssignment.id)
      .eq("parent_user_id", parentUserId);
  } else {
    await supabase.from("daily_assignments").insert(assignmentPayload);
  }

  return {
    queuedCount: Math.max(targetWords.length - skippedActiveWords, 0),
    skippedActiveWords,
    assignmentUpdated: true,
  };
}

export async function saveWritingSample(formData: FormData) {
  const childId = formData.get("child_id");
  const title = formData.get("title");
  const context = formData.get("context");
  const sampleText = formData.get("sample_text");
  const redirectChild =
    typeof formData.get("redirect_child") === "string"
      ? (formData.get("redirect_child") as string)
      : null;
  const redirectPath =
    typeof formData.get("redirect_path") === "string" &&
    (formData.get("redirect_path") as string).startsWith("/analyse")
      ? (formData.get("redirect_path") as string)
      : "/analyse";

  if (typeof childId !== "string" || !childId) {
    redirect(
      buildRedirectUrl(
        {
          error: "Please choose a child profile.",
          child: redirectChild,
        },
        redirectPath,
      ),
    );
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(
      buildRedirectUrl(
        {
          error: "Please enter a title for this writing sample.",
          child: redirectChild,
        },
        redirectPath,
      ),
    );
  }

  if (typeof sampleText !== "string" || !sampleText.trim()) {
    redirect(
      buildRedirectUrl(
        {
          error: "Please paste the writing sample before saving.",
          child: redirectChild,
        },
        redirectPath,
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

  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("parent_user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();

  if (!child) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't find that child profile.",
          child: redirectChild ?? childId,
        },
        redirectPath,
      ),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: insertedSample, error } = await supabase
    .from("writing_samples")
    .insert({
    child_id: childId,
    parent_user_id: user.id,
    title: title.trim(),
    sample_text: sampleText.trim(),
    source: typeof context === "string" && context.trim() ? context.trim() : "Parent writing intake",
    written_at: today,
    })
    .select("id, child_id, sample_text")
    .single();

  if (error || !insertedSample) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't save this writing sample. Please try again.",
          child: redirectChild ?? childId,
        },
        redirectPath,
      ),
    );
  }

  const { error: analysisError } = await replaceAnalysisForSample(
    supabase,
    insertedSample,
    user.id,
  );

  if (analysisError) {
    redirect(
      buildRedirectUrl(
        {
          error: "The writing sample was saved, but analysis could not be stored.",
          child: redirectChild ?? childId,
        },
        redirectPath,
      ),
    );
  }

  redirect(
    buildRedirectUrl(
      {
        saved: "1",
        child: redirectChild ?? childId,
      },
      redirectPath,
    ),
  );
}

export async function sendSubmissionToSpellingReview(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectChild =
    typeof formData.get("redirect_child") === "string"
      ? (formData.get("redirect_child") as string)
      : null;
  const redirectPath =
    typeof formData.get("redirect_path") === "string" &&
    (formData.get("redirect_path") as string).startsWith("/courses")
      ? (formData.get("redirect_path") as string)
      : "/courses";

  if (typeof submissionId !== "string" || !submissionId) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't send that writing submission to spelling review.",
          child: redirectChild,
        },
        redirectPath,
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

  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, child_id, submission_text, submitted_at, task_id")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!submission) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't find that writing submission.",
          child: redirectChild,
        },
        redirectPath,
      ),
    );
  }

  const [{ data: task }, { data: existingSample }] = await Promise.all([
    supabase
      .from("course_tasks")
      .select("id, title")
      .eq("id", submission.task_id)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("writing_samples")
      .select("id, child_id, sample_text")
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
  ]);

  if (existingSample) {
    redirect(
      buildRedirectUrl(
        {
          saved: "1",
          child: redirectChild ?? existingSample.child_id,
        },
        "/analyse",
      ),
    );
  }

  const writtenAt = submission.submitted_at.slice(0, 10);
  const { data: insertedSample, error } = await supabase
    .from("writing_samples")
    .insert({
      child_id: submission.child_id,
      parent_user_id: user.id,
      title: task?.title ? `${task.title} submission` : "Course task submission",
      sample_text: submission.submission_text.trim(),
      source: "Course task submission",
      written_at: writtenAt,
      task_submission_id: submission.id,
    })
    .select("id, child_id, sample_text")
    .single();

  if (error || !insertedSample) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't send that writing to spelling review just yet.",
          child: redirectChild ?? submission.child_id,
        },
        redirectPath,
      ),
    );
  }

  const { error: analysisError } = await replaceAnalysisForSample(
    supabase,
    insertedSample,
    user.id,
  );

  if (analysisError) {
    redirect(
      buildRedirectUrl(
        {
          error: "The writing was saved for spelling review, but the analysis could not be stored.",
          child: redirectChild ?? submission.child_id,
        },
        redirectPath,
      ),
    );
  }

  redirect(
    buildRedirectUrl(
      {
        saved: "1",
        child: redirectChild ?? submission.child_id,
      },
      "/analyse",
    ),
  );
}

export async function updateMisspellingClassification(formData: FormData) {
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const misspellingInstanceIds = formData.get("misspelling_instance_ids");
  const overrideCategory = formData.get("override_category");
  const overrideFamilyId = formData.get("override_family_id");
  const overrideDiagnosis = formData.get("override_diagnosis");
  const flagFalsePositive = formData.get("flag_false_positive");
  const markReviewed = formData.get("mark_reviewed");
  const reopenReview = formData.get("reopen_review");
  const redirectChild =
    typeof formData.get("redirect_child") === "string"
      ? (formData.get("redirect_child") as string)
      : null;
  const redirectPath =
    typeof formData.get("redirect_path") === "string" &&
    (formData.get("redirect_path") as string).startsWith("/analyse")
      ? (formData.get("redirect_path") as string)
      : "/analyse";

  const targetIds =
    typeof misspellingInstanceIds === "string" && misspellingInstanceIds
      ? misspellingInstanceIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : typeof misspellingInstanceId === "string" && misspellingInstanceId
        ? [misspellingInstanceId]
        : [];

  if (targetIds.length === 0) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't update that analysis item.",
          child: redirectChild,
        },
        redirectPath,
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

  const { data: instance } = await supabase
    .from("misspelling_instances")
    .select("id, child_id, corrected_word, error_type, secondary_error_type, confidence_score, suggested_word, is_parent_overridden, is_false_positive, notes")
    .in("id", targetIds)
    .eq("parent_user_id", user.id)
    .order("position_start", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!instance) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't find that analysis item.",
          child: redirectChild,
        },
        redirectPath,
      ),
    );
  }

  const parsed = parseAnalysisRow(instance, instance.corrected_word);
  const requestedCategory =
    typeof overrideCategory === "string" && overrideCategory
      ? (overrideCategory as SpellingCategory)
      : null;
  const nextMarkedCareless = requestedCategory === "Careless performance error";
  const nextParentOverrideCategory =
    requestedCategory && requestedCategory !== "Careless performance error"
      ? requestedCategory
      : null;
  const nextParentOverrideFamilyId =
    typeof overrideFamilyId === "string" && overrideFamilyId
      ? normaliseWordFamilyId(overrideFamilyId)
      : null;
  const nextParentOverrideDiagnosis =
    typeof overrideDiagnosis === "string" && overrideDiagnosis
      ? (normaliseErrorPattern(overrideDiagnosis) as ErrorPattern | null)
      : null;
  const nextFalsePositive = flagFalsePositive === "on";
  const shouldMarkReviewed =
    (markReviewed === "on" && reopenReview !== "on") ||
    nextParentOverrideCategory !== parsed.extra.parentOverrideCategory ||
    nextParentOverrideFamilyId !== parsed.extra.parentOverrideFamilyId ||
    nextParentOverrideDiagnosis !== parsed.extra.parentOverrideDiagnosis ||
    nextMarkedCareless !== parsed.extra.markedCareless ||
    nextFalsePositive !== parsed.isFalsePositive;
  const nextExtraMetadata = {
    ...parsed.extra,
    detectedPrimaryCategory:
      parsed.extra.detectedPrimaryCategory ?? parsed.primaryCategory,
    parentOverrideCategory: nextParentOverrideCategory,
    parentOverrideFamilyId: nextParentOverrideFamilyId,
    parentOverrideDiagnosis: nextParentOverrideDiagnosis,
    parentReviewedAt:
      reopenReview === "on"
        ? null
        : shouldMarkReviewed
          ? parsed.extra.parentReviewedAt ?? new Date().toISOString()
          : parsed.extra.parentReviewedAt,
    markedCareless: nextMarkedCareless,
  };
  const nextErrorType = nextExtraMetadata.markedCareless
    ? "Careless performance error"
    : nextExtraMetadata.parentOverrideCategory ?? parsed.primaryCategory;

  const { error } = await supabase
    .from("misspelling_instances")
    .update({
      error_type: nextErrorType,
      is_parent_overridden:
        nextFalsePositive ||
        nextExtraMetadata.markedCareless ||
        nextExtraMetadata.parentOverrideCategory !== null ||
        nextExtraMetadata.parentOverrideFamilyId !== null ||
        nextExtraMetadata.parentOverrideDiagnosis !== null,
      is_false_positive: nextFalsePositive,
      notes: stringifyAnalysisExtraMetadata(nextExtraMetadata),
    })
    .in("id", targetIds)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't update that analysis item.",
          child: redirectChild,
        },
        redirectPath,
      ),
    );
  }

  const shouldQueueReviewedItems =
    reopenReview !== "on" &&
    !nextFalsePositive &&
    Boolean(nextExtraMetadata.parentReviewedAt);

  if (shouldQueueReviewedItems) {
    await syncReviewedMisspellingsIntoQueue(
      supabase,
      user.id,
      instance.child_id,
    );
  }

  redirect(
    buildRedirectUrl(
      {
        updated: "1",
        assigned: shouldQueueReviewedItems ? "1" : null,
        child: redirectChild,
      },
      redirectPath,
    ),
  );
}

export async function reanalyseWritingSample(formData: FormData) {
  const writingSampleId = formData.get("writing_sample_id");
  const redirectChild =
    typeof formData.get("redirect_child") === "string"
      ? (formData.get("redirect_child") as string)
      : null;
  const redirectPath =
    typeof formData.get("redirect_path") === "string" &&
    (formData.get("redirect_path") as string).startsWith("/analyse")
      ? (formData.get("redirect_path") as string)
      : "/analyse";

  if (typeof writingSampleId !== "string" || !writingSampleId) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't reanalyse that writing sample.",
          child: redirectChild,
        },
        redirectPath,
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

  const { data: sample } = await supabase
    .from("writing_samples")
    .select("id, child_id, sample_text")
    .eq("id", writingSampleId)
    .eq("parent_user_id", user.id)
    .single();

  if (!sample) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't find that writing sample.",
          child: redirectChild,
        },
        redirectPath,
      ),
    );
  }

  const { error } = await replaceAnalysisForSample(supabase, sample, user.id);

  if (error) {
    redirect(
      buildRedirectUrl(
        {
          error: "We couldn't reanalyse that writing sample.",
          child: redirectChild ?? sample.child_id,
        },
        redirectPath,
      ),
    );
  }

  redirect(
    buildRedirectUrl(
      {
        updated: "1",
        reanalysed: "1",
        child: redirectChild ?? sample.child_id,
      },
      redirectPath,
    ),
  );
}

export async function generateDailyAssignment(formData: FormData) {
  const childId = formData.get("assignment_child_id");
  const redirectChild =
    typeof formData.get("redirect_child") === "string"
      ? (formData.get("redirect_child") as string)
      : null;
  const redirectPath =
    typeof formData.get("redirect_path") === "string" &&
    (formData.get("redirect_path") as string).startsWith("/analyse")
      ? (formData.get("redirect_path") as string)
      : "/analyse";

  if (typeof childId !== "string" || !childId) {
    redirect(
      buildRedirectUrl(
        {
          error: "Please choose a child before generating an assignment.",
          child: redirectChild,
        },
        redirectPath,
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

  const { data: latestSample } = await supabase
    .from("writing_samples")
    .select("id, child_id, title")
    .eq("parent_user_id", user.id)
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestSample) {
    redirect(
      buildRedirectUrl(
        {
          error: "No analysed writing sample was found for that child yet.",
          child: redirectChild ?? childId,
        },
        redirectPath,
      ),
    );
  }

  const { data: instances } = await supabase
    .from("misspelling_instances")
    .select(
      "misspelled_word, corrected_word, error_type, is_false_positive, notes",
    )
    .eq("parent_user_id", user.id)
    .eq("child_id", childId)
    .eq("writing_sample_id", latestSample.id);

  const relevantMisspellings = (instances ?? [])
    .map((instance) => ({
      instance,
      parsed: parseAnalysisRow(
        {
          suggested_word: instance.corrected_word,
          error_type: instance.error_type,
          secondary_error_type: null,
          confidence_score: null,
          is_parent_overridden: null,
          is_false_positive: instance.is_false_positive,
          notes: instance.notes,
        },
        instance.corrected_word,
      ),
    }))
    .filter(({ parsed }) => !parsed.isFalsePositive)
    .map(({ instance, parsed }) => ({
      misspelledWord: instance.misspelled_word,
      correctedWord: instance.corrected_word,
      category: parsed.effectiveCategory,
      errorPattern: parsed.effectiveDiagnosis,
      selectedWordFamilyId:
        parsed.extra.parentOverrideFamilyId ?? parsed.extra.selectedWordFamilyId,
      reviewedAt: parsed.extra.parentReviewedAt,
      hasParentOverride: Boolean(
        parsed.extra.parentOverrideCategory ||
          parsed.extra.parentOverrideDiagnosis ||
          parsed.extra.parentOverrideFamilyId ||
          parsed.extra.markedCareless,
      ),
    }));

  relevantMisspellings.sort((left, right) => {
    const leftReviewed = left.reviewedAt ? 1 : 0;
    const rightReviewed = right.reviewedAt ? 1 : 0;
    if (leftReviewed !== rightReviewed) {
      return rightReviewed - leftReviewed;
    }

    const leftOverride = left.hasParentOverride ? 1 : 0;
    const rightOverride = right.hasParentOverride ? 1 : 0;
    if (leftOverride !== rightOverride) {
      return rightOverride - leftOverride;
    }

    return left.correctedWord.localeCompare(right.correctedWord);
  });

  const today = getDateOnly(new Date());

  const { data: progressRows } = await supabase
    .from("word_progress")
    .select("target_word, review_stage, last_assigned_at, last_practised_at, mastered_at")
    .eq("parent_user_id", user.id)
    .eq("child_id", childId);

  const { data: wordFamilyRows } = await supabase
    .from("word_families")
    .select("*");

  const reviewWords = getWordsDueToday(progressRows ?? [], today).map(
    (row) => row.target_word,
  );

  const plan = generateDailyAssignmentPlan(
    relevantMisspellings,
    reviewWords,
    (wordFamilyRows ?? []) as Array<Record<string, unknown>>,
  );

  if (plan.targetWords.length === 0 && plan.reviewWords.length === 0) {
    redirect(
      buildRedirectUrl(
        {
          error: "There isn't enough analysed spelling data yet to generate an assignment.",
          child: redirectChild ?? childId,
        },
        redirectPath,
      ),
    );
  }

  const { data: existingAssignment } = await supabase
    .from("daily_assignments")
    .select("id, target_words, review_words, status, focus_word, selected_family_slug")
    .eq("parent_user_id", user.id)
    .eq("child_id", childId)
    .eq("assignment_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingTargetWords = ((existingAssignment?.target_words ?? []) as string[])
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  const existingReviewWords = ((existingAssignment?.review_words ?? []) as string[])
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  const sameAssignmentWords =
    existingTargetWords.join("::") === plan.targetWords.join("::") &&
    existingReviewWords.join("::") === plan.reviewWords.join("::") &&
    (existingAssignment?.focus_word ?? null) === plan.focusWord &&
    (existingAssignment?.selected_family_slug ?? null) === (plan.familyId ?? null);
  const nextAssignmentStatus =
    sameAssignmentWords && existingAssignment?.status
      ? existingAssignment.status
      : "pending";

  const assignmentPayload = {
    child_id: childId,
    parent_user_id: user.id,
    assignment_date: today,
    title: plan.title,
    instructions: plan.instructions,
    focus_word: plan.focusWord,
    selected_family_slug: plan.familyId,
    target_words: plan.targetWords,
    review_words: plan.reviewWords,
    status: nextAssignmentStatus,
    word_family_id: null,
  };

  const assignmentMutation = existingAssignment
    ? supabase
        .from("daily_assignments")
        .update(assignmentPayload)
        .eq("id", existingAssignment.id)
        .eq("parent_user_id", user.id)
    : supabase.from("daily_assignments").insert(assignmentPayload);

  const { error: assignmentError } = await assignmentMutation;

  if (assignmentError) {
    redirect(
      buildRedirectUrl(
        {
          error: getFriendlyDatabaseError(assignmentError.message),
          child: redirectChild ?? childId,
        },
        redirectPath,
      ),
    );
  }

  const targetWordsToTrack = existingAssignment
    ? plan.targetWords.filter((word) => !existingTargetWords.includes(word))
    : plan.targetWords;
  if (targetWordsToTrack.length > 0) {
    const { data: existingProgress } = await supabase
      .from("word_progress")
      .select("id, target_word, times_assigned, review_stage")
      .eq("parent_user_id", user.id)
      .eq("child_id", childId)
      .in("target_word", targetWordsToTrack);

    const existingByWord = new Map(
      (existingProgress ?? []).map((row) => [row.target_word, row]),
    );

    for (const word of targetWordsToTrack) {
      const existing = existingByWord.get(word);

      if (existing) {
        await supabase
          .from("word_progress")
          .update({
            times_assigned: (existing.times_assigned ?? 0) + 1,
            last_assigned_at: new Date().toISOString(),
            review_stage: existing.review_stage ?? 0,
          })
          .eq("id", existing.id)
          .eq("parent_user_id", user.id);
      } else {
        await supabase.from("word_progress").insert({
          child_id: childId,
          parent_user_id: user.id,
          target_word: word,
          word_family_id: null,
          times_assigned: 1,
          review_stage: 0,
          last_assigned_at: new Date().toISOString(),
        });
      }
    }
  }

  redirect(
    buildRedirectUrl(
      {
        assigned: "1",
        child: redirectChild ?? childId,
      },
      redirectPath,
    ),
  );
}
