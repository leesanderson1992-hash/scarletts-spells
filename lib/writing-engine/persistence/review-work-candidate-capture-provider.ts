import type { createClient } from "../../supabase/server";
import type { WritingEngineMicroSkillCatalogEntry } from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ReviewWorkCandidateCaptureCatalogRow = {
  micro_skill_key: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  practice_route: WritingEngineMicroSkillCatalogEntry["practiceRoute"];
  display_name: string;
  is_assignable: boolean;
  is_active: boolean;
};

type ReviewWorkCandidateCaptureFamilyRow = {
  skill_family_key: string;
  display_name: string;
};

type ReviewWorkCandidateCaptureClusterRow = {
  skill_cluster_key: string;
  display_name: string;
};

export type ReviewWorkCandidateCaptureMicroSkillOption = {
  microSkillKey: string;
  displayName: string;
  skillFamilyKey: string;
  skillFamilyDisplayName: string;
  skillClusterKey: string | null;
  skillClusterDisplayName: string | null;
};

export type ReviewWorkCandidateCaptureMicroSkillProviderResult =
  | {
      status: "available";
      options: ReviewWorkCandidateCaptureMicroSkillOption[];
    }
  | {
      status: "blocked";
      reason: "no_options_available";
    };

export async function getReviewWorkCandidateCaptureMicroSkillProvider(input: {
  supabase: SupabaseServerClient;
}) {
  const { data: rows } = await input.supabase
    .from("micro_skill_catalog")
    .select(
      [
        "micro_skill_key",
        "mastery_domain_key",
        "skill_family_key",
        "skill_cluster_key",
        "display_name",
        "is_assignable",
        "is_active",
      ].join(", "),
    )
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true)
    .order("display_name", { ascending: true });

  const catalogRows = ((rows ?? []) as unknown) as ReviewWorkCandidateCaptureCatalogRow[];
  const familyKeys = Array.from(
    new Set(catalogRows.map((row) => row.skill_family_key).filter(Boolean)),
  );
  const clusterKeys = Array.from(
    new Set(
      catalogRows
        .map((row) => row.skill_cluster_key)
        .filter((key): key is string => typeof key === "string" && key.length > 0),
    ),
  );

  const [{ data: familyRows }, { data: clusterRows }] = await Promise.all([
    familyKeys.length > 0
      ? input.supabase
          .from("micro_skill_families")
          .select("skill_family_key, display_name")
          .in("skill_family_key", familyKeys)
      : Promise.resolve({ data: [] }),
    clusterKeys.length > 0
      ? input.supabase
          .from("micro_skill_clusters")
          .select("skill_cluster_key, display_name")
          .in("skill_cluster_key", clusterKeys)
      : Promise.resolve({ data: [] }),
  ]);

  const familyDisplayNamesByKey = new Map(
    (((familyRows ?? []) as unknown) as ReviewWorkCandidateCaptureFamilyRow[]).map(
      (row) => [row.skill_family_key, row.display_name],
    ),
  );
  const clusterDisplayNamesByKey = new Map(
    (((clusterRows ?? []) as unknown) as ReviewWorkCandidateCaptureClusterRow[]).map(
      (row) => [row.skill_cluster_key, row.display_name],
    ),
  );

  const options = catalogRows
    .map((row) => ({
      microSkillKey: row.micro_skill_key,
      displayName: row.display_name,
      skillFamilyKey: row.skill_family_key,
      skillFamilyDisplayName:
        familyDisplayNamesByKey.get(row.skill_family_key) ?? row.skill_family_key,
      skillClusterKey: row.skill_cluster_key,
      skillClusterDisplayName: row.skill_cluster_key
        ? clusterDisplayNamesByKey.get(row.skill_cluster_key) ?? row.skill_cluster_key
        : null,
    }));

  if (options.length === 0) {
    return {
      status: "blocked",
      reason: "no_options_available",
    } satisfies ReviewWorkCandidateCaptureMicroSkillProviderResult;
  }

  return {
    status: "available",
    options,
  } satisfies ReviewWorkCandidateCaptureMicroSkillProviderResult;
}

export async function getReviewWorkCandidateCaptureMicroSkillCatalogEntry(input: {
  supabase: SupabaseServerClient;
  microSkillKey: string;
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
      ].join(", "),
    )
    .eq("micro_skill_key", input.microSkillKey)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const row = data as unknown as ReviewWorkCandidateCaptureCatalogRow;

  return {
    microSkillKey: row.micro_skill_key,
    masteryDomainKey: row.mastery_domain_key,
    skillFamilyKey: row.skill_family_key,
    skillClusterKey: row.skill_cluster_key,
    practiceRoute: row.practice_route,
    isAssignable: row.is_assignable,
    isActive: row.is_active,
  } satisfies WritingEngineMicroSkillCatalogEntry;
}
