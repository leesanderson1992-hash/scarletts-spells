"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import {
  disableResolverVisibilityForCanonicalMappingAdmin,
  enableResolverVisibilityForCanonicalMappingAdmin,
} from "@/lib/writing-engine/persistence/spelling-canonical-mappings";

const ADMIN_CANONICAL_MAPPINGS_PATH = "/admin/canonical-mappings";

function buildRedirectWithMessage(key: "saved" | "error", value: string) {
  const searchParams = new URLSearchParams();
  searchParams.set(key, value);
  return `${ADMIN_CANONICAL_MAPPINGS_PATH}?${searchParams.toString()}`;
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNote(formData: FormData) {
  const note = readRequiredText(formData, "note").slice(0, 600);
  return note.length > 0 ? note : null;
}

export async function enableCanonicalMappingResolverVisibility(
  formData: FormData,
) {
  const adminUser = await requireAdminUser();
  const mappingId = readRequiredText(formData, "mapping_id");
  const note = readNote(formData);

  if (!mappingId || !note) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Choose a canonical mapping and add a resolver visibility note.",
      ),
    );
  }

  try {
    await enableResolverVisibilityForCanonicalMappingAdmin({
      mapping: {
        adminEmail: adminUser.email ?? null,
        adminUserId: adminUser.id,
        mappingId,
        note,
        metadata: {
          action_source: "admin_canonical_mappings_r2",
        },
      },
    });
  } catch (error) {
    redirect(
      buildRedirectWithMessage(
        "error",
        error instanceof Error
          ? error.message
          : "Resolver visibility could not be enabled.",
      ),
    );
  }

  revalidatePath(ADMIN_CANONICAL_MAPPINGS_PATH);
  redirect(
    buildRedirectWithMessage("saved", "Resolver visibility enabled."),
  );
}

export async function disableCanonicalMappingResolverVisibility(
  formData: FormData,
) {
  const adminUser = await requireAdminUser();
  const mappingId = readRequiredText(formData, "mapping_id");
  const note = readNote(formData);

  if (!mappingId || !note) {
    redirect(
      buildRedirectWithMessage(
        "error",
        "Choose a canonical mapping and add a resolver visibility note.",
      ),
    );
  }

  try {
    await disableResolverVisibilityForCanonicalMappingAdmin({
      mapping: {
        adminEmail: adminUser.email ?? null,
        adminUserId: adminUser.id,
        mappingId,
        note,
        metadata: {
          action_source: "admin_canonical_mappings_r2",
        },
      },
    });
  } catch (error) {
    redirect(
      buildRedirectWithMessage(
        "error",
        error instanceof Error
          ? error.message
          : "Resolver visibility could not be disabled.",
      ),
    );
  }

  revalidatePath(ADMIN_CANONICAL_MAPPINGS_PATH);
  redirect(
    buildRedirectWithMessage("saved", "Resolver visibility disabled."),
  );
}
