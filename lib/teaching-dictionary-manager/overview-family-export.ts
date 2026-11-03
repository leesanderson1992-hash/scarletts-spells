import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { teachingDictionaryExportRows } from "./bulk-export";
import { projectOverviewCsvRows, type OverviewFamilySelection } from "./overview-csv";

type Membership = { canonical_word_id: string; family_key: string; revision: number };
type Family = { family_key: string; revision: number; base_kind: string; base_lemma: string;
  base_meaning: string; base_part_of_speech: string; review_status: string };
type Root = { family_key: string; revision: number; root_definition: string | null;
  origin_language: string | null; pronunciation_applicability: string | null; pronunciation_ipa: string | null };

/** Exports only current reviewed lexical memberships; ambiguous history is marked for review. */
export async function teachingDictionaryOverviewExportRows(): Promise<Record<string, unknown>[]> {
  const exported = await teachingDictionaryExportRows();
  const ids = [...new Set(exported.map((row) => String(row.canonical_word_id ?? "")).filter(Boolean))];
  const db = createServiceRoleClient();
  const members: Membership[] = [];
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
    members.push(...lexical.data as Membership[]);
    for (const row of [...(legacy.data ?? []), ...(registry.data ?? [])]) historical.add(row.canonical_word_id);
  }
  const keys = [...new Set(members.map((member) => member.family_key))];
  const latest = new Map<string, Family>();
  const roots = new Map<string, Root>();
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
    for (const family of families.data as Family[]) if (!latest.has(family.family_key))
      latest.set(family.family_key, family);
    for (const root of rootMetadata.data as Root[]) roots.set(`${root.family_key}:${root.revision}`, root);
  }
  const byWord = new Map<string, OverviewFamilySelection>();
  for (const id of ids) {
    const current = members.filter((member) => {
      const family = latest.get(member.family_key);
      return family?.revision === member.revision && family.review_status === "approved";
    });
    const unique = [...new Set(current.map((member) => member.family_key))];
    if (unique.length > 1) {
      byWord.set(id, { kind: "free_base", familyKey: "", basePartOfSpeech: "",
        reviewIssue: "Multiple current families: select one in Overview" });
      continue;
    }
    if (!unique.length) {
      if (historical.has(id)) byWord.set(id, { kind: "free_base", familyKey: "", basePartOfSpeech: "",
        reviewIssue: "Historical family link: select an approved family in Overview" });
      continue;
    }
    const family = latest.get(unique[0]!)!;
    const kind = family.base_kind;
    if (kind !== "free_base" && kind !== "bound_root") {
      byWord.set(id, { kind: "free_base", familyKey: "", basePartOfSpeech: "",
        reviewIssue: "Unrecognised family kind: review in Overview" });
      continue;
    }
    const root = roots.get(`${family.family_key}:${family.revision}`);
    byWord.set(id, { kind, familyKey: family.family_key, revision: family.revision,
      basePartOfSpeech: family.base_part_of_speech, baseLemma: family.base_lemma,
      baseMeaning: family.base_meaning,
      ...(kind === "bound_root" ? {
        rootDefinition: root?.root_definition ?? "",
        rootOriginLanguage: root?.origin_language ?? "",
        rootPronunciationApplicability: root?.pronunciation_applicability ?? "",
        rootPronunciationIpa: root?.pronunciation_ipa ?? "",
        ...(!root ? { reviewIssue: "Bound-root metadata is missing: review in Overview" } : {}),
      } : {}),
    });
  }
  return projectOverviewCsvRows(exported, byWord);
}
