import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { createClient } from "@/lib/supabase/server";

type AssignmentsPageProps = {
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

type AssignmentRow = {
  id: string;
  title: string | null;
  instructions: string | null;
  focus_word: string | null;
  selected_family_slug: string | null;
  assignment_generation_source?: string | null;
  source_learning_item_ids?: string[] | null;
  target_words: string[] | null;
  review_words: string[] | null;
  status: string | null;
  assignment_date: string;
  session_completed_at: string | null;
  session_completed_words: number | null;
};

type CanonicalAssignmentLearningItemRow = {
  id: string;
  micro_skill_key: string;
  practice_route: string | null;
};

type CanonicalAssignmentCatalogRow = {
  micro_skill_key: string;
  display_name: string;
};

type LatestAssignmentDetails = {
  primaryDisplayName: string | null;
  isGroupedSetRoute: boolean;
};

function getChildName(child: ChildRow) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

function getCleanWords(words: string[] | null) {
  return Array.from(
    new Set((words ?? []).map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function getAssignmentStatusLabel(assignment: AssignmentRow) {
  if (assignment.session_completed_at) {
    return "Completed in practice";
  }

  if (assignment.status === "completed") {
    return "Completed";
  }

  if (assignment.status === "in_progress") {
    return "In progress";
  }

  return "Ready to practise";
}

function getAssignmentSourceLabel(assignment: AssignmentRow) {
  if (assignment.assignment_generation_source === "learning_items") {
    const linkedCount = assignment.source_learning_item_ids?.length ?? 0;
    return linkedCount > 1
      ? `Canonical · ${linkedCount} learning streams`
      : "Canonical · learning stream";
  }

  if (assignment.assignment_generation_source === "historical_pre_phase5") {
    return "Historic pre-Phase 5 assignment";
  }

  return "Needs manual verification";
}

function getAssignmentSourceSummary(assignment: AssignmentRow) {
  if (assignment.assignment_generation_source === "learning_items") {
    return "This assignment was generated from active canonical learning items and saved into the daily assignment delivery surface.";
  }

  if (assignment.assignment_generation_source === "historical_pre_phase5") {
    return "This assignment was saved before the final Phase 5 destructive cleanup pass completed.";
  }

  return "Assignment source needs manual verification.";
}

async function getLatestAssignmentDetails(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  assignment: AssignmentRow;
}) {
  if (input.assignment.assignment_generation_source !== "learning_items") {
    return {
      primaryDisplayName: null,
      isGroupedSetRoute: false,
    } satisfies LatestAssignmentDetails;
  }

  const sourceLearningItemIds = input.assignment.source_learning_item_ids ?? [];
  if (sourceLearningItemIds.length === 0) {
    return {
      primaryDisplayName: null,
      isGroupedSetRoute: false,
    } satisfies LatestAssignmentDetails;
  }

  const { data: linkedLearningItems } = await input.supabase
    .from("learning_items")
    .select("id, micro_skill_key, practice_route")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in("id", sourceLearningItemIds);

  const orderedLearningItems = sourceLearningItemIds
    .map((id) =>
      (linkedLearningItems ?? []).find(
        (item) => item.id === id,
      ) as CanonicalAssignmentLearningItemRow | undefined,
    )
    .filter((item): item is CanonicalAssignmentLearningItemRow => Boolean(item));

  const primaryLearningItem = orderedLearningItems[0] ?? null;
  if (!primaryLearningItem) {
    return {
      primaryDisplayName: null,
      isGroupedSetRoute: false,
    } satisfies LatestAssignmentDetails;
  }

  const { data: catalogRow } = await input.supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key, display_name")
    .eq("micro_skill_key", primaryLearningItem.micro_skill_key)
    .maybeSingle<CanonicalAssignmentCatalogRow>();

  return {
    primaryDisplayName: catalogRow?.display_name ?? null,
    isGroupedSetRoute: primaryLearningItem.practice_route === "grouped_set_practice",
  } satisfies LatestAssignmentDetails;
}

export default async function AssignmentsPage({
  searchParams,
}: AssignmentsPageProps) {
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

  if (mode === "child") {
    redirect(buildScopedPath("/learn/week", selectedChild?.id ?? null, mode));
  }

  if (!selectedChild && activeChildren.length > 0) {
    redirect(buildScopedPath("/assignments", activeChildren[0].id, mode));
  }

  // Transitional runtime read: assignments still render from daily_assignments,
  // but the saved rows can now identify whether the plan came from canonical
  // learning_items or the fenced legacy fallback path.
  const { data: assignments } = selectedChild
    ? await supabase
        .from("daily_assignments")
        .select(
          "id, title, instructions, focus_word, selected_family_slug, assignment_generation_source, source_learning_item_ids, target_words, review_words, status, assignment_date, session_completed_at, session_completed_words",
        )
        .eq("parent_user_id", user.id)
        .eq("child_id", selectedChild.id)
        .order("assignment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(12)
    : { data: [] };

  const latestAssignment = ((assignments ?? []) as AssignmentRow[])[0] ?? null;
  const assignmentHistory = ((assignments ?? []) as AssignmentRow[]).slice(1);
  const latestAssignmentDetails =
    selectedChild && latestAssignment
      ? await getLatestAssignmentDetails({
          supabase,
          parentUserId: user.id,
          childId: selectedChild.id,
          assignment: latestAssignment,
        })
      : null;

  return (
    <AppShell
      currentPath="/assignments"
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={activeChildren}
      userEmail={user.email}
    >
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="brand-eyebrow">Scarlett&apos;s Spells</p>
                <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
                  Assignments
                </h1>
                <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">
                  Daily spelling is now built automatically from active learning items for{" "}
                  {selectedChild ? getChildName(selectedChild) : "your child"}. Older legacy
                  assignment rows may still appear here as historical records, but new assignment
                  generation now follows the canonical learning-item path only. This page is best
                  used as a quiet reference view of recent assignment builds.
                </p>
              </div>
              {selectedChild ? (
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={buildScopedPath("/dashboard", selectedChild.id, mode)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                  >
                    Open dashboard
                  </Link>
                  <Link
                    href={buildScopedPath("/analyse/review", selectedChild.id, mode)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                  >
                    Review spellings
                  </Link>
                  <Link
                    href={buildScopedPath("/practice", selectedChild.id, mode)}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800"
                  >
                    Open practice
                  </Link>
                </div>
              ) : null}
            </div>
          </section>

          {!selectedChild ? (
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-zinc-600">
                Create or restore a child profile first so the spelling assignment flow knows who to plan for.
              </p>
            </section>
          ) : latestAssignment ? (
            <>
              <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="grid gap-1">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">
                      Workflow note
                    </p>
                    <p className="text-sm leading-6 text-amber-900">
                      Parents no longer need to manually generate today&apos;s spelling. Active
                      learning items now generate the daily set first, and the older word-level
                      review path only fills in when no truthful canonical assignment can yet be
                      built.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={buildScopedPath("/courses/review", selectedChild.id, mode)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-amber-300 px-4 text-sm font-medium text-amber-900 transition hover:border-amber-500"
                    >
                      Review submitted work
                    </Link>
                    <Link
                      href={buildScopedPath("/practice", selectedChild.id, mode)}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      Open practice
                    </Link>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="grid gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Latest assignment
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                      {latestAssignment.title ?? "Daily spelling practice"}
                    </h2>
                    <p className="text-sm leading-6 text-zinc-600">
                      Saved {formatDate(latestAssignment.assignment_date)}.{" "}
                      {latestAssignment.instructions ?? "This assignment is ready to use in practice."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                      {getAssignmentStatusLabel(latestAssignment)}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                      {getAssignmentSourceLabel(latestAssignment)}
                    </span>
                    {latestAssignment.selected_family_slug ? (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                        {latestAssignment.selected_family_slug}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Focus word
                    </p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950">
                      {latestAssignment.focus_word ?? "Not set"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Target words
                    </p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950">
                      {getCleanWords(latestAssignment.target_words).length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Review words
                    </p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950">
                      {getCleanWords(latestAssignment.review_words).length}
                    </p>
                  </div>
                  {latestAssignment.assignment_generation_source === "learning_items" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                        Canonical focus
                      </p>
                      <p className="mt-2 text-lg font-semibold text-zinc-950">
                        {latestAssignmentDetails?.primaryDisplayName ?? "Needs manual verification"}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Assignment source
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-700">
                      {getAssignmentSourceSummary(latestAssignment)}
                    </p>
                    {latestAssignment.assignment_generation_source === "learning_items" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                          {latestAssignmentDetails?.isGroupedSetRoute
                            ? "Grouped-set route"
                            : "Word-practice route"}
                        </span>
                        {latestAssignmentDetails?.primaryDisplayName ? (
                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                            {latestAssignmentDetails.primaryDisplayName}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Target words to teach
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {getCleanWords(latestAssignment.target_words).map((word) => (
                        <span
                          key={word}
                          className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Review words due
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {getCleanWords(latestAssignment.review_words).length > 0 ? (
                        getCleanWords(latestAssignment.review_words).map((word) => (
                          <span
                            key={word}
                            className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700"
                          >
                            {word}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">
                          No review words are due in this plan.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                      Assignment history
                    </h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      Recent spelling plans for {getChildName(selectedChild)}.
                    </p>
                  </div>
                </div>

                {assignmentHistory.length > 0 ? (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className="bg-zinc-50">
                        <tr className="text-left text-xs uppercase tracking-[0.16em] text-zinc-500">
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Focus</th>
                          <th className="px-4 py-3 font-medium">Family</th>
                          <th className="px-4 py-3 font-medium">Source</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 bg-white">
                        {assignmentHistory.map((assignment) => (
                          <tr key={assignment.id}>
                            <td className="px-4 py-3 text-zinc-700">
                              {formatDate(assignment.assignment_date)}
                            </td>
                            <td className="px-4 py-3 font-medium text-zinc-950">
                              {assignment.focus_word ?? "Not set"}
                            </td>
                            <td className="px-4 py-3 text-zinc-700">
                              {assignment.selected_family_slug ?? "Mixed / review"}
                            </td>
                            <td className="px-4 py-3 text-zinc-700">
                              {getAssignmentSourceLabel(assignment)}
                            </td>
                            <td className="px-4 py-3 text-zinc-700">
                              {getAssignmentStatusLabel(assignment)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-zinc-600">
                    There isn&apos;t any earlier assignment history yet.
                  </p>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                No assignment yet
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                The spelling loop becomes usable when this chain is complete:
                analyse writing, review the misses, generate an assignment, then open practice.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={buildScopedPath("/analyse", selectedChild.id, mode)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                >
                  Analyse writing
                </Link>
                <Link
                  href={buildScopedPath("/analyse/review", selectedChild.id, mode)}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800"
                >
                  Review spellings
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
