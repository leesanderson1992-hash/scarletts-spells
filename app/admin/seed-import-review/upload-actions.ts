"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildSeedUploadImportPlan,
  buildSeedUploadPreview,
  decodeSeedUploadPayload,
  encodeSeedUploadPayload,
  MAX_SEED_UPLOAD_ROWS,
  type SeedUploadCanonicalMapping,
  type SeedUploadMicroSkill,
  type SeedUploadPreview,
} from "@/lib/writing-engine/seed-import-upload";

const ADMIN_SEED_IMPORT_REVIEW_PATH = "/admin/seed-import-review";
const CONFIRM_UPLOAD_IMPORT = "IMPORT_SEED_UPLOAD_ROWS";
const MAX_UPLOAD_BYTES = 1024 * 1024 * 2;
const PROTECTED_TABLES = [
  "micro_skill_catalog",
  "spelling_canonical_mappings",
  "spelling_canonical_mapping_events",
  "spelling_canonical_mapping_recommendations",
  "spelling_catalog_review_cases",
  "spelling_catalog_review_case_decisions",
  "parent_verified_spelling_candidate_mappings",
  "learning_items",
  "assignment_items",
  "learning_item_evidence",
  "writing_issues",
  "parent_verifications",
] as const;

export type SeedImportUploadState = {
  error?: string;
  preview?: {
    encodedCsv: string;
    encodedPreview: string;
    fileName: string;
    generatedAt: string;
    sourceFileSha256: string;
    summary: SeedUploadPreview["summary"];
    warnings: string[];
    sampleRows: Array<{
      rowNumber: number;
      pair: string;
      uploadedMicroSkillKey: string;
      storedMicroSkillKey: string | null;
      status: string;
      reasons: string[];
    }>;
  };
  saved?: string;
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readRequiredText(formData: FormData, key: string, label: string, maxLength: number) {
  const value = readText(formData, key).slice(0, maxLength);
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

async function countTable(client: ReturnType<typeof createServiceRoleClient>, table: string) {
  const { count, error } = await client.from(table).select("*", {
    count: "exact",
    head: true,
  });
  if (error) {
    throw new Error(`Unable to count ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function fetchProtectedCounts(client: ReturnType<typeof createServiceRoleClient>) {
  const entries = await Promise.all(
    PROTECTED_TABLES.map(async (table) => [table, await countTable(client, table)] as const),
  );
  return Object.fromEntries(entries);
}

function assertProtectedCountsUnchanged(
  before: Record<string, number>,
  after: Record<string, number>,
) {
  const changed = Object.keys(before).filter((table) => before[table] !== after[table]);
  if (changed.length > 0) {
    throw new Error(
      `Protected table counts changed during seed upload import: ${changed
        .map((table) => `${table} ${before[table]} -> ${after[table]}`)
        .join(", ")}`,
    );
  }
}

async function readCsvUpload(formData: FormData) {
  const file = formData.get("seed_csv");
  if (!(file instanceof File)) {
    throw new Error("Choose a CSV file before previewing the import.");
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Seed upload accepts CSV files only.");
  }

  if (file.size <= 0) {
    throw new Error("CSV file is empty.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("CSV file is too large for the 1000-row upload flow.");
  }

  return {
    csvText: await file.text(),
    fileName: file.name,
  };
}

async function fetchPreviewComparisonData(
  supabase: ReturnType<typeof createServiceRoleClient>,
  csvText: string,
) {
  const keyMatches = Array.from(
    csvText.matchAll(/D4_[A-Z0-9_]+/g),
    (match) => match[0],
  );
  const keys = Array.from(new Set(keyMatches));
  let microSkills: SeedUploadMicroSkill[] = [];

  if (keys.length > 0) {
    const { data, error } = await supabase
      .from("micro_skill_catalog")
      .select("micro_skill_key, mastery_domain_key, is_active, is_assignable")
      .in("micro_skill_key", keys);
    if (error) {
      throw new Error(`Unable to validate micro-skill keys: ${error.message}`);
    }
    microSkills = ((data ?? []) as unknown) as SeedUploadMicroSkill[];
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from("spelling_canonical_mappings")
    .select(
      "id, misspelling_normalized, correct_spelling_normalized, dialect_code, normalization_version, mapping_status, micro_skill_key",
    )
    .eq("mapping_status", "active")
    .limit(5000);
  if (mappingsError) {
    throw new Error(`Unable to compare canonical mappings: ${mappingsError.message}`);
  }

  return {
    canonicalMappings: ((mappings ?? []) as unknown) as SeedUploadCanonicalMapping[],
    microSkills,
  };
}

function buildUploadPreviewState(
  preview: SeedUploadPreview,
  csvText: string,
): SeedImportUploadState {
  return {
    preview: {
      encodedCsv: encodeSeedUploadPayload({ csvText }),
      encodedPreview: encodeSeedUploadPayload(preview),
      fileName: preview.input_file,
      generatedAt: preview.generated_at,
      sourceFileSha256: preview.source_file_sha256,
      summary: preview.summary,
      warnings: preview.warnings,
      sampleRows: preview.rows.slice(0, 10).map((row) => ({
        pair: `${row.misspelling} -> ${row.correction}`,
        reasons: [...row.blocking_errors, ...row.manual_review_warnings].slice(0, 3),
        rowNumber: row.row_number,
        status: row.bucket,
        storedMicroSkillKey: row.stored_micro_skill_key,
        uploadedMicroSkillKey: row.uploaded_micro_skill_key,
      })),
    },
  };
}

export async function previewSeedImportUpload(
  _state: SeedImportUploadState,
  formData: FormData,
): Promise<SeedImportUploadState> {
  try {
    await requireAdminUser();
    const supabase = createServiceRoleClient();
    const { csvText, fileName } = await readCsvUpload(formData);
    const comparisonData = await fetchPreviewComparisonData(supabase, csvText);
    const preview = buildSeedUploadPreview({
      canonicalMappings: comparisonData.canonicalMappings,
      csvText,
      fileName,
      microSkills: comparisonData.microSkills,
    });

    if (preview.summary.total_rows > MAX_SEED_UPLOAD_ROWS) {
      throw new Error(`CSV upload is limited to ${MAX_SEED_UPLOAD_ROWS} data rows.`);
    }

    return buildUploadPreviewState(preview, csvText);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function confirmSeedImportUpload(
  _state: SeedImportUploadState,
  formData: FormData,
): Promise<SeedImportUploadState> {
  try {
    const adminUser = await requireAdminUser();
    const supabase = createServiceRoleClient();
    const confirmation = readText(formData, "upload_import_confirmation");
    if (confirmation !== CONFIRM_UPLOAD_IMPORT) {
      throw new Error(`Type ${CONFIRM_UPLOAD_IMPORT} to confirm the seed import.`);
    }

    const sourceLicenseNote = readRequiredText(
      formData,
      "source_license_note",
      "Source/license note",
      1000,
    );
    const { csvText } = decodeSeedUploadPayload<{ csvText: string }>(
      readRequiredText(formData, "encoded_csv", "Encoded CSV", MAX_UPLOAD_BYTES * 2),
    );
    const preview = decodeSeedUploadPayload<SeedUploadPreview>(
      readRequiredText(formData, "encoded_preview", "Encoded preview", MAX_UPLOAD_BYTES * 3),
    );

    const comparisonData = await fetchPreviewComparisonData(supabase, csvText);
    const freshPreview = buildSeedUploadPreview({
      canonicalMappings: comparisonData.canonicalMappings,
      csvText,
      fileName: preview.input_file,
      microSkills: comparisonData.microSkills,
      now: new Date(preview.generated_at),
    });

    if (JSON.stringify(freshPreview.rows) !== JSON.stringify(preview.rows)) {
      throw new Error("The upload preview changed before confirmation. Preview the CSV again.");
    }

    const activeBatch = await supabase
      .from("spelling_seed_import_batches")
      .select("id")
      .eq("source_file_sha256", preview.source_file_sha256)
      .not("batch_status", "in", "(superseded,cancelled,quarantined)")
      .limit(1)
      .maybeSingle();
    if (activeBatch.error) {
      throw new Error(`Unable to check existing seed imports: ${activeBatch.error.message}`);
    }
    if (activeBatch.data) {
      throw new Error("An active seed import batch already exists for this CSV file.");
    }

    const protectedCountsBefore = await fetchProtectedCounts(supabase);
    const plan = buildSeedUploadImportPlan({
      adminEmail: adminUser.email ?? null,
      adminUserId: adminUser.id,
      csvText,
      preview,
      sourceLicenseNote,
    });

    const { data: batch, error: batchError } = await supabase
      .from("spelling_seed_import_batches")
      .insert(plan.batch)
      .select("id")
      .single();
    if (batchError || !batch) {
      throw new Error(
        `Unable to create seed import batch: ${batchError?.message ?? "unknown error"}`,
      );
    }

    const { error: rowError } = await supabase.from("spelling_seed_import_rows").insert(
      plan.rows.map((row) => ({
        ...row,
        batch_id: batch.id,
      })),
    );
    if (rowError) {
      await supabase
        .from("spelling_seed_import_batches")
        .update({
          batch_status: "quarantined",
          close_note: `Slice 4D.2 row insert failed: ${rowError.message}`,
          closed_at: new Date().toISOString(),
        })
        .eq("id", batch.id);
      throw new Error(`Unable to insert seed import rows: ${rowError.message}`);
    }

    const protectedCountsAfter = await fetchProtectedCounts(supabase);
    assertProtectedCountsUnchanged(protectedCountsBefore, protectedCountsAfter);
    revalidatePath(ADMIN_SEED_IMPORT_REVIEW_PATH);
    return {
      saved: `Imported ${plan.rows.length} seed rows. ${preview.summary.manual_review_rows} need manual review.`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
