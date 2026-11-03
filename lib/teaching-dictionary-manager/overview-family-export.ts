import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { teachingDictionaryExportRows } from "./bulk-export";
import { projectOverviewCsvRows } from "./overview-csv";
import { selectOverviewFamilies, type OverviewFamily, type OverviewMembership, type OverviewRoot } from
  "./overview-family-selection";

/** Exports only current reviewed lexical memberships; ambiguous history is marked for review. */
export async function teachingDictionaryOverviewExportRows(): Promise<Record<string, unknown>[]> {
  const exported = await teachingDictionaryExportRows();
  const ids = [...new Set(exported.map((row) => String(row.canonical_word_id ?? "")).filter(Boolean))];
  const db = createServiceRoleClient();
  const members: OverviewMembership[] = [];
  const historical = new Set<string>();
  for (let start = 0; start < ids.length; start += 100) {
    const slice = ids.slice(start, start + 100);
    const [lexical, legacy, registry] = await Promise.all([
      db.from("canonical_teaching_dictionary_lexical_base_family_members")
        .select("canonical_word_id,family_key,revision").in("canonical_word_id", slice),
      db.from("canonical_teaching_dictionary_base_word_family_members")
        .select("canonical_word_id").in("canonical_word_id", slice).eq("row_status", "active"),
      db.from("canonical_teaching_dictionary_base_family_registry_members")
        .select("canonical_word_id").in("canonical_word_id", slice),
    ]);
    if (lexical.error || legacy.error || registry.error
      || [lexical, legacy, registry].some((result) => (result.data?.length ?? 0) >= 1000))
      throw new Error("TEACHING_OVERVIEW_FAMILY_EXPORT_READ_FAILED");
    members.push(...lexical.data as OverviewMembership[]);
    for (const row of [...(legacy.data ?? []), ...(registry.data ?? [])]) historical.add(row.canonical_word_id);
  }
  const keys = [...new Set(members.map((member) => member.family_key))];
  const latest = new Map<string, OverviewFamily>();
  const roots = new Map<string, OverviewRoot>();
  for (let start = 0; start < keys.length; start += 100) {
    const slice = keys.slice(start, start + 100);
    const [families, rootMetadata] = await Promise.all([
      db.from("canonical_teaching_dictionary_lexical_base_families")
        .select("family_key,revision,base_kind,base_lemma,base_meaning,base_part_of_speech,review_status")
        .in("family_key", slice).order("revision", { ascending: false }),
      db.from("canonical_teaching_dictionary_lexical_root_metadata")
        .select("family_key,revision,root_definition,origin_language,pronunciation_applicability,pronunciation_ipa")
        .in("family_key", slice),
    ]);
    if (families.error || rootMetadata.error
      || [families, rootMetadata].some((result) => (result.data?.length ?? 0) >= 1000))
      throw new Error("TEACHING_OVERVIEW_FAMILY_EXPORT_READ_FAILED");
    for (const family of families.data as OverviewFamily[]) if (!latest.has(family.family_key))
      latest.set(family.family_key, family);
    for (const root of rootMetadata.data as OverviewRoot[]) roots.set(`${root.family_key}:${root.revision}`, root);
  }
  const byWord = selectOverviewFamilies(ids, members, latest, roots, historical);
  return projectOverviewCsvRows(exported, byWord);
}
