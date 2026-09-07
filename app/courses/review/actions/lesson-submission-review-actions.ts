import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { stringifyAnalysisExtraMetadata } from "@/lib/writing-engine/spelling/legacy-analysis";
import { analyseParentAddedMisspellingPair } from "@/lib/writing-engine/spelling/parent-added-misspelling-analysis";
import {
  resolveParentIdentifiedOccurrence,
  type ParentIdentifiedOccurrenceCandidate,
} from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { readSnapshotField } from "@/lib/writing-engine/whole-writing/context-source";
import type { SourceSnapshot } from "@/lib/writing-engine/whole-writing/source";

import {
  backfillPendingSubmissionSuggestionCanonicalMicroSkill,
  resolveScopedMicroSkillForSubmissionSuggestion,
  type MisspellingSuggestionLookupRow,
} from "./canonical-spelling-backfill-actions";
import { mergeScopedSubmissionMicroSkillResolutionMetadata } from "../resolver-visible-priority";
import {
  buildRedirectWithMessage,
  findWordRange,
  getLinkedWritingSample,
  getOwnedSubmission,
  getStructuredLessonReviewContext,
  inferStructuredLessonFieldMatch,
  normaliseMicroSkillKey,
  normaliseOptionalIssueText,
  revalidateReviewQueueAndDetail,
  revalidateReviewQueueAndDetailBestEffort,
  type ReviewSupabase,
} from "./_shared";
import { normaliseWordForLookup } from "../review-utils";

export async function findOrCreateSuggestionForMisspelling({
  supabase,
  parentUserId,
  childId,
  taskSubmissionId,
  writingSampleId,
  misspellingInstanceId,
  observedText,
  suggestedReplacement,
  contextText,
  positionStart,
  positionEnd,
  suggestedMicroSkillKey,
}: {
  supabase: ReviewSupabase;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
  writingSampleId: string | null;
  misspellingInstanceId: string;
  observedText: string | null;
  suggestedReplacement: string | null;
  contextText: string | null;
  positionStart: number | null;
  positionEnd: number | null;
  suggestedMicroSkillKey: string;
}) {
  const { data: existingSuggestion } = await supabase
    .from("writing_issue_suggestions")
    .select("id, suggestion_status, suggested_micro_skill_key, metadata")
    .eq("parent_user_id", parentUserId)
    .eq("task_submission_id", taskSubmissionId)
    .eq("misspelling_instance_id", misspellingInstanceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSuggestion) {
    return backfillPendingSubmissionSuggestionCanonicalMicroSkill({
      supabase,
      parentUserId,
      childId,
      taskSubmissionId,
      misspellingInstanceId,
      suggestion: existingSuggestion as MisspellingSuggestionLookupRow,
      observedText,
      suggestedReplacement,
    });
  }

  const scopedResolution = await resolveScopedMicroSkillForSubmissionSuggestion(
    {
      supabase,
      parentUserId,
      childId,
      observedText,
      suggestedReplacement,
    },
  );
  const nextSuggestedMicroSkillKey = scopedResolution.blocked
    ? null
    : (scopedResolution.microSkillKey ?? suggestedMicroSkillKey);
  const metadata = mergeScopedSubmissionMicroSkillResolutionMetadata({
    metadata: null,
    resolution: scopedResolution,
  });

  const { data: createdSuggestion, error } = await supabase
    .from("writing_issue_suggestions")
    .insert({
      child_id: childId,
      parent_user_id: parentUserId,
      task_submission_id: taskSubmissionId,
      writing_sample_id: writingSampleId,
      misspelling_instance_id: misspellingInstanceId,
      source_type: "misspelling_instance",
      suggestion_status: "pending",
      observed_text: observedText,
      suggested_replacement: suggestedReplacement,
      context_text: contextText,
      position_start: positionStart,
      position_end: positionEnd,
      suggested_micro_skill_key: nextSuggestedMicroSkillKey,
      metadata,
    })
    .select("id, suggestion_status, suggested_micro_skill_key, metadata")
    .single();

  if (error || !createdSuggestion) {
    return null;
  }

  return createdSuggestion as MisspellingSuggestionLookupRow;
}

export async function markSuggestionReviewedAsAccepted(input: {
  supabase: ReviewSupabase;
  suggestionId: string;
  parentUserId: string;
}) {
  const { error } = await input.supabase
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "accepted",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.suggestionId)
    .eq("parent_user_id", input.parentUserId);

  if (error) {
    throw new Error("Failed to mark the spelling suggestion as reviewed.");
  }
}

export async function addMissedWordToSubmissionReviewImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspelledWord = formData.get("misspelled_word");
  const correctedWord = formData.get("corrected_word");
  const requestedOccurrenceId = formData.get("source_writing_occurrence_id");

  const safeRedirectPath =
    typeof redirectPath === "string" &&
    redirectPath.startsWith("/courses/review/")
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

  const analysis = analyseParentAddedMisspellingPair({
    observedSpelling: misspelledWord,
    correctSpelling: correctedWord,
  });

  if (!analysis) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Add two different spellings before saving this missed word.",
      ),
    );
  }

  const safeMisspelledWord = analysis.observedSpelling;
  const safeCorrectedWord = analysis.correctSpelling;

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

  const { data: sourceSnapshot } = await supabase
    .from("writing_source_snapshots")
    .select("*")
    .eq("submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .eq("child_id", submission.child_id)
    .maybeSingle();
  type OccurrenceRow = {
    id: string;
    observed_text: string;
    field_path: string;
    start_utf16: number;
    end_utf16: number;
    provenance: "learner_response" | "unknown";
  };
  const occurrenceRows: OccurrenceRow[] = [];
  if (sourceSnapshot) {
    const selectedOccurrenceId =
      typeof requestedOccurrenceId === "string" && requestedOccurrenceId
        ? requestedOccurrenceId
        : null;
    if (selectedOccurrenceId) {
      const { data } = await supabase
        .from("writing_occurrences")
        .select("id,observed_text,field_path,start_utf16,end_utf16,provenance")
        .eq("snapshot_id", sourceSnapshot.id)
        .eq("id", selectedOccurrenceId)
        .eq("provenance", "learner_response")
        .maybeSingle();
      if (data) occurrenceRows.push(data as OccurrenceRow);
    } else {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("writing_occurrences")
          .select(
            "id,observed_text,field_path,start_utf16,end_utf16,provenance",
          )
          .eq("snapshot_id", sourceSnapshot.id)
          .eq("provenance", "learner_response")
          .order("field_path", { ascending: true })
          .order("start_utf16", { ascending: true })
          .range(offset, offset + 999);
        if (error) break;
        occurrenceRows.push(...((data ?? []) as OccurrenceRow[]));
        if ((data ?? []).length < 1000) break;
      }
    }
  }
  const occurrenceResolution = resolveParentIdentifiedOccurrence({
    observedSpelling: safeMisspelledWord,
    explicitOccurrenceId:
      typeof requestedOccurrenceId === "string" && requestedOccurrenceId
        ? requestedOccurrenceId
        : null,
    candidates: occurrenceRows.map(
      (row): ParentIdentifiedOccurrenceCandidate => ({
        id: row.id,
        observedText: row.observed_text,
        fieldPath: row.field_path,
        startUtf16: row.start_utf16,
        endUtf16: row.end_utf16,
        provenance: row.provenance,
      }),
    ),
  });

  if (occurrenceResolution.status === "ambiguous") {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Choose where this repeated spelling appeared before adding it.",
      ),
    );
  }
  if (
    occurrenceResolution.status === "invalid_explicit_occurrence" ||
    occurrenceResolution.status === "observed_spelling_mismatch"
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "The selected occurrence no longer matches that spelling. Review the word and try again.",
      ),
    );
  }
  const sourceWritingOccurrenceId =
    occurrenceResolution.status === "resolved"
      ? occurrenceResolution.occurrence.id
      : null;
  const sourceOccurrence = sourceWritingOccurrenceId
    ? occurrenceRows.find((row) => row.id === sourceWritingOccurrenceId) ?? null
    : null;

  let existingQuery = supabase
    .from("misspelling_instances")
    .select("id")
    .eq("writing_sample_id", sample.id)
    .eq("parent_user_id", user.id);
  existingQuery = sourceWritingOccurrenceId
    ? existingQuery.eq(
        "source_writing_occurrence_id",
        sourceWritingOccurrenceId,
      )
    : existingQuery
        .eq("misspelled_word", safeMisspelledWord)
        .eq("corrected_word", safeCorrectedWord);
  const { data: existing } = await existingQuery.limit(1).maybeSingle();

  if (existing) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "That missed word is already on the review list.",
      ),
    );
  }

  const sourceFieldText = sourceOccurrence && sourceSnapshot
    ? readSnapshotField(sourceSnapshot as unknown as SourceSnapshot, sourceOccurrence.field_path)
    : null;
  const sourceExcerpt = sourceOccurrence && sourceFieldText !== null &&
      sourceFieldText.slice(sourceOccurrence.start_utf16, sourceOccurrence.end_utf16) === sourceOccurrence.observed_text
    ? sourceFieldText.slice(
        Math.max(0, sourceOccurrence.start_utf16 - 80),
        Math.min(sourceFieldText.length, sourceOccurrence.end_utf16 + 80),
      )
    : null;
  const exactSampleRange = sourceOccurrence && sourceFieldText === sample.sample_text
    ? { raw: sourceOccurrence.observed_text, start: sourceOccurrence.start_utf16, end: sourceOccurrence.end_utf16 }
    : null;
  const range = sourceWritingOccurrenceId ? exactSampleRange : findWordRange(sample.sample_text, safeMisspelledWord);
  const { error } = await supabase.from("misspelling_instances").insert({
    writing_sample_id: sample.id,
    child_id: sample.child_id,
    parent_user_id: user.id,
    misspelled_word: safeMisspelledWord,
    corrected_word: safeCorrectedWord,
    suggested_word: safeCorrectedWord,
    error_type: analysis.primaryCategory,
    secondary_error_type: analysis.secondaryCategory,
    confidence_score: 1,
    is_false_positive: false,
    is_parent_overridden: false,
    word_family_id: null,
    source_writing_occurrence_id: sourceWritingOccurrenceId,
    context_text: sourceExcerpt ?? range?.raw ?? safeMisspelledWord,
    position_start: range?.start ?? null,
    position_end: range?.end ?? null,
    notes: stringifyAnalysisExtraMetadata({
      detectedPrimaryCategory: analysis.primaryCategory,
      parentOverrideCategory: null,
      parentOverrideFamilyId: null,
      parentOverrideDiagnosis: null,
      parentReviewedAt: null,
      parentAuthoredMissedWord: true,
      markedCareless: false,
      detectedErrorPattern: analysis.detectedErrorPattern,
      selectedWordFamilyId: analysis.selectedWordFamilyId,
      detectionSource: null,
      canonicalDetection: null,
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

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Missed word added to the review list below.",
    ),
  );
}

export async function acceptSubmissionReviewIssueImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const observedText = normaliseOptionalIssueText(
    formData.get("observed_text"),
  );
  const approvedReplacement = normaliseOptionalIssueText(
    formData.get("approved_replacement"),
  );
  const parentReviewNote = normaliseOptionalIssueText(
    formData.get("issue_note"),
  );
  const microSkillKey = normaliseMicroSkillKey(formData.get("micro_skill_key"));

  const safeRedirectPath =
    typeof redirectPath === "string" &&
    redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof misspellingInstanceId !== "string" ||
    !misspellingInstanceId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that issue suggestion.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { supabase, submission } = await getOwnedSubmission(
    submissionId,
    user.id,
  );

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const linkedSample = await getLinkedWritingSample(
    supabase,
    submission.id,
    user.id,
  );
  const structuredLessonReviewContext = await getStructuredLessonReviewContext({
    supabase,
    taskId: submission.task_id,
    childId: submission.child_id,
    parentUserId: user.id,
  });

  const { data: misspelling } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, context_text, position_start, position_end",
    )
    .eq("id", misspellingInstanceId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!misspelling) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling suggestion is no longer available.",
      ),
    );
  }

  const { data: existingIssue } = await supabase
    .from("writing_issues")
    .select("id")
    .eq("parent_user_id", user.id)
    .eq("task_submission_id", submission.id)
    .eq("source_misspelling_instance_id", misspelling.id)
    .maybeSingle();

  if (existingIssue) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "That writing issue has already been saved.",
      ),
    );
  }

  const matchedLessonField = inferStructuredLessonFieldMatch({
    reviewContext: structuredLessonReviewContext,
    observedText: observedText ?? misspelling.misspelled_word,
    approvedReplacement:
      approvedReplacement ??
      misspelling.suggested_word ??
      misspelling.corrected_word,
    contextText: misspelling.context_text,
    parentReviewNote,
  });
  const issueLevelParentNote =
    parentReviewNote ?? matchedLessonField?.feedback?.trim() ?? null;

  const suggestion = await findOrCreateSuggestionForMisspelling({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample?.id ?? null,
    misspellingInstanceId: misspelling.id,
    observedText: misspelling.misspelled_word,
    suggestedReplacement:
      misspelling.suggested_word ?? misspelling.corrected_word,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedMicroSkillKey: "unknown",
  });

  if (!suggestion) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that issue suggestion just yet.",
      ),
    );
  }

  const { error: suggestionUpdateError } = await supabase
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "accepted",
      observed_text: observedText ?? misspelling.misspelled_word,
      suggested_replacement:
        approvedReplacement ??
        misspelling.suggested_word ??
        misspelling.corrected_word,
      suggested_micro_skill_key: microSkillKey,
      source_field_key: matchedLessonField?.key ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("parent_user_id", user.id);

  if (suggestionUpdateError) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't update that suggestion just yet.",
      ),
    );
  }

  const { error } = await supabase.from("writing_issues").insert({
    child_id: submission.child_id,
    parent_user_id: user.id,
    task_submission_id: submission.id,
    writing_sample_id: linkedSample?.id ?? null,
    source_suggestion_id: suggestion.id,
    source_misspelling_instance_id: misspelling.id,
    issue_status: "pending_parent_review",
    final_classification: null,
    observed_text: observedText ?? misspelling.misspelled_word,
    suggested_replacement:
      misspelling.suggested_word ?? misspelling.corrected_word,
    approved_replacement:
      approvedReplacement ??
      misspelling.suggested_word ??
      misspelling.corrected_word,
    context_text: misspelling.context_text,
    source_field_key: matchedLessonField?.key ?? null,
    position_start: misspelling.position_start,
    position_end: misspelling.position_end,
    micro_skill_key: microSkillKey,
    parent_review_note: issueLevelParentNote,
    parent_marked_at: new Date().toISOString(),
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't save that writing issue just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Writing issue saved for targeted writing practice.",
    ),
  );
}

export async function rejectSubmissionReviewIssueImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const rejectionNote = normaliseOptionalIssueText(
    formData.get("rejection_note"),
  );

  const safeRedirectPath =
    typeof redirectPath === "string" &&
    redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof misspellingInstanceId !== "string" ||
    !misspellingInstanceId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that issue suggestion.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { supabase, submission } = await getOwnedSubmission(
    submissionId,
    user.id,
  );

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const linkedSample = await getLinkedWritingSample(
    supabase,
    submission.id,
    user.id,
  );

  const { data: misspelling } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, context_text, position_start, position_end",
    )
    .eq("id", misspellingInstanceId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!misspelling) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling suggestion is no longer available.",
      ),
    );
  }

  const { data: existingIssue } = await supabase
    .from("writing_issues")
    .select("id")
    .eq("parent_user_id", user.id)
    .eq("task_submission_id", submission.id)
    .eq("source_misspelling_instance_id", misspelling.id)
    .maybeSingle();

  if (existingIssue) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That suggestion already has a saved writing issue.",
      ),
    );
  }

  const suggestion = await findOrCreateSuggestionForMisspelling({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample?.id ?? null,
    misspellingInstanceId: misspelling.id,
    observedText: misspelling.misspelled_word,
    suggestedReplacement:
      misspelling.suggested_word ?? misspelling.corrected_word,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedMicroSkillKey: "unknown",
  });

  if (!suggestion) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that suggestion just yet.",
      ),
    );
  }

  const { error } = await supabase
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "rejected",
      notes: rejectionNote,
      rejected_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't reject that suggestion just yet.",
      ),
    );
  }

  const { error: suppressionError } = await supabase
    .from("writing_false_positive_suppressions")
    .upsert(
      {
        child_id: submission.child_id,
        parent_user_id: user.id,
        misspelled_word: normaliseWordForLookup(misspelling.misspelled_word),
        corrected_word: normaliseWordForLookup(
          misspelling.suggested_word ?? misspelling.corrected_word,
        ),
        source_writing_issue_suggestion_id: suggestion.id,
        source_misspelling_instance_id: misspelling.id,
        notes: rejectionNote,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "child_id,parent_user_id,misspelled_word,corrected_word",
      },
    );

  if (suppressionError) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "The suggestion was rejected, but the exact false-positive suppression could not be saved yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Suggestion rejected for targeted writing practice.",
    ),
  );
}
