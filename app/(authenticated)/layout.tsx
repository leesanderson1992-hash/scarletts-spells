import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { isAdminUser } from "@/lib/admin/access";
import { getAuthenticatedContext } from "@/lib/authenticated-context";
import { getActiveChildIdFromCookies, selectChildById } from "@/lib/children";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, children: childRows } = await getAuthenticatedContext();
  if (!user) redirect("/login");
  const cookieChildId = await getActiveChildIdFromCookies();
  const availableChildren = childRows.filter((child) => !child.is_archived);
  const selected = selectChildById(availableChildren, cookieChildId);
  return <Suspense fallback={<div className="app-shell-loading" aria-busy="true">Loading Scarlett Spells…</div>}>
    <AppShell currentPath="/" mode="parent" activeChildId={selected?.id ?? null}
      availableChildren={availableChildren} userEmail={user.email} showAdminNav={isAdminUser(user)}>
      {children}
    </AppShell>
  </Suspense>;
}
