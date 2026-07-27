"use server";

import { redirect } from "next/navigation";
import { buildScopedPath, selectChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { composeDailyPlan } from "@/lib/adle/daily-assignment-composer";
import { getExistingAdleSessionPlanId, persistComposedAdleDailyPlan } from "@/lib/adle/loaders/daily-plan-surface";
import { loadDailyPlanFacts } from "@/lib/adle/loaders/composer-facts-loader";
import { buildDynamicAffixAssignmentPlan } from "@/lib/adle/morphology/dynamic-affix-assignment-plan";
import { compileDynamicAffixWordLabPayload, selectDynamicAffixWordLab } from "@/lib/adle/morphology/affix-word-lab";
import { loadDynamicSuffixProfiles } from "@/lib/adle/morphology/dynamic-suffix-profile-loader";
import { isDynamicSuffixRouteEnabled } from "@/lib/adle/morphology/dynamic-suffix-route-gate";

export async function createDynamicSuffixAssignmentAction(formData: FormData) {
  const childId = typeof formData.get("childId") === "string" ? String(formData.get("childId")) : "";
  if (!isDynamicSuffixRouteEnabled() || !childId) redirect("/learn/week");
  const userClient = await createClient(); const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  if (!selectChildById(await getActiveChildrenForUser(userClient, user.id), childId)) redirect("/learn/week");
  const planDate = getDateOnly();
  if (await getExistingAdleSessionPlanId({ userClient, parentUserId: user.id, childId, planDate })) redirect(buildScopedPath("/learn/week/adle", childId, "child"));
  const serviceClient = createServiceRoleClient();
  const loaded = await loadDynamicSuffixProfiles(serviceClient, childId, { allowStagingProfiles: process.env.VERCEL_ENV === "preview" });
  const selection = selectDynamicAffixWordLab(loaded); const payload = selection && compileDynamicAffixWordLabPayload(selection);
  if (!selection || !payload) redirect(`${buildScopedPath("/learn/week/adle/dynamic-suffix", childId, "child")}&error=not-ready`);
  const { facts } = await loadDailyPlanFacts(serviceClient, { childId, today: planDate });
  const plan = buildDynamicAffixAssignmentPlan({ basePlan: composeDailyPlan(facts, planDate), selection, payload });
  const assignmentId = await persistComposedAdleDailyPlan({ userClient, serviceClient, parentUserId: user.id, childId, planDate, plan });
  if (!assignmentId) redirect(`${buildScopedPath("/learn/week/adle/dynamic-suffix", childId, "child")}&error=not-ready`);
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
