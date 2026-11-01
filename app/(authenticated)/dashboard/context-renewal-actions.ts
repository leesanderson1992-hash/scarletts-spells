"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function applyParentWritingContextDecisions(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const raw = formData.get("decisions");
  let decisions: unknown;
  try { decisions = typeof raw === "string" ? JSON.parse(raw) : null; }
  catch { decisions = null; }
  if (!Array.isArray(decisions) || decisions.length < 1 || decisions.length > 100 ||
    !decisions.every((row) => row && typeof row === "object" &&
      typeof row.childId === "string" && /^[0-9a-f-]{36}$/i.test(row.childId) &&
      (row.choice === "approve" || row.choice === "decline"))) {
    return { error: "Select Approve or Do not approve for at least one profile, then try again." };
  }
  const client = await createClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return { error: "Your session has expired. Sign in again before saving these choices." };
  let result;
  try {
    result = await client.rpc("apply_parent_writing_context_decisions_v1", {
      p_decisions: decisions,
      p_copy_version: "PARENT_WRITING_CONTEXT_BULK_V1",
    });
  } catch {
    return { error: "The connection was interrupted. Your choices were not confirmed. Please try again." };
  }
  const { data, error } = result;
  if (error) {
    console.error("[parent-context-renewal] bulk decision failed", { code: error.code });
    if (error.message.includes("CONTEXT_BULK_CHILD_NOT_ELIGIBLE"))
      return { error: "A selected profile is no longer available for writing context checking. Refresh the page and try again." };
    if (error.message.includes("CONTEXT_BULK_POLICY_UNAVAILABLE"))
      return { error: "Writing context checking is temporarily unavailable. No choices were saved." };
    return { error: "The choices could not be saved. No changes were made. Please try again." };
  }
  revalidatePath("/dashboard");
  const approved = typeof data?.approved === "number" ? data.approved : 0;
  const declined = typeof data?.declined === "number" ? data.declined : 0;
  redirect(`/dashboard?context_saved=1&approved=${approved}&declined=${declined}`);
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
