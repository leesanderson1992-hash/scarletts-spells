import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { buildRedirectWithMessage, revalidateReviewQueueAndDetailBestEffort } from "./_shared";

export async function resolveContextReviewSuggestionImpl(formData: FormData) {
  const deliveryId = formData.get("delivery_id");
  const decision = formData.get("decision");
  const redirectPath = formData.get("redirect_path");
  const safeRedirectPath = typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
    ? redirectPath
    : "/courses/review";
  if (
    typeof deliveryId !== "string" || !deliveryId ||
    (decision !== "accepted" && decision !== "not_a_learning_issue")
  ) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "That context suggestion could not be prepared."));
  }
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  const serviceClient = createServiceRoleClient();
  const delivery = await serviceClient.from("writing_context_review_deliveries")
    .select("id,parent_user_id").eq("id", deliveryId).eq("parent_user_id", user.id).maybeSingle();
  if (delivery.error || !delivery.data) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "That context suggestion is no longer available."));
  }
  const resolved = await serviceClient.rpc("resolve_writing_context_review_delivery", {
    p_delivery_id: deliveryId,
    p_decision: decision,
  });
  if (resolved.error) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "That context suggestion changed before it could be saved. Reload and check it again."));
  }
  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);
  redirect(buildRedirectWithMessage(
    safeRedirectPath,
    "saved",
    decision === "accepted"
      ? "Context suggestion confirmed. Choose the learning reason below before sending the work back."
      : "Context suggestion marked as not an issue.",
  ));
}
