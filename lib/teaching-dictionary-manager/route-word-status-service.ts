import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed tables precede generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { recordAdleReadPage, withAdleReadMetrics } from "@/lib/adle/observability/read-metrics";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadTeachingDictionaryEvidenceAuthorityForWords } from "./evidence-authority";
import { loadLessonReadiness, type LessonReadinessRow } from "./lesson-preflight";
import { wordRouteStatus, type WordRouteStatus } from "./word-route-status";

type Candidate = { wordId: string; displayWord: string; status: WordRouteStatus };

async function readPages(client: SupabaseClient, table: string, columns: string, filter: (query: any) => any): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const started = performance.now();
    const { data, error } = await filter(client.from(table).select(columns)).order("id").range(offset, offset + 499);
    recordAdleReadPage(table, data ?? [], performance.now() - started);
    if (error) throw new Error(`route word status ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) return rows;
  }
}

async function readByIds(client: SupabaseClient, table: string, columns: string, column: string, ids: readonly string[]): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches: any[][] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    batches.push(await readPages(client, table, columns, (query) => query.in(column, unique.slice(offset, offset + 100))));
  }
  return batches.flat();
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
}): Promise<{ words: Candidate[]; counts: { candidates: number; approvedRelationships: number; technicalComplete: number; administrativeCandidates: number; awaitingEditorial: number; missingContent: number } }> {
  return withAdleReadMetrics("route_word_status", () => loadRouteWordStatusesUnmeasured(input));
}

async function loadRouteWordStatusesUnmeasured(input: {
  routeId: string;
  microSkillKey: string;
  lesson?: LessonReadinessRow;
  wordIds?: readonly string[];
}): Promise<{ words: Candidate[]; counts: { candidates: number; approvedRelationships: number; technicalComplete: number; administrativeCandidates: number; awaitingEditorial: number; missingContent: number } }> {
  const lesson = input.lesson ?? (await loadLessonReadiness({ routeId: input.routeId, microSkillKey: input.microSkillKey }))
    .find((row) => row.routeId === input.routeId && row.microSkillKey === input.microSkillKey);
  if (!lesson || lesson.routeId !== input.routeId || lesson.microSkillKey !== input.microSkillKey)
    throw new Error("Route word status requires a registered route and micro-skill");
  const client = createServiceRoleClient();
  const discovery = input.wordIds ? null : await discoverWordIds(client, lesson);
  const ids = [...new Set(input.wordIds ?? discovery?.ids ?? [])];
  if (ids.length === 0) return { words: [], counts: { candidates: 0, approvedRelationships: 0, technicalComplete: 0, administrativeCandidates: 0, awaitingEditorial: 0, missingContent: 0 } };
  const environment = resolveAdleRouteActivationEnvironment();
  const [authority, dictionary] = await Promise.all([
    environment ? loadTeachingDictionaryEvidenceAuthorityForWords(client, environment, ids) : Promise.resolve(null),
    readByIds(client, "canonical_teaching_dictionary_words", "id,display_word,row_status,review_status", "id", ids),
  ]);
  const approvedByWord = new Map<string, Set<string>>();
  for (const relationship of authority?.relationships ?? []) {
    const skills = approvedByWord.get(relationship.canonicalWordId) ?? new Set<string>();
    skills.add(relationship.microSkillKey);
    approvedByWord.set(relationship.canonicalWordId, skills);
  }
  const words = dictionary.filter((row) => input.wordIds || discovery?.nonReviewedIds.has(row.id)
    || approvedByWord.get(row.id)?.has(lesson.microSkillKey)).map((row): Candidate => ({
    wordId: row.id,
    displayWord: row.display_word,
    status: wordRouteStatus({
      wordId: row.id,
      dictionaryApproved: row.row_status === "active" && row.review_status === "approved_for_first_exposure",
      approvedSkillKeys: approvedByWord.get(row.id) ?? new Set(),
      lesson,
    }),
  })).sort((a, b) => a.displayWord.localeCompare(b.displayWord) || a.wordId.localeCompare(b.wordId));
  return { words, counts: {
    candidates: words.length,
    approvedRelationships: words.filter((word) => word.status.relationshipApproved).length,
    technicalComplete: words.filter((word) => word.status.technicalFacts === "complete").length,
    administrativeCandidates: words.filter((word) => word.status.administrativeCandidate).length,
    awaitingEditorial: words.filter((word) => word.status.contentPresent && !word.status.editorialApproved).length,
    missingContent: words.filter((word) => !word.status.contentPresent).length,
  } };
}
