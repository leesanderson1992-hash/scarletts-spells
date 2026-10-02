import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed intake tables precede generated types */

import { canonicalWordSkillPair } from "@/lib/adle/canonical-intake";
import { resolveCanonicalIntakeRoute } from "@/lib/adle/canonical-intake/route-readiness";
import { routeActivationFacts } from "@/lib/adle/loaders/canonical-intake-live";
import { ADLE_PILOT_CHILD_BAND } from "@/lib/adle/loaders/composer-facts-loader";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  projectReadiness,
  type Facets,
  type RouteFact,
} from "./readiness-projection";
import { distinctOccurrences, distinctUsersWaiting, groupIsArchived, groupMatchesView, matchesProjectedUnresolvedView, type ReadinessView } from "./readiness-groups";

export type { ReadinessView } from "./readiness-groups";
export type ReadinessRow = {
  key: string;
  word: string;
  microSkillKey: string;
  routeId: string;
  routeVersion: string;
  occurrences: number;
  usersWaiting: number;
  waitingCandidates: number;
  archived: boolean;
  facets: Facets;
  lastEvaluatedAt: string | null;
  lastSeenAt: string | null;
  history: Array<{ id: string; type: string; at: string }>;
};

type Demand = {
  id: string;
  normalized_target_token: string;
  micro_skill_key: string;
  route_id: string;
  route_version: string;
  lifecycle_status: string;
  archived_at: string | null;
  last_seen_at: string;
};
type Candidate = {
  id: string;
  child_id: string;
  source_candidate_mapping_id: string;
  normalized_target_token: string;
  micro_skill_key: string;
  candidate_state: string;
  last_evaluated_at: string | null;
  canonical_word_id: string | null;
};
type Link = { candidate_id: string; demand_id: string; link_status: string };
type Group = { key: string; word: string; skill: string; demands: Demand[]; candidates: Candidate[]; waiting: Candidate[]; archived: boolean };

const PAGE_SIZE = 25;
const BLOCKED = new Set(["pending_mapping", "pending_content", "error_retryable"]);
const key = (word: string, skill: string) => `${word}\u0000${skill}`;

async function readAll(db: any, table: string, columns: string): Promise<any[]> {
  const rows: any[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from(table).select(columns).order("id").range(start, start + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

function latest(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

export async function loadReadinessRows(params: {
  view: ReadinessView;
  search: string;
  page: number;
}): Promise<{ rows: ReadinessRow[]; total: number }> {
  const db = createServiceRoleClient() as any;
  const [demands, candidates, links] = await Promise.all([
    readAll(db, "adle_canonical_intake_demands", "id,normalized_target_token,micro_skill_key,route_id,route_version,lifecycle_status,archived_at,last_seen_at"),
    readAll(db, "adle_canonical_intake_candidates", "id,child_id,source_candidate_mapping_id,normalized_target_token,micro_skill_key,candidate_state,last_evaluated_at,canonical_word_id"),
    readAll(db, "adle_canonical_intake_candidate_demands", "id,candidate_id,demand_id,link_status"),
  ]) as [Demand[], Candidate[], Link[]];
  const groups = new Map<string, Group>();
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const demandById = new Map(demands.map((demand) => [demand.id, demand]));
  for (const demand of demands) {
    const groupKey = key(demand.normalized_target_token, demand.micro_skill_key);
    let group = groups.get(groupKey);
    if (!group) {
      group = { key: groupKey, word: demand.normalized_target_token, skill: demand.micro_skill_key,
        demands: [], candidates: [], waiting: [], archived: false };
      groups.set(groupKey, group);
    }
    group.demands.push(demand);
  }
  for (const candidate of candidates) {
    const group = groups.get(key(candidate.normalized_target_token, candidate.micro_skill_key));
    if (group) group.candidates.push(candidate);
  }
  for (const link of links) {
    if (link.link_status !== "waiting") continue;
    const demand = demandById.get(link.demand_id);
    const candidate = candidateById.get(link.candidate_id);
    if (!demand || !candidate || !BLOCKED.has(candidate.candidate_state)) continue;
    const group = groups.get(key(demand.normalized_target_token, demand.micro_skill_key));
    if (group && !group.waiting.some((row) => row.id === candidate.id)) group.waiting.push(candidate);
  }
  for (const group of groups.values()) {
    group.archived = groupIsArchived(group.demands);
  }
  const allGroups = [...groups.values()];
  const search = params.search.trim().toLowerCase();
  const filtered = allGroups.filter((group) => groupMatchesView(group, params.view) &&
    (!search || group.word.includes(search) || group.skill.toLowerCase().includes(search)))
    .sort((a, b) => {
      const byWaiting = distinctUsersWaiting(b.waiting) - distinctUsersWaiting(a.waiting);
      return byWaiting || (latest(b.demands.map((d) => d.last_seen_at)) ?? "").localeCompare(latest(a.demands.map((d) => d.last_seen_at)) ?? "") || a.word.localeCompare(b.word);
    });
  // Current blockers must be decided from today's facts, not from a stored
  // demand state. Evaluate the complete matching set before paging it.
  const pageGroups = params.view === "current" || params.view === "other"
    ? filtered
    : filtered.slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE);
  if (!pageGroups.length) return { rows: [], total: filtered.length };

  const targets = [...new Set(pageGroups.map((group) => group.word))];
  const skillKeys = [...new Set(pageGroups.map((group) => group.skill))];
  const sourceIds = [...new Set(pageGroups.flatMap((group) => group.candidates.map((candidate) => candidate.source_candidate_mapping_id)))];
  const demandIds = pageGroups.flatMap((group) => group.demands.map((demand) => demand.id));
  const [wordResult, skillResult, sourceResult, contentResult, supportResult, eventResult] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,normalised_word,row_status,review_status,age_band,frequency_band").in("normalised_word", targets),
    db.from("micro_skill_catalog").select("micro_skill_key,mastery_domain_key,skill_cluster_key,is_active,is_assignable").in("micro_skill_key", skillKeys),
    sourceIds.length ? db.from("parent_verified_spelling_candidate_mappings").select("id,child_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key").in("id", sourceIds) : Promise.resolve({ data: [], error: null }),
    db.from("canonical_teaching_dictionary_content_versions").select("micro_skill_key,version_status,is_active,final_readiness_review_status,child_friendly_explanation,rule_explanation").in("micro_skill_key", skillKeys),
    db.from("canonical_teaching_dictionary_word_support").select("canonical_word_id,micro_skill_key,support_role,row_status,review_status").in("micro_skill_key", skillKeys),
    db.from("adle_canonical_intake_events").select("id,demand_id,event_type,created_at").in("demand_id", demandIds).order("created_at", { ascending: false }).limit(1000),
  ]);
  for (const result of [wordResult, skillResult, sourceResult, contentResult, supportResult, eventResult])
    if (result.error) throw new Error(`Readiness facts: ${result.error.message}`);
  const sources = sourceResult.data ?? [];
  const misspellings = [...new Set(sources.map((source: any) => source.misspelling_normalized))];
  const mappingResult = misspellings.length
    ? await db.from("spelling_canonical_mappings")
      .select("id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status")
      .in("misspelling_normalized", misspellings)
    : { data: [], error: null };
  if (mappingResult.error) throw new Error(`Canonical mappings: ${mappingResult.error.message}`);
  const mappingIds = (mappingResult.data ?? []).map((mapping: any) => mapping.id);
  const visibilityResult = mappingIds.length
    ? await db.from("spelling_canonical_mapping_events").select("mapping_id")
      .in("mapping_id", mappingIds).eq("event_type", "resolver_visibility_enabled")
      .eq("new_resolver_visibility_status", "visible")
    : { data: [], error: null };
  if (visibilityResult.error) throw new Error(`Resolver visibility: ${visibilityResult.error.message}`);
  const visibleIds = new Set((visibilityResult.data ?? []).map((row: any) => row.mapping_id));
  const childIds = [...new Set(pageGroups.flatMap((group) =>
    (group.waiting.length ? group.waiting : group.candidates.slice(0, 1)).map((candidate) => candidate.child_id)))];
  const routeFactsByChild = new Map(await Promise.all(childIds.map(async (childId) =>
    [childId, await routeActivationFacts(db, childId)] as const)));

  const rows: ReadinessRow[] = pageGroups.map((group) => {
    const skill = (skillResult.data ?? []).find((row: any) => row.micro_skill_key === group.skill);
    const route = resolveCanonicalIntakeRoute(group.skill, skill?.skill_cluster_key ?? null);
    const wordRows = (wordResult.data ?? []).filter((word: any) => word.normalised_word === group.word);
    const relevantChildren = [...new Set((group.waiting.length ? group.waiting : group.candidates.slice(0, 1)).map((candidate) => candidate.child_id))];
    const closureWordId = relevantChildren.map((childId) => routeFactsByChild.get(childId)?.baseWordClosureWords.find((word) =>
      word.normalisedWord === group.word && word.microSkillKey === group.skill)?.canonicalWordId).find(Boolean);
    const canonicalWordId = wordRows.find((word: any) => word.row_status === "active" && word.review_status === "approved_for_first_exposure")?.id ??
      group.candidates.find((candidate) => candidate.canonical_word_id)?.canonical_word_id ?? closureWordId ?? null;
    const exactPair = canonicalWordId ? canonicalWordSkillPair(canonicalWordId, group.skill) : null;
    const routeFacts: RouteFact[] = relevantChildren.map((childId) => {
      const facts = routeFactsByChild.get(childId);
      const exact = facts?.routeReadiness.find((fact) => fact.canonicalWordId === canonicalWordId && fact.microSkillKey === group.skill);
      return { childId, enabled: facts?.enabled.has(group.skill) ?? false,
        readyPair: exactPair ? (facts?.readyPairs.has(exactPair) ?? false) : false,
        exactReady: exact?.ready ?? null,
        blockerCodes: exact?.blockers ? [...exact.blockers] : [],
        hasSelector: (facts?.selectorProfiles ?? []).some((profile: any) => profile.micro_skill_key === group.skill &&
          profile.row_status === "active" && profile.review_status === "approved_for_first_exposure" &&
          (!wordRows[0]?.age_band || profile.allowed_age_bands?.includes(wordRows[0].age_band))),
      };
    });
    const teachingRow = (contentResult.data ?? []).find((content: any) => content.micro_skill_key === group.skill && content.is_active);
    const facets = projectReadiness({
      target: group.word, microSkillKey: group.skill, routeId: route.routeId,
      candidates: sources.filter((source: any) => source.correct_spelling_normalized === group.word && source.micro_skill_key === group.skill &&
        (!group.waiting.length || group.waiting.some((candidate) => candidate.source_candidate_mapping_id === source.id)))
        .map((source: any) => ({ childId: source.child_id, misspelling: source.misspelling_normalized,
          target: source.correct_spelling_normalized, microSkillKey: source.micro_skill_key })),
      mappings: (mappingResult.data ?? []).map((mapping: any) => ({
        misspelling: mapping.misspelling_normalized, target: mapping.correct_spelling_normalized,
        microSkillKey: mapping.micro_skill_key, status: mapping.mapping_status,
        visibility: mapping.resolver_visibility_status, hasEnableEvent: visibleIds.has(mapping.id),
      })),
      words: wordRows.map((word: any) => ({ id: word.id, target: word.normalised_word,
        rowStatus: word.row_status, reviewStatus: word.review_status,
        ageBand: word.age_band, frequencyBand: word.frequency_band })),
      routeFacts,
      teaching: teachingRow ? { active: teachingRow.version_status === "active" && teachingRow.is_active,
        signedOff: teachingRow.final_readiness_review_status === "signed_off",
        childExplanation: teachingRow.child_friendly_explanation, ruleExplanation: teachingRow.rule_explanation } : null,
      skill: skill ? { active: skill.is_active, assignable: skill.is_assignable, domain: skill.mastery_domain_key } : null,
      hasApprovedSupport: (supportResult.data ?? []).some((support: any) => support.canonical_word_id === canonicalWordId &&
        support.micro_skill_key === group.skill && support.row_status === "active" &&
        support.review_status === "approved_for_first_exposure" &&
        ["support_example", "review_example"].includes(support.support_role)),
      allowedAgeBands: ADLE_PILOT_CHILD_BAND.allowedAgeBands,
      allowedFrequencyBands: ADLE_PILOT_CHILD_BAND.allowedFrequencyBands,
    });
    const history = (eventResult.data ?? []).filter((event: any) => group.demands.some((demand) => demand.id === event.demand_id))
      .slice(0, 12).map((event: any) => ({ id: event.id, type: event.event_type, at: event.created_at }));
    return { key: group.key, word: group.word, microSkillKey: group.skill,
      routeId: route.routeId, routeVersion: route.routeVersion,
      occurrences: distinctOccurrences(group.candidates),
      usersWaiting: distinctUsersWaiting(group.waiting),
      waitingCandidates: group.waiting.length, archived: group.archived, facets,
      lastEvaluatedAt: latest(group.candidates.map((candidate) => candidate.last_evaluated_at)),
      lastSeenAt: latest(group.demands.map((demand) => demand.last_seen_at)), history };
  });
  if (params.view === "current") {
    const blockedRows = rows.filter((row) => matchesProjectedUnresolvedView({ waitingCandidates: row.waitingCandidates,
      states: Object.values(row.facets).map((facet) => facet.state) }, "current"));
    return { rows: blockedRows.slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE),
      total: blockedRows.length };
  }
  if (params.view === "other") {
    const otherRows = rows.filter((row) => matchesProjectedUnresolvedView({ waitingCandidates: row.waitingCandidates,
      states: Object.values(row.facets).map((facet) => facet.state) }, "other"));
    return { rows: otherRows.slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE),
      total: otherRows.length };
  }
  return { rows, total: filtered.length };
}
