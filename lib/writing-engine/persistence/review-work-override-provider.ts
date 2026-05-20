import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ReviewWorkOverrideMicroSkillCatalogRow = {
  micro_skill_key: string;
  mastery_domain_key: string;
  skill_family_key: string;
  display_name: string;
  is_assignable: boolean;
  is_active: boolean;
};

export type ReviewWorkOverrideMicroSkillOption = {
  microSkillKey: string;
  displayName: string;
};

export type ReviewWorkOverrideMicroSkillProviderResult =
  | {
      status: "available";
      options: ReviewWorkOverrideMicroSkillOption[];
      anchorMicroSkillKey: string;
    }
  | {
      status: "blocked";
      reason:
        | "missing_anchor"
        | "anchor_not_catalog_backed"
        | "no_alternative_options";
    };

export async function getReviewWorkOverrideMicroSkillProvider(input: {
  supabase: SupabaseServerClient;
  anchorMicroSkillKey: string | null;
}) {
  const anchorMicroSkillKey = input.anchorMicroSkillKey?.trim() ?? null;

  if (!anchorMicroSkillKey) {
    return {
      status: "blocked",
      reason: "missing_anchor",
    } satisfies ReviewWorkOverrideMicroSkillProviderResult;
  }

  const { data: anchorRow } = await input.supabase
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
    .eq("micro_skill_key", anchorMicroSkillKey)
    .maybeSingle();

  const typedAnchorRow =
    (anchorRow as ReviewWorkOverrideMicroSkillCatalogRow | null) ?? null;

  if (
    !typedAnchorRow ||
    typedAnchorRow.mastery_domain_key !== "D4" ||
    !typedAnchorRow.is_active ||
    !typedAnchorRow.is_assignable
  ) {
    return {
      status: "blocked",
      reason: "anchor_not_catalog_backed",
    } satisfies ReviewWorkOverrideMicroSkillProviderResult;
  }

  const { data: siblingRows } = await input.supabase
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
    .eq("skill_family_key", typedAnchorRow.skill_family_key)
    .eq("is_active", true)
    .eq("is_assignable", true)
    .neq("micro_skill_key", typedAnchorRow.micro_skill_key)
    .order("display_name", { ascending: true });

  const options = (((siblingRows ?? []) as unknown) as ReviewWorkOverrideMicroSkillCatalogRow[])
    .map((row) => ({
      microSkillKey: row.micro_skill_key,
      displayName: row.display_name,
    }));

  if (options.length === 0) {
    return {
      status: "blocked",
      reason: "no_alternative_options",
    } satisfies ReviewWorkOverrideMicroSkillProviderResult;
  }

  return {
    status: "available",
    options,
    anchorMicroSkillKey: typedAnchorRow.micro_skill_key,
  } satisfies ReviewWorkOverrideMicroSkillProviderResult;
}
