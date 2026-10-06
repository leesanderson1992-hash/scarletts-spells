"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { adoptSpellingCanonicalMappingRecommendationAdmin } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";

const ADMIN_CANONICAL_RECOMMENDATIONS_PATH = "/admin/canonical-recommendations";

function buildRedirectWithMessage(key: "saved" | "error", value: string) {
  const searchParams = new URLSearchParams();
  searchParams.set(key, value);
  return `${ADMIN_CANONICAL_RECOMMENDATIONS_PATH}?${searchParams.toString()}`;
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNote(formData: FormData) {
  const note = readRequiredText(formData, "adoption_note").slice(0, 600);
  return note.length > 0 ? note : null;
}

export async function adoptAcceptedSpellingCanonicalRecommendation(
  formData: FormData,
) {
  const adminUser = await requireAdminUser();
  const recommendationId = readRequiredText(formData, "recommendation_id");
  const note = readNote(formData);

  if (!recommendationId || !note) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Choose an accepted recommendation and add an adoption note.",
      ),
    );
  }

  try {
    await adoptSpellingCanonicalMappingRecommendationAdmin({
      adoption: {
        adminEmail: adminUser.email ?? null,
        adminUserId: adminUser.id,
        metadata: {
          action_source: "admin_pcrm_g_canonical_adoption",
        },
        note,
        recommendationId,
      },
    });
  } catch (error) {
    redirect(
      buildRedirectWithMessage(
        "error",
        error instanceof Error
          ? error.message
          : "The recommendation could not be adopted as a canonical mapping.",
      ),
    );
  }

  revalidatePath(ADMIN_CANONICAL_RECOMMENDATIONS_PATH);
  redirect(
    buildRedirectWithMessage(
      "saved",
      "Recommendation adopted as canonical mapping. Resolver visibility remains disabled.",
    ),
  );
}
