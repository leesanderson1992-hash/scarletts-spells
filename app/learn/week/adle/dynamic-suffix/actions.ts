"use server";

import { redirect } from "next/navigation";
import { buildScopedPath, selectChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createDynamicAffixAssignment } from "@/lib/adle/morphology/dynamic-affix-assignment-writer";
import { isDynamicSuffixRouteEnabled } from "@/lib/adle/morphology/dynamic-suffix-route-gate";

export async function createDynamicSuffixAssignmentAction(formData: FormData) {
  const childId = typeof formData.get("childId") === "string" ? String(formData.get("childId")) : "";
  if (!isDynamicSuffixRouteEnabled() || !childId) redirect("/learn/week");
  const userClient = await createClient(); const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  if (!selectChildById(await getActiveChildrenForUser(userClient, user.id), childId)) redirect("/learn/week");
  const planDate = getDateOnly();
  const serviceClient = createServiceRoleClient();
  const allowStagingProfiles = process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "staging"
    || process.env.VERCEL_ENV === "preview";
  const result = await createDynamicAffixAssignment({ userClient, serviceClient, parentUserId: user.id, childId, planDate, allowStagingProfiles });
  if (result.status === "conflict" || result.status === "not_ready") redirect(`${buildScopedPath("/learn/week/adle/dynamic-suffix", childId, "child")}&error=not-ready`);
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
