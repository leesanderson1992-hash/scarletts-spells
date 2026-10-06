import { redirect } from "next/navigation";

import { getAuthenticatedContext } from "@/lib/authenticated-context";
import { getActiveChildIdFromCookies, normaliseAppMode, selectChildById } from "@/lib/children";
import { LegacyInsightsPage } from "./legacy-page";
import { ParentInsights } from "./parent-insights";

type Props = { searchParams?: Promise<{ child?: string; mode?: string; saved?: string; error?: string }> };

export default async function InsightsPage(props: Props) {
  const params = await props.searchParams;
  if (normaliseAppMode(params?.mode) === "child") return LegacyInsightsPage(props);
  const { user, children } = await getAuthenticatedContext();
  if (!user) redirect("/login");
  const availableChildren = children.filter((child) => !child.is_archived);
  const selectedChild = selectChildById(
    availableChildren,
    params?.child ?? await getActiveChildIdFromCookies(),
  );
  return <ParentInsights child={selectedChild} childOptions={availableChildren} />;
}
