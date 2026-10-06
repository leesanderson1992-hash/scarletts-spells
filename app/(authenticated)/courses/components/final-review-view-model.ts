import { buildScopedPath, type AppMode } from "@/lib/children";
import { formatCourseDate } from "@/lib/courses/queries";
import type {
  CourseCheckpointRow,
  CourseDetail,
  CourseTaskRow,
  FinalReviewAuditViewModel,
  FinalReviewGapViewModel,
  FinalReviewGroupViewModel,
  FinalReviewItemViewModel,
  FocusBlockRow,
} from "@/lib/courses/types";

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

type ModulePhaseOptionInput = {
  id: string;
  title: string;
  description: string | null;
  modules: Array<{
    id: string;
    title: string;
    tasks: CourseTaskRow[];
  }>;
  checkpoints: CourseCheckpointRow[];
};

type TimedOrderedItemInput =
  | {
      kind: "task";
      id: string;
      position: number;
      task: CourseTaskRow;
    }
  | {
      kind: "focus_block";
      id: string;
      position: number;
      focusBlock: FocusBlockRow;
      tasks: CourseTaskRow[];
    }
  | {
      kind: "checkpoint";
      id: string;
      scheduledDate: string | null;
      checkpoint: CourseCheckpointRow;
    };

type TimedPhaseTaskSectionInput = {
  id: string;
  title: string;
  phaseNumber: number;
  range: { start: string; end: string } | null;
  checkpoints: CourseCheckpointRow[];
  focusBlock: FocusBlockRow | null;
  isCurrent: boolean;
  tasks: Array<CourseTaskRow & { moduleId: string; moduleTitle: string }>;
  orderedItems: TimedOrderedItemInput[];
};

function formatTaskTypeLabel(taskType: string) {
  return taskType.replaceAll("_", " ");
}

function buildTaskEditHref({
  courseId,
  moduleId,
  taskId,
  selectedChildId,
  mode,
}: {
  courseId: string;
  moduleId: string;
  taskId: string;
  selectedChildId: string | null;
  mode: AppMode;
}) {
  return buildScopedPath(
    `/courses/${courseId}/modules/${moduleId}/tasks/${taskId}/edit`,
    selectedChildId,
    mode,
  );
}

function buildModuleOpenHref({
  courseId,
  moduleId,
  selectedChildId,
  mode,
}: {
  courseId: string;
  moduleId: string;
  selectedChildId: string | null;
  mode: AppMode;
}) {
  return buildScopedPath(`/courses/${courseId}/modules/${moduleId}`, selectedChildId, mode);
}

function buildReviewGaps({
  structureType,
  detail,
  timedPhaseCount,
  nextCheckpoint,
  scopedCurrentPath,
}: {
  structureType: "phased" | "timed";
  detail: CourseDetail;
  timedPhaseCount: number;
  nextCheckpoint: CourseCheckpointRow | null;
  scopedCurrentPath: string;
}): FinalReviewGapViewModel[] {
  const gaps =
    structureType === "phased"
      ? [
          detail.phases.length === 0 ? { label: "Add at least one phase", step: 1 } : null,
          detail.modules.length === 0 ? { label: "Add modules inside the phases", step: 2 } : null,
          !nextCheckpoint ? { label: "Add a review point", step: 4 } : null,
        ]
      : [
          detail.goals.length === 0 ? { label: "Add at least one course goal", step: 1 } : null,
          timedPhaseCount === 0 ? { label: "Set timing so the cycles generate", step: 2 } : null,
          detail.modules.flatMap((module) => module.tasks).length === 0
            ? { label: "Add tasks to at least one cycle", step: 3 }
            : null,
          !nextCheckpoint ? { label: "Add one review checkpoint", step: 4 } : null,
        ];

  return gaps
    .filter((item): item is { label: string; step: number } => Boolean(item))
    .map((gap) => ({
      ...gap,
      href: withQuery(scopedCurrentPath, { step: String(gap.step) }),
    }));
}

function buildTimedReviewItems({
  orderedItems,
  courseId,
  selectedChildId,
  mode,
}: {
  orderedItems: TimedOrderedItemInput[];
  courseId: string;
  selectedChildId: string | null;
  mode: AppMode;
}): FinalReviewItemViewModel[] {
  return orderedItems.map((item, index) => {
    const canMoveUp = index > 0;
    const canMoveDown = index < orderedItems.length - 1;

    if (item.kind === "focus_block") {
      return {
        id: item.id,
        kind: "focus_block",
        title: item.focusBlock.title,
        badgeLabel: "Focus block",
        detail: item.focusBlock.goal ?? null,
        notes:
          item.tasks.length > 0
            ? item.tasks.map((task, taskIndex) => `${taskIndex + 1}. ${task.title}`).join(" · ")
            : "No mini tasks yet",
        stats: [`${item.tasks.length} task${item.tasks.length === 1 ? "" : "s"}`],
        canMoveUp,
        canMoveDown,
        moveEntityId: item.focusBlock.id,
        editHref: withQuery(
          buildScopedPath(`/courses/${courseId}/modules/${item.focusBlock.module_id ?? ""}`, selectedChildId, mode),
          { editFocus: item.focusBlock.id },
        ),
      };
    }

    if (item.kind === "task") {
      return {
        id: item.id,
        kind: "task",
        title: item.task.title,
        badgeLabel: formatTaskTypeLabel(item.task.task_type),
        detail: item.task.instructions,
        stats: [String(item.task.gold_coin_reward_amount)],
        canMoveUp,
        canMoveDown,
        moveEntityId: item.task.id,
        editHref: buildTaskEditHref({
          courseId,
          moduleId: item.task.module_id,
          taskId: item.task.id,
          selectedChildId,
          mode,
        }),
      };
    }

    return {
      id: item.id,
      kind: "checkpoint",
      title: item.checkpoint.title,
      badgeLabel: "Checkpoint",
      detail: item.checkpoint.scheduled_date ?? "No date",
      notes: item.checkpoint.target,
      stats: item.checkpoint.gold_coin_reward_amount > 0 ? [String(item.checkpoint.gold_coin_reward_amount)] : [],
      canMoveUp,
      canMoveDown,
      moveEntityId: item.checkpoint.id,
      editHref: withQuery(buildScopedPath(`/courses/${courseId}`, selectedChildId, mode), {
        step: "4",
        editCheckpoint: item.checkpoint.id,
      }),
    };
  });
}

export function buildFinalReviewAuditViewModel({
  detail,
  structureType,
  modulePhaseOptions,
  timedPhaseCards,
  timedPhaseTaskSections,
  nextCheckpoint,
  courseId,
  selectedChildId,
  mode,
  scopedCurrentPath,
}: {
  detail: CourseDetail;
  structureType: "phased" | "timed";
  modulePhaseOptions: ModulePhaseOptionInput[];
  timedPhaseCards: Array<{
    id: string;
    title: string;
    description: string | null;
    phaseNumber: number;
    range: { start: string; end: string } | null;
    checkpoints: CourseCheckpointRow[];
    focusBlock: FocusBlockRow | null;
    isCurrent: boolean;
  }>;
  timedPhaseTaskSections: TimedPhaseTaskSectionInput[];
  nextCheckpoint: CourseCheckpointRow | null;
  courseId: string;
  selectedChildId: string | null;
  mode: AppMode;
  scopedCurrentPath: string;
}): FinalReviewAuditViewModel {
  const allTasks = detail.modules.flatMap((module) => module.tasks);
  const gaps = buildReviewGaps({
    structureType,
    detail,
    timedPhaseCount: timedPhaseCards.length,
    nextCheckpoint,
    scopedCurrentPath,
  });
  const readinessLabel = gaps.length === 0 ? "Ready for use" : "Needs attention";
  const readinessTone = gaps.length === 0 ? "ready" : "attention";

  const stats =
    structureType === "phased"
      ? [
          { label: "Phases", value: `${detail.phases.length}` },
          { label: "Modules", value: `${detail.modules.length}` },
          { label: "Lessons and activities", value: `${allTasks.length}` },
          { label: "Review point", value: nextCheckpoint?.title ?? "No checkpoint yet" },
        ]
      : [
          { label: "Course goals", value: `${detail.goals.length}` },
          { label: "Cycles", value: `${timedPhaseCards.length}` },
          { label: "Tasks", value: `${allTasks.length}` },
          { label: "Review point", value: nextCheckpoint?.title ?? "No checkpoint yet" },
        ];

  if (structureType === "phased") {
    const groups: FinalReviewGroupViewModel[] = modulePhaseOptions.map((phase, index) => ({
      id: phase.id,
      title: `Phase ${index + 1}: ${phase.title}`,
      detail: phase.description,
      stats: [
        `${phase.modules.length} module${phase.modules.length === 1 ? "" : "s"}`,
        `${phase.checkpoints.length} review point${phase.checkpoints.length === 1 ? "" : "s"}`,
      ],
      items: [
        ...phase.modules.map<FinalReviewItemViewModel>((module, moduleIndex) => ({
          id: module.id,
          kind: "module",
          title: module.title,
          detail: module.tasks.length > 0 ? null : "No tasks yet",
          stats: [
            `${module.tasks.length} task${module.tasks.length === 1 ? "" : "s"}`,
          ],
          canMoveUp: moduleIndex > 0,
          canMoveDown: moduleIndex < phase.modules.length - 1,
          moveEntityId: module.id,
          editHref: buildModuleOpenHref({
            courseId,
            moduleId: module.id,
            selectedChildId,
            mode,
          }),
          children: module.tasks.map((task, taskIndex) => ({
            id: task.id,
            kind: "task",
            title: task.title,
            badgeLabel: formatTaskTypeLabel(task.task_type),
            detail: task.instructions,
            stats: [String(task.gold_coin_reward_amount)],
            canMoveUp: taskIndex > 0,
            canMoveDown: taskIndex < module.tasks.length - 1,
            moveEntityId: task.id,
            editHref: buildTaskEditHref({
              courseId,
              moduleId: module.id,
              taskId: task.id,
              selectedChildId,
              mode,
            }),
          })),
          defaultOpen: module.tasks.length > 0,
        })),
        ...phase.checkpoints.map<FinalReviewItemViewModel>((checkpoint) => ({
          id: checkpoint.id,
          kind: "checkpoint",
          title: checkpoint.title,
          badgeLabel: "Review point",
          detail: checkpoint.scheduled_date ?? "No date",
          notes: checkpoint.target,
          stats:
            checkpoint.gold_coin_reward_amount > 0
              ? [String(checkpoint.gold_coin_reward_amount)]
              : [],
          editHref: withQuery(scopedCurrentPath, { step: "4", editCheckpoint: checkpoint.id }),
        })),
      ],
    }));

    return {
      heading: "Review the whole course",
      description:
        "Check the final sequence, placement, and review rhythm before you use the course.",
      readinessLabel,
      readinessTone,
      readinessMessage:
        gaps.length === 0
          ? "The main structure is in place. Use this review to sanity-check the course before publishing or piloting it."
          : "This course still needs a few pieces before the parent flow feels complete and trustworthy.",
      readinessHelpText:
        gaps.length === 0
          ? "The main structure is in place. Use this final pass to confirm the sequence and make any last task or checkpoint adjustments before launch."
          : "The course is not ready yet. Use the missing-step links below, then confirm the sequence before you finish setup.",
      gaps,
      stats,
      primarySection: {
        title: "Phase order",
        description: "Expand phases, then modules, to confirm tasks and make small final order changes.",
        badgeLabel: `${detail.phases.length} phase${detail.phases.length === 1 ? "" : "s"}`,
        emptyMessage: "Add phases to review the full sequence.",
        groups,
      },
    };
  }

  const groups: FinalReviewGroupViewModel[] = timedPhaseTaskSections.map((phase) => ({
    id: phase.id,
    title: `Cycle ${phase.phaseNumber}`,
    detail: phase.range
      ? `${formatCourseDate(phase.range.start)} to ${formatCourseDate(phase.range.end)}`
      : "Date window appears once timing is set",
    statusLabel: phase.isCurrent ? "Current" : null,
    isHighlighted: phase.isCurrent,
    stats: [
      `${phase.tasks.length} task${phase.tasks.length === 1 ? "" : "s"}`,
      `${phase.checkpoints.length} checkpoint${phase.checkpoints.length === 1 ? "" : "s"}`,
    ],
    items: buildTimedReviewItems({
      orderedItems: phase.orderedItems,
      courseId,
      selectedChildId,
      mode,
    }),
  }));

  return {
    heading: "Review the whole course",
    description: "Check the child order, tasks, focus blocks, and checkpoints before you finish setup.",
    readinessLabel,
    readinessTone,
    readinessMessage:
      gaps.length === 0
        ? "The main structure is in place. Use this final pass to confirm the child order and make any last task or checkpoint adjustments before launch."
        : "The course is not ready yet. Use the missing-step links below, then confirm the child order before you finish setup.",
    readinessHelpText:
      gaps.length === 0
        ? "The main structure is in place. Use this final pass to confirm the child order and make any last task or checkpoint adjustments before launch."
        : "The course is not ready yet. Use the missing-step links below, then confirm the child order before you finish setup.",
    gaps,
    stats,
    primarySection: {
      title: "Course overview",
      description: "Review the child order for each cycle, then make any last task-order adjustments before launch.",
      badgeLabel: `${timedPhaseCards.length} cycle${timedPhaseCards.length === 1 ? "" : "s"}`,
      emptyMessage: "Add course timing to review the full cycle timeline.",
      groups,
    },
  };
}
