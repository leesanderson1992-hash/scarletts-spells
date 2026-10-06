"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function resolveContextualCatalogCase(formData: FormData) {
  const admin = await requireAdminUser();
  const id = formData.get("case_id");
  const status = formData.get("case_status");
  if (typeof id !== "string" || !["reviewed", "dismissed"].includes(String(status))) {
    throw new Error("Invalid contextual catalog decision.");
  }
  const service = createServiceRoleClient();
  const saved = await service.rpc("resolve_writing_context_catalog_case", {
    p_case_id: id, p_admin_user_id: admin.id, p_decision: status,
  });
  if (saved.error || !saved.data) throw new Error("The contextual catalog case is no longer open.");
  revalidatePath("/admin/catalog-review");
}
