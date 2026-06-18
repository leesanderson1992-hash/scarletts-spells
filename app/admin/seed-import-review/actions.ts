"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  normaliseSeedImportReviewDecision,
  type SeedImportReviewDecisionInput,
  type SeedImportReviewDecisionRow,
  validateSeedImportReviewDecision,
} from "./decision-rules";

const ADMIN_SEED_IMPORT_REVIEW_PATH = "/admin/seed-import-review";
const DECISION_ROW_SELECT =
  "id, row_status, misspelling_normalized, correct_spelling_normalized, dialect_code";

function buildRedirectWithMessage(key: "saved" | "error", value: string) {
  const searchParams = new URLSearchParams();
  searchParams.set(key, value);
  return `${ADMIN_SEED_IMPORT_REVIEW_PATH}?${searchParams.toString()}`;
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalText(formData: FormData, key: string, maxLength: number) {
  const value = readText(formData, key).slice(0, maxLength);
  return value.length > 0 ? value : null;
}

function parseDecisionInput(formData: FormData): SeedImportReviewDecisionInput | null {
  const decision = normaliseSeedImportReviewDecision(readText(formData, "decision"));
  const rowId = readText(formData, "row_id");

  if (!decision || !rowId) {
    return null;
  }

  return {
    decision,
    duplicateOfSeedImportRowId: readOptionalText(
      formData,
      "duplicate_of_seed_import_row_id",
      80,
    ),
    reviewNote: readOptionalText(formData, "review_note", 700),
    rowId,
    statusReason: readOptionalText(formData, "status_reason", 400),
  };
}

export async function decideSeedImportReviewRow(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createServiceRoleClient();
  const decisionInput = parseDecisionInput(formData);

  if (!decisionInput) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Choose a valid seed import review decision before submitting.",
      ),
    );
  }

  const { data: rowData, error: rowError } = await supabase
    .from("spelling_seed_import_rows")
    .select(DECISION_ROW_SELECT)
    .eq("id", decisionInput.rowId)
    .maybeSingle();

  if (rowError) {
    redirect(
      buildRedirectWithMessage(
        "error",
        rowError.message || "Seed import row could not be loaded.",
      ),
    );
  }

  let duplicateTarget: SeedImportReviewDecisionRow | null = null;

  if (decisionInput.duplicateOfSeedImportRowId) {
    const { data: duplicateTargetData, error: duplicateTargetError } =
      await supabase
        .from("spelling_seed_import_rows")
        .select(DECISION_ROW_SELECT)
        .eq("id", decisionInput.duplicateOfSeedImportRowId)
        .maybeSingle();

    if (duplicateTargetError) {
      redirect(
        buildRedirectWithMessage(
          "error",
          duplicateTargetError.message || "Duplicate target could not be loaded.",
        ),
      );
    }

    duplicateTarget =
      ((duplicateTargetData ?? null) as unknown) as SeedImportReviewDecisionRow | null;
  }

  const validation = validateSeedImportReviewDecision({
    decisionInput,
    duplicateTarget,
    row: ((rowData ?? null) as unknown) as SeedImportReviewDecisionRow | null,
  });

  if (!validation.ok) {
    redirect(buildRedirectWithMessage("error", validation.message));
  }

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("spelling_seed_import_rows")
    .update({
      duplicate_of_seed_import_row_id: validation.duplicateOfSeedImportRowId,
      reviewed_at: reviewedAt,
      reviewed_by_admin_email: adminUser.email ?? null,
      reviewed_by_admin_user_id: adminUser.id,
      review_note: decisionInput.reviewNote,
      row_status: validation.rowStatus,
      status_reason: decisionInput.statusReason,
      updated_at: reviewedAt,
    })
    .eq("id", decisionInput.rowId);

  if (updateError) {
    redirect(
      buildRedirectWithMessage(
        "error",
        updateError.message || "Seed import review decision could not be saved.",
      ),
    );
  }

  revalidatePath(ADMIN_SEED_IMPORT_REVIEW_PATH);
  redirect(buildRedirectWithMessage("saved", "Seed import review decision saved."));
}
