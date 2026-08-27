import "server-only";

import { intakeApprovedAdleReviewCorrection } from "@/lib/adle/loaders/canonical-intake-live";
import { buildAdleParentIssueSourceEntityId } from "@/lib/adle/review-work/additional-spelling";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type AdleCatalogDecision =
  | "linked_existing_skill"
  | "add_canonical_mapping"
  | "needs_new_micro_skill"
  | "word_level_only"
  | "not_a_learning_issue"
  | "reject_no_canonical_update";

export async function applyAdleCatalogReviewDecision(input: {
  supabase: ServiceClient;
  caseId: string;
  decisionType: AdleCatalogDecision;
  linkedMicroSkillKey: string | null;
}) {
  const caseResult = await input.supabase
    .from("spelling_catalog_review_cases")
    .select(
      "id,parent_user_id,child_id,source_suggestion_id,source_adle_review_session_id,source_adle_review_parent_issue_link_id,misspelling_normalized,correct_spelling_normalized,source_provenance",
    )
    .eq("id", input.caseId)
    .maybeSingle();
  if (caseResult.error) throw new Error(caseResult.error.message);
  const reviewCase = caseResult.data;
  if (
    !reviewCase ||
    reviewCase.source_provenance !== "adle_review_submitted_writing_parent_identified"
  ) {
    return { source: "course" as const, materialized: false };
  }
  if (
    !reviewCase.source_adle_review_session_id ||
    !reviewCase.source_adle_review_parent_issue_link_id
  ) {
    throw new Error("ADLE catalog case source lineage is incomplete.");
  }

  const [sessionResult, issueResult] = await Promise.all([
    input.supabase
      .from("adle_review_sessions")
      .select("id,parent_user_id,child_id,stage,completed_at")
      .eq("id", reviewCase.source_adle_review_session_id)
      .maybeSingle(),
    input.supabase
      .from("adle_review_parent_issue_links")
      .select("*")
      .eq("id", reviewCase.source_adle_review_parent_issue_link_id)
      .eq("review_session_id", reviewCase.source_adle_review_session_id)
      .maybeSingle(),
  ]);
  if (sessionResult.error || issueResult.error) {
    throw new Error(
      sessionResult.error?.message || issueResult.error?.message || "ADLE catalog lineage could not be loaded.",
    );
  }
  const session = sessionResult.data;
  const issue = issueResult.data;
  if (
    !session ||
    !issue ||
    session.stage !== "completed" ||
    !session.completed_at ||
    session.parent_user_id !== reviewCase.parent_user_id ||
    session.child_id !== reviewCase.child_id ||
    issue.parent_user_id !== reviewCase.parent_user_id ||
    issue.child_id !== reviewCase.child_id ||
    issue.catalog_review_case_id !== reviewCase.id
  ) {
    throw new Error("ADLE catalog case is not anchored to an owned completed Review.");
  }

  if (
    input.decisionType === "not_a_learning_issue" ||
    input.decisionType === "reject_no_canonical_update"
  ) {
    const updateResult = await input.supabase
      .from("adle_review_parent_issue_links")
      .update({ resolution_status: "not_a_learning_issue", updated_at: new Date().toISOString() })
      .eq("id", issue.id)
      .eq("catalog_review_case_id", reviewCase.id);
    if (updateResult.error) throw new Error(updateResult.error.message);
    return { source: "adle" as const, materialized: false, rejected: true };
  }

  if (
    input.decisionType === "needs_new_micro_skill" ||
    input.decisionType === "word_level_only"
  ) {
    return { source: "adle" as const, materialized: false, awaitingRoute: true };
  }

  if (!input.linkedMicroSkillKey || !issue.parent_verification_id) {
    throw new Error("ADLE admin route completion requires a parent confirmation and D4 route.");
  }

  const existingMappingResult = await input.supabase
    .from("parent_verified_spelling_candidate_mappings")
    .select("id,micro_skill_key")
    .eq("parent_verification_id", issue.parent_verification_id)
    .maybeSingle();
  if (existingMappingResult.error) throw new Error(existingMappingResult.error.message);
  let candidateMappingId = existingMappingResult.data?.id as string | undefined;
  if (
    existingMappingResult.data &&
    existingMappingResult.data.micro_skill_key !== input.linkedMicroSkillKey
  ) {
    throw new Error("The ADLE parent verification is already linked to a different route.");
  }

  if (!candidateMappingId) {
    const sourceEntityId = buildAdleParentIssueSourceEntityId({
      reviewSessionId: session.id,
      positionStart: issue.position_start,
      positionEnd: issue.position_end,
      observedSpelling: issue.observed_spelling_normalized,
      correctSpelling: issue.correct_spelling_normalized,
    });
    const insertResult = await input.supabase
      .from("parent_verified_spelling_candidate_mappings")
      .insert({
        parent_user_id: reviewCase.parent_user_id,
        child_id: reviewCase.child_id,
        parent_verification_id: issue.parent_verification_id,
        task_submission_id: null,
        writing_sample_id: null,
        source_suggestion_id: reviewCase.source_suggestion_id,
        source_misspelling_instance_id: null,
        source_adle_review_session_id: session.id,
        source_provenance: "adle_review_submitted_writing_parent_identified",
        reviewed_event_source_entity_id: sourceEntityId,
        original_child_spelling: issue.observed_spelling_normalized,
        original_correct_spelling: issue.correct_spelling_normalized,
        misspelling_normalized: issue.observed_spelling_normalized,
        correct_spelling_normalized: issue.correct_spelling_normalized,
        micro_skill_key: input.linkedMicroSkillKey,
        candidate_status: "parent_local_promoted",
        promotion_scope: "parent_local",
        metadata: {
          sourceOccurrence: {
            positionStart: issue.position_start,
            positionEnd: issue.position_end,
          },
          adminCatalogReviewCaseId: reviewCase.id,
          adminRouteCompleted: true,
        },
      })
      .select("id")
      .single();
    if (insertResult.error || !insertResult.data) {
      throw new Error(insertResult.error?.message || "ADLE candidate mapping could not be created.");
    }
    candidateMappingId = insertResult.data.id;
  }

  const issueUpdate = await input.supabase
    .from("adle_review_parent_issue_links")
    .update({
      candidate_mapping_id: candidateMappingId,
      resolution_status: "confirmed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", issue.id)
    .eq("catalog_review_case_id", reviewCase.id);
  if (issueUpdate.error) throw new Error(issueUpdate.error.message);

  if (!candidateMappingId) {
    throw new Error("ADLE candidate mapping was not available after admin routing.");
  }

  await intakeApprovedAdleReviewCorrection({
    serviceClient: input.supabase,
    parentUserId: reviewCase.parent_user_id,
    childId: reviewCase.child_id,
    adleReviewSessionId: session.id,
    candidateMappingIds: [candidateMappingId],
  });

  return { source: "adle" as const, materialized: true, candidateMappingId };
}
