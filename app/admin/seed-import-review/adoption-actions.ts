"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { adoptSeedImportRowHiddenCanonicalAdmin } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";

import {
  SEED_IMPORT_HIDDEN_CANONICAL_ADOPTION_ACTION_SOURCE,
  validateSeedImportHiddenCanonicalAdoptionInput,
} from "./adoption-rules";

const ADMIN_SEED_IMPORT_REVIEW_PATH = "/admin/seed-import-review";

function buildRedirectWithMessage(key: "saved" | "error", value: string) {
  const searchParams = new URLSearchParams();
  searchParams.set(key, value);
  return `${ADMIN_SEED_IMPORT_REVIEW_PATH}?${searchParams.toString()}`;
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function adoptSeedImportRowHiddenCanonical(formData: FormData) {
  const adminUser = await requireAdminUser();
  const validation = validateSeedImportHiddenCanonicalAdoptionInput({
    adoptionNote: readText(formData, "adoption_note").slice(0, 1000),
    confirmationCopy: readText(formData, "resolver_visibility_confirmation"),
    rowId: readText(formData, "row_id"),
  });

  if (!validation.ok) {
    redirect(buildRedirectWithMessage("error", validation.message));
  }

  const supabase = createServiceRoleClient();

  try {
    await adoptSeedImportRowHiddenCanonicalAdmin({
      supabase,
      adoption: {
        adminEmail: adminUser.email ?? null,
        adminUserId: adminUser.id,
        metadata: {
          action_source: SEED_IMPORT_HIDDEN_CANONICAL_ADOPTION_ACTION_SOURCE,
          resolver_visible: false,
          resolver_visibility_status: "hidden",
        },
        note: validation.adoptionNote,
        seedImportRowId: validation.rowId,
      },
    });
  } catch (error) {
    redirect(
      buildRedirectWithMessage(
        "error",
        error instanceof Error
          ? error.message
          : "Seed import hidden canonical adoption failed.",
      ),
    );
  }

  revalidatePath(ADMIN_SEED_IMPORT_REVIEW_PATH);
  redirect(
    buildRedirectWithMessage(
      "saved",
      "Seed row adopted as hidden canonical truth. Resolver visibility remains disabled.",
    ),
  );
}
