import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AdleSessionRunner } from "@/components/adle-session-runner";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import {
  getExistingAdleDailyPlanId,
  getAdleDailyPlanReadModel,
} from "@/lib/adle/loaders/daily-plan-surface";
import { getChildRewardReadModel } from "@/lib/rewards/read-model";
import {
  deriveAdleSessionCelebration,
  type AdleSessionCelebrationModel,
} from "@/lib/rewards/adle-session-celebration";
import { AdleSessionCelebration } from "@/components/adle/adle-session-celebration";

type AdleSessionPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
  }>;
};

// ADLE Slice 7P: the child-facing route is read-only. Explicit guarded
// generation creates the assignment before a child opens this page; loading
// this route must never create daily_assignments or assignment_items.
export default async function AdleSessionPage({ searchParams }: AdleSessionPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode ?? "child");
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );
  if (!selectedChild) {
    notFound();
  }

  const today = getDateOnly();

  let assignmentId: string | null = null;
  try {
    assignmentId = await getExistingAdleDailyPlanId({
      userClient: supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      planDate: today,
    });
  } catch (error) {
    console.error("[adle-session] assignment lookup failed", error);
  }

  const readModel = await getAdleDailyPlanReadModel({
    userClient: supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
    planDate: today,
    assignmentId,
  });

  const backPath = buildScopedPath("/learn/week", selectedChild.id, mode);

  // Slice 7a-D: on the completed screen, read the child's Word Treasure state and
  // derive today's celebration (Nugget->Forge from lesson completion + any
  // Golden Bar earned today). Read-model-driven (the completion redirect
  // revalidates this page); a failure falls back to the plain "all done" card.
  let celebration: AdleSessionCelebrationModel | null = null;
  if (readModel.state === "completed") {
    try {
      const fiveDayCutoff = new Date();
      fiveDayCutoff.setDate(fiveDayCutoff.getDate() - 5);
      const rewardReadModel = await getChildRewardReadModel({
        supabase,
        parentUserId: user.id,
        childId: selectedChild.id,
        todayDateOnly: today,
        lastFiveDaysSinceIso: fiveDayCutoff.toISOString(),
      });
      celebration = deriveAdleSessionCelebration(rewardReadModel.childWordTreasures, today);
    } catch (rewardError) {
      console.error("[adle-session] reward celebration read failed (plain completed card shown)", rewardError);
      celebration = null;
    }
  }

  return (
    <AppShell
      currentPath="/learn/week/adle"
      mode={mode}
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
      layout="focus"
    >
      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">ADLE spelling</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
            Today&apos;s spelling plan
          </h1>
          <p className="mt-1 text-sm text-[color:var(--mid)]">{readModel.planDate}</p>
          {resolvedSearchParams?.saved ? (
            <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {resolvedSearchParams.saved}
            </p>
          ) : null}
          {resolvedSearchParams?.error ? (
            <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {resolvedSearchParams.error}
            </p>
          ) : null}
          <Link
            href={backPath}
            className="mt-3 inline-flex h-8 items-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)]"
          >
            Back to my week
          </Link>
        </div>

        {readModel.state === "empty" ? (
          <div className="brand-card rounded-3xl p-4 md:p-5">
            <p className="text-sm text-[color:var(--mid)]">
              Today&apos;s spelling plan has not been set up yet. Check back after
              your grown-up has prepared it.
            </p>
          </div>
        ) : readModel.state === "completed" ? (
          celebration !== null ? (
            <AdleSessionCelebration
              model={celebration}
              planDate={readModel.planDate}
              backPath={backPath}
            />
          ) : (
            <div className="brand-card rounded-3xl p-4 md:p-5">
              <p className="text-sm text-emerald-700">
                Today&apos;s spelling plan is all done. See you tomorrow.
              </p>
            </div>
          )
        ) : (
          <AdleSessionRunner
            childId={selectedChild.id}
            assignmentId={readModel.assignmentId ?? ""}
            planDate={readModel.planDate}
            partOne={readModel.partOne}
            partTwo={readModel.partTwo}
          />
        )}
      </section>
    </AppShell>
  );
}
