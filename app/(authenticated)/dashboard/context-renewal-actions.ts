"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function applyParentWritingContextDecisions(formData: FormData) {
  const raw = formData.get("decisions");
  let decisions: unknown;
  try { decisions = typeof raw === "string" ? JSON.parse(raw) : null; }
  catch { decisions = null; }
  if (!Array.isArray(decisions) || decisions.length < 1 || decisions.length > 100 ||
    !decisions.every((row) => row && typeof row === "object" &&
      typeof row.childId === "string" && /^[0-9a-f-]{36}$/i.test(row.childId) &&
      (row.choice === "approve" || row.choice === "decline"))) {
    redirect("/dashboard?context_error=invalid_choices");
  }
  const client = await createClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) redirect("/login");
  const { error } = await client.rpc("apply_parent_writing_context_decisions_v1", {
    p_decisions: decisions,
    p_copy_version: "PARENT_WRITING_CONTEXT_BULK_V1",
  });
  if (error) {
    console.error("[parent-context-renewal] bulk decision failed", { code: error.code });
    redirect("/dashboard?context_error=renewal_unavailable");
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?context_saved=1");
}

export async function renewParentWritingContextAuthorisation(formData: FormData) {
  const childId = formData.get("child_id");
  if (typeof childId !== "string" || !/^[0-9a-f-]{36}$/i.test(childId)) {
    redirect("/dashboard?context_error=invalid_child");
  }
  const client = await createClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) redirect("/login");
  const { data: child, error: childError } = await client.from("children")
    .select("id").eq("id", childId).eq("parent_user_id", user.id)
    .eq("is_archived", false).maybeSingle();
  if (childError || !child) redirect("/dashboard?context_error=child_not_owned");
  const { error } = await client.rpc("renew_parent_writing_context_authorisation_v1", {
    p_child_id: childId,
    p_copy_version: "PARENT_WRITING_CONTEXT_RENEWAL_V1",
  });
  if (error) {
    console.error("[parent-context-renewal] renewal failed", { code: error.code });
    redirect(`/dashboard?child=${encodeURIComponent(childId)}&context_error=renewal_unavailable`);
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?child=${encodeURIComponent(childId)}&context_renewed=1`);
}
