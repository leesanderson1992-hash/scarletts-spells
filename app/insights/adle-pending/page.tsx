import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ChildSwitcher } from "@/components/child-switcher";
import { PendingAdleLearningSection } from "@/components/pending-adle-learning-section";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { loadPendingAdleLearningForChild } from "@/lib/adle/loaders/pending-learning";
import { createClient } from "@/lib/supabase/server";

type PendingAdleQueuePageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  is_archived: boolean;
};

function getChildName(child: ChildRow) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

export default async function PendingAdleQueuePage({
  searchParams,
}: PendingAdleQueuePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const requestedMode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, is_archived")
    .eq("parent_user_id", user.id)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  const activeChildren = (children ?? []) as ChildRow[];

  if (activeChildren.length === 0) {
    return (
      <AppShell
        currentPath="/insights/adle-pending"
        mode="parent"
        activeChildId={null}
        availableChildren={[]}
        userEmail={user.email}
      >
        <div className="brand-page px-6 py-12">
          <div className="mx-auto w-full max-w-4xl">
            <section className="brand-card rounded-3xl p-6">
              <p className="brand-eyebrow">ADLE learning</p>
              <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
                Pending ADLE learning
              </h1>
              <p className="brand-copy mt-3 text-sm leading-6">
                Add an active child profile before viewing the ADLE learning queue.
              </p>
              <Link href="/insights" className="brand-secondary-btn mt-5">
                Back to Parent Insights
              </Link>
            </section>
          </div>
        </div>
      </AppShell>
    );
  }

  const selectedChild = selectChildById(
    activeChildren,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );
  if (!selectedChild) {
    redirect(buildScopedPath("/insights/adle-pending", activeChildren[0]?.id, "parent"));
  }

  if (requestedMode === "child") {
    redirect(buildScopedPath("/insights", selectedChild.id, "child"));
  }

  const pendingAdleLearning = await loadPendingAdleLearningForChild(selectedChild.id);

  return (
    <AppShell
      currentPath="/insights/adle-pending"
      mode="parent"
      activeChildId={selectedChild.id}
      availableChildren={activeChildren}
      userEmail={user.email}
    >
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="brand-eyebrow">ADLE learning</p>
                <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
                  Pending ADLE learning
                </h1>
                <p className="brand-copy mt-3 text-sm leading-6">
                  Every active unresolved spelling route for {getChildName(selectedChild)}.
                  Shared target words remain separate where they use different micro-skills.
                </p>
              </div>
              <ChildSwitcher
                activeChildId={selectedChild.id}
                childOptions={activeChildren}
                redirectPath="/insights/adle-pending"
              />
            </div>
            <Link
              href={buildScopedPath("/insights", selectedChild.id, "parent")}
              className="brand-secondary-btn mt-5"
            >
              Back to Parent Insights
            </Link>
          </section>

          <PendingAdleLearningSection
            result={pendingAdleLearning}
            queueHref={buildScopedPath("/insights/adle-pending", selectedChild.id, "parent")}
            showQueueLink={false}
          />
        </div>
      </div>
    </AppShell>
  );
}
