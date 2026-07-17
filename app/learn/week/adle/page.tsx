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
import { isAdminUser } from "@/lib/admin/access";
import {
  getExistingAdleDailyPlanId,
  getAdleDailyPlanReadModel,
} from "@/lib/adle/loaders/daily-plan-surface";
import { resolveAdlePlanDateOverride } from "@/lib/adle/session-date-override";
import {
  type AdleSessionCelebrationModel,
} from "@/lib/rewards/adle-session-celebration";
import { AdleSessionCelebration } from "@/components/adle/adle-session-celebration";
import { isMorphologyUnPilotEnabledForChild } from "@/lib/adle/morphology/pilot-access";
import { resolveMorphologyPilotRuntime } from "@/lib/adle/morphology/payload";
import { type ChildLearningReflection } from "@/lib/adle/morphology/reflections";
import { ClearCompletedMorphologyResume } from "@/components/adle/morphology/clear-completed-resume";
import { WordLabCompletionPerformanceObserver } from "@/components/adle/morphology/completion-performance-observer";
import { loadAdleCompletedRouteDetails } from "@/lib/adle/loaders/completed-route-loader";

type AdleSessionPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
    adleDate?: string;
    completionTrace?: string;
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

  const actualToday = getDateOnly();
  const planDate = resolveAdlePlanDateOverride({
    requestedDate: resolvedSearchParams?.adleDate,
    fallbackDate: actualToday,
    isAdmin: isAdminUser(user),
  });
  if (planDate === null) {
    notFound();
  }

  let assignmentId: string | null = null;
  try {
    assignmentId = await getExistingAdleDailyPlanId({
      userClient: supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      planDate,
    });
  } catch (error) {
    console.error("[adle-session] assignment lookup failed", error);
  }

  const readModel = await getAdleDailyPlanReadModel({
    userClient: supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
    planDate,
    assignmentId,
  });

  const backPath = buildScopedPath("/learn/week", selectedChild.id, mode);
  const morphologyPilotPayload = resolveMorphologyPilotRuntime(
    isMorphologyUnPilotEnabledForChild(selectedChild.id),
    readModel.partTwo.items,
  );

  // Slice 7a-D: on the completed screen, read the child's Word Treasure state and
  // derive today's celebration (Nugget->Forge from lesson completion + any
  // Golden Bar earned today). Read-model-driven (the completion redirect
  // revalidates this page); a failure falls back to the plain "all done" card.
  let celebration: AdleSessionCelebrationModel | null = null;
  let completedReflection: ChildLearningReflection | null = null;
  if (readModel.state === "completed") {
    const completedDetails = await loadAdleCompletedRouteDetails({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      assignmentId: readModel.assignmentId,
      planDate,
      traceId: resolvedSearchParams?.completionTrace,
    });
    celebration = completedDetails.celebration;
    completedReflection = completedDetails.reflection;
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
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)]"
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
          <div className="grid gap-4">
            {resolvedSearchParams?.completionTrace && /^[0-9a-f-]{36}$/i.test(resolvedSearchParams.completionTrace) ? <WordLabCompletionPerformanceObserver traceId={resolvedSearchParams.completionTrace} /> : null}
            {morphologyPilotPayload && readModel.assignmentId ? <ClearCompletedMorphologyResume assignmentId={readModel.assignmentId} contentVersion={morphologyPilotPayload.contentVersion} /> : null}
            {celebration !== null ? (
              <AdleSessionCelebration model={celebration} planDate={readModel.planDate} backPath={backPath} />
            ) : (
              <div className="brand-card rounded-3xl p-4 md:p-5"><p className="text-sm text-emerald-700">Today&apos;s spelling plan is all done. See you tomorrow.</p></div>
            )}
            {completedReflection ? (
              <section className="brand-card rounded-3xl p-4 md:p-5" aria-labelledby="completed-word-lab-reflection">
                <p className="brand-eyebrow">My Word Lab reflection</p>
                <h2 id="completed-word-lab-reflection" className="mt-1 text-lg font-semibold text-[color:var(--ink)]">What I noticed</h2>
                <p className="mt-2 text-sm text-[color:var(--mid)]">{completedReflection.promptText}</p>
                <blockquote className="mt-3 rounded-2xl bg-cyan-50 p-4 text-base leading-7 text-cyan-950">{completedReflection.reflectionText}</blockquote>
              </section>
            ) : null}
          </div>
        ) : (
          <AdleSessionRunner
            childId={selectedChild.id}
            assignmentId={readModel.assignmentId ?? ""}
            planDate={readModel.planDate}
            partOne={readModel.partOne}
            partTwo={readModel.partTwo}
            morphologyPilotPayload={morphologyPilotPayload}
          />
        )}
      </section>
    </AppShell>
  );
}
