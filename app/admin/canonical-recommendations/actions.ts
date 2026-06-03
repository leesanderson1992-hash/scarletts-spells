"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const ADMIN_CANONICAL_RECOMMENDATIONS_PATH = "/admin/canonical-recommendations";

const ADMIN_RECOMMENDATION_DECISIONS = [
  "accepted",
  "rejected",
  "duplicate",
  "merged",
  "superseded",
] as const;

type AdminRecommendationDecision =
  (typeof ADMIN_RECOMMENDATION_DECISIONS)[number];

const TARGET_REQUIRED_DECISIONS = new Set<AdminRecommendationDecision>([
  "duplicate",
  "merged",
  "superseded",
]);

function buildRedirectWithMessage(key: "saved" | "error", value: string) {
  const searchParams = new URLSearchParams();
  searchParams.set(key, value);
  return `${ADMIN_CANONICAL_RECOMMENDATIONS_PATH}?${searchParams.toString()}`;
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  const normalized =
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";

  return normalized.length > 0 ? normalized : null;
}

function normalizeDecision(value: string): AdminRecommendationDecision | null {
  return ADMIN_RECOMMENDATION_DECISIONS.includes(
    value as AdminRecommendationDecision,
  )
    ? (value as AdminRecommendationDecision)
    : null;
}

function readMetadata(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function curateSpellingCanonicalRecommendation(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createServiceRoleClient();

  const recommendationId = readRequiredText(formData, "recommendation_id");
  const decision = normalizeDecision(readRequiredText(formData, "decision"));
  const reviewNote = readOptionalText(formData, "review_note", 600);
  const targetRecommendationId = readOptionalText(
    formData,
    "target_recommendation_id",
    80,
  );

  if (!recommendationId || !decision) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Choose a valid recommendation decision before submitting.",
      ),
    );
  }

  if (TARGET_REQUIRED_DECISIONS.has(decision) && !targetRecommendationId) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Duplicate, merge, and supersede decisions require a target recommendation id.",
      ),
    );
  }

  if (targetRecommendationId === recommendationId) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "A recommendation cannot target itself.",
      ),
    );
  }

  const { data: recommendation, error: recommendationError } = await supabase
    .from("spelling_canonical_mapping_recommendations")
    .select("id, recommendation_status, metadata")
    .eq("id", recommendationId)
    .maybeSingle();

  if (recommendationError || !recommendation) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "That recommendation could not be found for admin review.",
      ),
    );
  }

  if (
    recommendation.recommendation_status !== "recommended" &&
    recommendation.recommendation_status !== "pending_admin_review"
  ) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Only open recommendations can be curated in PCRM-D.",
      ),
    );
  }

  if (targetRecommendationId) {
    const { data: targetRecommendation } = await supabase
      .from("spelling_canonical_mapping_recommendations")
      .select("id")
      .eq("id", targetRecommendationId)
      .maybeSingle();

    if (!targetRecommendation) {
      redirect(
        buildRedirectWithMessage(
          "error",
          "The target recommendation could not be found.",
        ),
      );
    }
  }

  const reviewedAt = new Date().toISOString();
  const metadata = {
    ...readMetadata(recommendation.metadata),
    resolver_visible: false,
    latest_admin_curation: {
      action_source: "pcrm_d_admin_recommendation_curation",
      decision,
      resolver_visible: false,
      reviewed_at: reviewedAt,
      reviewed_by_admin_user_id: adminUser.id,
      reviewed_by_admin_email: adminUser.email ?? null,
      target_recommendation_id: targetRecommendationId,
    },
  };

  const { error } = await supabase
    .from("spelling_canonical_mapping_recommendations")
    .update({
      recommendation_status: decision,
      review_note: reviewNote,
      reviewed_at: reviewedAt,
      reviewed_by_admin_user_id: adminUser.id,
      reviewed_by_admin_email: adminUser.email ?? null,
      duplicate_of_recommendation_id:
        decision === "duplicate" ? targetRecommendationId : null,
      merge_target_recommendation_id:
        decision === "merged" ? targetRecommendationId : null,
      superseded_by_recommendation_id:
        decision === "superseded" ? targetRecommendationId : null,
      canonical_mapping_id: null,
      metadata,
    })
    .eq("id", recommendationId);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        "error",
        error.message || "The recommendation decision could not be saved.",
      ),
    );
  }

  revalidatePath(ADMIN_CANONICAL_RECOMMENDATIONS_PATH);
  redirect(
    buildRedirectWithMessage("saved", "Recommendation decision saved."),
  );
}
