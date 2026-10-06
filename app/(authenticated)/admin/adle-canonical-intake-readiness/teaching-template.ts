import "server-only";

import { strToU8, zipSync } from "fflate";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { allUnresolvedReadinessRows } from "./export-data";

export const TEACHING_TEMPLATE_VERSION = 1;
export const TEACHING_TEMPLATE_FILES = {
  adle_word_level: "standard-adle.json",
  dynamic_prefix_word_lab: "prefix-lessons.json",
  dynamic_affix_word_lab: "suffix-lessons.json",
  base_word_lab: "base-word-lessons.json",
  compound_word_lab: "compound-word-lessons.json",
} as const;

type RouteId = keyof typeof TEACHING_TEMPLATE_FILES;
type TemplateItem = {
  routeId: RouteId;
  routeVersion: string;
  microSkillKey: string;
  affectedWords: string[];
  state: "missing" | "unknown";
  missingFacts: string[];
  expected: { contentVersionId?: string | null; contentVersion?: string | null;
    profileId?: string | null; sourceRowHash?: string | null; authorityId?: string | null;
    semanticFingerprint?: string | null };
  content: Record<string, unknown>;
};

function skillOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const skill = object.microSkillKey ?? object.micro_skill_key;
  return typeof skill === "string" ? skill : null;
}

export async function buildTeachingTemplate(): Promise<Uint8Array> {
  const readiness = (await allUnresolvedReadinessRows()).filter((row) => row.facets.teaching.state !== "complete");
  const skills = [...new Set(readiness.map((row) => row.microSkillKey))];
  const db = createServiceRoleClient();
  const [contents, prefixes, suffixes, authorities] = await Promise.all([
    skills.length ? db.from("canonical_teaching_dictionary_content_versions")
      .select("id,micro_skill_key,content_version,source_row_hash,version_status,is_active,teaching_objective,child_friendly_explanation,rule_explanation,memory_tip,common_misconceptions,first_exposure_progression,guided_practice_progression,review_proofreading_progression,example_selection_guidance,contrast_policy_guidance,reflection_prompt_key,reflection_prompt_text,sample_preview_word_key,source_category,source_name,source_url,source_licence,source_use_note,confidence")
      .in("micro_skill_key", skills) : Promise.resolve({ data: [], error: null }),
    skills.length ? db.from("canonical_teaching_dictionary_prefix_profiles")
      .select("id,micro_skill_key,source_row_hash,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status")
      .in("micro_skill_key", skills) : Promise.resolve({ data: [], error: null }),
    skills.length ? db.from("canonical_teaching_dictionary_suffix_profiles")
      .select("id,micro_skill_key,source_row_hash,suffix_label,suffix_text,suffix_meaning,meaning_bins,suffix_choices,intro_content,include_meaning_sort,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status")
      .in("micro_skill_key", skills) : Promise.resolve({ data: [], error: null }),
    db.from("adle_curriculum_dependency_authorities")
      .select("id,authority_type,authority_manifest,semantic_fingerprint,semantic_projection")
      .eq("authority_type", "teaching_content"),
  ]);
  for (const result of [contents, prefixes, suffixes, authorities]) if (result.error) throw new Error(result.error.message);
  const grouped = new Map<string, typeof readiness>();
  for (const row of readiness) {
    const key = `${row.routeId}\u0000${row.microSkillKey}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const files: Record<RouteId, TemplateItem[]> = {
    adle_word_level: [], dynamic_prefix_word_lab: [], dynamic_affix_word_lab: [],
    base_word_lab: [], compound_word_lab: [],
  };
  for (const rows of grouped.values()) {
    const first = rows[0];
    const routeId = first.routeId as RouteId;
    if (!(routeId in files)) continue;
    const content = (contents.data ?? []).find((row) => row.micro_skill_key === first.microSkillKey && row.is_active) ??
      (contents.data ?? []).find((row) => row.micro_skill_key === first.microSkillKey);
    const profile = routeId === "dynamic_prefix_word_lab"
      ? (prefixes.data ?? []).find((row) => row.micro_skill_key === first.microSkillKey && row.row_status === "active")
      : routeId === "dynamic_affix_word_lab"
        ? (suffixes.data ?? []).find((row) => row.micro_skill_key === first.microSkillKey && row.row_status === "active") : null;
    const authority = (authorities.data ?? []).find((row) =>
      skillOf(row.authority_manifest) === first.microSkillKey || skillOf(row.semantic_projection) === first.microSkillKey);
    const contentFields = Object.fromEntries(Object.entries(content ?? {}).filter(([field]) =>
      !["id", "micro_skill_key", "content_version", "source_row_hash", "is_active", "version_status"].includes(field)));
    const profileFields = Object.fromEntries(Object.entries(profile ?? {}).filter(([field]) =>
      !["id", "micro_skill_key", "source_row_hash", "production_enabled", "row_status", "review_status"].includes(field)));
    files[routeId].push({ routeId, routeVersion: first.routeVersion, microSkillKey: first.microSkillKey,
      affectedWords: [...new Set(rows.map((row) => row.word))].sort(),
      state: rows.some((row) => row.facets.teaching.state === "missing") ? "missing" : "unknown",
      missingFacts: [...new Set(rows.flatMap((row) => row.facets.teaching.details))],
      expected: { contentVersionId: content?.id ?? null, contentVersion: content?.content_version ?? null,
        profileId: profile?.id ?? null, sourceRowHash: profile?.source_row_hash ?? content?.source_row_hash ?? null,
        authorityId: authority?.id ?? null, semanticFingerprint: authority?.semantic_fingerprint ?? null },
      content: routeId === "adle_word_level" ? contentFields :
        routeId === "dynamic_prefix_word_lab" || routeId === "dynamic_affix_word_lab" ? profileFields :
          authority?.authority_manifest && typeof authority.authority_manifest === "object"
            ? authority.authority_manifest as Record<string, unknown> : {},
    });
  }
  const entries: Record<string, Uint8Array> = {};
  const manifest = { schemaVersion: TEACHING_TEMPLATE_VERSION, generatedAt: new Date().toISOString(),
    purpose: "adle_teaching_content_preparation", importStatus: "not_supported",
    routes: Object.keys(TEACHING_TEMPLATE_FILES),
    note: "Preparation export only. No upload or approval path accepts this ZIP yet. Unknown facts require route evidence before approval.",
    counts: Object.fromEntries(Object.entries(files).map(([route, items]) => [route, items.length])) };
  entries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  for (const [route, filename] of Object.entries(TEACHING_TEMPLATE_FILES))
    entries[filename] = strToU8(JSON.stringify(files[route as RouteId], null, 2));
  return zipSync(entries, { level: 6 });
}
