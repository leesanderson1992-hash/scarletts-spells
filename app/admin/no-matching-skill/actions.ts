"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function returnToCanonicalResolver(formData: FormData) {
  const admin = await requireAdminUser();
  const itemId = formData.get("item_id");
  if (typeof itemId !== "string" || !/^[0-9a-f-]{36}$/i.test(itemId)) {
    redirect("/admin/no-matching-skill?error=Invalid%20spelling%20pair");
  }
  const { error } = await createServiceRoleClient().rpc("return_no_matching_skill_to_resolution_admin", {
    p_item_id: itemId,
    p_admin_user_id: admin.id,
  });
  if (error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/no-matching-skill");
  revalidatePath("/admin/canonical-mappings");
  redirect("/admin/no-matching-skill?saved=Returned%20to%20Canonical%20Misspelling%20Resolver");
}
