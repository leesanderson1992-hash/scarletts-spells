import { notFound, redirect } from "next/navigation";

import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";

type LearnWeekPracticePageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

// ADLE 7P: legacy Daily Practice is no longer the child-facing daily
// assignment path. Child traffic is redirected to the ADLE read-only session
// route; generation is explicit and guarded outside this page.
export default async function LearnWeekPracticePage({
  searchParams,
}: LearnWeekPracticePageProps) {
  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);

  if (mode !== "child") {
    redirect(buildScopedPath("/dashboard", resolvedSearchParams?.child, "parent"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    notFound();
  }

  redirect(buildScopedPath("/learn/week/adle", selectedChild.id, "child"));
}
