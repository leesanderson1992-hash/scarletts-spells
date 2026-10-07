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
import { isBulkResolutionEligible, type BulkResolutionAction } from "./bulk-resolution";

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

async function confirmResolutionItem(db: ReturnType<typeof createServiceRoleClient>, admin: {
  id: string; email?: string | null;
}, itemId: string): Promise<string | null> {
  const { error } = await db.rpc("confirm_spelling_resolution_admin", {
    p_item_id: itemId,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email ?? null,
    p_note: "Confirmed in the unified canonical resolver.",
  });
  if (error) throw new Error(error.message);

  // Catalog decisions have downstream governed ADLE and replay continuations.
  // They run after the atomic canonical transaction, as on the former page.
  const { data: links, error: linksError } = await db.from("spelling_resolution_item_sources")
    .select("source_id").eq("item_id", itemId).eq("source_type", "catalog");
  if (linksError) return `Catalog follow-up could not load: ${linksError.message}`;
  const caseIds = (links ?? []).map((link) => link.source_id);
  if (caseIds.length) {
    const { data: cases, error: casesError } = await db.from("spelling_catalog_review_cases")
      .select("id, source_provenance").in("id", caseIds);
    if (casesError) return `Catalog follow-up could not load: ${casesError.message}`;
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
      return `Catalog follow-up needs review: ${errorText(cause)}`;
    }
  }
  return null;
}

export async function confirmResolution(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient();
  let warning: string | null;
  try {
    warning = await confirmResolutionItem(db, admin, value(formData, "item_id", 80));
  } catch (cause) {
    message("error", errorText(cause));
  }
  if (warning) message("error", `Mapping confirmed, but ${warning}`);
  message("saved", "Canonical mapping confirmed. Resolver use remains off until enabled.");
}

export async function applyBulkResolution(action: BulkResolutionAction, itemIds: string[]) {
  const admin = await requireAdminUser();
  if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 50) {
    throw new Error("Choose up to 50 valid spelling rows.");
  }
  const ids = [...new Set(itemIds)];
  if (!["confirm", "noSkill", "activate"].includes(action) ||
    ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("Choose up to 50 valid spelling rows.");
  }
  const db = createServiceRoleClient();
  const { data: items, error: itemsError } = await db.from("spelling_resolution_items")
    .select("id, misspelling, correction, review_status, resolver_enabled, mapping_id, micro_skill_key")
    .in("id", ids);
  if (itemsError) throw new Error(itemsError.message);
  const mappingIds = (items ?? []).map((item) => item.mapping_id).filter((id): id is string => Boolean(id));
  const skillKeys = (items ?? []).map((item) => item.micro_skill_key).filter((key): key is string => Boolean(key));
  const [mappingResult, skillResult] = await Promise.all([
    mappingIds.length ? db.from("spelling_canonical_mappings")
      .select("id, mapping_status, resolver_visibility_status").in("id", mappingIds) : Promise.resolve({ data: [], error: null }),
    skillKeys.length ? db.from("micro_skill_catalog")
      .select("micro_skill_key").in("micro_skill_key", skillKeys)
      .eq("mastery_domain_key", "D4").eq("is_active", true).eq("is_assignable", true) : Promise.resolve({ data: [], error: null }),
  ]);
  if (mappingResult.error || skillResult.error) throw new Error(mappingResult.error?.message ?? skillResult.error?.message);
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const mappingById = new Map((mappingResult.data ?? []).map((mapping) => [mapping.id, mapping]));
  const readySkills = new Set((skillResult.data ?? []).map((skill) => skill.micro_skill_key));
  const failures: Array<{ id: string; label: string; reason: string }> = [];
  const warnings: Array<{ id: string; label: string; reason: string }> = [];
  let succeeded = 0;
  let skipped = 0;
  for (const id of ids) {
    const item = itemById.get(id);
    if (!item) { skipped++; continue; }
    const label = `${item.misspelling} → ${item.correction}`;
    const mapping = item.mapping_id ? mappingById.get(item.mapping_id) : null;
    if (!isBulkResolutionEligible(action, {
      status: item.review_status, resolverEnabled: item.resolver_enabled, mappingId: item.mapping_id,
      mappingStatus: mapping?.mapping_status ?? null,
      visibilityStatus: mapping?.resolver_visibility_status ?? null,
      skillReady: Boolean(item.micro_skill_key && readySkills.has(item.micro_skill_key)),
    })) { skipped++; continue; }
    try {
      if (action === "confirm") {
        const warning = await confirmResolutionItem(db, admin, id);
        if (warning) warnings.push({ id, label, reason: warning });
      } else if (action === "noSkill") {
        const { error } = await db.rpc("move_spelling_resolution_to_no_matching_skill_admin", {
          p_item_id: id, p_admin_user_id: admin.id, p_admin_email: admin.email ?? null,
        });
        if (error) throw new Error(error.message);
      } else {
        await enableResolverVisibilityForCanonicalMappingAdmin({ mapping: {
          adminEmail: admin.email ?? null, adminUserId: admin.id,
          mappingId: item.mapping_id!, note: "Added to resolver in the unified canonical resolver (bulk action).",
          metadata: { action_source: "unified_spelling_resolution_bulk" },
        } });
      }
      succeeded++;
    } catch (cause) {
      failures.push({ id, label, reason: errorText(cause) });
    }
  }
  if (succeeded) {
    revalidatePath(PATH);
    if (action === "noSkill") revalidatePath("/admin/no-matching-skill");
  }
  return { succeeded, skipped, failures, warnings };
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
