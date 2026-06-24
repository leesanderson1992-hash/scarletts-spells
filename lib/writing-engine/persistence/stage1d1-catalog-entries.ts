import type { createClient } from "../../supabase/server";
import type {
  WritingEngineMicroSkillCatalogEntry,
  WritingEngineStage1d1CatalogEntry,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type MicroSkillCatalogLookupRow = {
  micro_skill_key: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  practice_route: WritingEngineMicroSkillCatalogEntry["practiceRoute"];
  is_assignable: boolean;
  is_active: boolean;
};

type Stage1d1CatalogRow = MicroSkillCatalogLookupRow & {
  display_name: string;
  allowed_template_keys: string[] | null;
  metadata: Record<string, unknown>;
};

export async function getStage1d1CatalogEntries(input: {
  supabase: SupabaseServerClient;
  microSkillKeys: string[];
}) {
  if (input.microSkillKeys.length === 0) {
    return [] as WritingEngineStage1d1CatalogEntry[];
  }

  const { data } = await input.supabase
    .from("micro_skill_catalog")
    .select(
      [
        "micro_skill_key",
        "mastery_domain_key",
        "skill_family_key",
        "skill_cluster_key",
        "practice_route",
        "is_assignable",
        "is_active",
        "display_name",
        "allowed_template_keys",
        "metadata",
      ].join(", "),
    )
    .in("micro_skill_key", input.microSkillKeys);

  return (((data ?? []) as unknown) as Stage1d1CatalogRow[]).map((row) => ({
    microSkillKey: row.micro_skill_key,
    masteryDomainKey: row.mastery_domain_key,
    skillFamilyKey: row.skill_family_key,
    skillClusterKey: row.skill_cluster_key,
    practiceRoute: row.practice_route,
    isAssignable: row.is_assignable,
    isActive: row.is_active,
    displayName: row.display_name,
    allowedTemplateKeys: row.allowed_template_keys ?? [],
    metadata: row.metadata ?? {},
  })) satisfies WritingEngineStage1d1CatalogEntry[];
}
