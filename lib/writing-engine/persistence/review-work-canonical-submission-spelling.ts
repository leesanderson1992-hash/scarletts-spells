import { createClient } from "@/lib/supabase/server";
import type { WritingEngineStage1d1CatalogEntry } from "@/lib/writing-engine/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type CanonicalSubmissionSpellingCatalogRow = {
  micro_skill_key: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  practice_route: WritingEngineStage1d1CatalogEntry["practiceRoute"];
  is_assignable: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
};

export async function getCanonicalSubmissionSpellingCatalogEntries(input: {
  supabase: SupabaseServerClient;
}) {
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
        "metadata",
      ].join(", "),
    );

  return (((data ?? []) as unknown) as CanonicalSubmissionSpellingCatalogRow[]).map(
    (row) => ({
      microSkillKey: row.micro_skill_key,
      masteryDomainKey: row.mastery_domain_key,
      skillFamilyKey: row.skill_family_key,
      skillClusterKey: row.skill_cluster_key,
      practiceRoute: row.practice_route,
      isAssignable: row.is_assignable,
      isActive: row.is_active,
      metadata: row.metadata ?? {},
    }),
  ) satisfies Array<
    Pick<
      WritingEngineStage1d1CatalogEntry,
      | "microSkillKey"
      | "masteryDomainKey"
      | "skillFamilyKey"
      | "skillClusterKey"
      | "practiceRoute"
      | "isAssignable"
      | "isActive"
      | "metadata"
    >
  >;
}
