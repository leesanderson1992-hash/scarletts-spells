import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase schema facts precede generated types */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLearnerEvidenceProjection } from "./evidence/repository";
import { loadCanonicalWordSkillRelationshipAuthority } from "../word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "../../writing-engine/whole-writing/knowledge-repository";
import { ADLE_PILOT_CHILD_BAND } from "../loaders/composer-facts-loader";
import { calculateShadowProficiency, requiredAgeBands, validCalculationDate, type ShadowWord, type ShadowSkillResult } from "./shadow-v1";

const PAGE_SIZE = 500;
async function all<T>(client: SupabaseClient, table: string, columns: string, key = "id"): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = client.from(table).select(columns).order(key, { ascending: true }).limit(PAGE_SIZE);
    if (after) query = query.gt(key, after);
    const result = await query;
    if (result.error) throw new Error(`shadow proficiency ${table}: ${result.error.message}`);
    const rows = (result.data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
    after = String((rows.at(-1) as Record<string, unknown>)[key] ?? "");
    if (!after) throw new Error(`shadow proficiency ${table}: paging key missing`);
  }
}

export interface ScarlettShadowReport {
  childId: string;
  asOf: string;
  results: ShadowSkillResult[];
  source: { admittedEvents: number; blocked: number; ambiguous: number; wholeWritingShadowProjections: number };
  relationshipFingerprint: string;
  projectionFingerprint: string;
  wordAuthorityFingerprint: string;
  groupAuthorityFingerprint: string;
  complexityVersion: string;
  warnings: string[];
  blockedTeachingNeeds: { skillKey: string; word: string; ageBand: string | null; frequencyBand: string | null; sourceKind: string }[];
  activeNeedCount: number;
  requiredAgeBands: readonly string[] | null;
  wordDetails: Record<string, { word: string; ageBand: string | null; frequencyBand: string | null }>;
}

/** Exact name is a discovery check only; the returned UUID scopes every learner query. */
export async function resolveScarlettChild(client: SupabaseClient) {
  const result = await client.from("children").select("id,date_of_birth,is_archived")
    .ilike("first_name", "Scarlett").ilike("last_name", "Sanderson").limit(2);
  if (result.error) throw new Error("Scarlett learner identity unavailable");
  if (result.data?.length !== 1 || result.data[0].is_archived) throw new Error("Scarlett learner identity is not unique and active");
  return result.data[0];
}

export async function loadScarlettShadowReport(client: SupabaseClient, asOf: string): Promise<ScarlettShadowReport> {
  if (!validCalculationDate(asOf)) {
    throw new Error("Invalid shadow calculation date");
  }
  const child = await resolveScarlettChild(client);
  const [published, wordRows, bandRows, overrideRows, versions, catalog, mapRows, groupRows, needResult, wholeWritingCount] = await Promise.all([
    loadPublishedWritingAssociations(client, "production"),
    all<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,display_word,row_status,review_status,frequency_band,age_band"),
    all<any>(client, "canonical_teaching_dictionary_word_banding", "id,canonical_word_id,banding_version,structural_score,complexity_level,row_status"),
    all<any>(client, "canonical_teaching_dictionary_banding_overrides", "id,canonical_word_id,override_level,row_status"),
    all<any>(client, "canonical_teaching_dictionary_banding_versions", "banding_version,is_active,level_count", "banding_version"),
    all<any>(client, "micro_skill_catalog", "micro_skill_key,display_name,skill_family_key,is_active", "micro_skill_key"),
    all<any>(client, "canonical_spelling_word_map_words", "id,micro_skill_key,normalised_word,diversity_group_key,row_status,review_status"),
    all<any>(client, "canonical_spelling_word_map_diversity_groups", "id,micro_skill_key,diversity_group_key,row_status,review_status"),
    client.from("adle_learning_items").select("canonical_word_id,micro_skill_key,item_status,row_status,source_kind")
      .eq("child_id", child.id).eq("row_status", "active"),
    client.from("writing_shadow_skill_evidence_projections").select("id", { count: "exact", head: true }).eq("learner_id", child.id),
  ]);
  if (needResult.error) throw new Error("Scarlett learning needs unavailable");
  if (wholeWritingCount.error) throw new Error("Whole-writing shadow authority unavailable");
  const activeVersion = versions.filter((row) => row.is_active);
  if (activeVersion.length !== 1) throw new Error("Active complexity version unresolved");
  const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const wordAuthorityFingerprint = fingerprint({ words: wordRows, banding: bandRows, overrides: overrideRows, activeVersion: activeVersion[0] });
  const groupAuthorityFingerprint = fingerprint({ words: mapRows, groups: groupRows });
  const authority = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: "production", explicitReviewedAssociations: published });
  const evidence = await loadLearnerEvidenceProjection({ client, relationshipAuthority: authority, learnerId: child.id });
  const currentBand = new Map(bandRows.filter((row) => row.row_status === "active" && row.banding_version === activeVersion[0].banding_version).map((row) => [row.canonical_word_id, row]));
  const overrides = new Map(overrideRows.filter((row) => row.row_status === "active").map((row) => [row.canonical_word_id, row]));
  const groups = new Map<string, string[]>();
  const approvedGroups = new Set(groupRows.filter((row) => row.row_status === "active" &&
    ["source_verified", "manual_verified"].includes(row.review_status))
    .map((row) => `${row.micro_skill_key}:${row.diversity_group_key}`));
  for (const row of mapRows) {
    if (row.row_status !== "active" || !["source_verified", "manual_verified"].includes(row.review_status) ||
      !row.diversity_group_key || !approvedGroups.has(`${row.micro_skill_key}:${row.diversity_group_key}`)) continue;
    const key = `${row.micro_skill_key}:${row.normalised_word}`;
    groups.set(key, [...new Set([...(groups.get(key) ?? []), row.diversity_group_key])]);
  }
  const words: ShadowWord[] = wordRows.map((row) => {
    const band = currentBand.get(row.id);
    const override = overrides.get(row.id);
    return { id: row.id, active: row.row_status === "active", reviewEligible: ["approved_for_guided_review", "approved_for_first_exposure"].includes(row.review_status),
      frequencyBand: row.frequency_band, ageBand: row.age_band,
      complexityLevel: Number.isInteger(override?.override_level) && override.override_level >= 1 && override.override_level <= activeVersion[0].level_count
        ? override.override_level : band?.complexity_level ?? null,
      structuralScore: band?.structural_score ?? null,
      groupIds: null };
  });
  const wordById = new Map(wordRows.map((row) => [row.id, row]));
  const allowedAgeBands = requiredAgeBands(child.date_of_birth, asOf);
  const blockedTeachingNeeds = (needResult.data ?? []).filter((need) => {
    if (need.item_status === "resolved") return false;
    const word = wordById.get(need.canonical_word_id);
    return !!word && (!ADLE_PILOT_CHILD_BAND.allowedFrequencyBands.includes(word.frequency_band ?? "") ||
      !ADLE_PILOT_CHILD_BAND.allowedAgeBands.includes(word.age_band ?? ""));
  }).map((need) => {
    const word = wordById.get(need.canonical_word_id)!;
    return { skillKey: need.micro_skill_key, word: word.display_word, sourceKind: need.source_kind,
      ageBand: word.age_band as string | null, frequencyBand: word.frequency_band as string | null };
  });
  const baseWords = new Map(words.map((word) => [word.id, word]));
  const resultWords = new Map<string, ShadowWord>();
  for (const relation of authority.relationships) {
    const base = baseWords.get(relation.canonicalWordId);
    const raw = wordById.get(relation.canonicalWordId);
    if (!base || !raw) continue;
    resultWords.set(`${relation.microSkillKey}:${base.id}`, { ...base,
      groupIds: groups.get(`${relation.microSkillKey}:${raw.normalised_word}`) ?? null });
  }
  // The calculator receives per-skill metadata; a word may have different
  // governed groups for different skills. Use one scoped calculation per skill.
  const catalogByKey = new Map(catalog.filter((row) => row.is_active).map((row) => [row.micro_skill_key, row]));
  const skillKeys = [...catalogByKey.keys()].sort();
  const warnings = ["S9 whole-writing qualification is not available in this read model; authentic and recurrence claims require reconciliation."];
  if (!allowedAgeBands) warnings.push("Scarlett's age-based requirement pool is unresolved.");
  if (groups.size === 0) warnings.push("No reviewed word-map representative groups are available; group gates remain unresolved.");
  const results = skillKeys.flatMap((key) => {
    const row = catalogByKey.get(key)!;
    const relations = authority.relationships.filter((entry) => entry.microSkillKey === key);
    return calculateShadowProficiency({ learnerId: child.id, dateOfBirth: child.date_of_birth, asOf,
      words: relations.map((relation) => resultWords.get(`${key}:${relation.canonicalWordId}`)).filter((word): word is ShadowWord => !!word),
      relationships: relations.map((relation) => ({ wordId: relation.canonicalWordId, skillKey: key, authorityFingerprint: relation.authorityFingerprint })),
      skills: [{ key, label: row.display_name, profile: row.skill_family_key === "D4_HOM" ? "CONTEXT_DEPENDENT_CLOSED_SET_V1" : "PRODUCTIVE_PATTERN_DEFAULT" }],
      projections: evidence.projections.filter((entry) => entry.microSkillKey === key),
      evidenceAuthorityComplete: false, recurrenceAuthorityComplete: false, resolvedNegativeEventIds: [] });
  });
  return { childId: child.id, asOf, results, relationshipFingerprint: authority.reconciliation.sourceFingerprint,
    projectionFingerprint: evidence.reconciliation.projectionFingerprint, wordAuthorityFingerprint,
    groupAuthorityFingerprint, complexityVersion: activeVersion[0].banding_version,
    source: { admittedEvents: evidence.reconciliation.admittedSourceEventCount, blocked: evidence.reconciliation.blockedCount,
      ambiguous: evidence.reconciliation.ambiguousCount, wholeWritingShadowProjections: wholeWritingCount.count ?? 0 }, warnings,
    blockedTeachingNeeds, activeNeedCount: (needResult.data ?? []).filter((need) => need.item_status !== "resolved").length,
    requiredAgeBands: allowedAgeBands,
    wordDetails: Object.fromEntries(wordRows.map((word) => [word.id, { word: word.display_word, ageBand: word.age_band, frequencyBand: word.frequency_band }])) };
}
