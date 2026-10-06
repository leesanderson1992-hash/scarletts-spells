"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { adoptSeedImportRowHiddenCanonicalAdmin } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";

import {
  SEED_IMPORT_HIDDEN_CANONICAL_AUTO_NOTE,
  SEED_IMPORT_HIDDEN_CANONICAL_ADOPTION_ACTION_SOURCE,
  validateSeedImportHiddenCanonicalAdoptionInput,
} from "./adoption-rules";
import {
  validateSeedImportReviewDecision,
  type SeedImportReviewDecisionRow,
} from "./decision-rules";

const ADMIN_SEED_IMPORT_REVIEW_PATH = "/admin/seed-import-review";
const ADOPTION_ROW_SELECT =
  "id, row_status, misspelling_normalized, correct_spelling_normalized, dialect_code, canonical_mapping_id";

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
    rowId: readText(formData, "row_id"),
  });

  if (!validation.ok) {
    redirect(buildRedirectWithMessage("error", validation.message));
  }

  const supabase = createServiceRoleClient();

  try {
    const { data: rowData, error: rowError } = await supabase
      .from("spelling_seed_import_rows")
      .select(ADOPTION_ROW_SELECT)
      .eq("id", validation.rowId)
      .maybeSingle();

    if (rowError) {
      throw new Error(rowError.message || "Seed import row could not be loaded.");
    }

    const row = ((rowData ?? null) as unknown) as
      | (SeedImportReviewDecisionRow & { canonical_mapping_id: string | null })
      | null;

    if (!row) {
      throw new Error("Seed import row was not found.");
    }

    if (row.canonical_mapping_id) {
      throw new Error("Seed import row has already been adopted for canonical review.");
    }

    if (row.row_status !== "nominated_for_canonical_adoption") {
      const nomination = validateSeedImportReviewDecision({
        decisionInput: {
          decision: "nominate_for_canonical_adoption",
          duplicateOfSeedImportRowId: null,
          reviewNote: SEED_IMPORT_HIDDEN_CANONICAL_AUTO_NOTE,
          rowId: validation.rowId,
          statusReason: "Approved from the simplified seed import review queue.",
        },
        duplicateTarget: null,
        row,
      });

      if (!nomination.ok) {
        throw new Error(nomination.message);
      }

      const reviewedAt = new Date().toISOString();
      const { error: nominationError } = await supabase
        .from("spelling_seed_import_rows")
        .update({
          duplicate_of_seed_import_row_id: nomination.duplicateOfSeedImportRowId,
          reviewed_at: reviewedAt,
          reviewed_by_admin_email: adminUser.email ?? null,
          reviewed_by_admin_user_id: adminUser.id,
          review_note: SEED_IMPORT_HIDDEN_CANONICAL_AUTO_NOTE,
          row_status: nomination.rowStatus,
          status_reason: "Approved from the simplified seed import review queue.",
          updated_at: reviewedAt,
        })
        .eq("id", validation.rowId);

      if (nominationError) {
        throw new Error(
          nominationError.message ||
            "Seed import row could not be approved for canonical review.",
        );
      }
    }

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
        note: SEED_IMPORT_HIDDEN_CANONICAL_AUTO_NOTE,
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
      "Seed row adopted for canonical review. Resolver visibility remains disabled.",
    ),
  );
}
