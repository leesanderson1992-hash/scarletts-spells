import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { createClient } from "@/lib/supabase/server";

type SettingsPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();

  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, is_archived")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true });

  const activeChildren = (children ?? []).filter((child) => !child.is_archived);
  const selectedChild = selectChildById(
    activeChildren,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  return (
    <AppShell
      currentPath="/settings"
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={activeChildren}
      userEmail={user.email}
    >
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">Scarlett&apos;s Spells</p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Settings
            </h1>
            <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">
              Settings is in place as part of the new app shell. This will be the natural home
              for preferences and account controls once we expand beyond the MVP.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
