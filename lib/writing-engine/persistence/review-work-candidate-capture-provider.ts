import { createClient } from "@/lib/supabase/server";
import type { WritingEngineMicroSkillCatalogEntry } from "@/lib/writing-engine/types";

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

export type ReviewWorkCandidateCaptureMicroSkillOption = {
  microSkillKey: string;
  displayName: string;
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
        "display_name",
        "is_assignable",
        "is_active",
      ].join(", "),
    )
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true)
    .order("display_name", { ascending: true });

  const options = (((rows ?? []) as unknown) as ReviewWorkCandidateCaptureCatalogRow[])
    .map((row) => ({
      microSkillKey: row.micro_skill_key,
      displayName: row.display_name,
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
