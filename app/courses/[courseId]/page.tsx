import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SharedTaskCreatorForm } from "@/components/shared-task-creator-form";
import { TimedCheckpointCreatorForm } from "@/components/timed-checkpoint-creator-form";
import { FinalReviewAudit } from "@/app/courses/components/final-review-audit";
import { buildFinalReviewAuditViewModel } from "@/app/courses/components/final-review-view-model";
import { PhasedModuleOrderList } from "@/app/courses/components/phased-module-order-list";
import { StepThreeTaskTable } from "@/app/courses/components/step-three-task-table";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  formatCourseDate,
  getCurrentCycle,
  getCourseActivityForChild,
  getActiveChildrenForUser,
  getCycleDateRange,
  getCourseDetailForParent,
  getNextCheckpoint,
  getTimedPhaseDateRange,
  getTotalCycles,
} from "@/lib/courses/queries";
import {
  formatCourseGoalTarget,
  formatSuggestedPace,
  getCourseGoalGuidance,
} from "@/lib/courses/goals";
import { getParentCourseInsightSummary } from "@/lib/courses/insights";
import { getDateOnly, getModuleCompletionMap } from "@/lib/courses/progress";
import {
  buildTimedPhaseBackingModuleOptionValue,
  isTimedPhaseBackingModule,
} from "@/lib/courses/timed-phase-modules";
import {
  COURSE_TASK_TYPE_LABELS,
  COURSE_GOAL_STATUS_LABELS,
  getSharedCreatorModes,
  getTimedCourseGoalKind,
  normaliseCourseStructureType,
  type SharedTaskPlacementSelection,
  type StepThreeTaskTableRowViewModel,
  type StepThreeTaskTableViewModel,
  TIMED_COURSE_GOAL_KIND_LABELS,
  TIMED_COURSE_GOAL_KINDS,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";

import {
  createCoursePhase,
  createCourseGoal,
  createCourseCheckpoint,
  createModule,
  deleteCourseCheckpoint,
  deleteCourse,
  deleteModule,
  updateCourseParentVisibility,
  updateCourseCheckpoint,
  updateCourseGoal,
  updateCoursePhase,
  updateModule,
} from "../actions";
import {
  createFocusBlock,
  createTask,
  deleteFocusBlock,
  deleteTask,
} from "../module-authoring-actions";
import {
  reorderCourseCheckpointAction,
  reorderFocusBlockAction,
  reorderModuleAction,
  reorderTaskAction,
} from "../reorder-actions";

type CourseDetailPageProps = {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    edit?: string;
    editPhase?: string;
    editMission?: string;
    addGoal?: string;
    editGoal?: string;
    editCheckpoint?: string;
    step?: string;
  }>;
};

function withQuery(path: string, updates: Record<string, string | null | undefined>) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }

  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function normaliseWizardStep(value: string | undefined, maxStep: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 1;
  }

  return Math.min(Math.max(parsed, 1), maxStep);
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: CourseDetailPageProps) {
  const { courseId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const detail = await getCourseDetailForParent(supabase, user.id, courseId);

  if (!detail) {
    notFound();
  }

  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie ?? detail.course.child_id,
  );
  const courseActivity = await getCourseActivityForChild(
    supabase,
    detail.course.child_id,
    courseId,
  );
  const today = getDateOnly();
  const courseInsightSummary = getParentCourseInsightSummary(detail, courseActivity, today);
  const currentPath = `/courses/${courseId}`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const scopedCoursesPath = buildScopedPath("/courses", selectedChild?.id ?? null, mode);
  const stepThreePath = withQuery(scopedCurrentPath, { step: "3" });
  const editingModuleId = resolvedSearchParams?.edit ?? null;
  const editingPhaseId = resolvedSearchParams?.editPhase ?? null;
  const isEditingMission = resolvedSearchParams?.editMission === "true";
  const isAddingGoal = resolvedSearchParams?.addGoal === "true";
  const editingGoalId = resolvedSearchParams?.editGoal ?? null;
  const editingCheckpointId = resolvedSearchParams?.editCheckpoint ?? null;
  const courseStructure = normaliseCourseStructureType(detail.course.structure_type);
  const wizardSteps =
    courseStructure === "phased"
      ? ([
          { id: 1, label: "Phases" },
          { id: 2, label: "Modules" },
          { id: 3, label: "Lessons and activities" },
          { id: 4, label: "Phase review" },
          { id: 5, label: "Final review" },
        ] as const)
      : ([
          { id: 1, label: "Course goals" },
          { id: 2, label: "Cycles" },
          { id: 3, label: "Tasks" },
          { id: 4, label: "Checkpoints" },
          { id: 5, label: "Course overview" },
        ] as const);
  const activeStep = normaliseWizardStep(resolvedSearchParams?.step, wizardSteps.length);
  const contentStep =
    courseStructure === "phased"
      ? activeStep + 1
      : activeStep;
  const currentWizardPath = withQuery(scopedCurrentPath, { step: String(activeStep) });
  const checkpointStepPath = withQuery(scopedCurrentPath, {
    step: "4",
    editCheckpoint: null,
  });
  const totalCycles = getTotalCycles(
    detail.course.duration_weeks,
    detail.course.cycle_length_weeks,
  );
  const visibleTimedModules =
    courseStructure === "timed"
      ? detail.modules.filter((module) => !isTimedPhaseBackingModule(module))
      : detail.modules;
  const allTasks = detail.modules.flatMap((module) =>
    module.tasks.map((task) => ({
      ...task,
      moduleTitle: module.title,
      phaseTitle:
        detail.phases.find((phase) => phase.id === module.phase_id)?.title ?? null,
    })),
  );
  const recurringDailyTasks = allTasks.filter((task) => task.task_type === "recurring_daily");
  const recurringWeeklyTasks = allTasks.filter((task) => task.task_type === "recurring_weekly");
  const recurringGoalTasks = [...recurringDailyTasks, ...recurringWeeklyTasks];
  const goalTaskIdsByGoal = new Map<string, string[]>();
  detail.goalTaskSources.forEach((source) => {
    const existing = goalTaskIdsByGoal.get(source.goal_id) ?? [];
    goalTaskIdsByGoal.set(source.goal_id, [...existing, source.task_id]);
  });
  const currentCycle = getCurrentCycle(
    detail.course.start_date,
    detail.course.duration_weeks,
    detail.course.cycle_length_weeks,
  );
  const currentCycleRange = getCycleDateRange(
    detail.course.start_date,
    detail.course.cycle_length_weeks,
    currentCycle,
  );
  const nextCheckpoint = getNextCheckpoint(detail.checkpoints);
  const activeFocusBlock =
    detail.focusBlocks.find((focusBlock) =>
      currentCycle ? focusBlock.cycle_number === currentCycle : focusBlock.is_active,
    ) ?? detail.focusBlocks.find((focusBlock) => focusBlock.is_active) ?? null;
  const linkedFocusTasks = activeFocusBlock
    ? allTasks.filter((task) => task.focus_block_id === activeFocusBlock.id)
    : [];
  const modulePhaseOptions = detail.phases.map((phase) => ({
    ...phase,
    modules: detail.modules.filter((module) => module.phase_id === phase.id),
    checkpoints: detail.checkpoints.filter((checkpoint) => checkpoint.phase_id === phase.id),
  }));
  const phaseTitleById = new Map(modulePhaseOptions.map((phase) => [phase.id, phase.title]));
  const timedPhaseCards = detail.phases
    .slice(0, totalCycles ?? detail.phases.length)
    .map((phase, index) => ({
      ...phase,
      phaseNumber: index + 1,
      range: getTimedPhaseDateRange(
        detail.course.start_date,
        detail.course.duration_weeks,
        detail.course.cycle_length_weeks,
        index + 1,
      ),
      checkpoints: detail.checkpoints.filter((item) => item.cycle_number === index + 1),
      focusBlock: detail.focusBlocks.find((item) => item.cycle_number === index + 1) ?? null,
      isCurrent: currentCycle === index + 1,
    }));
  const timedPhaseTaskSections = timedPhaseCards.map((phase) => {
    const phaseModules = detail.modules.filter((module) => module.phase_id === phase.id);
    const phaseTasks = phaseModules.flatMap((module) =>
      module.tasks.map((task) => ({
        ...task,
        moduleId: module.id,
        moduleTitle: module.title,
      })),
    );
    const orderedItems: Array<
      | {
          kind: "task";
          id: string;
          position: number;
          task: (typeof phaseTasks)[number];
        }
      | {
          kind: "focus_block";
          id: string;
          position: number;
          focusBlock: NonNullable<typeof phase.focusBlock>;
          tasks: typeof phaseTasks;
        }
      | {
          kind: "checkpoint";
          id: string;
          scheduledDate: string | null;
          checkpoint: (typeof phase.checkpoints)[number];
        }
    > = [];

    let taskIndex = 0;
    while (taskIndex < phaseTasks.length) {
      const task = phaseTasks[taskIndex];

      if (task?.focus_block_id) {
        const groupedTasks: typeof phaseTasks = [];
        while (
          taskIndex < phaseTasks.length &&
          phaseTasks[taskIndex]?.focus_block_id === task.focus_block_id
        ) {
          groupedTasks.push(phaseTasks[taskIndex]!);
          taskIndex += 1;
        }

        const matchingFocusBlock = detail.focusBlocks.find((item) => item.id === task.focus_block_id);
        if (matchingFocusBlock) {
          orderedItems.push({
            kind: "focus_block",
            id: matchingFocusBlock.id,
            position: groupedTasks[0]?.position ?? Number.MAX_SAFE_INTEGER,
            focusBlock: matchingFocusBlock,
            tasks: groupedTasks,
          });
        } else {
          groupedTasks.forEach((groupTask) => {
            orderedItems.push({
              kind: "task",
              id: groupTask.id,
              position: groupTask.position,
              task: groupTask,
            });
          });
        }
        continue;
      }

      if (task) {
        orderedItems.push({
          kind: "task",
          id: task.id,
          position: task.position,
          task,
        });
      }
      taskIndex += 1;
    }

    phase.checkpoints.forEach((checkpoint) => {
      orderedItems.push({
        kind: "checkpoint",
        id: checkpoint.id,
        scheduledDate: checkpoint.scheduled_date,
        checkpoint,
      });
    });

    orderedItems.sort((left, right) => {
      if (left.kind === "checkpoint" && right.kind === "checkpoint") {
        const leftDate = left.scheduledDate ?? "9999-12-31";
        const rightDate = right.scheduledDate ?? "9999-12-31";
        if (leftDate !== rightDate) {
          return leftDate.localeCompare(rightDate);
        }
        return right.checkpoint.created_at.localeCompare(left.checkpoint.created_at);
      }

      if (left.kind === "checkpoint") {
        return 1;
      }

      if (right.kind === "checkpoint") {
        return -1;
      }

      return left.position - right.position;
    });

    return {
      ...phase,
      tasks: phaseTasks,
      orderedItems,
      recurringDailyTasks: phaseTasks.filter((task) => task.task_type === "recurring_daily"),
      recurringWeeklyTasks: phaseTasks.filter((task) => task.task_type === "recurring_weekly"),
      supportTasks: phaseTasks.filter(
        (task) => task.task_type !== "recurring_daily" && task.task_type !== "recurring_weekly",
      ),
    };
  });
  const phasedStepThreePlacement: SharedTaskPlacementSelection = {
    label: "Phase",
    moduleLabel: "Module",
    summaryLabel: `${detail.phases.length} phase${detail.phases.length === 1 ? "" : "s"}`,
    emptyGroupMessage: "Add a module to this phase first",
    groups: modulePhaseOptions.map((phase, index) => ({
      id: phase.id,
      label: `Phase ${index + 1} · ${phase.title}`,
      moduleOptions: phase.modules.map((module) => ({
        id: module.id,
        label: module.title,
      })),
    })),
  };
  const timedStepThreePlacement: SharedTaskPlacementSelection = {
    label: "Cycle",
    moduleLabel: "Module",
    summaryLabel: `${timedPhaseTaskSections.length} cycle${timedPhaseTaskSections.length === 1 ? "" : "s"}`,
    emptyGroupMessage: "No module choices are available for this cycle yet",
    groups: timedPhaseTaskSections.map((phase) => {
      const visibleModulesForPhase = visibleTimedModules.filter((module) => module.phase_id === phase.id);
      return {
        id: phase.id,
        label: `Cycle ${phase.phaseNumber}`,
        moduleOptions: [
          {
            id: buildTimedPhaseBackingModuleOptionValue(phase.id),
            label: "Cycle tasks",
          },
          ...visibleModulesForPhase.map((module) => ({
            id: module.id,
            label: module.title,
          })),
        ],
      };
    }),
  };
  const buildTaskTableRows = ({
    moduleId,
    tasks,
    focusBlocks,
  }: {
    moduleId: string;
    tasks: Array<(typeof detail.modules)[number]["tasks"][number]>;
    focusBlocks: typeof detail.focusBlocks;
  }): StepThreeTaskTableRowViewModel[] => {
    const rows: StepThreeTaskTableRowViewModel[] = [];
    let taskIndex = 0;

    while (taskIndex < tasks.length) {
      const task = tasks[taskIndex];

      if (task?.focus_block_id) {
        const groupedTasks: typeof tasks = [];
        while (taskIndex < tasks.length && tasks[taskIndex]?.focus_block_id === task.focus_block_id) {
          groupedTasks.push(tasks[taskIndex]!);
          taskIndex += 1;
        }

        const matchingFocusBlock = focusBlocks.find((item) => item.id === task.focus_block_id);
        if (matchingFocusBlock) {
          rows.push({
            kind: "focus_block",
            id: matchingFocusBlock.id,
            title: matchingFocusBlock.title,
            typeLabel: "Focus block",
            rewardAmount: matchingFocusBlock.gold_coin_reward_amount,
            editHref: withQuery(
              buildScopedPath(`/courses/${courseId}/modules/${moduleId}`, selectedChild?.id ?? null, mode),
              { editFocus: matchingFocusBlock.id },
            ),
            canMoveUp: false,
            canMoveDown: false,
          });
          continue;
        }

        groupedTasks.forEach((groupTask) => {
          rows.push({
            kind: "task",
            id: groupTask.id,
            title: groupTask.title,
            typeLabel: COURSE_TASK_TYPE_LABELS[groupTask.task_type],
            rewardAmount: groupTask.gold_coin_reward_amount,
            editHref: buildScopedPath(
              `/courses/${courseId}/modules/${moduleId}/tasks/${groupTask.id}/edit`,
              selectedChild?.id ?? null,
              mode,
            ),
            canMoveUp: false,
            canMoveDown: false,
          });
        });
        continue;
      }

      if (task) {
        rows.push({
          kind: "task",
          id: task.id,
          title: task.title,
          typeLabel: COURSE_TASK_TYPE_LABELS[task.task_type],
          rewardAmount: task.gold_coin_reward_amount,
          editHref: buildScopedPath(
            `/courses/${courseId}/modules/${moduleId}/tasks/${task.id}/edit`,
            selectedChild?.id ?? null,
            mode,
          ),
          canMoveUp: false,
          canMoveDown: false,
        });
      }

      taskIndex += 1;
    }

    return rows.map((row, index) => ({
      ...row,
      canMoveUp: index > 0,
      canMoveDown: index < rows.length - 1,
    }));
  };
  const phasedStepThreeTable: StepThreeTaskTableViewModel = {
    groupLabel: "Phase",
    moduleLabel: "Module",
    summaryLabel: `${allTasks.length} task${allTasks.length === 1 ? "" : "s"}`,
    emptyGroupMessage: "Add a phase first, then add modules and tasks here.",
    emptyModuleMessage: "Add a module to this phase first.",
    emptyRowMessage: "No tasks yet in this module. Add one above to confirm placement here.",
    groups: modulePhaseOptions.map((phase, index) => ({
      id: phase.id,
      title: `Phase ${index + 1} · ${phase.title}`,
      moduleCount: phase.modules.length,
      taskCount: phase.modules.reduce((sum, module) => sum + module.tasks.length, 0),
      modules: phase.modules.map((module) => ({
        id: module.id,
        title: module.title,
        taskCount: module.tasks.length,
        statusLabel: module.tasks.length > 0 ? "Ready" : "Needs tasks",
        rows: buildTaskTableRows({
          moduleId: module.id,
          tasks: module.tasks,
          focusBlocks: detail.focusBlocks.filter((item) => item.module_id === module.id),
        }),
      })),
    })),
  };
  const timedStepThreeTable: StepThreeTaskTableViewModel = {
    groupLabel: "Cycle",
    moduleLabel: "Module",
    summaryLabel: `${allTasks.length} task${allTasks.length === 1 ? "" : "s"}`,
    emptyGroupMessage: "Set up the course timing and cycles first, then add tasks here.",
    emptyModuleMessage: "No module choices are available for this cycle yet.",
    emptyRowMessage: "No tasks yet in this module. Add one above to confirm placement here.",
    groups: timedPhaseTaskSections.map((phase) => {
      const visibleModulesForPhase = visibleTimedModules.filter((module) => module.phase_id === phase.id);
      const backingModule = detail.modules.find(
        (module) => module.phase_id === phase.id && isTimedPhaseBackingModule(module),
      );
      const backingModuleId = backingModule?.id ?? `${phase.id}-general`;
      const backingTasks = backingModule?.tasks ?? [];
      const modules = [
        {
          id: backingModuleId,
          title: "Cycle tasks",
          taskCount: backingTasks.length,
          statusLabel: backingTasks.length > 0 ? "Ready" : "No tasks yet",
          rows: buildTaskTableRows({
            moduleId: backingModuleId,
            tasks: backingTasks,
            focusBlocks: detail.focusBlocks.filter((item) => item.module_id === backingModule?.id),
          }),
        },
        ...visibleModulesForPhase.map((module) => ({
          id: module.id,
          title: module.title,
          taskCount: module.tasks.length,
          statusLabel: module.tasks.length > 0 ? "Ready" : "Needs tasks",
          rows: buildTaskTableRows({
            moduleId: module.id,
            tasks: module.tasks,
            focusBlocks: detail.focusBlocks.filter((item) => item.module_id === module.id),
          }),
        })),
      ];

      return {
        id: phase.id,
        title: `Cycle ${phase.phaseNumber}`,
        detail: phase.range
          ? `${formatCourseDate(phase.range.start)} to ${formatCourseDate(phase.range.end)}`
          : "Date window appears once timing is set",
        moduleCount: modules.length,
        taskCount: modules.reduce((sum, module) => sum + module.taskCount, 0),
        isCurrent: phase.isCurrent,
        modules,
      };
    }),
  };
  const timedCheckpointOptions = timedPhaseCards.map((phase) => ({
    value: String(phase.phaseNumber),
    label: `Cycle ${phase.phaseNumber}`,
    endDate: phase.range?.end ?? "",
  }));
  const timedCheckpointRows = [...detail.checkpoints].sort((left, right) => {
    const leftCycle = left.cycle_number ?? Number.MAX_SAFE_INTEGER;
    const rightCycle = right.cycle_number ?? Number.MAX_SAFE_INTEGER;

    if (leftCycle !== rightCycle) {
      return leftCycle - rightCycle;
    }

    const leftDate = left.scheduled_date ?? "9999-12-31";
    const rightDate = right.scheduled_date ?? "9999-12-31";

    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    return right.created_at.localeCompare(left.created_at);
  });
  const finalReviewModel = buildFinalReviewAuditViewModel({
    detail,
    structureType: courseStructure,
    modulePhaseOptions,
    timedPhaseCards,
    timedPhaseTaskSections,
    nextCheckpoint,
    courseId,
    selectedChildId: selectedChild?.id ?? null,
    mode,
    scopedCurrentPath,
  });
  const moduleCompletionById = getModuleCompletionMap(
    detail.modules,
    courseActivity.completions,
    courseActivity.submissions,
  );
  const phasedModuleOrderGroups = modulePhaseOptions.map((phase) => ({
    id: phase.id,
    title: phase.title,
    description: phase.description,
    checkpointCount: phase.checkpoints.length,
    modules: phase.modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      taskCount: module.tasks.length,
      isComplete: moduleCompletionById.get(module.id) ?? false,
      isEditing: editingModuleId === module.id,
      editHref: buildScopedPath(
        `/courses/${courseId}/modules/${module.id}/edit`,
        selectedChild?.id ?? null,
        mode,
      ),
      openHref: buildScopedPath(
        `/courses/${courseId}/modules/${module.id}`,
        selectedChild?.id ?? null,
        mode,
      ),
      cancelEditHref: withQuery(currentWizardPath, { edit: null }),
    })),
  }));
  const timedGoalProgressById =
    courseInsightSummary.structureType === "timed"
      ? new Map(courseInsightSummary.goalProgress.map((goal) => [goal.goalId, goal]))
      : new Map();
  const mappedTimedGoalCount = detail.goals.filter((goal) => {
    const goalProgress = timedGoalProgressById.get(goal.id);
    return Boolean(goalProgress?.supported);
  }).length;
  const timedStepOneNextMove =
    detail.goals.length === 0
      ? "Add the first course goal."
      : mappedTimedGoalCount < detail.goals.length
        ? "Review or refine the course goals."
        : "Course goals look ready. Continue to cycles when you are ready.";
  return (
    <AppShell
      currentPath="/courses"
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-3">
        <div className="brand-card rounded-3xl p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-eyebrow">Course</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                {detail.course.title}
              </h1>
              {detail.course.description ? (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  {detail.course.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-1 flex-wrap items-start justify-end gap-2">
              {courseStructure === "phased" ? (
                <>
                  <div className="min-w-[220px] rounded-[1rem] border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                      Phases
                    </p>
                    <p className="text-[12px] leading-5 text-[color:var(--mid)]">
                      {detail.phases.length} planned
                    </p>
                  </div>
                  <div className="min-w-[250px] rounded-[1rem] border border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                      Modules
                    </p>
                    <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--mid)]">
                      {detail.modules.length} total · {detail.checkpoints.length} review point{detail.checkpoints.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-[220px] rounded-[1rem] border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                      Timing
                    </p>
                    <p className="text-[12px] leading-5 text-[color:var(--mid)]">
                      {detail.course.duration_weeks
                        ? `${detail.course.duration_weeks}-week course`
                        : "Duration not set"}
                    </p>
                  </div>
                  <div className="min-w-[250px] rounded-[1rem] border border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                      Current cycle
                    </p>
                    <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--mid)]">
                      {currentCycleRange
                        ? `${formatCourseDate(currentCycleRange.start)} to ${formatCourseDate(currentCycleRange.end)}`
                        : totalCycles
                          ? `About ${detail.course.cycle_length_weeks ?? 4} weeks each`
                          : "Dates pending"}
                    </p>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2 whitespace-nowrap">
              <form action={updateCourseParentVisibility} className="flex items-center">
                <input type="hidden" name="course_id" value={courseId} />
                <input type="hidden" name="redirect_path" value={currentWizardPath} />
                <input
                  type="hidden"
                  name="is_active"
                  value={detail.course.is_active ? "false" : "true"}
                />
                <button
                  type="submit"
                  className={`relative inline-flex h-10 w-24 items-center rounded-full border px-3 transition ${
                    detail.course.is_active
                      ? "border-emerald-200 bg-emerald-100"
                      : "border-[var(--border)] bg-[rgba(148,163,184,0.18)]"
                  }`}
                  title={
                    detail.course.is_active
                      ? `Deactivate ${detail.course.title} in parent view`
                      : `Activate ${detail.course.title} in parent view`
                  }
                  aria-label={
                    detail.course.is_active
                      ? `Deactivate ${detail.course.title} in parent view`
                      : `Activate ${detail.course.title} in parent view`
                  }
                  role="switch"
                  aria-checked={detail.course.is_active}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                      detail.course.is_active
                        ? "pr-7 text-emerald-800"
                        : "pl-7 text-[color:var(--mid)]"
                    }`}
                  >
                    {detail.course.is_active ? "Active" : "Hidden"}
                  </span>
                  <span
                    className={`absolute inline-block h-6 w-6 rounded-full bg-white shadow-sm transition ${
                      detail.course.is_active ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </form>
              <Link
                href={buildScopedPath(`/courses/${courseId}/edit`, selectedChild?.id ?? null, mode)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                title={`Edit ${detail.course.title}`}
                aria-label={`Edit ${detail.course.title}`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                </svg>
              </Link>
              <button
                type="submit"
                form="delete-course-detail-form"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                title={`Delete ${detail.course.title} forever`}
                aria-label={`Delete ${detail.course.title} forever`}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                    <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
            <div className="mt-3 grid gap-2">
              {resolvedSearchParams?.error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {resolvedSearchParams.error}
                </p>
              ) : null}

              {resolvedSearchParams?.saved ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                  Saved {resolvedSearchParams.saved}.
                </p>
              ) : null}
            </div>
          ) : null}

          <form id="delete-course-detail-form" action={deleteCourse} className="hidden">
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="redirect_path" value={scopedCoursesPath} />
          </form>

          {courseStructure === "phased" ? (
            <>
              <div className="mt-3 rounded-[1.2rem] border border-[var(--border)] bg-white px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {wizardSteps.map((step) => {
                      const done =
                        step.id === 1
                          ? detail.phases.length > 0
                          : step.id === 2
                            ? detail.modules.length > 0
                            : step.id === 3
                              ? allTasks.length > 0
                              : step.id === 4
                                ? Boolean(nextCheckpoint)
                                : false;

                      return (
                        <Link
                          key={step.id}
                          href={withQuery(scopedCurrentPath, { step: String(step.id) })}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            activeStep === step.id
                              ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.55)] text-[color:var(--ink)]"
                              : done
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                          }`}
                        >
                          {step.id}. {step.label}
                        </Link>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeStep > 1 ? (
                      <Link
                        href={withQuery(scopedCurrentPath, { step: String(activeStep - 1) })}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                        title="Previous step"
                        aria-label="Previous step"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                          <path d="M11.7 4.3a1 1 0 0 1 0 1.4L7.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z" />
                        </svg>
                      </Link>
                    ) : null}
                    {activeStep < wizardSteps.length ? (
                      <Link
                        href={withQuery(scopedCurrentPath, { step: String(activeStep + 1) })}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                        title="Next step"
                        aria-label="Next step"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                          <path d="M8.3 15.7a1 1 0 0 1 0-1.4L12.6 10 8.3 5.7a1 1 0 1 1 1.4-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z" />
                        </svg>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
              <div className="mt-3 rounded-[1.2rem] border border-[var(--border)] bg-white px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 md:justify-end">
                  {wizardSteps.map((step) => {
                    const done =
                      step.id === 1
                        ? detail.goals.length > 0
                        : step.id === 2
                          ? timedPhaseCards.length > 0
                          : step.id === 3
                            ? allTasks.length > 0
                            : step.id === 4
                              ? Boolean(nextCheckpoint)
                              : false;

                    return (
                      <Link
                        key={step.id}
                        href={withQuery(scopedCurrentPath, { step: String(step.id) })}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          activeStep === step.id
                            ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.55)] text-[color:var(--ink)]"
                            : done
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                        }`}
                      >
                        {step.id}. {step.label}
                      </Link>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  {activeStep > 1 ? (
                    <Link
                      href={withQuery(scopedCurrentPath, { step: String(activeStep - 1) })}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                      title="Previous step"
                      aria-label="Previous step"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                        <path d="M11.7 4.3a1 1 0 0 1 0 1.4L7.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z" />
                      </svg>
                    </Link>
                  ) : null}
                  {activeStep < wizardSteps.length ? (
                    <Link
                      href={withQuery(scopedCurrentPath, { step: String(activeStep + 1) })}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                      title="Next step"
                      aria-label="Next step"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                        <path d="M8.3 15.7a1 1 0 0 1 0-1.4L12.6 10 8.3 5.7a1 1 0 1 1 1.4-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z" />
                      </svg>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4">
          {contentStep === 1 ? (
          <section className="brand-card rounded-3xl p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  Set the course goals
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  Define the course outcome first. Course goals belong to overall course setup, not
                  to cycle setup.
                </p>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                Timed course
              </div>
            </div>

            <div className="mt-3 grid gap-2.5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Course goals
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {detail.goals.length} goal{detail.goals.length === 1 ? "" : "s"} set
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    {mappedTimedGoalCount} linked to shared progress
                  </p>
                </div>
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Goal tracking
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {recurringGoalTasks.length} recurring task{recurringGoalTasks.length === 1 ? "" : "s"} available
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    Tracking stays secondary until you intentionally open add or edit.
                  </p>
                </div>
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(252,228,244,0.18)] px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Best next move
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {timedStepOneNextMove}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Goal table
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--mid)]">
                      Review the course-level goals here. Add and edit stay hidden until you intentionally open them.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <details className="relative">
                      <summary
                        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                        title="Goal guidance"
                        aria-label="Goal guidance"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                          <path d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 5a1 1 0 0 0-1 1v.2a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 3a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1Z" />
                        </svg>
                      </summary>
                      <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[color:var(--mid)] shadow-sm">
                        Numerical goals work best when the target can later be linked to recurring daily or weekly tasks. Aspirations stay parent-reviewed and reflective. Checkpoints help you review progress, but they do not need to be fully planned in this step.
                      </div>
                    </details>
                    <Link
                      href={withQuery(currentWizardPath, {
                        addGoal: isAddingGoal ? null : "true",
                        editGoal: null,
                      })}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                      title={isAddingGoal ? "Close add goal" : "Add goal"}
                      aria-label={isAddingGoal ? "Close add goal" : "Add goal"}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                        <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
                      </svg>
                    </Link>
                  </div>
                </div>

                {detail.goals.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-[760px] w-full border-separate border-spacing-y-2 text-left">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                          <th className="px-3 pb-1">Goal</th>
                          <th className="px-3 pb-1">Type</th>
                          <th className="px-3 pb-1">Target</th>
                          <th className="px-3 pb-1">Tracking</th>
                          <th className="px-3 pb-1">Status</th>
                          <th className="px-3 pb-1 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.goals.map((goal) => {
                          const timedGoalKind = getTimedCourseGoalKind(goal);
                          const goalProgress = timedGoalProgressById.get(goal.id);
                          const mappedGoalTaskIds = goalTaskIdsByGoal.get(goal.id) ?? [];
                          const trackingLabel =
                            timedGoalKind === "aspiration"
                              ? "Manual review"
                              : goalProgress?.supported
                                ? `${mappedGoalTaskIds.length} linked · ${
                                    goalProgress.behindBy > 0 ? "Behind pace" : "On pace"
                                  }`
                                : mappedGoalTaskIds.length > 0
                                  ? `${mappedGoalTaskIds.length} linked`
                                  : "Needs mapping";

                          return (
                            <tr key={goal.id} className="rounded-2xl bg-[rgba(252,228,244,0.12)] text-sm text-[color:var(--ink)]">
                              <td className="rounded-l-2xl border border-r-0 border-[var(--border)] px-3 py-3">
                                <p className="font-semibold">{goal.title}</p>
                                {goal.success_description ? (
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--mid)]">
                                    {goal.success_description}
                                  </p>
                                ) : null}
                              </td>
                              <td className="border border-x-0 border-[var(--border)] px-3 py-3 text-xs text-[color:var(--mid)]">
                                {TIMED_COURSE_GOAL_KIND_LABELS[timedGoalKind]}
                              </td>
                              <td className="border border-x-0 border-[var(--border)] px-3 py-3 text-xs text-[color:var(--mid)]">
                                {timedGoalKind === "numerical"
                                  ? `${formatCourseGoalTarget(goal)}${
                                      goal.stretch_target ? ` · Stretch ${goal.stretch_target}` : ""
                                    }`
                                  : "Outcome in words"}
                              </td>
                              <td className="border border-x-0 border-[var(--border)] px-3 py-3 text-xs text-[color:var(--mid)]">
                                {trackingLabel}
                              </td>
                              <td className="border border-x-0 border-[var(--border)] px-3 py-3 text-xs text-[color:var(--mid)]">
                                {COURSE_GOAL_STATUS_LABELS[goal.status]}
                              </td>
                              <td className="rounded-r-2xl border border-l-0 border-[var(--border)] px-3 py-3">
                                <div className="flex justify-end gap-2">
                                  <details className="relative">
                                    <summary
                                      className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                      title={`Open details for ${goal.title}`}
                                      aria-label={`Open details for ${goal.title}`}
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                        <path d="M9 4a1 1 0 1 1 2 0v1.05a4.5 4.5 0 0 1 3.95 3.95H16a1 1 0 1 1 0 2h-1.05A4.5 4.5 0 0 1 11 14.95V16a1 1 0 1 1-2 0v-1.05A4.5 4.5 0 0 1 5.05 11H4a1 1 0 1 1 0-2h1.05A4.5 4.5 0 0 1 9 5.05V4Zm1 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
                                      </svg>
                                    </summary>
                                    <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)] shadow-sm">
                                      <p className="font-medium text-[color:var(--ink)]">
                                        {timedGoalKind === "numerical"
                                          ? formatSuggestedPace(
                                              getCourseGoalGuidance(goal, detail.course).recommended_daily_pace,
                                              "day",
                                            ) ??
                                            formatSuggestedPace(
                                              getCourseGoalGuidance(goal, detail.course).recommended_weekly_pace,
                                              "week",
                                            ) ??
                                            "No fixed pace needed"
                                          : "Parent-reviewed aspiration"}
                                      </p>
                                      <p className="mt-2 leading-6">
                                        {getCourseGoalGuidance(goal, detail.course).suggested_next_step}
                                      </p>
                                    </div>
                                  </details>
                                  <Link
                                    href={withQuery(currentWizardPath, {
                                      editGoal: editingGoalId === goal.id ? null : goal.id,
                                      addGoal: null,
                                    })}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                    title={`Edit ${goal.title}`}
                                    aria-label={`Edit ${goal.title}`}
                                  >
                                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                      <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                                    </svg>
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-4 py-4 text-sm text-[color:var(--mid)]">
                    <p className="font-medium text-[color:var(--ink)]">No course goals yet.</p>
                    <p className="mt-1">
                      Add the first numerical goal or aspiration before moving into cycles.
                    </p>
                  </div>
                )}

                {isAddingGoal ? (
                  <form
                    action={createCourseGoal}
                    className="mt-4 grid gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-4 py-4"
                  >
                    <input type="hidden" name="course_id" value={courseId} />
                    <input type="hidden" name="redirect_path" value={currentWizardPath} />
                    <input type="hidden" name="goal_scope" value="timed_course_goal" />
                    <input type="hidden" name="status" value="active" />
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                          Add goal
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--mid)]">
                          Add a course-level goal, then optionally open advanced tracking.
                        </p>
                      </div>
                      <Link
                        href={withQuery(currentWizardPath, { addGoal: null })}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                        title="Close add goal"
                        aria-label="Close add goal"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                          <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                        </svg>
                      </Link>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px_140px]">
                      <input
                        type="text"
                        name="title"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Course goal title"
                      />
                      <select
                        name="timed_goal_kind"
                        defaultValue="numerical"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                      >
                        {TIMED_COURSE_GOAL_KINDS.map((goalKind) => (
                          <option key={goalKind} value={goalKind}>
                            {TIMED_COURSE_GOAL_KIND_LABELS[goalKind]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        name="target_quantity"
                        min={1}
                        max={10000}
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Target"
                      />
                      <input
                        type="text"
                        name="unit"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Unit or measure"
                      />
                      <input
                        type="number"
                        name="stretch_target"
                        min={1}
                        max={10000}
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Stretch"
                      />
                    </div>
                    <textarea
                      name="success_description"
                      rows={2}
                      className="brand-input rounded-2xl px-4 py-3 text-sm"
                      placeholder="What should success look like, especially if this is an aspiration?"
                    />
                    <details className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                      <summary className="cursor-pointer list-none text-sm font-medium text-[color:var(--ink)]">
                        Advanced tracking
                      </summary>
                      <div className="mt-3 grid gap-2">
                        <p className="text-xs leading-5 text-[color:var(--mid)]">
                          Optional for numerical goals. Link recurring daily or weekly tasks only when this goal should use shared course pacing.
                        </p>
                        {recurringGoalTasks.length > 0 ? (
                          <div className="grid gap-2 md:grid-cols-2">
                            {recurringGoalTasks.map((task) => (
                              <label
                                key={task.id}
                                className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-3 py-3"
                              >
                                <input
                                  type="checkbox"
                                  name="goal_task_ids"
                                  value={task.id}
                                  className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)] focus:ring-[var(--scarlett)]"
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-[color:var(--ink)]">
                                    {task.title}
                                  </span>
                                  <span className="mt-1 block text-xs text-[color:var(--mid)]">
                                    {(courseStructure === "timed" ? task.phaseTitle : task.moduleTitle) ?? task.moduleTitle} · {task.task_type === "recurring_daily" ? "Daily" : "Weekly"}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[color:var(--mid)]">
                            Add recurring daily or weekly tasks first, then come back here if this goal should be mapped.
                          </p>
                        )}
                      </div>
                    </details>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                      >
                        Add goal
                      </button>
                    </div>
                  </form>
                ) : null}

                {editingGoalId
                  ? detail.goals
                      .filter((goal) => goal.id === editingGoalId)
                      .map((goal) => {
                        const timedGoalKind = getTimedCourseGoalKind(goal);
                        const goalProgress = timedGoalProgressById.get(goal.id);
                        const mappedGoalTaskIds = new Set(goalTaskIdsByGoal.get(goal.id) ?? []);
                        const guidance = getCourseGoalGuidance(goal, detail.course);

                        return (
                          <form
                            key={goal.id}
                            action={updateCourseGoal}
                            className="mt-4 grid gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[rgba(255,247,220,0.28)] px-4 py-4"
                          >
                            <input type="hidden" name="course_id" value={courseId} />
                            <input type="hidden" name="goal_id" value={goal.id} />
                            <input type="hidden" name="redirect_path" value={currentWizardPath} />
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                                  Edit goal
                                </p>
                                <p className="mt-1 text-sm text-[color:var(--mid)]">
                                  Refine the goal first. Open advanced tracking only if you need to adjust shared progress mapping.
                                </p>
                              </div>
                              <Link
                                href={withQuery(currentWizardPath, { editGoal: null })}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                title="Close edit goal"
                                aria-label="Close edit goal"
                              >
                                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                  <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                                </svg>
                              </Link>
                            </div>
                            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px_140px]">
                              <input
                                type="text"
                                name="title"
                                defaultValue={goal.title}
                                className="brand-input h-11 rounded-2xl px-4 text-sm"
                              />
                              <select
                                name="timed_goal_kind"
                                defaultValue={timedGoalKind}
                                className="brand-input h-11 rounded-2xl px-4 text-sm"
                              >
                                {TIMED_COURSE_GOAL_KINDS.map((goalKind) => (
                                  <option key={goalKind} value={goalKind}>
                                    {TIMED_COURSE_GOAL_KIND_LABELS[goalKind]}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                name="target_quantity"
                                min={1}
                                max={10000}
                                defaultValue={timedGoalKind === "numerical" ? goal.target_quantity : undefined}
                                className="brand-input h-11 rounded-2xl px-4 text-sm"
                                placeholder="Target"
                              />
                              <input
                                type="text"
                                name="unit"
                                defaultValue={goal.unit}
                                className="brand-input h-11 rounded-2xl px-4 text-sm"
                                placeholder="Unit or measure"
                              />
                              <input
                                type="number"
                                name="stretch_target"
                                min={1}
                                max={10000}
                                defaultValue={goal.stretch_target ?? undefined}
                                className="brand-input h-11 rounded-2xl px-4 text-sm"
                                placeholder="Stretch"
                              />
                            </div>
                            <textarea
                              name="success_description"
                              rows={2}
                              defaultValue={goal.success_description ?? ""}
                              className="brand-input rounded-2xl px-4 py-3 text-sm"
                              placeholder="What should success look like, especially if this is an aspiration?"
                            />
                            <details className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                              <summary className="cursor-pointer list-none text-sm font-medium text-[color:var(--ink)]">
                                Advanced tracking
                              </summary>
                              <div className="mt-3 grid gap-3">
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-3 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                                      Recommended shape
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                                      {guidance.recommended_task_type}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.3)] px-3 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                                      Suggested pace
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                                      {formatSuggestedPace(guidance.recommended_daily_pace, "day") ??
                                        formatSuggestedPace(guidance.recommended_weekly_pace, "week") ??
                                        "No fixed pace needed"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(236,253,245,0.3)] px-3 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                                      Tracking
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                                      {goalProgress?.supported
                                        ? `${(goalTaskIdsByGoal.get(goal.id) ?? []).length} linked tasks`
                                        : timedGoalKind === "aspiration"
                                          ? "Manual review"
                                          : "Needs mapping"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                                      Checkpoint suggestion
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                                      {guidance.suggested_checkpoint_frequency ?? "Every cycle and end of course"}
                                    </p>
                                  </div>
                                </div>
                                {recurringGoalTasks.length > 0 ? (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    {recurringGoalTasks.map((task) => (
                                      <label
                                        key={`${goal.id}-${task.id}`}
                                        className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-3 py-3"
                                      >
                                        <input
                                          type="checkbox"
                                          name="goal_task_ids"
                                          value={task.id}
                                          defaultChecked={mappedGoalTaskIds.has(task.id)}
                                          className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)] focus:ring-[var(--scarlett)]"
                                        />
                                        <span className="min-w-0">
                                          <span className="block text-sm font-medium text-[color:var(--ink)]">
                                            {task.title}
                                          </span>
                                          <span className="mt-1 block text-xs text-[color:var(--mid)]">
                                            {(courseStructure === "timed" ? task.phaseTitle : task.moduleTitle) ?? task.moduleTitle} · {task.task_type === "recurring_daily" ? "Daily" : "Weekly"}
                                          </span>
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-[color:var(--mid)]">
                                    Add recurring daily or weekly tasks first, then return here if this goal should be mapped.
                                  </p>
                                )}
                              </div>
                            </details>
                            <div className="flex justify-end">
                              <button
                                type="submit"
                                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                              >
                                Save goal
                              </button>
                            </div>
                          </form>
                        );
                      })
                  : null}
              </div>
            </div>
          </section>
          ) : null}

          {contentStep === 2 ? (
          <section className="brand-card rounded-3xl p-3.5">
            {courseStructure === "phased" ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Add the phases
                    </h2>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {detail.phases.length} phase{detail.phases.length === 1 ? "" : "s"}
                  </div>
                </div>

                <form action={createCoursePhase} className="mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  <input
                    type="text"
                    name="title"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Phase title"
                  />
                  <input
                    type="text"
                    name="description"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="What happens in this phase?"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                  >
                    Add phase
                  </button>
                </form>

                <div className="mt-3 grid gap-2">
                  {detail.phases.length > 0 ? (
                    detail.phases.map((phase) => {
                      const phaseModules = detail.modules.filter((module) => module.phase_id === phase.id);
                      return (
                        <div key={phase.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[color:var(--ink)]">{phase.title}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                                Phase
                              </span>
                              <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                              {phaseModules.length} module{phaseModules.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </div>
                          {phase.description ? (
                            <p className="mt-1 text-sm text-[color:var(--mid)]">{phase.description}</p>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                      No phases yet.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                        Set up the cycles
                      </h2>
                      <details className="relative">
                        <summary
                          className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] bg-white text-xs font-semibold text-[color:var(--mid)]"
                          aria-label="Cycle setup help"
                          title="Cycle setup help"
                        >
                          i
                        </summary>
                        <div className="absolute left-0 z-10 mt-2 w-72 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[color:var(--mid)] shadow-sm">
                          Cycles are the parent-facing structure for timed courses. Rename them if needed, then move on to task planning once the sequence feels right.
                        </div>
                      </details>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                      {timedPhaseCards.length} cycle{timedPhaseCards.length === 1 ? "" : "s"}
                    </div>
                    <Link
                      href={withQuery(currentWizardPath, {
                        editMission: isEditingMission ? null : "true",
                      })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                      title={isEditingMission ? "Close cycle focus" : "Edit cycle focus"}
                      aria-label={isEditingMission ? "Close cycle focus" : "Edit cycle focus"}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                        <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                      </svg>
                    </Link>
                  </div>
                </div>

                {timedPhaseCards.length > 0 ? (
                  <>
                    <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                      <div className="grid gap-2">
                        {timedPhaseCards.map((phase) => {
                          const isEditing = editingPhaseId === phase.id;
                          return (
                            <div
                              key={phase.id}
                              className={`rounded-2xl border px-3 py-3 ${
                                phase.isCurrent
                                  ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.22)]"
                                  : "border-[var(--border)] bg-[rgba(255,247,220,0.28)]"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-[color:var(--ink)]">
                                      Cycle {phase.phaseNumber}: {phase.title}
                                    </p>
                                    {phase.isCurrent ? (
                                      <span className="rounded-full border border-[var(--scarlett)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--scarlett)]">
                                        Current
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs text-[color:var(--mid)]">
                                    {phase.range
                                      ? `${formatCourseDate(phase.range.start)} to ${formatCourseDate(phase.range.end)}`
                                      : "Date window appears once the course timing is set"}
                                  </p>
                                  <p className="mt-2 text-xs text-[color:var(--mid)]">
                                    {phase.checkpoints.length} checkpoint{phase.checkpoints.length === 1 ? "" : "s"} · {phase.focusBlock ? phase.focusBlock.title : "No cycle focus set"}
                                  </p>
                                </div>
                                <Link
                                  href={withQuery(currentWizardPath, { editPhase: isEditing ? null : phase.id })}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                  title={isEditing ? "Stop editing cycle" : `Edit cycle ${phase.phaseNumber}`}
                                  aria-label={isEditing ? "Stop editing cycle" : `Edit cycle ${phase.phaseNumber}`}
                                >
                                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                    <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                                  </svg>
                                </Link>
                              </div>

                              {isEditing ? (
                                <form
                                  action={updateCoursePhase}
                                  className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"
                                >
                                  <input type="hidden" name="phase_id" value={phase.id} />
                                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                                  <input
                                    type="text"
                                    name="title"
                                    defaultValue={phase.title}
                                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                                    aria-label={`Title for cycle ${phase.phaseNumber}`}
                                  />
                                  <input
                                    type="text"
                                    name="description"
                                    defaultValue={phase.description ?? ""}
                                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                                    placeholder="Optional cycle note"
                                    aria-label={`Description for cycle ${phase.phaseNumber}`}
                                  />
                                  <button
                                    type="submit"
                                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-4 text-sm font-medium text-white transition hover:brightness-105"
                                  >
                                    Save cycle
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {isEditingMission ? (
                      <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                              Current cycle focus
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--mid)]">
                              This is optional. Use it when the current cycle needs one clear emphasis before you add or rebalance tasks.
                            </p>
                          </div>
                          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[color:var(--mid)]">
                            {linkedFocusTasks.length} linked task{linkedFocusTasks.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        {activeFocusBlock ? (
                          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-[color:var(--ink)]">{activeFocusBlock.title}</p>
                              {activeFocusBlock.cycle_number ? (
                                <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                                  Cycle {activeFocusBlock.cycle_number}
                                </span>
                              ) : null}
                            </div>
                            {activeFocusBlock.goal ? (
                              <p className="mt-2 text-sm text-[color:var(--ink)]">{activeFocusBlock.goal}</p>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-3 py-3">
                            <p className="text-sm text-[color:var(--mid)]">
                              No cycle focus yet. You only need one if this cycle needs a clear theme or short-term push.
                            </p>
                          </div>
                        )}

                        {!activeFocusBlock ? (
                          <form
                            action={createFocusBlock}
                            className="mt-3 grid gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-4 py-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_130px_auto]"
                          >
                            <input type="hidden" name="course_id" value={courseId} />
                            <input type="hidden" name="redirect_path" value={currentWizardPath} />
                            <input
                              type="text"
                              name="title"
                              className="brand-input h-11 rounded-2xl px-4 text-sm"
                              placeholder="Focus title"
                            />
                            <input
                              type="text"
                              name="goal"
                              className="brand-input h-11 rounded-2xl px-4 text-sm"
                              placeholder="What matters most this cycle?"
                            />
                            <input
                              type="number"
                              name="cycle_number"
                              min={1}
                              max={totalCycles ?? 52}
                              defaultValue={currentCycle ?? ""}
                              className="brand-input h-11 rounded-2xl px-4 text-sm"
                              placeholder="Cycle"
                            />
                            <button
                              type="submit"
                              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                            >
                              Save focus
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                    Set the course timing first so the timed cycles can be generated before you set the cycle rhythm.
                  </p>
                )}
              </>
            )}
          </section>
          ) : null}

          {contentStep === 3 ? (
          <section className="brand-card rounded-3xl p-3.5">
            {courseStructure === "phased" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Add modules inside the phases
                    </h2>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {detail.modules.length} module{detail.modules.length === 1 ? "" : "s"}
                  </div>
                </div>

                {detail.phases.length > 0 ? (
                  <>
                    <form action={createModule} className="mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.1fr)_auto]">
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="redirect_path" value={currentWizardPath} />
                      <select
                        name="phase_id"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        defaultValue={detail.phases[0]?.id ?? ""}
                      >
                        {detail.phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.title}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="title"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Module title"
                      />
                      <input
                        type="text"
                        name="description"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="What sits inside this module?"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                      >
                        Add module
                      </button>
                    </form>

                    <PhasedModuleOrderList
                      phases={phasedModuleOrderGroups}
                      currentWizardPath={currentWizardPath}
                      updateModuleAction={updateModule}
                      deleteModuleAction={deleteModule}
                      reorderModuleAction={reorderModuleAction}
                    />
                  </>
                ) : (
                  <p className="mt-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                    Add a phase first, then place modules into it here.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Manage tasks within the cycles
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                      Add a task, then verify and edit cycle tasks from the overview table below.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {allTasks.length} task{allTasks.length === 1 ? "" : "s"}
                  </div>
                </div>

                {timedStepThreePlacement.groups.length > 0 ? (
                  <>
                    <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                      <SharedTaskCreatorForm
                        action={createTask}
                        courseId={courseId}
                        placementSelection={timedStepThreePlacement}
                        redirectPath={stepThreePath}
                        creatorModes={getSharedCreatorModes(courseStructure)}
                        focusBlocks={detail.focusBlocks}
                        showFocusBlockField={detail.focusBlocks.length > 0}
                      />
                    </div>

                    <div className="mt-3">
                      <StepThreeTaskTable
                        model={timedStepThreeTable}
                        courseId={courseId}
                        redirectPath={stepThreePath}
                        reorderTaskAction={reorderTaskAction}
                        deleteTaskAction={deleteTask}
                        reorderFocusBlockAction={reorderFocusBlockAction}
                        deleteFocusBlockAction={deleteFocusBlock}
                      />
                    </div>
                  </>
                ) : (
                  <p className="mt-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                    Set up the course timing and cycles first, then add tasks from the shared composer.
                  </p>
                )}
              </>
            )}
          </section>
          ) : null}

          {contentStep === 4 ? (
          <section className="brand-card rounded-3xl p-3.5">
            {courseStructure === "phased" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Manage lessons and activities
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                      Add a task, then verify and edit placement from the overview table below.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {allTasks.length} task{allTasks.length === 1 ? "" : "s"}
                  </div>
                </div>

                {detail.modules.length > 0 ? (
                  <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                    <SharedTaskCreatorForm
                      action={createTask}
                      courseId={courseId}
                      placementSelection={phasedStepThreePlacement}
                      redirectPath={stepThreePath}
                      creatorModes={getSharedCreatorModes(courseStructure)}
                      focusBlocks={detail.focusBlocks}
                      showFocusBlockField={detail.focusBlocks.length > 0}
                    />
                  </div>
                ) : null}

                <div className="mt-3">
                  <StepThreeTaskTable
                    model={phasedStepThreeTable}
                    courseId={courseId}
                    redirectPath={stepThreePath}
                    reorderTaskAction={reorderTaskAction}
                    deleteTaskAction={deleteTask}
                    reorderFocusBlockAction={reorderFocusBlockAction}
                    deleteFocusBlockAction={deleteFocusBlock}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Add checkpoints
                    </h2>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {detail.checkpoints.length} checkpoint{detail.checkpoints.length === 1 ? "" : "s"}
                  </div>
                </div>

                {timedCheckpointOptions.length > 0 ? (
                  <TimedCheckpointCreatorForm
                    action={createCourseCheckpoint}
                    courseId={courseId}
                    redirectPath={checkpointStepPath}
                    cycleOptions={timedCheckpointOptions}
                    defaultCycleValue={currentCycle ? String(currentCycle) : timedCheckpointOptions[0]?.value}
                  />
                ) : (
                  <p className="mt-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                    Set the course timing first so the cycle dates are available before you add checkpoints.
                  </p>
                )}

                <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Scheduled checkpoints
                    </p>
                    <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[color:var(--mid)]">
                      {timedCheckpointRows.length} total
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {timedCheckpointRows.length > 0 ? (
                      timedCheckpointRows.map((checkpoint) => {
                        const isEditing = editingCheckpointId === checkpoint.id;
                        return (
                          <div
                            key={checkpoint.id}
                            className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.24)] px-3 py-3"
                          >
                            {isEditing ? (
                              <form action={updateCourseCheckpoint} className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_170px_minmax(0,1fr)_auto]">
                                <input type="hidden" name="checkpoint_id" value={checkpoint.id} />
                                <input type="hidden" name="redirect_path" value={checkpointStepPath} />
                                <input
                                  type="text"
                                  name="title"
                                  defaultValue={checkpoint.title}
                                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                                  aria-label={`Title for ${checkpoint.title}`}
                                />
                                <select
                                  name="cycle_number"
                                  defaultValue={String(checkpoint.cycle_number ?? currentCycle ?? timedCheckpointOptions[0]?.value ?? "")}
                                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                                  aria-label={`Cycle for ${checkpoint.title}`}
                                >
                                  {timedCheckpointOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="date"
                                  name="scheduled_date"
                                  defaultValue={checkpoint.scheduled_date ?? ""}
                                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                                  aria-label={`Date for ${checkpoint.title}`}
                                />
                                <input
                                  type="text"
                                  name="target"
                                  defaultValue={checkpoint.target ?? ""}
                                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                                  placeholder="Optional target"
                                  aria-label={`Target for ${checkpoint.title}`}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="submit"
                                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-4 text-sm font-medium text-white transition hover:brightness-105"
                                  >
                                    Save
                                  </button>
                                  <Link
                                    href={checkpointStepPath}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                    title="Stop editing checkpoint"
                                    aria-label="Stop editing checkpoint"
                                  >
                                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                      <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                                    </svg>
                                  </Link>
                                </div>
                              </form>
                            ) : (
                              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_180px_minmax(0,1fr)_88px_88px] lg:items-center">
                                <div>
                                  <p className="text-sm font-semibold text-[color:var(--ink)]">{checkpoint.title}</p>
                                </div>
                                <p className="text-sm text-[color:var(--mid)]">
                                  {checkpoint.cycle_number ? `Cycle ${checkpoint.cycle_number}` : "No cycle"}
                                </p>
                                <p className="text-sm text-[color:var(--mid)]">
                                  {checkpoint.scheduled_date
                                    ? formatCourseDate(checkpoint.scheduled_date)
                                    : "No date"}
                                </p>
                                <p className="text-sm text-[color:var(--mid)]">
                                  {checkpoint.target ?? "No target"}
                                </p>
                                <Link
                                  href={withQuery(checkpointStepPath, { editCheckpoint: checkpoint.id })}
                                  className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                >
                                  Edit
                                </Link>
                                <form action={deleteCourseCheckpoint}>
                                  <input type="hidden" name="checkpoint_id" value={checkpoint.id} />
                                  <input type="hidden" name="redirect_path" value={checkpointStepPath} />
                                  <button
                                    type="submit"
                                    className="inline-flex h-9 w-full items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                                  >
                                    Delete
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-[color:var(--mid)]">
                        No checkpoints scheduled yet.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
          ) : null}

          {contentStep === 5 ? (
          <section className="brand-card rounded-3xl p-3.5">
            {courseStructure === "phased" ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Add the review point
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                      Use review points at the end of a phase or a meaningful chunk of modules. Keep this as the running record of how the progress course is progressing.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {detail.checkpoints.length} checkpoint{detail.checkpoints.length === 1 ? "" : "s"}
                  </div>
                </div>

                <form action={createCourseCheckpoint} className="mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_220px_160px_auto]">
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  <input
                    type="text"
                    name="title"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Checkpoint title"
                  />
                  <select
                    name="phase_id"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    defaultValue={detail.phases[0]?.id ?? ""}
                    aria-label="Phase for this review point"
                  >
                    <option value="" disabled>
                      Choose phase
                    </option>
                    {detail.phases.map((phase, index) => (
                      <option key={phase.id} value={phase.id}>
                        {`Phase ${index + 1}: ${phase.title}`}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    name="scheduled_date"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                  >
                    Add checkpoint
                  </button>
                </form>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Next checkpoint
                    </p>
                    {nextCheckpoint ? (
                      <>
                        <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                          {nextCheckpoint.title}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--mid)]">
                          {nextCheckpoint.scheduled_date
                            ? formatCourseDate(nextCheckpoint.scheduled_date)
                            : "No date set yet"}
                        </p>
                        {nextCheckpoint.target ? (
                          <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                            {nextCheckpoint.target}
                          </p>
                        ) : null}
                        {nextCheckpoint.notes ? (
                          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                            {nextCheckpoint.notes}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-[color:var(--mid)]">
                        No review point yet. Add one when a phase or chunk is ready to be reviewed.
                      </p>
                    )}
                  </div>

                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      All review points
                    </p>
                    <div className="mt-3 grid gap-2">
                      {detail.checkpoints.length > 0 ? (
                        detail.checkpoints.map((checkpoint) => (
                          <div key={checkpoint.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.42)] px-3 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[color:var(--ink)]">
                                {checkpoint.title}
                              </p>
                              <span className="text-xs text-[color:var(--mid)]">
                                {checkpoint.scheduled_date
                                  ? formatCourseDate(checkpoint.scheduled_date)
                                  : "No date"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[color:var(--mid)]">
                              {phaseTitleById.get(checkpoint.phase_id ?? "")
                                ? `After ${phaseTitleById.get(checkpoint.phase_id ?? "")}`
                                : "Not linked to a phase yet"}
                            </p>
                            {checkpoint.target ? (
                              <p className="mt-1 text-sm text-[color:var(--mid)]">{checkpoint.target}</p>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[color:var(--mid)]">
                          No review points added yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <div className="mt-1">
                  <FinalReviewAudit
                    model={finalReviewModel}
                    reorderModuleAction={reorderModuleAction}
                    reorderTaskAction={reorderTaskAction}
                    reorderFocusBlockAction={reorderFocusBlockAction}
                    reorderCheckpointAction={reorderCourseCheckpointAction}
                  />
                </div>
              </>
            )}
          </section>
          ) : null}

          {contentStep === 6 && courseStructure === "phased" ? (
          <section className="brand-card rounded-3xl p-3.5">
            <p className="brand-eyebrow">Step {activeStep}</p>
            <div className="mt-1">
              <FinalReviewAudit
                model={finalReviewModel}
                reorderModuleAction={reorderModuleAction}
                reorderTaskAction={reorderTaskAction}
                reorderFocusBlockAction={reorderFocusBlockAction}
                reorderCheckpointAction={reorderCourseCheckpointAction}
              />
            </div>
          </section>
          ) : null}
        </div>

      </section>
    </AppShell>
  );
}
