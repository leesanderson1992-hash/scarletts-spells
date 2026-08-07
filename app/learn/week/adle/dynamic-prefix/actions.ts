"use server";

import { redirect } from "next/navigation";

import { buildScopedPath } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getLondonPracticeDate } from "@/lib/practice-date";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  createDynamicPrefixAssignment,
} from "@/lib/adle/morphology/dynamic-prefix-assignment-writer";
import { isDynamicPrefixRouteEnabled } from "@/lib/adle/morphology/dynamic-prefix-staging-access";

export async function createDynamicPrefixStagingAssignmentAction(formData: FormData) {
  const childId = typeof formData.get("childId") === "string" ? String(formData.get("childId")) : "";
  if (!isDynamicPrefixRouteEnabled() || !childId) redirect("/learn/week");
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  const child = (await getActiveChildrenForUser(userClient, user.id)).find(
    (candidate) => candidate.id === childId,
  );
  if (!child) redirect("/learn/week");
  const planDate = getLondonPracticeDate();
  const serviceClient = createServiceRoleClient();
  const result = await createDynamicPrefixAssignment({
    userClient,
    serviceClient,
    parentUserId: user.id,
    childId,
    planDate,
    allowStagingProfiles: process.env.VERCEL_ENV === "preview",
  });
  if (result.status === "conflict" || result.status === "not_ready") {
    redirect(`${buildScopedPath("/learn/week/adle/dynamic-prefix", childId, "child")}&error=not-ready`);
  }
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
