"use server";

import { ING_RULE_FOR_SKILL } from "@/lib/adle/ing/contracts";
import { generateIngWordFromOverview } from "@/lib/teaching-dictionary-manager/ing-overview-recipe";
import { requireAdminUser } from "@/lib/admin/access";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { candidatePreviewAssociations, isUuid, reviewPairReadiness } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";
import { loadWordSkillReviewControls } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";
import { managerAssignedPairs } from "@/lib/teaching-dictionary-manager/bulk-review";
import { bulkSenseChoiceError } from "@/lib/teaching-dictionary-manager/bulk-sense-approval";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { evaluateLessonCandidate, hasCandidateRule,
  LESSON_CANDIDATE_RULE_REVISION } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { candidateFactsForSense, type CandidateAnalysisRow, type CandidateLinkRow } from
  "@/lib/teaching-dictionary-manager/candidate-sense-facts";
import { loadTeachingDictionaryEvidenceAuthority, TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { updateTag } from "next/cache";
import type { EnrichmentCandidate } from "@/lib/writing-engine/whole-writing/knowledge";

export type BulkApprovalResult = {
  ok: boolean;
  approvedCount: number;
  alreadyAssignedCount: number;
  excludedCount: number;
  clearedCount: number;
  deassignedCount: number;
  assigned: { id: string; removable: boolean }[];
  excluded: string[];
  readbackRequired?: boolean;
  blocked: { id: string; word: string; reason: string }[];
  error?: string;
};

const failed = (error: string, blocked: BulkApprovalResult["blocked"] = []): BulkApprovalResult => ({
  ok: false, approvedCount: 0, alreadyAssignedCount: 0, excludedCount: 0, clearedCount: 0,
  deassignedCount: 0, assigned: [], excluded: [], blocked, error,
});

export async function saveBulkSkillApprovals(input: {
  microSkillKey: string;
  applyWordIds: string[];
  excludeWordIds: string[];
  clearWordIds: string[];
  deassignWordIds: string[];
  senseIds: Record<string, string>;
  requestId: string;
  workbookReadback?: boolean;
  sourceKind?: "teaching_dictionary_bulk" | "teaching_dictionary_word" | "teaching_dictionary_import";
}): Promise<BulkApprovalResult> {
  const actor = await requireAdminUser();
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) return failed("Evidence approval is not configured for this environment.");
  if (!input || typeof input !== "object" || typeof input.microSkillKey !== "string"
    || typeof input.requestId !== "string" || !isUuid(input.requestId)
    || !input.senseIds || typeof input.senseIds !== "object" || Array.isArray(input.senseIds)
    || !Array.isArray(input.applyWordIds) || !Array.isArray(input.excludeWordIds)
    || !Array.isArray(input.clearWordIds) || !Array.isArray(input.deassignWordIds)) {
    return failed("Select between 1 and 100 distinct words.");
  }
  const { applyWordIds, excludeWordIds, clearWordIds, deassignWordIds } = input;
  if (input.microSkillKey === "D4_SCHWA_MEDIAL_NATURAL_ACTUAL")
    return failed("This micro-skill has been replaced by final -al.");
  const allIds = [...applyWordIds, ...excludeWordIds, ...clearWordIds, ...deassignWordIds];
  if (allIds.length < 1 || allIds.length > 100 || allIds.some((id) => typeof id !== "string" || !isUuid(id))
    || new Set(allIds).size !== allIds.length) return failed("Select between 1 and 100 distinct words.");

  const db = createServiceRoleClient();
  const [skill, words, controls] = await Promise.all([
    db.from("micro_skill_catalog").select("micro_skill_key").eq("micro_skill_key", input.microSkillKey)
      .eq("is_active", true).eq("is_assignable", true).maybeSingle(),
    db.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status,source_name,source_url")
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
  if (Object.keys(input.senseIds).length !== applyWordIds.length
    || applyWordIds.some(id => typeof input.senseIds[id] !== "string"))
    return failed("Choose a reviewed meaning for every word being applied.");
  const expectedFacts: Record<string, { senseId: string; senseSet: DictionarySenseSet;
    morphologyId: string; morphologySource: "legacy" | "sense"; familyLinkIds: string[] }> = {};
  if (applyWordIds.length) {
    const [reviewed, morphology, familyLinks, senseAnalyses, senseFamilyLinks] = await Promise.all([
      db.from("teaching_dictionary_reviewed_sense_sets")
        .select("canonical_word_id,sense_set").in("canonical_word_id", applyWordIds),
      hasCandidateRule(input.microSkillKey) ? db.from("canonical_teaching_dictionary_word_morphology")
        .select("id,canonical_word_id,morphology_parts,morphology_joins,analysis_status,review_status,word_sum,created_at")
        .in("canonical_word_id", applyWordIds).eq("row_status", "active")
        .order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      hasCandidateRule(input.microSkillKey) ? db.from("teaching_dictionary_current_sense_family_links")
        .select("id,canonical_word_id,sense_id,family_key,component_part_id,relationship_kind")
        .in("canonical_word_id", applyWordIds) : Promise.resolve({ data: [], error: null }),
      hasCandidateRule(input.microSkillKey) ? db.from("teaching_dictionary_current_sense_morphology")
        .select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,word_sum")
        .in("canonical_word_id", applyWordIds) : Promise.resolve({ data: [], error: null }),
      hasCandidateRule(input.microSkillKey) ? db.from("teaching_dictionary_current_sense_family_memberships")
        .select("id,canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind,base_meaning")
        .in("canonical_word_id", applyWordIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (reviewed.error || morphology.error || familyLinks.error || senseAnalyses.error || senseFamilyLinks.error)
      return failed("Could not check current reviewed lesson facts. Please retry.");
    const byWord = new Map((reviewed.data ?? []).map(row => [row.canonical_word_id,
      row.sense_set as DictionarySenseSet]));
    const morphologyByWord = new Map<string, NonNullable<typeof morphology.data>[number]>();
    for (const row of morphology.data ?? []) if (!morphologyByWord.has(row.canonical_word_id))
      morphologyByWord.set(row.canonical_word_id, row);
    const blocked = applyWordIds.flatMap(id => {
      const word = byId.get(id)!;
      const selected = morphologyByWord.get(id);
      const facts = candidateFactsForSense({ wordId: id, senseId: input.senseIds[id],
        senseSet: byWord.get(id) ?? null,
        legacyMorphology: selected ? { id: selected.id, parts: selected.morphology_parts,
          joins: selected.morphology_joins, analysisStatus: selected.analysis_status,
          reviewStatus: selected.review_status, wordSum: selected.word_sum } : null,
        legacyLinks: (familyLinks.data ?? []) as CandidateLinkRow[],
        senseAnalyses: (senseAnalyses.data ?? []) as CandidateAnalysisRow[],
        senseLinks: (senseFamilyLinks.data ?? []) as CandidateLinkRow[] });
      const candidateInput = {
        wordId: id, displayWord: word.display_word, skillKey: input.microSkillKey,
        senseId: input.senseIds[id], senseSet: byWord.get(id) ?? null,
        morphology: facts.morphology, familyLinks: facts.familyLinks,
      };
      const candidate = input.sourceKind === "teaching_dictionary_import" && input.microSkillKey in ING_RULE_FOR_SKILL
        ? generateIngWordFromOverview({ ...candidateInput,
            provenance: { sourceName: word.source_name, sourceUrl: word.source_url } })
        : hasCandidateRule(input.microSkillKey) ? evaluateLessonCandidate(candidateInput) : null;
      const reason = candidate && candidate.status !== "ready"
        ? candidate.issues[0]?.message ?? "This word does not match this lesson rule."
        : bulkSenseChoiceError({ wordId: id, displayWord: word.display_word,
          senseSet: byWord.get(id) ?? null, senseId: input.senseIds[id] });
      if (reason) return [{ id, word: word.display_word, reason }];
      if (candidate && facts.morphologyId && byWord.has(id)) expectedFacts[id] = {
        senseId: input.senseIds[id], senseSet: byWord.get(id)!,
        morphologyId: facts.morphologyId, morphologySource: facts.source,
        familyLinkIds: facts.familyLinkIds,
      };
      return [];
    });
    if (blocked.length) return failed("Review the selected meanings before confirming.", blocked);
  }

  try {
    // Imports apply explicit word–skill pairs. The scoped authority still
    // checks their identity, historical sources, withdrawals and deassignments.
    const scopedIds = input.workbookReadback && input.sourceKind === "teaching_dictionary_import" ? allIds : undefined;
    const [existing, decisions] = await Promise.all([
      loadPublishedWritingAssociations(db, environment, scopedIds),
      db.from("teaching_dictionary_pair_latest_decisions")
        .select("canonical_word_id,action").eq("environment_key", environment)
        .eq("micro_skill_key", input.microSkillKey).in("canonical_word_id", allIds),
    ]);
    const effective = new Set<string>();
    if (deassignWordIds.length || excludeWordIds.length) {
      const current = await loadCanonicalWordSkillRelationshipAuthority({
        client: db, environmentKey: environment, explicitReviewedAssociations: existing, canonicalWordIds: scopedIds,
      });
      for (const row of current.relationships)
        if (row.microSkillKey === input.microSkillKey) effective.add(row.canonicalWordId);
    }
    if (deassignWordIds.some(id => !effective.has(id))) return failed("A selected word is no longer assigned. Reload and retry.");
    if (decisions.error) return failed("Could not check saved de-assignments. Please retry.");
    const suppressed = new Set((decisions.data ?? []).filter((row) => row.action === "deassign")
      .map((row) => row.canonical_word_id));
    const restoreIds = applyWordIds.filter((id) => suppressed.has(id));
    const activeReviewedPairs = new Set(existing.filter((row) => row.microSkillKey === input.microSkillKey
      && row.relationshipRole === "demonstrates" && row.rowStatus === "active")
      .map((row) => row.canonicalWordId));
    // A historical effective word–skill relationship without an active reviewed
    // release still needs one governed publication before its sense can bind.
    const newIds = applyWordIds.filter((id) => !activeReviewedPairs.has(id));
    const alreadyAssignedCount = applyWordIds.length - newIds.length;
    const deassignIds = [...new Set([...deassignWordIds, ...excludeWordIds.filter((id) => effective.has(id))])];
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
        explicitReviewedAssociations: [...existing, ...previewAssociations], canonicalWordIds: scopedIds,
        ignorePairDecisionsFor: restoreIds.map((id) => ({ canonicalWordId: id, microSkillKey: input.microSkillKey })),
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

    const reconciled = await db.rpc("reconcile_teaching_dictionary_bulk_review_v6", {
      p_environment: environment, p_skill_key: input.microSkillKey,
      p_publish_ids: newIds, p_exclude_ids: excludeWordIds,
      p_clear_ids: [...clearWordIds, ...applyWordIds],
      p_deassign_ids: deassignIds, p_restore_ids: restoreIds,
      p_sense_ids: input.senseIds,
      p_actor: actor.id, p_request_id: input.requestId,
      p_authority_fingerprint: authorityFingerprint,
      p_rule_revision: LESSON_CANDIDATE_RULE_REVISION,
      p_expected_facts: expectedFacts,
      p_source_kind: input.sourceKind ?? "teaching_dictionary_bulk",
    });
    if (reconciled.error || reconciled.data !== newIds.length) {
      return failed("The batch result could not be confirmed. Retry with the same selection.");
    }
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    const summary = { ok: true, approvedCount: applyWordIds.length - alreadyAssignedCount, alreadyAssignedCount,
      excludedCount: excludeWordIds.length, clearedCount: clearWordIds.length,
      deassignedCount: deassignIds.length, blocked: [] };
    // The workbook returns its affected words' release status separately.
    if (scopedIds) return { ...summary, assigned: [], excluded: [] };
    try {
      const saved = await loadTeachingDictionaryEvidenceAuthority(db, environment);
      const excluded: string[] = [];
      for (let start = 0; ; start += 500) {
        const page = await db.from("teaching_dictionary_bulk_review_exclusions")
          .select("canonical_word_id").eq("environment_key", environment).eq("micro_skill_key", input.microSkillKey)
          .order("canonical_word_id").range(start, start + 499);
        if (page.error) throw page.error;
        excluded.push(...(page.data ?? []).map((row) => row.canonical_word_id));
        if ((page.data?.length ?? 0) < 500) break;
      }
      return { ...summary,
        assigned: managerAssignedPairs(saved.relationships).filter((pair) => pair.microSkillKey === input.microSkillKey)
          .map((pair) => ({ id: pair.wordId, removable: pair.removable })),
        excluded };
    } catch {
      return { ...summary, assigned: [], excluded: [], readbackRequired: true };
    }
  } catch {
    return failed("The approval check failed. No new approvals were saved.");
  }
}
