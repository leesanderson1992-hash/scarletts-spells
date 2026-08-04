"use server";
/* eslint-disable @typescript-eslint/no-explicit-any -- additive intake tables precede generated Supabase types */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const PATH = "/admin/adle-canonical-intake-readiness";
const DEMAND_STATUSES = new Set(["in_review", "rejected", "superseded"]);

function text(formData: FormData, key: string, max = 500): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finish(key: "saved" | "error", message: string): never {
  const params = new URLSearchParams({ [key]: message });
  redirect(`${PATH}?${params.toString()}`);
}

async function demandById(db: any, demandId: string) {
  const { data, error } = await db
    .from("adle_canonical_intake_demands")
    .select("id,lifecycle_status,notification_status")
    .eq("id", demandId)
    .maybeSingle();
  if (error) finish("error", "The intake demand could not be read.");
  if (!data) finish("error", "That intake demand no longer exists.");
  return data as {
    id: string;
    lifecycle_status: string;
    notification_status: string;
  };
}

async function appendAdminEvent(input: {
  db: any;
  demandId: string;
  adminUserId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  const { error } = await input.db.from("adle_canonical_intake_events").insert({
    demand_id: input.demandId,
    event_type: input.eventType,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    event_payload: input.payload ?? {},
  });
  if (error) throw error;
}

export async function acknowledgeIntakeDemand(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient() as any;
  const demandId = text(formData, "demand_id", 80);
  if (!demandId) finish("error", "Choose a valid demand.");
  await demandById(db, demandId);
  const now = new Date().toISOString();
  const { error } = await db
    .from("adle_canonical_intake_demands")
    .update({
      notification_status: "open",
      notification_opened_at: now,
      updated_at: now,
    })
    .eq("id", demandId)
    .neq("notification_status", "resolved");
  if (error) finish("error", "The notification could not be acknowledged.");
  await appendAdminEvent({
    db,
    demandId,
    adminUserId: admin.id,
    eventType: "notification_opened",
  });
  revalidatePath(PATH);
  revalidatePath("/admin/spelling-review");
  finish("saved", "Demand notification acknowledged.");
}

export async function assignIntakeDemandToMe(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient() as any;
  const demandId = text(formData, "demand_id", 80);
  if (!demandId) finish("error", "Choose a valid demand.");
  await demandById(db, demandId);
  const now = new Date().toISOString();
  const { error } = await db
    .from("adle_canonical_intake_demands")
    .update({
      owner_user_id: admin.id,
      lifecycle_status: "in_review",
      notification_status: "open",
      notification_opened_at: now,
      updated_at: now,
    })
    .eq("id", demandId)
    .in("lifecycle_status", ["pending", "in_review"]);
  if (error) finish("error", "The demand owner could not be assigned.");
  await appendAdminEvent({
    db,
    demandId,
    adminUserId: admin.id,
    eventType: "demand_owner_assigned",
    payload: { lifecycleStatus: "in_review" },
  });
  revalidatePath(PATH);
  revalidatePath("/admin/spelling-review");
  finish("saved", "Demand assigned and marked in review.");
}

export async function updateIntakeDemandStatus(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient() as any;
  const demandId = text(formData, "demand_id", 80);
  const status = text(formData, "status", 40);
  const note = text(formData, "note", 500);
  if (!demandId || !DEMAND_STATUSES.has(status))
    finish("error", "Choose a valid audited demand status.");
  if ((status === "rejected" || status === "superseded") && !note)
    finish("error", "Rejected or superseded demands require an audited note.");
  await demandById(db, demandId);
  const now = new Date().toISOString();
  const { error } = await db
    .from("adle_canonical_intake_demands")
    .update({
      lifecycle_status: status,
      reviewer_user_id: admin.id,
      resolution_note: note || null,
      notification_status:
        status === "rejected" || status === "superseded" ? "resolved" : "open",
      notification_resolved_at:
        status === "rejected" || status === "superseded" ? now : null,
      updated_at: now,
    })
    .eq("id", demandId)
    .neq("lifecycle_status", "activated");
  if (error) finish("error", "The demand status could not be updated.");
  await appendAdminEvent({
    db,
    demandId,
    adminUserId: admin.id,
    eventType: `demand_${status}`,
    payload: note ? { note } : {},
  });
  revalidatePath(PATH);
  revalidatePath("/admin/spelling-review");
  finish("saved", "Demand status updated.");
}

export async function enqueueIntakeDemandRecheck(formData: FormData) {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient() as any;
  const demandId = text(formData, "demand_id", 80);
  if (!demandId) finish("error", "Choose a valid demand.");
  await demandById(db, demandId);
  const { data: links, error: linkError } = await db
    .from("adle_canonical_intake_candidate_demands")
    .select("candidate_id")
    .eq("demand_id", demandId)
    .eq("link_status", "waiting")
    .limit(500);
  if (linkError) finish("error", "Waiting candidates could not be read.");
  for (const link of links ?? []) {
    const { error } = await db.rpc("adle_enqueue_canonical_intake_candidate", {
      p_candidate_id: link.candidate_id,
      p_trigger_type: "admin_recheck",
      p_source_ref: `admin-demand:${demandId}`,
    });
    if (error) finish("error", "The readiness recheck could not be queued.");
  }
  await appendAdminEvent({
    db,
    demandId,
    adminUserId: admin.id,
    eventType: "reconciliation_enqueued",
    payload: { waitingCandidateCount: (links ?? []).length },
  });
  revalidatePath(PATH);
  finish("saved", "Readiness reconciliation queued.");
}
