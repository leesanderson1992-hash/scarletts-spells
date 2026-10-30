import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed tables precede generated types */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDailyPlanFacts } from "@/lib/adle/loaders/composer-facts-loader";
import { loadLearnerEvidenceProjection } from "@/lib/adle/proficiency/evidence/repository";
import { deriveV2WordGroups } from "@/lib/adle/proficiency/v2-groups";
import { loadHomophoneContextEvidence } from "@/lib/parent-insights/homophone-evidence";
import { calculateProficiencyV2, type V2Evidence, type V2SkillResult } from "@/lib/adle/proficiency/v2";
import { contributingV2Words, type ParentV2EvidenceWord } from "@/lib/parent-insights/v2-evidence-words";
import { isAdleCoverCheckSource } from "@/lib/adle/proficiency/v2-source-policy";
import { requiredAgeBands } from "@/lib/adle/proficiency/shadow-v1";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";

const PAGE = 500;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function all<T>(client: SupabaseClient, table: string, columns: string, key = "id", configure: (query: any) => any = (query) => query): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = configure(client.from(table).select(columns)).order(key).limit(PAGE);
    if (after) query = query.gt(key, after);
    const result = await query;
    if (result.error) throw new Error(`parent proficiency ${table}: ${result.error.message}`);
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
    after = String((page.at(-1) as Record<string, unknown>)[key] ?? "");
    if (!after) throw new Error(`parent proficiency ${table}: paging key missing`);
  }
}

async function allCanonicalMembers(client: SupabaseClient): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0;; offset += PAGE) {
    const result = await client.from("canonical_teaching_dictionary_base_family_registry_members")
      .select("canonical_family_id,canonical_word_id,source_family_keys")
      .order("canonical_family_id").order("canonical_word_id").range(offset, offset + PAGE - 1);
    if (result.error) throw new Error(`parent proficiency canonical family members: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export interface ParentV2Skill {
  key: string;
  label: string;
  familyKey: string;
  familyLabel: string;
  clusterKey: string;
  clusterLabel: string;
  evidenceWords: ParentV2EvidenceWord[];
  result: V2SkillResult;
}

export interface ParentWordMastery {
  id: string;
  word: string;
  state: string;
  slipped: boolean;
  productions: number;
  distinctDays: number;
  verifiedAuthenticUses: number;
  reviewStatus: string;
  nextReview: string;
}

export interface ParentV2Dashboard {
  asOf: string;
  skills: ParentV2Skill[];
  words: ParentWordMastery[];
  source: { admitted: number; blocked: number; ambiguous: number; relationshipFingerprint: string; evidenceFingerprint: string };
}

const positiveEnvironment = (value: string): value is V2Evidence["environment"] =>
  ["CONTROLLED_LESSON", "ISOLATED_RETRIEVAL", "CONTEXTUAL_TRANSFER", "AUTHENTIC_WRITING"].includes(value);

function reviewAction(word: { membershipStatus: string; nextRetestDueOn: string | null; preRetirementCheckDueOn: string | null }, today: string, scheduledDue: string | null): string {
  if (word.membershipStatus === "paused_parent_review") return "Parent review needed";
  if (word.membershipStatus === "ejected_pending_reteach") return "Reteaching needed";
  if (word.membershipStatus === "retired") return "No Review action due";
  const due = word.nextRetestDueOn ?? scheduledDue ?? word.preRetirementCheckDueOn;
  if (due) return due <= today ? "Review due" : `Review due ${due}`;
  return "Continue the Review cycle";
}

const REVIEW_LABELS: Record<string, string> = {
  scheduled: "Scheduled", catch_up: "Retrying", awaiting_pre_retirement_check: "Final check pending",
  paused_parent_review: "Parent review needed", ejected_pending_reteach: "Reteaching needed", retired: "Exited Review",
};

export async function loadParentV2Dashboard(childId: string, asOf: string): Promise<ParentV2Dashboard> {
  const client = createServiceRoleClient();
  const environment = resolveAdleRouteActivationEnvironment() ?? "production";
  const [daily, published, childResult, words, catalog, families, clusters, canonicalFamilies, canonicalMembers, legacyFamilies, compoundFacts, morphology, contextualResult, attemptRows] = await Promise.all([
    loadDailyPlanFacts(client, { childId, today: asOf, relationshipEnvironment: environment, wordReadMode: "scoped" }),
    loadPublishedWritingAssociations(client, environment),
    client.from("children").select("id,date_of_birth").eq("id", childId).maybeSingle(),
    all<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,display_word,row_status,review_status,age_band,frequency_band"),
    all<any>(client, "micro_skill_catalog", "micro_skill_key,display_name,skill_family_key,skill_cluster_key,is_active", "micro_skill_key"),
    all<any>(client, "micro_skill_families", "skill_family_key,display_name", "skill_family_key"),
    all<any>(client, "micro_skill_clusters", "skill_cluster_key,display_name", "skill_cluster_key"),
    all<any>(client, "canonical_teaching_dictionary_base_family_registry", "id,decision_status,canonical_base_word_id"),
    allCanonicalMembers(client),
    all<any>(client, "canonical_teaching_dictionary_base_word_families", "id,base_family_key,micro_skill_key,row_status,review_status"),
    all<any>(client, "canonical_teaching_dictionary_compound_facts", "id,canonical_word_id,micro_skill_key,first_word,second_word,assignment_eligible,row_status,review_status"),
    all<any>(client, "canonical_teaching_dictionary_word_morphology", "id,canonical_word_id,morphology_parts,analysis_status,row_status,review_status"),
    client.from("contextual_micro_skill_members").select("micro_skill_key,member_normalized"),
    all<any>(client, "adle_assignment_attempt_events", "id,daily_assignment_id,assignment_item_id,canonical_word_id,attempt_text,is_correct,attempt_kind,micro_skill_key,created_at,source_ref,section_key,template_key", "id", (query) => query.eq("child_id", childId)),
  ]);
  if (childResult.error || !childResult.data) throw new Error("parent proficiency learner unavailable");
  if (contextualResult.error) throw new Error("parent proficiency contextual roles unavailable");
  const authority = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations: published });
  const projection = await loadLearnerEvidenceProjection({ client, relationshipAuthority: authority, learnerId: childId });
  const activeWords = words.filter((word) => word.row_status === "active");
  const groupAuthority = deriveV2WordGroups({ words: activeWords.map((word) => ({ id: word.id, normalisedWord: word.normalised_word })),
    canonicalFamilies, canonicalMembers, legacyFamilies, compoundFacts, morphology });
  const wordById = new Map(activeWords.map((word) => [word.id as string, word]));
  const eventById = new Map(projection.events.map((event) => [event.eventId, event]));
  const coverAttemptIds = new Set(attemptRows.filter((row) =>
    row.section_key === "lesson_production" && row.attempt_kind === "lesson_production")
    .map((row) => row.id as string));
  const roles = new Set((contextualResult.data ?? []).map((row) => `${row.micro_skill_key}\u0000${row.member_normalized}`));
  const homophoneEnabled = process.env.PROFICIENCY_HOMOPHONE_CONTEXT_ENABLED === "true";
  const homophoneContext = homophoneEnabled
    ? await loadHomophoneContextEvidence(client, childId, activeWords, contextualResult.data ?? [], attemptRows)
    : { bySkill: new Map<string, V2Evidence[]>(), fingerprint: "disabled" };
  const contextAttempts = new Map(attemptRows.filter((row) =>
    (typeof row.source_ref === "string" && (row.source_ref.includes(":passage:") || row.source_ref.startsWith("review-r3:"))) ||
    row.section_key === "review_audio_check" || row.template_key === "homophone_passage_dictation")
    .map((row) => [row.id as string, String(row.source_ref ?? row.template_key ?? row.id)]));
  const ageBands = requiredAgeBands(childResult.data.date_of_birth, asOf);
  const familyLabel = new Map(families.map((row) => [row.skill_family_key, row.display_name]));
  const clusterLabel = new Map(clusters.map((row) => [row.skill_cluster_key, row.display_name]));
  const relationshipsBySkill = new Map<string, string[]>();
  for (const relation of authority.relationships) {
    relationshipsBySkill.set(relation.microSkillKey, [...(relationshipsBySkill.get(relation.microSkillKey) ?? []), relation.canonicalWordId]);
  }
  const projectionsBySkill = new Map<string, typeof projection.projections>();
  for (const item of projection.projections) {
    projectionsBySkill.set(item.microSkillKey, [...(projectionsBySkill.get(item.microSkillKey) ?? []), item]);
  }
  const skills: ParentV2Skill[] = catalog.filter((row) => row.is_active).map((row) => {
    const key = String(row.micro_skill_key);
    const familyKey = String(row.skill_family_key ?? "other");
    const closed = familyKey === "D4_HOM";
    const relatedIds = relationshipsBySkill.get(key) ?? [];
    const relatedSet = new Set(relatedIds);
    const eligible = relatedIds.filter((id) => {
      const word = wordById.get(id);
      if (!word || !["approved_for_guided_review", "approved_for_first_exposure"].includes(word.review_status)) return false;
      if (!word.frequency_band || !["high", "medium"].includes(word.frequency_band)) return false;
      return !!ageBands && !!word.age_band && ageBands.includes(word.age_band);
    });
    const groupFor = (wordId: string) => {
      const word = wordById.get(wordId);
      if (!word) return { key: "unresolved:word", resolved: false };
      if (closed) return roles.has(`${key}\u0000${word.normalised_word}`)
        ? { key: `role:${word.normalised_word}`, resolved: true }
        : { key: "unresolved:role", resolved: false };
      const derived = groupAuthority.forSkill(wordId, key, relatedSet);
      return derived?.resolved ? derived : { key: `unresolved:${key}`, resolved: false };
    };
    const requiredGroupKeys = [...new Set(eligible.map((id) => groupFor(id)).filter((group) => group.resolved).map((group) => group.key))];
    const entries = closed && homophoneEnabled ? [] : projectionsBySkill.get(key) ?? [];
    let unscored = projection.events.filter((event) => relatedIds.includes(event.canonicalWordId) &&
      (event.outcome === "unknown" || event.verificationState !== "verified" || event.independence !== "independent")).length;
    let unresolvedGroups = eligible.filter((id) => !groupFor(id).resolved).length;
    const evidence: V2Evidence[] = [];
    const firstByGroup = new Map<string, string>();
    for (const item of entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      const source = eventById.get(item.eventId);
      // A covered word is useful for word mastery, but does not demonstrate
      // pattern use in V2. Only the target of answer-hidden dictation does.
      if (source && isAdleCoverCheckSource(source.provenance.sourceRepresentations, coverAttemptIds)) continue;
      const group = groupFor(item.canonicalWordId);
      const occurredOn = item.occurredAt.slice(0, 10);
      if (!source || !positiveEnvironment(item.environment) || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) { unscored += 1; continue; }
      if (!group.resolved) { unresolvedGroups += 1; unscored += 1; continue; }
      if (closed && !["CONTEXTUAL_TRANSFER", "AUTHENTIC_WRITING"].includes(item.environment)) {
        unscored += 1; continue;
      }
      // Contextual lesson passages are governed. Generic word correctness and
      // isolated spelling cannot establish a meaning choice.
      const contextReference = source.provenance.sourceRepresentations
        .map((representation) => contextAttempts.get(representation.sourceEntityId)).find(Boolean);
      if (closed && !contextReference) { unscored += 1; continue; }
      const priorDate = firstByGroup.get(group.key);
      const delayed = !!priorDate && Date.parse(`${occurredOn}T00:00:00Z`) - Date.parse(`${priorDate}T00:00:00Z`) >= 7 * 86_400_000;
      if (!priorDate) firstByGroup.set(group.key, occurredOn);
      const transferable = item.polarity === "positive" && item.environment !== "CONTROLLED_LESSON";
      const relevantChallenge = transferable && (closed || familyKey === "D4_IRRE" ? (closed || delayed) :
        ["D4_MOR", "D4_INF"].includes(familyKey) ? group.resolved &&
          ["released_base_family", "reviewed_morphology"].includes(groupAuthority.forSkill(item.canonicalWordId, key, relatedSet)?.source ?? "") &&
          ["CONTEXTUAL_TRANSFER", "AUTHENTIC_WRITING"].includes(item.environment) :
          ["CONTEXTUAL_TRANSFER", "AUTHENTIC_WRITING"].includes(item.environment));
      evidence.push({ eventId: item.eventId, wordId: item.canonicalWordId, groupKey: group.key,
        occurredOn, polarity: item.polarity, environment: item.environment,
        challengeKey: relevantChallenge ? closed ? `context:${contextReference}` :
          `${group.key}:${item.environment}:${source.sourceKind}:${source.sourceEntityId}` : null,
        sourceKind: source.sourceKind });
    }
    if (closed && homophoneEnabled) evidence.push(...(homophoneContext.bySkill.get(key) ?? []));
    const result = calculateProficiencyV2({ learnerId: childId, skillKey: key, familyKey, asOf,
      requiredGroupKeys, evidence, unscoredCount: unscored, unresolvedGroupCount: unresolvedGroups,
      relationshipFingerprint: authority.reconciliation.sourceFingerprint,
      evidenceFingerprint: closed && homophoneEnabled ? homophoneContext.fingerprint : projection.reconciliation.projectionFingerprint,
      groupFingerprint: groupAuthority.fingerprint,
      homophoneTwoDateSetback: closed && homophoneEnabled });
    if (!closed && eligible.some((id) => groupAuthority.forSkill(id, key, relatedSet)?.key === "unresolved:family_review")) {
      result.reasonCodes.push("family_decision_review_required");
    }
    if (!ageBands) {
      result.confidence = "unresolved";
      result.reasonCodes.push("date_of_birth_unavailable_for_target_pool");
    }
    const evidenceWords = contributingV2Words(evidence, familyKey, asOf, (id) =>
      String(wordById.get(id)?.display_word ?? wordById.get(id)?.normalised_word ?? "Word"));
    const clusterKey = String(row.skill_cluster_key ?? "unclustered");
    return { key, label: String(row.display_name ?? key), familyKey,
      familyLabel: String(familyLabel.get(familyKey) ?? familyKey), clusterKey,
      clusterLabel: String(clusterLabel.get(clusterKey) ?? "Other skills"), evidenceWords, result };
  }).sort((a, b) => a.familyLabel.localeCompare(b.familyLabel) || a.label.localeCompare(b.label));
  const scheduleByWord = new Map(daily.facts.scheduleWords.filter((word) => word.rowStatus === "active")
    .map((word) => [word.canonicalWordId, word]));
  const masteryWords: ParentWordMastery[] = daily.wordStates.map((state) => {
    const counts = daily.wordMasteryEvidence.get(state.canonicalWordId);
    const schedule = scheduleByWord.get(state.canonicalWordId);
    return { id: state.canonicalWordId, word: daily.displayWordByWordId.get(state.canonicalWordId) ?? "Word",
      state: state.state, slipped: state.slipped, productions: counts?.productions ?? 0,
      distinctDays: counts?.distinctDays ?? 0, verifiedAuthenticUses: counts?.verifiedAuthenticUses ?? 0,
      reviewStatus: schedule ? REVIEW_LABELS[schedule.membershipStatus] ?? "Review status unavailable" : "Not in Review",
      nextReview: schedule ? reviewAction(schedule, asOf, daily.wordNextReviewDueByWordId.get(state.canonicalWordId) ?? null) :
        "No Review action scheduled" };
  }).sort((a, b) => a.word.localeCompare(b.word));
  return { asOf, skills, words: masteryWords,
    source: { admitted: projection.reconciliation.admittedSourceEventCount,
      blocked: projection.reconciliation.blockedCount, ambiguous: projection.reconciliation.ambiguousCount,
      relationshipFingerprint: authority.reconciliation.sourceFingerprint,
      evidenceFingerprint: hash({ projection: projection.reconciliation.projectionFingerprint, groups: groupAuthority.fingerprint }) } };
}
