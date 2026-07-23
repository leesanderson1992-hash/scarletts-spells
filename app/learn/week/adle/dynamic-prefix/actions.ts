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
import { buildDynamicPrefixAssignmentPlan } from "@/lib/adle/morphology/dynamic-prefix-assignment-plan";
import { compileDynamicPrefixWordLabPayload, selectDynamicPrefixWordLab } from "@/lib/adle/morphology/dynamic-prefix-word-lab";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { isDynamicPrefixRouteEnabled } from "@/lib/adle/morphology/dynamic-prefix-staging-access";

export async function createDynamicPrefixStagingAssignmentAction(formData: FormData) {
  const childId = typeof formData.get("childId") === "string" ? String(formData.get("childId")) : "";
  if (!isDynamicPrefixRouteEnabled() || !childId) redirect("/learn/week");
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  const child = selectChildById(await getActiveChildrenForUser(userClient, user.id), childId);
  if (!child) redirect("/learn/week");
  const planDate = getDateOnly();
  const existing = await getExistingAdleSessionPlanId({ userClient, parentUserId: user.id, childId, planDate });
  if (existing) redirect(buildScopedPath("/learn/week/adle", childId, "child"));
  const serviceClient = createServiceRoleClient();
  const loaded = await loadDynamicPrefixProfiles(serviceClient, childId, { allowStagingProfiles: process.env.VERCEL_ENV === "preview" });
  const selection = selectDynamicPrefixWordLab(loaded);
  const payload = selection ? compileDynamicPrefixWordLabPayload(selection) : null;
  if (!selection || !payload) redirect(`${buildScopedPath("/learn/week/adle/dynamic-prefix", childId, "child")}&error=not-ready`);
  const { facts } = await loadDailyPlanFacts(serviceClient, { childId, today: planDate });
  const plan = buildDynamicPrefixAssignmentPlan({ basePlan: composeDailyPlan(facts, planDate), facts, selection, payload });
  const assignmentId = await persistComposedAdleDailyPlan({ userClient, serviceClient, parentUserId: user.id, childId, planDate, plan });
  if (!assignmentId) redirect(`${buildScopedPath("/learn/week/adle/dynamic-prefix", childId, "child")}&error=not-ready`);
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
