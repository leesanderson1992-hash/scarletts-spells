import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed tables precede generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { recordAdleReadPage, withAdleReadMetrics } from "@/lib/adle/observability/read-metrics";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadTeachingDictionaryEvidenceAuthorityForWords } from "./evidence-authority";
import { loadLessonReadiness, type LessonReadinessRow } from "./lesson-preflight";
import { wordRouteStatus, type WordRouteStatus } from "./word-route-status";
import { loadPublishedWeakVowelWords } from "@/lib/adle/weak-vowel/governed-content-loader";
import { publishedWeakVowelWordBlockers } from "@/lib/adle/weak-vowel/governed-content";
import type { WeakVowelMicroSkill } from "@/lib/adle/weak-vowel/lesson";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";
import { evaluateLessonCandidate, hasCandidateRule, type CandidateDecision,
  type CandidateFamilyLink } from "./lesson-candidate";
import { approvedGeneratedIngWord, generateIngWordFromOverview, type IngRecipeResult } from "./ing-overview-recipe";
import { ING_RULE_FOR_SKILL, type IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import { loadCurrentLessonSenses } from "./lesson-sense-projection";
import { candidateDecisionIsCurrent, type CandidateDecisionEvent } from "./candidate-decision-current";
import type { DictionarySenseSet } from "./senses";

type Candidate = { wordId: string; displayWord: string; status: WordRouteStatus;
  overviewCandidate?: CandidateDecision; selectedSenseId?: string | null;
  selectedSenseDefinition?: string | null; senseBindingApproved?: boolean;
  candidateDecisionCurrent?: boolean;
  generatedIng?: IngRecipeResult; approvedIngWord?: IngDictionaryWordV1 | null };
type RouteWordCounts = { candidates: number; approvedRelationships: number; technicalComplete: number;
  administrativeCandidates: number; awaitingEditorial: number; missingContent: number;
  generatedReadyIng: number; approvedGeneratedIng: number };

async function readPages(client: SupabaseClient, table: string, columns: string, filter: (query: any) => any,
  orderColumn = "id"): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const started = performance.now();
    const { data, error } = await filter(client.from(table).select(columns)).order(orderColumn).range(offset, offset + 499);
    recordAdleReadPage(table, data ?? [], performance.now() - started);
    if (error) throw new Error(`route word status ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) return rows;
  }
}

async function readByIds(client: SupabaseClient, table: string, columns: string, column: string, ids: readonly string[],
  orderColumn = "id"): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches: any[][] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    batches.push(await readPages(client, table, columns,
      (query) => query.in(column, unique.slice(offset, offset + 100)), orderColumn));
  }
  return batches.flat();
}

async function loadOverviewCandidateFacts(client: SupabaseClient, ids: readonly string[],
  environment: string, skillKey: string) {
  const [senseSets, bindings, morphology, familyLinks, decisions] = await Promise.all([
    readByIds(client, "teaching_dictionary_reviewed_sense_sets", "canonical_word_id,sense_set",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_lesson_sense_bindings",
      "canonical_word_id,micro_skill_key,environment_key,sense_id,reviewed_by,withdrawn_at",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "canonical_teaching_dictionary_word_morphology",
      "id,canonical_word_id,row_status,created_at,morphology_parts,morphology_joins,analysis_status,review_status,word_sum",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_current_sense_family_links",
      "id,canonical_word_id,sense_id,family_key,component_part_id,relationship_kind",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_current_candidate_decisions",
      "canonical_word_id,micro_skill_key,environment_key,sense_id,action,pronunciation_id,rule_revision,fact_snapshot,event_sequence",
      "canonical_word_id", ids, "event_sequence"),
  ]);
  const sensesByWord = new Map<string, DictionarySenseSet>(senseSets.map(row =>
    [row.canonical_word_id, row.sense_set as DictionarySenseSet]));
  const bindingByWord = new Map<string, { senseId: string; reviewedBy: string }>(bindings.filter(row => row.environment_key === environment
    && row.micro_skill_key === skillKey && row.withdrawn_at == null).map(row =>
    [row.canonical_word_id, { senseId: row.sense_id, reviewedBy: row.reviewed_by }]));
  const morphologyByWord = new Map<string, typeof morphology[number]>();
  for (const row of morphology) {
    if (row.row_status !== "active") continue;
    const previous = morphologyByWord.get(row.canonical_word_id);
    if (!previous || row.created_at > previous.created_at) morphologyByWord.set(row.canonical_word_id, row);
  }
  const linksByWord = new Map<string, (CandidateFamilyLink & { id: string })[]>();
  for (const row of familyLinks) linksByWord.set(row.canonical_word_id,
    [...(linksByWord.get(row.canonical_word_id) ?? []), row]);
  const decisionsByWordSense = new Map<string, CandidateDecisionEvent>();
  for (const row of decisions.filter(row => row.environment_key === environment && row.micro_skill_key === skillKey))
    decisionsByWordSense.set(`${row.canonical_word_id}:${row.sense_id}`, row);
  return { sensesByWord, bindingByWord, morphologyByWord, linksByWord, decisionsByWordSense };
}

/** Discover possible relationships by one micro-skill, without treating a
 * source row as approval. The governed interpreter makes that decision. */
async function discoverWordIds(client: SupabaseClient, lesson: LessonReadinessRow): Promise<{ ids: string[]; nonReviewedIds: Set<string> }> {
  const skill = lesson.microSkillKey;
  const [reviewed, support, mappings, prefixProfiles, suffixProfiles] = await Promise.all([
    readPages(client, "adle_reviewed_word_skill_pairs", "id,canonical_word_id", (query) => query.eq("micro_skill_key", skill)),
    readPages(client, "canonical_teaching_dictionary_word_support", "id,canonical_word_id", (query) => query.eq("micro_skill_key", skill)),
    readPages(client, "spelling_canonical_mappings", "id,correct_spelling_normalized", (query) => query.eq("micro_skill_key", skill).eq("mapping_status", "active").eq("resolver_visibility_status", "visible")),
    readPages(client, "canonical_teaching_dictionary_prefix_profiles", "id", (query) => query.eq("micro_skill_key", skill)),
    readPages(client, "canonical_teaching_dictionary_suffix_profiles", "id", (query) => query.eq("micro_skill_key", skill)),
  ]);
  const [mappedWords, prefixMembers, suffixMembers] = await Promise.all([
    readByIds(client, "canonical_teaching_dictionary_words", "id", "normalised_word", mappings.map((row) => row.correct_spelling_normalized)),
    readByIds(client, "canonical_teaching_dictionary_prefix_members", "id,canonical_word_id", "prefix_profile_id", prefixProfiles.map((row) => row.id)),
    readByIds(client, "canonical_teaching_dictionary_suffix_members", "id,canonical_word_id", "suffix_profile_id", suffixProfiles.map((row) => row.id)),
  ]);
  const nonReviewedIds = new Set<string>([
    ...lesson.words.map((word) => word.id),
    ...support.map((row) => row.canonical_word_id),
    ...mappedWords.map((row) => row.id),
    ...prefixMembers.map((row) => row.canonical_word_id),
    ...suffixMembers.map((row) => row.canonical_word_id),
  ].filter(Boolean));
  return { ids: [...new Set([...nonReviewedIds, ...reviewed.map((row) => row.canonical_word_id)].filter(Boolean))], nonReviewedIds };
}

export async function loadRouteWordStatuses(input: {
  routeId: string;
  microSkillKey: string;
  lesson?: LessonReadinessRow;
  wordIds?: readonly string[];
}): Promise<{ words: Candidate[]; counts: RouteWordCounts }> {
  return withAdleReadMetrics("route_word_status", () => loadRouteWordStatusesUnmeasured(input));
}

async function loadRouteWordStatusesUnmeasured(input: {
  routeId: string;
  microSkillKey: string;
  lesson?: LessonReadinessRow;
  wordIds?: readonly string[];
}): Promise<{ words: Candidate[]; counts: RouteWordCounts }> {
  const lesson = input.lesson ?? (await loadLessonReadiness({ routeId: input.routeId, microSkillKey: input.microSkillKey }))
    .find((row) => row.routeId === input.routeId && row.microSkillKey === input.microSkillKey);
  if (!lesson || lesson.routeId !== input.routeId || lesson.microSkillKey !== input.microSkillKey)
    throw new Error("Route word status requires a registered route and micro-skill");
  const client = createServiceRoleClient();
  const discovery = input.wordIds ? null : await discoverWordIds(client, lesson);
  const ids = [...new Set(input.wordIds ?? discovery?.ids ?? [])];
  if (ids.length === 0) return { words: [], counts: { candidates: 0, approvedRelationships: 0,
    technicalComplete: 0, administrativeCandidates: 0, awaitingEditorial: 0, missingContent: 0,
    generatedReadyIng: 0, approvedGeneratedIng: 0 } };
  const environment = resolveAdleRouteActivationEnvironment();
  const [authority, dictionary, overview, currentSenses] = await Promise.all([
    environment ? lesson.routeId === "weak_vowel_word_lab"
      ? loadPublishedWritingAssociations(client, environment, ids).then((explicitReviewedAssociations) =>
        loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment,
          canonicalWordIds: ids, explicitReviewedAssociations }))
      : loadTeachingDictionaryEvidenceAuthorityForWords(client, environment, ids) : Promise.resolve(null),
    readByIds(client, "canonical_teaching_dictionary_words",
      "id,display_word,row_status,review_status,source_name,source_url", "id", ids),
    environment && hasCandidateRule(lesson.microSkillKey)
      ? loadOverviewCandidateFacts(client, ids, environment, lesson.microSkillKey)
      : Promise.resolve(null),
    environment && hasCandidateRule(lesson.microSkillKey)
      ? loadCurrentLessonSenses(client, ids, [lesson.microSkillKey])
      : Promise.resolve(new Map()),
  ]);
  const approvedByWord = new Map<string, Set<string>>();
  const approvalRefByWord = new Map<string, string>();
  for (const relationship of authority?.relationships ?? []) {
    const skills = approvedByWord.get(relationship.canonicalWordId) ?? new Set<string>();
    skills.add(relationship.microSkillKey);
    approvedByWord.set(relationship.canonicalWordId, skills);
    if (relationship.microSkillKey === lesson.microSkillKey) {
      const reviewed = relationship.sourceProvenance.find(source =>
        source.sourceAuthority === "explicit_reviewed_association"
        && source.exactPairApproval === "approved" && source.reviewState === "approved"
        && source.releaseState === "released") ?? relationship.sourceProvenance.find(source =>
        source.exactPairApproval === "approved" && source.reviewState === "approved"
        && source.releaseState === "released");
      if (reviewed?.provenanceId) approvalRefByWord.set(relationship.canonicalWordId, reviewed.provenanceId);
    }
  }
  const weakPublished = new Map<string, ReturnType<typeof publishedWeakVowelWordBlockers>>();
  if (lesson.routeId === "weak_vowel_word_lab") {
    for (let start = 0; start < ids.length; start += 6) {
      const published = await loadPublishedWeakVowelWords({ client, microSkillKey: lesson.microSkillKey as WeakVowelMicroSkill,
        canonicalWordIds: ids.slice(start, start + 6) });
      for (const row of published) weakPublished.set(row.canonicalWordId,
        publishedWeakVowelWordBlockers(row, lesson.microSkillKey as WeakVowelMicroSkill));
    }
  }
  const words = dictionary.filter((row) => input.wordIds || discovery?.nonReviewedIds.has(row.id)
    || approvedByWord.get(row.id)?.has(lesson.microSkillKey)).map((row): Candidate => {
    const senseSet = overview?.sensesByWord.get(row.id) ?? null;
    const binding = overview?.bindingByWord.get(row.id);
    const selectedSenseId = binding?.senseId
      ?? (senseSet?.senses.length === 1 ? senseSet.senses[0].id : null);
    const morphology = overview?.morphologyByWord.get(row.id);
    const recipe = overview && lesson.microSkillKey in ING_RULE_FOR_SKILL
      ? generateIngWordFromOverview({ wordId: row.id, displayWord: row.display_word,
        skillKey: lesson.microSkillKey, senseId: selectedSenseId ?? undefined, senseSet,
        morphology: morphology ? { parts: morphology.morphology_parts, joins: morphology.morphology_joins,
          analysisStatus: morphology.analysis_status, reviewStatus: morphology.review_status,
          wordSum: morphology.word_sum } : null,
        familyLinks: overview.linksByWord.get(row.id) ?? [],
        provenance: { sourceName: row.source_name, sourceUrl: row.source_url },
      }) : null;
    const bindingCurrent = currentSenses.get(`${row.id}:${lesson.microSkillKey}`)?.status === "current";
    const decisionCurrent = overview && selectedSenseId ? candidateDecisionIsCurrent({
      event: overview.decisionsByWordSense.get(`${row.id}:${selectedSenseId}`) ?? null,
      senseId: selectedSenseId, senseSet, morphologyId: morphology?.id ?? null,
      familyLinkIds: (overview.linksByWord.get(row.id) ?? [])
        .filter(link => link.sense_id === selectedSenseId).map(link => link.id),
    }) : false;
    const approvedIngWord = recipe?.status === "ready" && bindingCurrent && decisionCurrent
      && approvedByWord.get(row.id)?.has(lesson.microSkillKey)
      && row.row_status === "active" && row.review_status === "approved_for_first_exposure"
      ? approvedGeneratedIngWord({ generated: recipe.word,
        reviewerRef: binding?.reviewedBy ?? "", approvalRef: approvalRefByWord.get(row.id) ?? "" }) : null;
    return { wordId: row.id, displayWord: row.display_word,
      ...(overview ? { selectedSenseId, senseBindingApproved: bindingCurrent,
        candidateDecisionCurrent: decisionCurrent,
        selectedSenseDefinition: senseSet?.senses.find(sense => sense.id === selectedSenseId)?.definition ?? null,
        overviewCandidate: evaluateLessonCandidate({
        wordId: row.id, displayWord: row.display_word, skillKey: lesson.microSkillKey,
        senseId: selectedSenseId ?? undefined, senseSet,
        morphology: morphology ? { parts: morphology.morphology_parts, joins: morphology.morphology_joins,
          analysisStatus: morphology.analysis_status, reviewStatus: morphology.review_status,
          wordSum: morphology.word_sum } : null,
        familyLinks: overview.linksByWord.get(row.id) ?? [],
      }),
        ...(recipe ? { generatedIng: recipe, approvedIngWord } : {}) } : {}),
      status: wordRouteStatus({
      wordId: row.id,
      dictionaryApproved: row.row_status === "active" && row.review_status === "approved_for_first_exposure",
      approvedSkillKeys: approvedByWord.get(row.id) ?? new Set(),
      lesson,
      ...(lesson.routeId === "weak_vowel_word_lab" ? {
        weakVowelPublished: weakPublished.has(row.id), weakVowelContentBlockers: weakPublished.get(row.id) ?? [],
      } : {}),
    }) };
  }).sort((a, b) => a.displayWord.localeCompare(b.displayWord) || a.wordId.localeCompare(b.wordId));
  return { words, counts: {
    candidates: words.length,
    approvedRelationships: words.filter((word) => word.status.relationshipApproved).length,
    technicalComplete: words.filter((word) => word.status.technicalFacts === "complete").length,
    administrativeCandidates: words.filter((word) => word.status.administrativeCandidate).length,
    awaitingEditorial: words.filter((word) => word.status.contentPresent && !word.status.editorialApproved).length,
    missingContent: words.filter((word) => !word.status.contentPresent).length,
    generatedReadyIng: words.filter(word => word.generatedIng?.status === "ready").length,
    approvedGeneratedIng: words.filter(word => Boolean(word.approvedIngWord)).length,
  } };
}
