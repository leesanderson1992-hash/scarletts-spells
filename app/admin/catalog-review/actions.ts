"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const ADMIN_CATALOG_REVIEW_PATH = "/admin/catalog-review";

const ADMIN_DECISION_TYPES = [
  "linked_existing_skill",
  "new_skill_needed",
  "word_level_only",
  "not_a_learning_issue",
] as const;

type AdminDecisionType = (typeof ADMIN_DECISION_TYPES)[number];

function buildRedirectWithMessage(
  key: "saved" | "error",
  value: string,
) {
  const searchParams = new URLSearchParams();
  searchParams.set(key, value);
  return `${ADMIN_CATALOG_REVIEW_PATH}?${searchParams.toString()}`;
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  const normalized = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return normalized.length > 0 ? normalized : null;
}

function normaliseDecisionType(value: string): AdminDecisionType | null {
  return ADMIN_DECISION_TYPES.includes(value as AdminDecisionType)
    ? (value as AdminDecisionType)
    : null;
}

async function getValidLinkedMicroSkill(input: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  microSkillKey: string;
}) {
  const { data } = await input.supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key, mastery_domain_key, is_active, is_assignable")
    .eq("micro_skill_key", input.microSkillKey)
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true)
    .maybeSingle();

  return data;
}

export async function resolveSpellingCatalogReviewCase(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createServiceRoleClient();

  const caseId = readRequiredText(formData, "case_id");
  const decisionType = normaliseDecisionType(
    readRequiredText(formData, "decision_type"),
  );
  const decisionNote = readOptionalText(formData, "decision_note", 500);
  const submittedMicroSkillKey = readOptionalText(formData, "micro_skill_key", 120);

  if (!caseId || !decisionType) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Choose a valid admin decision before submitting.",
      ),
    );
  }

  let linkedMicroSkillKey: string | null = null;

  if (decisionType === "linked_existing_skill") {
    if (!submittedMicroSkillKey) {
      redirect(
        buildRedirectWithMessage(
          "error",
          "Link existing skill requires an active assignable D4 micro-skill.",
        ),
      );
    }

    const linkedMicroSkill = await getValidLinkedMicroSkill({
      supabase,
      microSkillKey: submittedMicroSkillKey,
    });

    if (!linkedMicroSkill) {
      redirect(
        buildRedirectWithMessage(
          "error",
          "That micro-skill is not an active assignable D4 skill.",
        ),
      );
    }

    linkedMicroSkillKey = submittedMicroSkillKey;
  } else if (submittedMicroSkillKey) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Only Link existing skill decisions may include a micro-skill.",
      ),
    );
  }

  const { error } = await supabase.rpc(
    "resolve_spelling_catalog_review_case_admin",
    {
      p_admin_email: adminUser.email ?? null,
      p_admin_user_id: adminUser.id,
      p_case_id: caseId,
      p_decision_note: decisionNote,
      p_decision_type: decisionType,
      p_linked_micro_skill_key: linkedMicroSkillKey,
      p_metadata: {
        action_source: "admin_catalog_review_4d1",
        canonical_mapping_created: false,
        resolver_visible: false,
      },
    },
  );

  if (error) {
    redirect(
      buildRedirectWithMessage(
        "error",
        error.message || "The catalog-review case could not be resolved.",
      ),
    );
  }

  revalidatePath(ADMIN_CATALOG_REVIEW_PATH);
  redirect(
    buildRedirectWithMessage("saved", "Catalog-review case resolved."),
  );
}
