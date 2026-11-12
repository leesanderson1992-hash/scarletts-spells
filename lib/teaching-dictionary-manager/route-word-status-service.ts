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
import { canUpdateStagingIngLesson } from "./ing-staging-scope";
import { loadCurrentLessonSenses } from "./lesson-sense-projection";
import { candidateDecisionIsCurrent, type CandidateDecisionEvent } from "./candidate-decision-current";
import type { DictionarySenseSet } from "./senses";
import { candidateFactsForSense, type CandidateAnalysisRow, type CandidateLinkRow } from
  "./candidate-sense-facts";

type Candidate = { wordId: string; displayWord: string; status: WordRouteStatus;
  overviewCandidate?: CandidateDecision; selectedSenseId?: string | null;
  selectedSenseDefinition?: string | null; senseBindingApproved?: boolean;
  multipleSenseChoices?: { id: string; definition: string }[];
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
  environment: string, skillKey: string, stagingIng: boolean) {
  const [senseSets, bindings, morphology, familyLinks, senseAnalyses, senseFamilyLinks, decisions, choices] = await Promise.all([
    readByIds(client, "teaching_dictionary_reviewed_sense_sets", "canonical_word_id,sense_set",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_effective_lesson_sense_bindings",
      "canonical_word_id,micro_skill_key,environment_key,sense_id,reviewed_by",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "canonical_teaching_dictionary_word_morphology",
      "id,canonical_word_id,row_status,created_at,morphology_parts,morphology_joins,analysis_status,review_status,word_sum",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_current_sense_family_links",
      "id,canonical_word_id,sense_id,family_key,component_part_id,relationship_kind",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_current_sense_morphology",
      "id,canonical_word_id,sense_id,morphology_parts,morphology_joins,word_sum",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_current_sense_family_memberships",
      "id,canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind",
      "canonical_word_id", ids, "canonical_word_id"),
    readByIds(client, "teaching_dictionary_current_candidate_decisions",
      "canonical_word_id,micro_skill_key,environment_key,sense_id,action,pronunciation_id,rule_revision,fact_snapshot,event_sequence",
      "canonical_word_id", ids, "event_sequence"),
    stagingIng ? readByIds(client, "teaching_dictionary_staging_ing_meaning_choices",
      "canonical_word_id,micro_skill_key,sense_id", "canonical_word_id", ids, "canonical_word_id")
      : Promise.resolve([]),
  ]);
  const sensesByWord = new Map<string, DictionarySenseSet>(senseSets.map(row =>
    [row.canonical_word_id, row.sense_set as DictionarySenseSet]));
  const bindingByWord = new Map<string, { senseId: string; reviewedBy: string }[]>();
  for (const row of bindings.filter(row => row.environment_key === environment && row.micro_skill_key === skillKey))
    bindingByWord.set(row.canonical_word_id, [...(bindingByWord.get(row.canonical_word_id) ?? []),
      { senseId: row.sense_id, reviewedBy: row.reviewed_by }]);
  const morphologyByWord = new Map<string, typeof morphology[number]>();
  for (const row of morphology) {
    if (row.row_status !== "active") continue;
    const previous = morphologyByWord.get(row.canonical_word_id);
    if (!previous || row.created_at > previous.created_at) morphologyByWord.set(row.canonical_word_id, row);
  }
  const linksByWord = new Map<string, (CandidateFamilyLink & { id: string })[]>();
  for (const row of familyLinks) linksByWord.set(row.canonical_word_id,
    [...(linksByWord.get(row.canonical_word_id) ?? []), row]);
  const senseAnalysesByWord = new Map<string, CandidateAnalysisRow[]>();
  for (const row of senseAnalyses) senseAnalysesByWord.set(row.canonical_word_id,
    [...(senseAnalysesByWord.get(row.canonical_word_id) ?? []), row]);
  const senseLinksByWord = new Map<string, CandidateLinkRow[]>();
  for (const row of senseFamilyLinks) senseLinksByWord.set(row.canonical_word_id,
    [...(senseLinksByWord.get(row.canonical_word_id) ?? []), row]);
  const decisionsByWordSense = new Map<string, CandidateDecisionEvent>();
  for (const row of decisions.filter(row => row.environment_key === environment && row.micro_skill_key === skillKey))
    decisionsByWordSense.set(`${row.canonical_word_id}:${row.sense_id}`, row);
  const releaseSenseByWord = new Map<string, string>(choices.filter(row => row.micro_skill_key === skillKey)
    .map(row => [row.canonical_word_id, row.sense_id]));
  return { sensesByWord, bindingByWord, morphologyByWord, linksByWord, releaseSenseByWord,
    senseAnalysesByWord, senseLinksByWord, decisionsByWordSense };
}

/** Discover possible relationships by one micro-skill, without treating a
 * source row as approval. The governed interpreter makes that decision. */
async function discoverWordIds(client: SupabaseClient, lesson: LessonReadinessRow): Promise<string[]> {
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
  return [...new Set<string>([
    ...lesson.words.map((word) => word.id),
    ...support.map((row) => row.canonical_word_id),
    ...mappedWords.map((row) => row.id),
    ...prefixMembers.map((row) => row.canonical_word_id),
    ...suffixMembers.map((row) => row.canonical_word_id),
    ...reviewed.map((row) => row.canonical_word_id),
  ].filter(Boolean))];
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
  const ids = [...new Set(input.wordIds ?? await discoverWordIds(client, lesson))];
  const words = await loadRouteWordCandidates(client, lesson, ids, (candidate, facts) => ({
    ...candidate, status: wordRouteStatus({ ...facts, lesson }),
  }));
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

export async function loadApprovedIngWordsForIds(client: SupabaseClient, microSkillKey: string, ids: readonly string[],
  selectedSenses?: ReadonlyMap<string, string>) {
  const candidates = await loadRouteWordCandidates(client, { routeId: "ing_endings_word_lab", microSkillKey },
    [...new Set(ids)], candidate => candidate, selectedSenses);
  return candidates.flatMap(candidate => candidate.approvedIngWord ? [candidate.approvedIngWord] : []);
}

async function loadRouteWordCandidates<T extends Omit<Candidate, "status">>(
  client: SupabaseClient, lesson: Pick<LessonReadinessRow, "routeId" | "microSkillKey">,
  ids: readonly string[], project: (candidate: Omit<Candidate, "status">, facts: Omit<Parameters<typeof wordRouteStatus>[0], "lesson">) => T,
  selectedSenses?: ReadonlyMap<string, string>,
): Promise<T[]> {
  if (!ids.length) return [];
  const environment = resolveAdleRouteActivationEnvironment();
  const stagingIng = lesson.routeId === "ing_endings_word_lab" && canUpdateStagingIngLesson();
  const [authority, dictionary, overview, currentSenses] = await Promise.all([
    environment ? lesson.routeId === "weak_vowel_word_lab"
      ? loadPublishedWritingAssociations(client, environment, ids).then((explicitReviewedAssociations) =>
        loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment,
          canonicalWordIds: ids, explicitReviewedAssociations }))
      : loadTeachingDictionaryEvidenceAuthorityForWords(client, environment, ids) : Promise.resolve(null),
    readByIds(client, "canonical_teaching_dictionary_words",
      "id,display_word,row_status,review_status,source_name,source_url", "id", ids),
    environment && hasCandidateRule(lesson.microSkillKey)
      ? loadOverviewCandidateFacts(client, ids, environment, lesson.microSkillKey, stagingIng)
      : Promise.resolve(null),
    environment && hasCandidateRule(lesson.microSkillKey)
      ? loadCurrentLessonSenses(client, ids, [lesson.microSkillKey], stagingIng)
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
  return dictionary.map((row) => {
    const senseSet = overview?.sensesByWord.get(row.id) ?? null;
    const bindings = overview?.bindingByWord.get(row.id) ?? [];
    const releaseSenseId = stagingIng
      ? selectedSenses?.get(row.id) ?? overview?.releaseSenseByWord.get(row.id) : undefined;
    const binding = releaseSenseId ? bindings.find(item => item.senseId === releaseSenseId)
      : bindings.length === 1 ? bindings[0] : null;
    const selectedSenseId = releaseSenseId ?? binding?.senseId
      ?? (bindings.length === 0 && senseSet?.senses.length === 1 ? senseSet.senses[0].id : null);
    const morphology = overview?.morphologyByWord.get(row.id);
    const facts = overview ? candidateFactsForSense({ wordId: row.id,
      senseId: selectedSenseId ?? undefined, senseSet,
      legacyMorphology: morphology ? { id: morphology.id, parts: morphology.morphology_parts,
        joins: morphology.morphology_joins, analysisStatus: morphology.analysis_status,
        reviewStatus: morphology.review_status, wordSum: morphology.word_sum } : null,
      legacyLinks: (overview.linksByWord.get(row.id) ?? []) as CandidateLinkRow[],
      senseAnalyses: overview.senseAnalysesByWord.get(row.id) ?? [],
      senseLinks: overview.senseLinksByWord.get(row.id) ?? [] }) : null;
    const recipe = overview && lesson.microSkillKey in ING_RULE_FOR_SKILL
      ? generateIngWordFromOverview({ wordId: row.id, displayWord: row.display_word,
        skillKey: lesson.microSkillKey, senseId: selectedSenseId ?? undefined, senseSet,
        morphology: facts?.morphology ?? null,
        familyLinks: facts?.familyLinks ?? [],
        provenance: { sourceName: row.source_name, sourceUrl: row.source_url },
      }) : null;
    const pairKey = `${row.id}:${lesson.microSkillKey}`;
    const bindingCurrent = Boolean(binding)
      && currentSenses.get(stagingIng ? `${pairKey}:${selectedSenseId}` : pairKey)?.status === "current";
    const decisionCurrent = overview && selectedSenseId ? candidateDecisionIsCurrent({
      event: overview.decisionsByWordSense.get(`${row.id}:${selectedSenseId}`) ?? null,
      senseId: selectedSenseId, senseSet, morphologyId: facts?.morphologyId ?? null,
      familyLinkIds: facts?.familyLinkIds ?? [],
    }) : false;
    const approvedIngWord = recipe?.status === "ready" && bindingCurrent && decisionCurrent
      && approvedByWord.get(row.id)?.has(lesson.microSkillKey)
      && row.row_status === "active" && row.review_status === "approved_for_first_exposure"
      ? approvedGeneratedIngWord({ generated: recipe.word,
        reviewerRef: binding?.reviewedBy ?? "", approvalRef: approvalRefByWord.get(row.id) ?? "" }) : null;
    return project({ wordId: row.id, displayWord: row.display_word,
      ...(overview ? { selectedSenseId, senseBindingApproved: bindingCurrent,
        multipleSenseChoices: bindings.length > 1 || releaseSenseId ? bindings.map(item => ({ id: item.senseId,
          definition: senseSet?.senses.find(sense => sense.id === item.senseId)?.definition ?? item.senseId })) : [],
        candidateDecisionCurrent: decisionCurrent,
        selectedSenseDefinition: senseSet?.senses.find(sense => sense.id === selectedSenseId)?.definition ?? null,
        overviewCandidate: evaluateLessonCandidate({
        wordId: row.id, displayWord: row.display_word, skillKey: lesson.microSkillKey,
        senseId: selectedSenseId ?? undefined, senseSet,
        morphology: facts?.morphology ?? null,
        familyLinks: facts?.familyLinks ?? [],
      }),
        ...(recipe ? { generatedIng: recipe, approvedIngWord } : {}) } : {}),
    }, {
      wordId: row.id,
      dictionaryApproved: row.row_status === "active" && row.review_status === "approved_for_first_exposure",
      approvedSkillKeys: approvedByWord.get(row.id) ?? new Set(),
      ...(lesson.routeId === "weak_vowel_word_lab" ? {
        weakVowelPublished: weakPublished.has(row.id), weakVowelContentBlockers: weakPublished.get(row.id) ?? [],
      } : {}),
    });
  }).sort((a, b) => a.displayWord.localeCompare(b.displayWord) || a.wordId.localeCompare(b.wordId));
}
