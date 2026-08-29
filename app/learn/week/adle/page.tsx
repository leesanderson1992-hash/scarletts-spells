import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdlePlanHeader, AdleEmptyPlan, AdleReviewCompleteTransition } from "@/components/adle/adle-plan-presentation";
import { AppShell } from "@/components/app-shell";
import { AdleSessionRunner } from "@/components/adle-session-runner";
import {
  buildScopedPath,
  findChildById,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getLondonPracticeDate } from "@/lib/practice-date";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isAdminUser } from "@/lib/admin/access";
import {
  getExistingAdleSessionPlanId,
  getAdleDailyPlanReadModel,
} from "@/lib/adle/loaders/daily-plan-surface";
import { resolveAdlePlanDateOverride } from "@/lib/adle/session-date-override";
import {
  type AdleSessionCelebrationModel,
} from "@/lib/rewards/adle-session-celebration";
import { AdleSessionCelebration } from "@/components/adle/adle-session-celebration";
import { isDynamicPrefixRouteEnabled } from "@/lib/adle/morphology/dynamic-prefix-staging-access";
import { isDynamicPrefixQaAuthorizedForUser } from "@/lib/adle/morphology/dynamic-prefix-qa-access";
import { isDynamicSuffixRouteEnabled } from "@/lib/adle/morphology/dynamic-suffix-route-gate";
import { isBaseWordFamilyPilotEnabledForChild } from "@/lib/adle/morphology/base-word-family-pilot-access";
import { type ChildLearningReflection } from "@/lib/adle/morphology/reflections";
import { ClearCompletedMorphologyResume } from "@/components/adle/morphology/clear-completed-resume";
import { WordLabCompletionPerformanceObserver } from "@/components/adle/morphology/completion-performance-observer";
import { loadAdleCompletedRouteDetails } from "@/lib/adle/loaders/completed-route-loader";
import {
  emitLessonRouteResolutionEvent,
  resolvePersistedLessonRoute,
} from "@/lib/adle/composable-lesson/route-resolution";
import { databaseActivatedAssignmentRuntimeAllowed } from "@/lib/adle/loaders/curriculum-release-authority";
import {
  loadGenericV3Checkpoints,
  type GenericV3DurableCheckpoint,
} from "@/lib/adle/generic-v3-attempt-checkpoints";
import { loadAdleSpecialistCheckpointR6, loadAdleTodaySessionR6 } from "@/lib/adle/review-v3/r6-persistence";
import { ReviewR6Session } from "@/components/adle/review/review-r6-session";
import { continueAdleAfterReviewR6Action } from "./review-r6-actions";

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
  const selectedChild = resolvedSearchParams?.child
    ? findChildById(children, resolvedSearchParams.child)
    : selectChildById(children, activeChildIdFromCookie);
  if (!selectedChild) {
    notFound();
  }

  const actualToday = getLondonPracticeDate();
  const planDate = resolveAdlePlanDateOverride({
    requestedDate: resolvedSearchParams?.adleDate,
    fallbackDate: actualToday,
    isAdmin: isAdminUser(user),
    isStagingQa: isDynamicPrefixQaAuthorizedForUser(user),
  });
  if (planDate === null) {
    notFound();
  }

  const serviceClient = createServiceRoleClient();
  let r6Session = null;
  try {
    r6Session = await loadAdleTodaySessionR6({
      client: serviceClient,
      parentUserId: user.id,
      childId: selectedChild.id,
      assignmentDate: planDate,
    });
  } catch (r6Error) {
    console.error("[adle-session] R6 session resolution failed", r6Error);
  }

  let assignmentId: string | null = r6Session?.assignmentId ?? null;
  const resolvedPlanDate = r6Session?.assignmentDate ?? planDate;
  try {
    if (assignmentId === null) {
      assignmentId = await getExistingAdleSessionPlanId({
        userClient: supabase,
        parentUserId: user.id,
        childId: selectedChild.id,
        planDate: resolvedPlanDate,
      });
    }
  } catch (error) {
    console.error("[adle-session] assignment lookup failed", error);
  }

  const readModel = await getAdleDailyPlanReadModel({
    userClient: supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
    planDate: resolvedPlanDate,
    assignmentId,
  });

  const backPath = buildScopedPath("/learn/week", selectedChild.id, mode);
  const assignmentItems = [...readModel.partOne.items, ...readModel.partTwo.items]
    .sort((left, right) => left.position - right.position);
  const routeResolution = readModel.assignmentId && (!r6Session || r6Session.majorStage === "specialist_lesson")
    ? resolvePersistedLessonRoute({
        lessonRouteMetadata: readModel.lessonRouteMetadata,
        compiledLessonSnapshot: readModel.compiledLessonSnapshot,
        items: assignmentItems,
        runtimeContext: {
          dynamicPrefixEnabled: isDynamicPrefixRouteEnabled(),
          dynamicAffixEnabled: isDynamicSuffixRouteEnabled(),
          baseWordFamilyEnabled: isBaseWordFamilyPilotEnabledForChild(selectedChild.id),
        },
      })
    : null;
  let runtimeSafetyBlocked = readModel.assignmentId !== null &&
    !(await databaseActivatedAssignmentRuntimeAllowed({
      client: serviceClient,
      lessonRouteMetadata: readModel.lessonRouteMetadata,
      assignmentCompleted: readModel.state === "completed",
    }));
  let durableGenericV3Checkpoints: GenericV3DurableCheckpoint[] = [];
  const r6SpecialistCheckpoint = r6Session?.majorStage === "specialist_lesson" && readModel.assignmentId
    ? await loadAdleSpecialistCheckpointR6({ client: serviceClient, assignmentId: readModel.assignmentId })
    : null;
  if (readModel.assignmentId
    && readModel.genericSnapshotResolution?.status === "resolved"
    && readModel.genericSnapshotResolution.source === "snapshot_v3") {
    try {
      durableGenericV3Checkpoints = await loadGenericV3Checkpoints({
        client: serviceClient,
        readModel,
        parentUserId: user.id,
        childId: selectedChild.id,
        assignmentId: readModel.assignmentId,
      });
    } catch (checkpointError) {
      console.error("[adle-session] frozen v3 checkpoint resolution failed", checkpointError);
      runtimeSafetyBlocked = true;
    }
  }
  if (routeResolution) {
    emitLessonRouteResolutionEvent(
      routeResolution,
      readModel.assignmentGenerationSource,
    );
  }
  const resolvedContentVersion =
    routeResolution &&
    routeResolution.status !== "blocked" &&
    routeResolution.runtime.payload &&
    "contentVersion" in routeResolution.runtime.payload
      ? routeResolution.runtime.payload.contentVersion
      : null;
  const r6LessonFingerprint = r6Session?.specialist?.compiledLessonSnapshot
    && typeof r6Session.specialist.compiledLessonSnapshot === "object"
    && "provenance" in r6Session.specialist.compiledLessonSnapshot
    ? (r6Session.specialist.compiledLessonSnapshot as { provenance?: { sourceFingerprint?: string } }).provenance?.sourceFingerprint
    : undefined;

  // Slice 7a-D: on the completed screen, read the child's Word Treasure state and
  // derive today's celebration (Nugget->Forge from lesson completion + any
  // Golden Bar earned today). Read-model-driven (the completion redirect
  // revalidates this page); a failure falls back to the plain "all done" card.
  let celebration: AdleSessionCelebrationModel | null = null;
  let completedReflection: ChildLearningReflection | null = null;
  const sessionCompleted = r6Session?.majorStage === "session_complete" || readModel.state === "completed";
  if (sessionCompleted) {
    const completedDetails = await loadAdleCompletedRouteDetails({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      assignmentId: readModel.assignmentId,
      planDate: resolvedPlanDate,
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
        <AdlePlanHeader planDate={readModel.planDate} backPath={backPath} saved={resolvedSearchParams?.saved} error={resolvedSearchParams?.error} />

        {r6Session?.majorStage === "review" && r6Session.review ? (
          <ReviewR6Session
            assignmentId={r6Session.assignmentId ?? ""}
            reviewSessionId={r6Session.review.sessionId}
            snapshot={r6Session.review.snapshot}
          />
        ) : r6Session?.majorStage === "specialist_generation" && r6Session.review ? (
          <AdleReviewCompleteTransition>
            <form action={continueAdleAfterReviewR6Action} className="mt-5">
              <input type="hidden" name="assignmentId" value={r6Session.assignmentId ?? ""} />
              <input type="hidden" name="reviewSessionId" value={r6Session.review.sessionId} />
              <input type="hidden" name="snapshotFingerprint" value={r6Session.review.snapshot.provenance.sourceFingerprint} />
              <input type="hidden" name="childId" value={selectedChild.id} />
              <button type="submit" className="review-primary">Continue</button>
            </form>
          </AdleReviewCompleteTransition>
        ) : r6Session?.majorStage === "blocked" ? (
          <div className="adle-presentation review-scene rounded-3xl p-5" role="alert">
            <p className="review-eyebrow">Today&apos;s Lesson paused</p>
            <h2 className="mt-1 text-lg font-semibold">Your work is safe.</h2>
            <p className="mt-2 text-sm text-[color:var(--review-muted)]">A grown-up needs to check the next ADLE stage before you continue.</p>
            {r6Session.review?.complete ? (
              <form action={continueAdleAfterReviewR6Action} className="mt-4">
                <input type="hidden" name="assignmentId" value={r6Session.assignmentId ?? ""} />
                <input type="hidden" name="reviewSessionId" value={r6Session.review.sessionId} />
                <input type="hidden" name="snapshotFingerprint" value={r6Session.review.snapshot.provenance.sourceFingerprint} />
                <input type="hidden" name="childId" value={selectedChild.id} />
                <button type="submit" className="review-secondary">Try the next stage again</button>
              </form>
            ) : null}
          </div>
        ) : readModel.state === "empty" && !sessionCompleted ? (
          <AdleEmptyPlan />
        ) : sessionCompleted ? (
          <div className="grid gap-4">
            {resolvedSearchParams?.completionTrace && /^[0-9a-f-]{36}$/i.test(resolvedSearchParams.completionTrace) ? <WordLabCompletionPerformanceObserver traceId={resolvedSearchParams.completionTrace} /> : null}
            {resolvedContentVersion && readModel.assignmentId ? <ClearCompletedMorphologyResume assignmentId={readModel.assignmentId} contentVersion={resolvedContentVersion} /> : null}
            {celebration !== null ? (
              <AdleSessionCelebration model={celebration} planDate={readModel.planDate} backPath={backPath} />
            ) : (
              <div className="adle-presentation review-scene rounded-3xl p-4 md:p-5"><p className="text-sm text-emerald-200">Today&apos;s spelling plan is all done. See you tomorrow.</p></div>
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
          routeResolution?.status === "blocked" ||
          runtimeSafetyBlocked ||
          readModel.genericSnapshotResolution?.status === "blocked"
        ) ? (
          <div className="brand-card rounded-3xl p-4 md:p-5" role="alert">
            <p className="brand-eyebrow">Word Lab paused</p>
            <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
              This Word Lab needs a grown-up check before it can continue.
            </h2>
            <p className="mt-2 text-sm text-[color:var(--mid)]">
              Your work is safe. Please go back to your week and ask your grown-up for help.
            </p>
            <Link href={backPath} className="brand-primary-btn mt-4 inline-flex">
              Back to my week
            </Link>
          </div>
        ) : routeResolution ? (
          <AdleSessionRunner
            childId={selectedChild.id}
            assignmentId={readModel.assignmentId ?? ""}
            planDate={readModel.planDate}
            snapshotFingerprint={r6LessonFingerprint ?? (readModel.genericSnapshotResolution?.status === "resolved"
              ? readModel.genericSnapshotResolution.snapshot.provenance.sourceFingerprint
              : "compatibility")}
            durableGenericV3Enabled={readModel.genericSnapshotResolution?.status === "resolved"
              && readModel.genericSnapshotResolution.source === "snapshot_v3"}
            durableGenericV3Checkpoints={durableGenericV3Checkpoints}
            r6SpecialistCheckpoint={r6SpecialistCheckpoint}
            partOne={readModel.partOne}
            partTwo={readModel.partTwo}
            routeResolution={routeResolution}
          />
        ) : null}
      </section>
    </AppShell>
  );
}
