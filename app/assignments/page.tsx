import { redirect } from "next/navigation";

import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
} from "@/lib/children";

type AssignmentsPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

export default async function AssignmentsPage({
  searchParams,
}: AssignmentsPageProps) {
  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildId = await getActiveChildIdFromCookies();
  const childId = resolvedSearchParams?.child ?? activeChildId ?? null;
  const destination =
    mode === "child"
      ? buildScopedPath("/learn/week", childId, "child")
      : buildScopedPath("/dashboard", childId, "parent");

  redirect(destination);
}
