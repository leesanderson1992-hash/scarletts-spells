"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { applyAdleCatalogReviewDecision } from "@/lib/adle/review-work/admin-catalog-route";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  disableResolverVisibilityForCanonicalMappingAdmin,
  enableResolverVisibilityForCanonicalMappingAdmin,
} from "@/lib/writing-engine/persistence/spelling-canonical-mappings";
import { surfaceReturnedCorrectionReplayRecommendations } from "@/lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply";
import { continueUnknownErrorAfterAdminDecision } from "@/lib/writing-engine/whole-writing/unknown-error-continuation";

const PATH = "/admin/canonical-mappings";

function value(formData: FormData, key: string, max = 600) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function message(kind: "saved" | "error", detail: string): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams({ [kind]: detail }).toString()}`);
}

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : "The spelling resolution action failed.";
}

export async function saveResolutionDraft(formData: FormData) {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const { error } = await db.rpc("save_spelling_resolution_draft_admin", {
    p_item_id: value(formData, "item_id", 80),
    p_misspelling: value(formData, "misspelling", 200),
    p_correction: value(formData, "correction", 200),
    p_micro_skill_key: value(formData, "micro_skill_key", 120) || null,
  });
  if (error) message("error", error.message);
  message("saved", "Pending spelling resolution updated.");
}

export async function reopenResolution(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient();
  const { error } = await db.rpc("reopen_spelling_resolution_admin", {
    p_item_id: value(formData, "item_id", 80),
    p_admin_user_id: admin.id,
    p_admin_email: admin.email ?? null,
    p_note: "Reopened for editing in the unified canonical resolver.",
  });
  if (error) message("error", error.message);
  message("saved", "Mapping reopened for editing. Resolver use is paused.");
}

export async function confirmResolution(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient();
  const itemId = value(formData, "item_id", 80);
  const { error } = await db.rpc("confirm_spelling_resolution_admin", {
    p_item_id: itemId,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email ?? null,
    p_note: "Confirmed in the unified canonical resolver.",
  });
  if (error) message("error", error.message);

  // Catalog decisions have downstream governed ADLE and replay continuations.
  // They run after the atomic canonical transaction, as on the former page.
  const { data: links, error: linksError } = await db.from("spelling_resolution_item_sources")
    .select("source_id").eq("item_id", itemId).eq("source_type", "catalog");
  if (linksError) message("error", `Mapping confirmed, but catalog follow-up could not load: ${linksError.message}`);
  const caseIds = (links ?? []).map((link) => link.source_id);
  if (caseIds.length) {
    const { data: cases, error: casesError } = await db.from("spelling_catalog_review_cases")
      .select("id, source_provenance").in("id", caseIds);
    if (casesError) message("error", `Mapping confirmed, but catalog follow-up could not load: ${casesError.message}`);
    const { data: item } = await db.from("spelling_resolution_items")
      .select("micro_skill_key").eq("id", itemId).maybeSingle();
    try {
      for (const reviewCase of cases ?? []) {
        await applyAdleCatalogReviewDecision({
          supabase: db, caseId: reviewCase.id,
          decisionType: "add_canonical_mapping",
          linkedMicroSkillKey: item?.micro_skill_key ?? null,
        });
        if (reviewCase.source_provenance !== "adle_review_submitted_writing_parent_identified") {
          await surfaceReturnedCorrectionReplayRecommendations({
            supabase: db, scope: { adminCaseId: reviewCase.id, limit: 100 },
            nowIso: new Date().toISOString(), triggerSource: "admin_hook",
          });
          await continueUnknownErrorAfterAdminDecision({
            serviceClient: db, adminCaseId: reviewCase.id,
          });
        }
      }
    } catch (cause) {
      message("error", `Mapping confirmed, but catalog follow-up needs review: ${errorText(cause)}`);
    }
  }
  message("saved", "Canonical mapping confirmed. Resolver use remains off until enabled.");
}

export async function setResolutionResolverVisibility(formData: FormData) {
  const admin = await requireAdminUser();
  const mappingId = value(formData, "mapping_id", 80);
  const mode = value(formData, "mode", 10);
  if (!mappingId || (mode !== "enable" && mode !== "disable")) {
    message("error", "Choose a mapping and resolver action.");
  }
  const note = mode === "enable"
    ? "Added to resolver in the unified canonical resolver."
    : "Removed from resolver in the unified canonical resolver.";
  try {
    const mapping = {
      adminEmail: admin.email ?? null,
      adminUserId: admin.id,
      mappingId, note,
      metadata: { action_source: "unified_spelling_resolution" },
    };
    if (mode === "enable") await enableResolverVisibilityForCanonicalMappingAdmin({ mapping });
    else await disableResolverVisibilityForCanonicalMappingAdmin({ mapping });
  } catch (cause) {
    message("error", errorText(cause));
  }
  message("saved", mode === "enable" ? "Added to Resolver." : "Removed from Resolver.");
}

export async function deleteResolution(formData: FormData) {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const { error } = await db.rpc("delete_spelling_resolution_admin", {
    p_item_id: value(formData, "item_id", 80),
    p_confirmation: value(formData, "confirmation", 250),
  });
  if (error) message("error", error.message);
  message("saved", "Spelling resolution and linked admin evidence permanently deleted.");
}

export async function moveResolutionToNoMatchingSkill(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient();
  const { error } = await db.rpc("move_spelling_resolution_to_no_matching_skill_admin", {
    p_item_id: value(formData, "item_id", 80),
    p_admin_user_id: admin.id,
    p_admin_email: admin.email ?? null,
  });
  if (error) message("error", error.message);
  revalidatePath("/admin/no-matching-skill");
  message("saved", "Moved to No Matching Skill.");
}
