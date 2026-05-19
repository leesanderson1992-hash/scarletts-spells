import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getReviewWorkOverrideMicroSkillProvider } from "@/lib/writing-engine/persistence/learning-items";
import {
  buildStage7dReviewWorkVerificationTarget,
  recordStage7dParentVerification,
} from "@/lib/writing-engine/review/stage7d-parent-verification";

import {
  backfillPendingSubmissionSuggestionCanonicalMicroSkill,
  resolveScopedMicroSkillForSubmissionSuggestion,
  type MisspellingSuggestionLookupRow,
} from "./canonical-spelling-backfill-actions";
import {
  buildRedirectWithMessage,
  getLinkedWritingSample,
  getOwnedManualWritingSample,
  getOwnedSubmission,
  normaliseOptionalIssueText,
  normaliseStage7dDecision,
  normaliseStage7dOverrideField,
  revalidateReviewQueueAndDetailBestEffort,
} from "./_shared";
import { findOrCreateSuggestionForMisspelling } from "./lesson-submission-review-actions";

export async function recordReviewWorkVerificationActionImpl(formData: FormData) {
  const decision = normaliseStage7dDecision(formData.get("decision"));
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const taskSubmissionId = formData.get("task_submission_id");
  const writingSampleId = formData.get("writing_sample_id");
  const verifiedCategoryCode = normaliseStage7dOverrideField(
    formData.get("verified_category_code"),
  );
  const verifiedMicroSkillKey = normaliseStage7dOverrideField(
    formData.get("verified_micro_skill_key"),
  );
  const verifiedTemplateKey = normaliseStage7dOverrideField(
    formData.get("verified_template_key"),
  );
  const verificationNote = normaliseOptionalIssueText(formData.get("verification_note"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    !decision ||
    typeof misspellingInstanceId !== "string" ||
    !misspellingInstanceId ||
    ((typeof taskSubmissionId !== "string" || !taskSubmissionId) &&
      (typeof writingSampleId !== "string" || !writingSampleId))
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that parent verification action.",
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

  const ownedSubmission =
    typeof taskSubmissionId === "string" && taskSubmissionId
      ? await getOwnedSubmission(taskSubmissionId, user.id, supabase)
      : null;

  if (ownedSubmission && !ownedSubmission.submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That lesson submission is no longer available for review.",
      ),
    );
  }

  const manualSample =
    typeof writingSampleId === "string" && writingSampleId
      ? await getOwnedManualWritingSample(supabase, writingSampleId, user.id)
      : null;
  const linkedSample =
    ownedSubmission?.submission
      ? await getLinkedWritingSample(supabase, ownedSubmission.submission.id, user.id)
      : null;

  if (!ownedSubmission?.submission && !manualSample) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That review source is no longer available.",
      ),
    );
  }

  const childId = ownedSubmission?.submission?.child_id ?? manualSample?.child_id;
  const canonicalWritingSampleId = linkedSample?.id ?? manualSample?.id ?? null;

  const { data: misspelling } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, error_type, notes, context_text, position_start, position_end",
    )
    .eq("id", misspellingInstanceId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!misspelling || !childId || !canonicalWritingSampleId) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That shared output is no longer available for verification.",
      ),
    );
  }

  if (ownedSubmission?.submission && decision === "accepted") {
    const ensuredSuggestion = await findOrCreateSuggestionForMisspelling({
      supabase,
      parentUserId: user.id,
      childId,
      taskSubmissionId: ownedSubmission.submission.id,
      writingSampleId: canonicalWritingSampleId,
      misspellingInstanceId: misspelling.id,
      observedText: misspelling.misspelled_word,
      suggestedReplacement: misspelling.suggested_word ?? misspelling.corrected_word,
      contextText: misspelling.context_text,
      positionStart: misspelling.position_start,
      positionEnd: misspelling.position_end,
      suggestedMicroSkillKey: "unknown",
    });

    if (!ensuredSuggestion) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "We couldn't prepare that shared suggestion just yet.",
        ),
      );
    }
  }

  const pendingSuggestionQuery = supabase
    .from("writing_issue_suggestions")
    .select(
      "id, suggested_replacement, suggested_micro_skill_key, notes, suggestion_status, metadata",
    )
    .eq("parent_user_id", user.id)
    .eq("misspelling_instance_id", misspelling.id)
    .eq("suggestion_status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (ownedSubmission?.submission) {
    pendingSuggestionQuery.eq("task_submission_id", ownedSubmission.submission.id);
  } else {
    pendingSuggestionQuery.eq("writing_sample_id", canonicalWritingSampleId);
  }

  const { data: pendingSuggestionRow } = await pendingSuggestionQuery.maybeSingle();
  const pendingSuggestion =
    ownedSubmission?.submission && pendingSuggestionRow
      ? await backfillPendingSubmissionSuggestionCanonicalMicroSkill({
          supabase,
          parentUserId: user.id,
          childId: ownedSubmission.submission.child_id,
          taskSubmissionId: ownedSubmission.submission.id,
          misspellingInstanceId: misspelling.id,
          suggestion: pendingSuggestionRow as MisspellingSuggestionLookupRow,
          observedText: misspelling.misspelled_word,
          suggestedReplacement:
            pendingSuggestionRow.suggested_replacement ??
            misspelling.suggested_word ??
            misspelling.corrected_word,
        })
      : pendingSuggestionRow;
  const suggestedMicroSkillKey = pendingSuggestion?.suggested_micro_skill_key ?? null;
  const hasPersistedCanonicalSuggestedMicroSkillKey =
    typeof suggestedMicroSkillKey === "string" &&
    suggestedMicroSkillKey.trim().length > 0 &&
    suggestedMicroSkillKey.trim().toLowerCase() !== "unknown";
  const overrideAnchorMicroSkillKey =
    ownedSubmission?.submission && !hasPersistedCanonicalSuggestedMicroSkillKey
      ? (
          await resolveScopedMicroSkillForSubmissionSuggestion({
            supabase,
            parentUserId: user.id,
            childId: ownedSubmission.submission.child_id,
            observedText: misspelling.misspelled_word,
            suggestedReplacement:
              pendingSuggestion?.suggested_replacement ??
              misspelling.suggested_word ??
              misspelling.corrected_word,
          })
        ).microSkillKey
      : suggestedMicroSkillKey;
  const verificationTarget = buildStage7dReviewWorkVerificationTarget({
    taskSubmissionId: ownedSubmission?.submission?.id ?? null,
    writingSampleId: canonicalWritingSampleId,
    observedText: misspelling.misspelled_word,
    suggestedReplacement:
      pendingSuggestion?.suggested_replacement ??
      misspelling.suggested_word ??
      misspelling.corrected_word,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedCategoryCode: misspelling.error_type,
    suggestedMicroSkillKey,
    notes: pendingSuggestion?.notes ?? misspelling.notes,
  });

  if (!verificationTarget) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That shared output does not yet have enough canonical source detail for parent verification.",
      ),
    );
  }

  const hasAnyOverrideField =
    verifiedCategoryCode !== null ||
    verifiedMicroSkillKey !== null ||
    verifiedTemplateKey !== null;
  const hasMeaningfulOverrideField =
    (verifiedCategoryCode !== null &&
      verifiedCategoryCode !== verificationTarget.suggestedCategoryCode) ||
    (verifiedMicroSkillKey !== null &&
      verifiedMicroSkillKey !== verificationTarget.suggestedMicroSkillKey) ||
    verifiedTemplateKey !== null;

  if (decision !== "overridden" && hasAnyOverrideField) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Verified override fields are only available through the override flow.",
      ),
    );
  }

  if (decision === "overridden" && !hasMeaningfulOverrideField) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Override requires at least one changed canonical verification field.",
      ),
    );
  }

  if (verifiedTemplateKey !== null) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Template override options are not available in this bounded slice.",
      ),
    );
  }

  if (verifiedMicroSkillKey !== null) {
    if (!ownedSubmission?.submission) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "Micro-skill override options are only available for lesson submission spelling suggestions.",
        ),
      );
    }

    const overrideMicroSkillProvider = await getReviewWorkOverrideMicroSkillProvider({
      supabase,
      anchorMicroSkillKey: overrideAnchorMicroSkillKey,
    });

    if (overrideMicroSkillProvider.status !== "available") {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "Canonical override micro-skill options are not available for that suggestion.",
        ),
      );
    }

    const isAllowedOverrideMicroSkill = overrideMicroSkillProvider.options.some(
      (option) => option.microSkillKey === verifiedMicroSkillKey,
    );

    if (!isAllowedOverrideMicroSkill) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "Override micro-skill must match a canonical bounded catalog option.",
        ),
      );
    }
  }

  const { data: existingVerification } = await supabase
    .from("parent_verifications")
    .select("id, decision")
    .eq("parent_user_id", user.id)
    .eq("source_entity_id", verificationTarget.sourceRef.sourceEntityId)
    .limit(1)
    .maybeSingle();

  if (existingVerification) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "A parent verification was already recorded for that shared output.",
      ),
    );
  }

  if (
    decision === "accepted" &&
    (ownedSubmission?.submission
      ? !suggestedMicroSkillKey || suggestedMicroSkillKey.trim().toLowerCase() === "unknown"
      : false)
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Accepted verification is only available when existing shared suggestion truth already carries a canonical micro-skill.",
      ),
    );
  }

  try {
    await recordStage7dParentVerification({
      supabase,
      childId,
      parentUserId: user.id,
      decision,
      verifiedCategoryCode,
      verifiedMicroSkillKey,
      verifiedTemplateKey,
      note: verificationNote,
      target: verificationTarget,
    });
  } catch (error) {
    console.error("Review Work verification action failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Could not record that parent verification right now.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      decision === "accepted"
        ? "Parent verification recorded as accepted."
        : decision === "overridden"
          ? "Parent verification recorded as overridden."
          : decision === "false_positive"
            ? "Parent verification recorded as false positive."
            : "Parent verification recorded as not a learning issue.",
    ),
  );
}
