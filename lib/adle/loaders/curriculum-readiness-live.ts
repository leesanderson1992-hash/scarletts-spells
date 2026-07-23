import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- additive lineage tables are ahead of generated DB types */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../curriculum-readiness/route-registry";
import type {
  CurriculumReadinessFacts,
  LearningItemLineageFact,
  RouteActivationFact,
  RouteContentFact,
  RouteSelectionFact,
  SharedWordRouteFact,
} from "../curriculum-readiness/resolver";
import type { LearningItemFact } from "../learning-items";

const PAGE_SIZE = 500;

async function readAllById<T>(client: SupabaseClient, table: string, columns: string, configure: (query: any) => any = (query) => query, key = "id"): Promise<T[]> {
  const output: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = configure(client.from(table).select(columns)).order(key, { ascending: true }).limit(PAGE_SIZE);
    if (after) query = query.gt(key, after);
    const { data, error } = await query;
    if (error) throw new Error(`curriculum readiness ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    output.push(...page);
    if (page.length < PAGE_SIZE) return output;
    const last = page[page.length - 1] as Record<string, unknown>;
    if (typeof last[key] !== "string" || !last[key]) throw new Error(`curriculum readiness ${table}: paged row missing ${key}`);
    after = last[key] as string;
  }
}

/**
 * Loads all source facts needed by the pure resolver. This function only uses
 * select queries; selector/activation facts are supplied by the caller so the
 * reader never decides to enable a route.
 */
export async function loadCurriculumReadinessFacts(params: {
  client: SupabaseClient;
  environmentKey: "local" | "staging" | "production";
  routeActivation: readonly RouteActivationFact[];
  routeSelections?: readonly RouteSelectionFact[];
  routeContent?: readonly RouteContentFact[];
}): Promise<CurriculumReadinessFacts> {
  const client = params.client;
  const [candidateRows, canonicalRows, wordRows, skillRows, supportRows, itemRows, lineageRows, scheduleRows, routeRows] = await Promise.all([
    readAllById<any>(client, "parent_verified_spelling_candidate_mappings", "id,parent_user_id,child_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,candidate_status,updated_at", (query) => query.in("candidate_status", ["parent_local_promoted", "global_canonical_promoted"])),
    readAllById<any>(client, "spelling_canonical_mappings", "id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status,created_at", (query) => query.eq("mapping_status", "active")),
    readAllById<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,row_status,review_status,frequency_band,age_band"),
    readAllById<any>(client, "micro_skill_catalog", "micro_skill_key,mastery_domain_key,skill_family_key,is_active,is_assignable", undefined, "micro_skill_key"),
    readAllById<any>(client, "canonical_teaching_dictionary_word_support", "id,canonical_word_id,micro_skill_key,support_role,row_status,review_status"),
    readAllById<any>(client, "adle_learning_items", "id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status", (query) => query.eq("row_status", "active")),
    readAllById<any>(client, "adle_learning_item_sources", "id,learning_item_id,source_ref,parent_verified_candidate_mapping_id,canonical_mapping_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key", (query) => query.eq("row_status", "active")),
    readAllById<any>(client, "adle_review_schedule_words", "id,child_id,canonical_word_id,row_status", (query) => query.eq("row_status", "active")),
    readAllById<any>(client, "adle_review_schedule_word_routes", "id,schedule_word_id,learning_item_id,micro_skill_key,attached_on,attachment_ordinal,row_status", (query) => query.eq("row_status", "active")),
  ]);
  const mappingIds = canonicalRows.map((row) => row.id as string);
  const visibilityRows = mappingIds.length === 0 ? [] : await readAllById<any>(client, "spelling_canonical_mapping_events", "id,mapping_id,event_type,new_resolver_visibility_status", (query) => query.in("mapping_id", mappingIds).eq("event_type", "resolver_visibility_enabled").eq("new_resolver_visibility_status", "visible"));
  const visibleIds = new Set(visibilityRows.map((row) => row.mapping_id as string));
  const skillFamilyByKey = new Map(skillRows.map((row) => [row.micro_skill_key as string, row.skill_family_key as string]));
  const scheduleById = new Map(scheduleRows.map((row) => [row.id as string, row]));
  const sharedRoutes = new Map<string, SharedWordRouteFact[]>();
  for (const row of routeRows) {
    const schedule = scheduleById.get(row.schedule_word_id as string);
    if (!schedule) continue;
    const key = `${schedule.child_id}\u0000${schedule.canonical_word_id}`;
    sharedRoutes.set(key, [...(sharedRoutes.get(key) ?? []), {
      learningItemId: row.learning_item_id,
      microSkillKey: row.micro_skill_key,
      attachedOn: row.attached_on,
      attachmentOrdinal: row.attachment_ordinal,
      requiresSentenceContext: skillFamilyByKey.get(row.micro_skill_key) === "D4_HOM",
      rowStatus: row.row_status,
    }]);
  }
  const mappings = [
    ...candidateRows.map((row) => ({ mappingId: row.id, authority: "parent_local" as const, parentUserId: row.parent_user_id, childId: row.child_id, misspellingNormalized: row.misspelling_normalized, correctSpellingNormalized: row.correct_spelling_normalized, microSkillKey: row.micro_skill_key, status: row.candidate_status, mappingStatus: null, resolverVisibilityStatus: null, hasVisibilityEnableEvent: false, verifiedOn: String(row.updated_at).slice(0, 10), sourceRef: `candidate:${row.id}` })),
    ...canonicalRows.map((row) => ({ mappingId: row.id, authority: "global_canonical" as const, parentUserId: null, childId: null, misspellingNormalized: row.misspelling_normalized, correctSpellingNormalized: row.correct_spelling_normalized, microSkillKey: row.micro_skill_key, status: "global_canonical_promoted", mappingStatus: row.mapping_status, resolverVisibilityStatus: row.resolver_visibility_status, hasVisibilityEnableEvent: visibleIds.has(row.id), verifiedOn: String(row.created_at).slice(0, 10), sourceRef: `canonical:${row.id}` })),
  ];
  return {
    environmentKey: params.environmentKey,
    mappings,
    learningItems: itemRows.map((row): LearningItemFact => ({ learningItemId: row.id, childId: row.child_id, canonicalWordId: row.canonical_word_id, microSkillKey: row.micro_skill_key, itemStatus: row.item_status, sourceKind: row.source_kind, sourceRef: row.source_ref, sourceAttemptText: row.source_attempt_text, reteachPriority: row.reteach_priority, ejectedOn: row.ejected_on, intakeOn: row.intake_on, rowStatus: row.row_status })),
    learningItemLineage: lineageRows.map((row): LearningItemLineageFact => ({ learningItemId: row.learning_item_id, sourceRef: row.source_ref, candidateMappingId: row.parent_verified_candidate_mapping_id, canonicalMappingId: row.canonical_mapping_id, misspellingNormalized: row.misspelling_normalized, correctSpellingNormalized: row.correct_spelling_normalized, microSkillKey: row.micro_skill_key })),
    words: wordRows.map((row) => ({ canonicalWordId: row.id, normalisedWord: row.normalised_word, rowStatus: row.row_status, reviewStatus: row.review_status, frequencyBand: row.frequency_band, ageBand: row.age_band })),
    microSkills: skillRows.map((row) => ({ microSkillKey: row.micro_skill_key, masteryDomainKey: row.mastery_domain_key, isActive: row.is_active, isAssignable: row.is_assignable })),
    supports: supportRows.map((row) => ({ canonicalWordId: row.canonical_word_id, microSkillKey: row.micro_skill_key, supportRole: row.support_role, rowStatus: row.row_status, reviewStatus: row.review_status })),
    routes: ADLE_CURRICULUM_ROUTE_REGISTRY,
    routeActivation: [...params.routeActivation],
    routeSelections: [...(params.routeSelections ?? [])],
    routeContent: [...(params.routeContent ?? [])],
    sharedRoutes,
    scheduledSharedWordKeys: new Set(
      scheduleRows.map(
        (row) => `${row.child_id as string}\u0000${row.canonical_word_id as string}`,
      ),
    ),
  };
}
