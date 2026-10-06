import Link from "next/link";
import { cache, Suspense } from "react";

import { buildReviewQueueThreads } from "@/app/courses/review/review-utils";
import { DashboardCard, EmptyState, ErrorCard, ProgressBar, SkeletonCard } from "@/components/ui/parent-primitives";
import { loadParentAdleTodayStatuses } from "@/lib/adle/today-assignment-service";
import { buildScopedPath } from "@/lib/children";
import { getCourseTaskProgressState } from "@/lib/courses/progress";
import { getCoursesForChild } from "@/lib/courses/queries";
import { earnedCoinsByChild, londonDateKey, type CoinEvent, type DedicationPeriod } from "@/lib/dashboard/dedication";
import { createClient } from "@/lib/supabase/server";
import { TodaysAdleSection, type TodayAdleChildRow } from "./todays-adle-section";
import { DashboardChildSelector } from "./dashboard-child-selector";

type Child = { id: string; first_name: string; last_name: string | null };
type Props = { parentId: string; parentName: string; childOptions: Child[]; selectedChildId: string | null; allChildren: boolean; period: DedicationPeriod };
type ActivityRow = { child_id: string; task_id: string; day: string };

function name(child: Child) { return [child.first_name, child.last_name].filter(Boolean).join(" "); }
function childIds(childOptions: Child[], selectedChildId: string | null, allChildren: boolean) {
  return (allChildren ? childOptions : childOptions.filter((child) => child.id === selectedChildId)).map((child) => child.id);
}
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
const loadLedger = cache(async (parentId: string, idsCsv: string): Promise<CoinEvent[]> => {
  const ids = idsCsv.split(",").filter(Boolean);
  if (!ids.length) return [];
  const supabase = await createClient();
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 6);
  start.setUTCDate(start.getUTCDate() - 2);
  const rows: CoinEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("child_gold_coin_ledger_events")
      .select("child_id, event_type, amount, created_at").eq("parent_user_id", parentId)
      .in("child_id", ids).gte("created_at", start.toISOString())
      .order("created_at", { ascending: false }).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...((data ?? []) as CoinEvent[]));
    if (!data || data.length < 500) break;
  }
  return rows;
});
const loadActivity = cache(async (parentId: string, idsCsv: string): Promise<ActivityRow[]> => {
  const ids = idsCsv.split(",").filter(Boolean);
  if (!ids.length) return [];
  const supabase = await createClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 31);
  const [completions, submissions] = await Promise.all([
    supabase.from("task_completions").select("child_id, task_id, completion_date")
      .eq("parent_user_id", parentId).in("child_id", ids).gte("completion_date", since.toISOString().slice(0, 10)),
    supabase.from("task_submissions").select("child_id, task_id, submitted_at")
      .eq("parent_user_id", parentId).in("child_id", ids).gte("submitted_at", since.toISOString()),
  ]);
  if (completions.error || submissions.error) throw completions.error ?? submissions.error;
  const unique = new Map<string, ActivityRow>();
  for (const row of completions.data ?? []) {
    const activity = { child_id: row.child_id, task_id: row.task_id, day: row.completion_date };
    unique.set(activity.child_id + ":" + activity.task_id + ":" + activity.day, activity);
  }
  for (const row of submissions.data ?? []) {
    const activity = { child_id: row.child_id, task_id: row.task_id, day: londonDateKey(row.submitted_at) };
    unique.set(activity.child_id + ":" + activity.task_id + ":" + activity.day, activity);
  }
  return [...unique.values()];
});
function weekStart(now = new Date()) {
  const today = londonDateKey(now);
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
function recentDays(count: number) {
  const today = londonDateKey(new Date());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - (count - index - 1));
    return date.toISOString().slice(0, 10);
  });
}
function streak(days: Set<string>) {
  const dates = recentDays(31).reverse();
  let count = 0;
  for (let index = 0; index < dates.length; index++) {
    if (index === 0 && !days.has(dates[index])) continue;
    if (!days.has(dates[index])) break;
    count++;
  }
  return count === 31 ? "31+" : String(count);
}

async function loadSafely<T>(label: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error("[parent-dashboard] " + label, error);
    return null;
  }
}

async function HeroMetrics({ parentId, ids, allChildren }: { parentId: string; ids: string[]; allChildren: boolean }) {
  const result = await loadSafely("hero metrics", async () => {
    const [activity, ledger] = await Promise.all([loadActivity(parentId, ids.join(",")), loadLedger(parentId, ids.join(","))]);
    const recent = activity.filter((row) => row.day >= weekStart());
    const coins = [...earnedCoinsByChild(ledger, "week").values()].reduce((sum, value) => sum + value, 0);
    const days = new Set(activity.map((row) => row.day));
    return <div className="parent-hero-metrics">
      <span><strong>{recent.length}</strong> course activities this week</span>
      <span><strong>{coins}</strong> coins earned this week</span>
      {!allChildren ? <span><strong>{streak(days)}</strong> day streak</span> : null}
    </div>;
  });
  return result ?? <p className="parent-muted" role="alert">Activity summary is temporarily unavailable.</p>;
}

async function ReadyActions({ parentId, childOptions }: { parentId: string; childOptions: Child[] }) {
  const result = await loadSafely("ADLE actions", async () => {
    const supabase = await createClient();
    const statuses = await loadParentAdleTodayStatuses({
      userClient: supabase, parentUserId: parentId, childIds: childOptions.map((child) => child.id),
    });
    const byId = new Map(statuses.map((status) => [status.childId, status]));
    const rows: TodayAdleChildRow[] = childOptions.map((child) => {
      const status = byId.get(child.id);
      return { childId: child.id, childName: name(child), initialState:
        status?.state === "ready" && status.assignmentId && status.href
          ? { state: "ready", assignmentId: status.assignmentId, href: status.href }
          : status?.state === "completed" && status.assignmentId && status.href
            ? { state: "completed", assignmentId: status.assignmentId, href: status.href }
            : status?.state === "error" ? { state: "failed" } : { state: "empty" },
      };
    });
    return <div id="ready-for-you"><TodaysAdleSection rows={rows} /></div>;
  });
  return result ?? <ErrorCard title="Ready for you" />;
}

async function CurrentCourses({ parentId, childOptions, selectedChildId }: { parentId: string; childOptions: Child[]; selectedChildId: string | null }) {
  const result = await loadSafely("courses", async () => {
    const supabase = await createClient();
    const coursesByChild = await Promise.all(childOptions.map(async (child) => ({
      child, courses: await getCoursesForChild(supabase, parentId, child.id, { activeOnly: true }),
    })));
    const courses = coursesByChild.flatMap(({ child, courses }) => courses.map((course) => ({ ...course, child })));
    const ids = courses.map((course) => course.id);
    if (!ids.length) return <DashboardCard title={selectedChildId ? "Current courses" : "Children's current courses"} href={buildScopedPath("/courses", selectedChildId)}>
      <EmptyState>No active courses yet. Create a course to start tracking progress.</EmptyState>
    </DashboardCard>;
    const [modules, tasks, completions, submissions] = await Promise.all([
      supabase.from("course_modules").select("id, course_id, title, position").eq("parent_user_id", parentId).in("course_id", ids),
      supabase.from("course_tasks").select("id, course_id, module_id, position, task_type, monthly_goal_total, is_active").eq("parent_user_id", parentId).in("course_id", ids).eq("is_active", true),
      supabase.from("task_completions").select("task_id, course_id, completion_date, quantity_completed").eq("parent_user_id", parentId).in("course_id", ids),
      supabase.from("task_submissions").select("task_id, course_id, parent_review_status, parent_review_note").eq("parent_user_id", parentId).in("course_id", ids),
    ]);
    if (modules.error || tasks.error || completions.error || submissions.error) throw modules.error ?? tasks.error ?? completions.error ?? submissions.error;
    return <DashboardCard title={selectedChildId ? "Current courses" : "Children's current courses"} href={buildScopedPath("/courses", selectedChildId)}>
      <div className="parent-course-head"><span>Course</span><span>Current module</span><span>Progress</span></div>
      <div className="parent-course-list">{courses.slice(0, 4).map((course) => {
        const moduleOrder = new Map((modules.data ?? []).map((module) => [module.id, module.position]));
        const courseTasks = (tasks.data ?? []).filter((task) => task.course_id === course.id)
          .sort((left, right) => (moduleOrder.get(left.module_id) ?? 0) - (moduleOrder.get(right.module_id) ?? 0) || left.position - right.position);
        const states = courseTasks.map((task) => getCourseTaskProgressState(task, completions.data ?? [], submissions.data ?? []));
        const complete = states.filter((state) => state === "complete").length;
        const percent = courseTasks.length ? complete / courseTasks.length * 100 : 0;
        const nextTask = courseTasks.find((_, index) => states[index] !== "complete");
        const currentModule = (modules.data ?? []).find((module) => module.id === nextTask?.module_id)
          ?? (modules.data ?? []).find((module) => module.course_id === course.id);
        return <Link href={buildScopedPath("/courses/" + course.id, course.child.id)} key={course.id} className="parent-course-row">
          <span className="parent-course-name"><strong>{course.title}</strong>{selectedChildId ? null : <small>{name(course.child)}</small>}</span>
          <span className="parent-course-module">{currentModule?.title ?? (courseTasks.length ? "All modules complete" : "No module yet")}</span>
          <ProgressBar value={percent} label={course.title + " progress"} />
        </Link>;
      })}</div>
      {courses.length > 4 ? <p className="parent-course-more">{courses.length - 4} more active {courses.length - 4 === 1 ? "course" : "courses"} in View all</p> : null}
    </DashboardCard>;
  });
  return result ?? <ErrorCard title="Current courses" />;
}

async function Dedication({ parentId, childOptions, selectedChildId, period, allChildren }: {
  parentId: string; childOptions: Child[]; selectedChildId: string | null; period: DedicationPeriod; allChildren: boolean;
}) {
  const result = await loadSafely("dedication", async () => {
    const ids = childOptions.map((child) => child.id);
    const ledger = await loadLedger(parentId, ids.join(","));
    const totals = earnedCoinsByChild(ledger, period);
    const filters: Array<[DedicationPeriod, string]> = [["week", "This week"], ["month", "This month"], ["last-month", "Last month"], ["six-months", "Last 6 months"]];
    const selected = childOptions.find((child) => child.id === selectedChildId);
    const activity = selected && !allChildren ? await loadActivity(parentId, selected.id) : [];
    const days = new Set(activity.map((row) => row.day));
    return <DashboardCard title={allChildren ? "Your children's dedication" : "This week"}>
      {allChildren ? <><div className="parent-filter" role="group" aria-label="Dedication period">{filters.map(([key, label]) =>
        <Link key={key} aria-current={period === key ? "true" : undefined} href={"/dashboard?scope=all&period=" + key}>{label}</Link>
      )}</div><div className="parent-dedication-list">{childOptions.map((child) =>
        <div key={child.id}><span>{name(child)}</span><strong>{totals.get(child.id) ?? 0} coins</strong></div>
      )}</div></> : selected ? <>
        <div className="parent-week-stats"><span><strong>{streak(days)}</strong> day streak</span><span><strong>{earnedCoinsByChild(ledger, "week").get(selected.id) ?? 0}</strong> coins earned</span></div>
        <div className="parent-week-days" aria-label="Activity in the last seven days">{recentDays(7).map((day) =>
          <div key={day} title={day}><span className={days.has(day) ? "is-active" : ""}>{days.has(day) ? "✓" : "·"}</span><small>{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"))}</small></div>
        )}</div>
      </> : <EmptyState>Choose a child to see activity.</EmptyState>}
    </DashboardCard>;
  });
  return result ?? <ErrorCard title="Dedication" />;
}

async function Reviews({ parentId, childOptions, selectedChildId }: { parentId: string; childOptions: Child[]; selectedChildId: string | null }) {
  const result = await loadSafely("reviews", async () => {
    const ids = childOptions.map((child) => child.id);
    if (!ids.length) return <DashboardCard title="Waiting for your review"><EmptyState>No work to review yet.</EmptyState></DashboardCard>;
    const supabase = await createClient();
    const { data, error } = await supabase.from("task_submissions")
      .select("id, task_id, course_id, child_id, submission_text, submitted_at, created_at, parent_review_status")
      .eq("parent_user_id", parentId).in("child_id", ids).order("submitted_at", { ascending: false }).limit(300);
    if (error) throw error;
    const returnedTasks = new Set((data ?? []).filter((row) => row.parent_review_status === "returned").map((row) => row.task_id));
    const threads = buildReviewQueueThreads((data ?? []).map((row) => ({
      ...row, parent_review_status: row.parent_review_status as "pending" | "approved" | "returned",
      hasActionableReturnedIssueHistory: false, hasReturnedSubmissionHistory: returnedTasks.has(row.task_id),
    }))).filter((thread) => thread.isActionable).slice(0, 2);
    const taskIds = [...new Set(threads.map((thread) => thread.latestSubmission.task_id))];
    const courseIds = [...new Set(threads.map((thread) => thread.latestSubmission.course_id))];
    const [tasks, courses] = taskIds.length ? await Promise.all([
      supabase.from("course_tasks").select("id, title").eq("parent_user_id", parentId).in("id", taskIds),
      supabase.from("courses").select("id, title").eq("parent_user_id", parentId).in("id", courseIds),
    ]) : [{ data: [] }, { data: [] }];
    const taskNames = new Map((tasks.data ?? []).map((row) => [row.id, row.title]));
    const courseNames = new Map((courses.data ?? []).map((row) => [row.id, row.title]));
    return <DashboardCard title="Waiting for your review" href={buildScopedPath("/courses/review", selectedChildId)}>
      {threads.length ? <div className="parent-review-list">{threads.map((thread) => {
        const item = thread.latestSubmission;
        const child = childOptions.find((row) => row.id === item.child_id);
        return <article key={item.id} className="parent-review-item">
          <div><small>{courseNames.get(item.course_id) ?? "Course"}{child ? " · " + name(child) : ""}</small>
            <h3>{taskNames.get(item.task_id) ?? "Submitted work"}</h3>
            <p>Submitted {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(item.submitted_at))}</p>
            {item.submission_text?.trim() ? <blockquote>{item.submission_text.trim().slice(0, 110)}{item.submission_text.trim().length > 110 ? "…" : ""}</blockquote> : null}
          </div>
          <Link href={buildScopedPath("/courses/review/" + item.id, item.child_id)} className="brand-secondary-btn">Review</Link>
        </article>;
      })}</div> : <EmptyState>Nothing is waiting for review right now.</EmptyState>}
    </DashboardCard>;
  });
  return result ?? <ErrorCard title="Waiting for your review" />;
}

async function Insight({ parentId, child }: { parentId: string; child: Child | null }) {
  if (!child) return <DashboardCard title="What Scarlett Spells noticed"><EmptyState>Select a child to see learning observations.</EmptyState></DashboardCard>;
  const result = await loadSafely("insight", async () => {
    const supabase = await createClient();
    const { data: sample, error } = await supabase.from("writing_samples")
      .select("id, title, created_at").eq("parent_user_id", parentId).eq("child_id", child.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!sample) return <DashboardCard title="What Scarlett Spells noticed"><EmptyState>Insights will appear after {name(child)} submits writing.</EmptyState></DashboardCard>;
    const { data: issues, error: issuesError } = await supabase.from("misspelling_instances")
      .select("error_type, is_false_positive").eq("parent_user_id", parentId).eq("child_id", child.id).eq("writing_sample_id", sample.id);
    if (issuesError) throw issuesError;
    const realIssues = (issues ?? []).filter((row) => !row.is_false_positive);
    const counts = new Map<string, number>();
    for (const issue of realIssues) if (issue.error_type) counts.set(issue.error_type, (counts.get(issue.error_type) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    return <DashboardCard title="What Scarlett Spells noticed" href={buildScopedPath("/insights", child.id)}>
      <p className="parent-insight">{realIssues.length
        ? name(child) + "'s latest writing sample has " + realIssues.length + " spelling item" + (realIssues.length === 1 ? "" : "s") + " flagged for review."
        : "No spelling issues were flagged in " + name(child) + "'s latest writing sample."}</p>
      {top ? <p className="parent-insight-focus">Most frequent recorded category: <strong>{top[0]}</strong> ({top[1]}). Review the evidence in Analytics.</p> : null}
    </DashboardCard>;
  });
  return result ?? <ErrorCard title="What Scarlett Spells noticed" />;
}

export function ParentDashboard({ parentId, parentName, childOptions, selectedChildId, allChildren, period }: Props) {
  const selected = childOptions.find((child) => child.id === selectedChildId) ?? null;
  const shown = allChildren ? childOptions : selected ? [selected] : [];
  const ids = childIds(childOptions, selectedChildId, allChildren);
  return <div className="parent-dashboard">
    <section className="parent-hero">
      <div className="parent-hero-copy">
        <p className="parent-eyebrow">Parent dashboard</p>
        <h1>{greeting()}, <span>{parentName}.</span></h1>
        <p>{allChildren ? "See what is ready across your family and how each child is progressing." : selected ? "See what is ready for " + name(selected) + " and how their projects are progressing." : "Add a child to get started."}</p>
      </div>
      {selected ? <Link href="#ready-for-you" className="brand-primary-btn">See {allChildren ? "today's" : name(selected) + "'s"} next action <span aria-hidden="true">→</span></Link> : null}
      {ids.length ? <Suspense fallback={<div className="parent-hero-metrics parent-muted">Loading activity…</div>}><HeroMetrics parentId={parentId} ids={ids} allChildren={allChildren} /></Suspense> : null}
    </section>
    {childOptions.length ? <DashboardChildSelector childOptions={childOptions} selectedChildId={selectedChildId} allChildren={allChildren} /> : null}
    {!childOptions.length ? <CreateChildPrompt /> : <div className="parent-dashboard-grid">
      <div className="parent-dashboard-zone zone-ready"><Suspense fallback={<SkeletonCard title="Ready for you loading" />}><ReadyActions parentId={parentId} childOptions={shown} /></Suspense></div>
      <div className="parent-dashboard-zone zone-courses"><Suspense fallback={<SkeletonCard title="Current courses loading" />}><CurrentCourses parentId={parentId} childOptions={shown} selectedChildId={allChildren ? null : selectedChildId} /></Suspense></div>
      <div className="parent-dashboard-zone zone-dedication"><Suspense fallback={<SkeletonCard title="Dedication loading" />}><Dedication parentId={parentId} childOptions={childOptions} selectedChildId={selectedChildId} period={period} allChildren={allChildren} /></Suspense></div>
      <div className="parent-dashboard-zone zone-reviews"><Suspense fallback={<SkeletonCard title="Reviews loading" />}><Reviews parentId={parentId} childOptions={shown} selectedChildId={allChildren ? null : selectedChildId} /></Suspense></div>
      <div className="parent-dashboard-zone zone-insight"><Suspense fallback={<SkeletonCard title="Insight loading" />}><Insight parentId={parentId} child={allChildren ? null : selected} /></Suspense></div>
    </div>}
  </div>;
}

function CreateChildPrompt() {
  return <DashboardCard title="Get started"><EmptyState>Add a child profile to see courses, reviews and next steps.</EmptyState><Link className="brand-primary-btn" href="/children">Add Child</Link></DashboardCard>;
}
