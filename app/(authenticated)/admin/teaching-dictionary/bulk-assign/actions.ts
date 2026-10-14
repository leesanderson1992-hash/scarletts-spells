"use server";

import { requireAdminUser } from "@/lib/admin/access";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { candidatePreviewAssociations, isUuid, reviewPairReadiness } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";
import { loadWordSkillReviewControls } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";
import { managerAssignedPairs } from "@/lib/teaching-dictionary-manager/bulk-review";
import { loadTeachingDictionaryEvidenceAuthority, TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { updateTag } from "next/cache";
import type { EnrichmentCandidate } from "@/lib/writing-engine/whole-writing/knowledge";

export type BulkApprovalResult = {
  ok: boolean;
  approvedCount: number;
  alreadyAssignedCount: number;
  excludedCount: number;
  clearedCount: number;
  assigned: { id: string; removable: boolean }[];
  blocked: { id: string; word: string; reason: string }[];
  error?: string;
};

const failed = (error: string, blocked: BulkApprovalResult["blocked"] = []): BulkApprovalResult => ({
  ok: false, approvedCount: 0, alreadyAssignedCount: 0, excludedCount: 0, clearedCount: 0, assigned: [], blocked, error,
});

export async function saveBulkSkillApprovals(input: {
  microSkillKey: string;
  applyWordIds: string[];
  excludeWordIds: string[];
  clearWordIds: string[];
  requestId: string;
}): Promise<BulkApprovalResult> {
  const actor = await requireAdminUser();
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) return failed("Evidence approval is not configured for this environment.");
  if (!input || typeof input !== "object" || typeof input.microSkillKey !== "string"
    || typeof input.requestId !== "string" || !isUuid(input.requestId)
    || !Array.isArray(input.applyWordIds) || !Array.isArray(input.excludeWordIds)
    || !Array.isArray(input.clearWordIds)) {
    return failed("Select between 1 and 100 distinct words.");
  }
  const { applyWordIds, excludeWordIds, clearWordIds } = input;
  const allIds = [...applyWordIds, ...excludeWordIds, ...clearWordIds];
  if (allIds.length < 1 || allIds.length > 100 || allIds.some((id) => typeof id !== "string" || !isUuid(id))
    || new Set(allIds).size !== allIds.length) return failed("Select between 1 and 100 distinct words.");

  const db = createServiceRoleClient();
  const [skill, words, controls] = await Promise.all([
    db.from("micro_skill_catalog").select("micro_skill_key").eq("micro_skill_key", input.microSkillKey)
      .eq("is_active", true).eq("is_assignable", true).maybeSingle(),
    db.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status")
      .in("id", allIds),
    loadWordSkillReviewControls(db, environment),
  ]);
  if (skill.error || !skill.data) return failed("The micro-skill is no longer active and assignable.");
  if (words.error) return failed("Could not check the selected words. Please retry.");
  if (!controls.review_enabled || !controls.publication_enabled || !controls.withdrawal_enabled) {
    return failed("Evidence approval controls are disabled in this environment.");
  }
  const byId = new Map((words.data ?? []).map((word) => [word.id, word]));
  const invalid = allIds.flatMap((id) => {
    const word = byId.get(id);
    return word?.row_status === "active" && word.review_status === "approved_for_first_exposure" ? []
      : [{ id, word: word?.display_word ?? id, reason: "Word is no longer active and approved." }];
  });
  if (invalid.length) return failed("Resolve the blocked words before confirming.", invalid);

  try {
    const existing = await loadPublishedWritingAssociations(db, environment);
    const current = await loadCanonicalWordSkillRelationshipAuthority({
      client: db, environmentKey: environment, explicitReviewedAssociations: existing,
    });
    const effective = new Set(current.relationships.filter((row) => row.microSkillKey === input.microSkillKey)
      .map((row) => row.canonicalWordId));
    const currentPairs = new Map(managerAssignedPairs(current.relationships)
      .filter((pair) => pair.microSkillKey === input.microSkillKey).map((pair) => [pair.wordId, pair.removable]));
    if (excludeWordIds.some((id) => effective.has(id))) return failed("An assigned word cannot be marked Doesn't apply. Remove its assignment first.");
    const newIds = applyWordIds.filter((id) => !effective.has(id));
    const alreadyAssignedCount = applyWordIds.length - newIds.length;
    let authorityFingerprint: string | null = null;
    if (newIds.length) {
      const prepared = await db.rpc("prepare_teaching_dictionary_bulk_skill_approvals", {
        p_environment: environment, p_skill_key: input.microSkillKey,
        p_word_ids: newIds, p_actor: actor.id, p_request_id: input.requestId,
      });
      if (prepared.error || !Array.isArray(prepared.data) || prepared.data.length !== newIds.length) {
        return failed("Could not prepare the approval batch. No words were approved.");
      }
      const packageByWord = new Map((prepared.data as { canonical_word_id: string; package_id: string }[])
        .map((row) => [row.canonical_word_id, row.package_id]));
      const candidates: EnrichmentCandidate[] = newIds.map((id) => ({
        canonicalWordId: id, microSkillKey: input.microSkillKey, relationshipRole: "demonstrates",
        method: "deterministic_candidate",
        sourceReference: `Teaching Dictionary Manager human bulk approval: ${id}:${input.microSkillKey}`,
        licenceReference: "internal_authored",
      }));
      const previewAssociations = candidates.flatMap((candidate) => {
        const packageId = packageByWord.get(candidate.canonicalWordId);
        return packageId ? candidatePreviewAssociations(packageId, [candidate]) : [];
      });
      if (previewAssociations.length !== newIds.length) return failed("Could not verify the approval batch. No words were approved.");
      const preview = await loadCanonicalWordSkillRelationshipAuthority({
        client: db, environmentKey: environment,
        explicitReviewedAssociations: [...existing, ...previewAssociations],
      });
      const blocked = candidates.flatMap((candidate) => {
        const packageId = packageByWord.get(candidate.canonicalWordId)!;
        const result = reviewPairReadiness(preview, packageId, candidate, 0);
        return result.ready ? [] : [{ id: candidate.canonicalWordId,
          word: byId.get(candidate.canonicalWordId)?.display_word ?? candidate.canonicalWordId,
          reason: result.reasons.join(", ").replaceAll("_", " ") }];
      });
      if (blocked.length) return failed("Resolve the blocked words before confirming. No words were approved.", blocked);
      authorityFingerprint = preview.reconciliation.sourceFingerprint;
    }

    const reconciled = await db.rpc("reconcile_teaching_dictionary_bulk_review", {
      p_environment: environment, p_skill_key: input.microSkillKey,
      p_apply_ids: newIds, p_exclude_ids: excludeWordIds,
      p_clear_ids: [...clearWordIds, ...applyWordIds],
      p_actor: actor.id, p_request_id: input.requestId,
      p_authority_fingerprint: authorityFingerprint,
    });
    if (reconciled.error || reconciled.data !== newIds.length) {
      return failed("The batch result could not be confirmed. Retry with the same selection.");
    }
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    return { ok: true, approvedCount: newIds.length, alreadyAssignedCount,
      excludedCount: excludeWordIds.length, clearedCount: clearWordIds.length,
      assigned: applyWordIds.map((id) => ({ id, removable: newIds.includes(id) || currentPairs.get(id) === true })),
      blocked: [] };
  } catch {
    return failed("The approval check failed. No new approvals were saved.");
  }
}

export type BulkReviewChangeResult = { ok: boolean; error?: string };

export async function removeBulkSkillAssignment(input: {
  microSkillKey: string; wordId: string;
}): Promise<BulkReviewChangeResult> {
  const actor = await requireAdminUser();
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment || !input || typeof input.microSkillKey !== "string" || !isUuid(input.wordId)) {
    return { ok: false, error: "Invalid word assignment." };
  }
  const db = createServiceRoleClient();
  try {
    const authority = await loadTeachingDictionaryEvidenceAuthority(db, environment);
    const pair = managerAssignedPairs(authority.relationships).find((row) =>
      row.microSkillKey === input.microSkillKey && row.wordId === input.wordId);
    if (!pair?.removable) return { ok: false, error: "This assignment is managed elsewhere and cannot be removed here." };
    const result = await db.rpc("withdraw_teaching_dictionary_manager_skill_pair", {
      p_environment: environment, p_skill_key: input.microSkillKey,
      p_word_id: input.wordId, p_actor: actor.id,
    });
    if (result.error || !result.data) return { ok: false, error: "The assignment could not be removed. Please retry." };
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    return { ok: true };
  } catch {
    return { ok: false, error: "The assignment could not be checked. Please retry." };
  }
}
