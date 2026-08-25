"use server";

import { redirect } from "next/navigation";

import { buildScopedPath, findChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { ensureTodayAdleSession } from "@/lib/adle/today-assignment-service";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function openTodayAdleSessionAction(formData: FormData): Promise<never> {
  const childId = typeof formData.get("childId") === "string"
    ? String(formData.get("childId")).trim()
    : "";
  const fallback = buildScopedPath("/learn/week", childId || null, "child");
  if (!childId) redirect(fallback);
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  const child = findChildById(await getActiveChildrenForUser(userClient, user.id), childId);
  if (!child) redirect(fallback);
  const result = await ensureTodayAdleSession({
    userClient,
    serviceClient: createServiceRoleClient(),
    parentUserId: user.id,
    childId,
  });
  const sessionPath = buildScopedPath("/learn/week/adle", childId, "child");
  if (result.outcome === "ready" || result.outcome === "completed") redirect(sessionPath);
  if (result.outcome === "no_eligible") redirect(`${fallback}&adle=none-due`);
  redirect(`${fallback}&adle=unavailable`);
}
