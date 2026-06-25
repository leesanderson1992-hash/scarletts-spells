"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import { completeDailySpellingPracticeItems } from "@/lib/writing-practice/daily-spelling-practice-completion";

function readRequiredFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function completeDailySpellingPracticeAction(formData: FormData) {
  const mode = readRequiredFormValue(formData, "mode");
  const childId = readRequiredFormValue(formData, "childId");
  const dailyAssignmentId = readRequiredFormValue(formData, "dailyAssignmentId");
  const practiceDate = readRequiredFormValue(formData, "practiceDate") ?? getDateOnly();
  const fallbackChildId = childId ?? (await getActiveChildIdFromCookies());
  const redirectPath = buildScopedPath(
    "/learn/week/practice",
    fallbackChildId,
    "child",
  );

  if (mode !== "child" || !childId || !dailyAssignmentId) {
    redirect(redirectPath);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(children, childId);

  if (!selectedChild) {
    redirect(buildScopedPath("/learn/week", fallbackChildId, "child"));
  }

  await completeDailySpellingPracticeItems({
    supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
    dailyAssignmentId,
    practiceDate,
  });

  revalidatePath("/learn/week");
  revalidatePath("/learn/week/practice");
  redirect(buildScopedPath("/learn/week/practice", selectedChild.id, "child"));
}
