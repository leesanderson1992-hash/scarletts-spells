"use server";

import type {
  ReorderActionResult,
  ReorderChange,
  ReorderDirection,
} from "@/lib/courses/types";
import {
  getAuthenticatedParent,
  getFriendlyCourseDatabaseError,
} from "@/app/courses/action-support";

function invalidReorder(message: string): ReorderActionResult {
  return {
    ok: false,
    error: message,
  };
}

function normaliseRpcChanges(data: unknown): ReorderChange[] {
  if (!data || typeof data !== "object" || !("changed" in data)) {
    return [];
  }

  const changed = (data as { changed?: unknown }).changed;
  if (!Array.isArray(changed)) {
    return [];
  }

  return changed.flatMap((item) => {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") {
      return [];
    }

    return [
      {
        id: item.id,
        position: typeof item.position === "number" ? item.position : undefined,
        scheduledDate:
          typeof item.scheduledDate === "string" || item.scheduledDate === null
            ? item.scheduledDate
            : undefined,
      },
    ];
  });
}

async function runReorderRpc(
  rpcName:
    | "reorder_course_module_adjacent"
    | "reorder_course_task_adjacent"
    | "reorder_course_checkpoint_adjacent",
  params: Record<string, string>,
): Promise<ReorderActionResult> {
  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return invalidReorder("Sign in again before changing the order.");
  }

  const { data, error } = await supabase.rpc(rpcName, params);

  if (error) {
    return invalidReorder(getFriendlyCourseDatabaseError(error.message));
  }

  return {
    ok: true,
    changed: normaliseRpcChanges(data),
  };
}

export async function reorderModuleAction(input: {
  moduleId: string;
  direction: ReorderDirection;
}): Promise<ReorderActionResult> {
  if (!input.moduleId) {
    return invalidReorder("We couldn't find that module.");
  }

  return runReorderRpc("reorder_course_module_adjacent", {
    p_module_id: input.moduleId,
    p_direction: input.direction,
  });
}

export async function reorderTaskAction(input: {
  taskId: string;
  direction: ReorderDirection;
}): Promise<ReorderActionResult> {
  if (!input.taskId) {
    return invalidReorder("We couldn't find that task.");
  }

  return runReorderRpc("reorder_course_task_adjacent", {
    p_task_id: input.taskId,
    p_direction: input.direction,
  });
}

export async function reorderCourseCheckpointAction(input: {
  checkpointId: string;
  direction: ReorderDirection;
}): Promise<ReorderActionResult> {
  if (!input.checkpointId) {
    return invalidReorder("We couldn't find that checkpoint.");
  }

  return runReorderRpc("reorder_course_checkpoint_adjacent", {
    p_checkpoint_id: input.checkpointId,
    p_direction: input.direction,
  });
}

export async function reorderFocusBlockAction(input: {
  focusBlockId: string;
  direction: ReorderDirection;
}): Promise<ReorderActionResult> {
  if (!input.focusBlockId) {
    return invalidReorder("We couldn't find that focus block.");
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return invalidReorder("Sign in again before changing the order.");
  }

  const { data: focusBlock } = await supabase
    .from("focus_blocks")
    .select("id, module_id")
    .eq("id", input.focusBlockId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!focusBlock?.module_id) {
    return invalidReorder("We couldn't find that focus block.");
  }

  const { data: tasks, error } = await supabase
    .from("course_tasks")
    .select("id, focus_block_id, position")
    .eq("module_id", focusBlock.module_id)
    .eq("parent_user_id", user.id)
    .order("position", { ascending: true });

  if (error || !tasks) {
    return invalidReorder(getFriendlyCourseDatabaseError(error?.message));
  }

  const units: Array<{ kind: "task" | "focus_block"; id: string; taskIds: string[] }> = [];
  let index = 0;

  while (index < tasks.length) {
    const task = tasks[index];
    if (task?.focus_block_id) {
      const groupTaskIds: string[] = [];
      const currentFocusBlockId = task.focus_block_id;

      while (index < tasks.length && tasks[index]?.focus_block_id === currentFocusBlockId) {
        groupTaskIds.push(tasks[index]!.id);
        index += 1;
      }

      units.push({ kind: "focus_block", id: currentFocusBlockId, taskIds: groupTaskIds });
      continue;
    }

    if (task) {
      units.push({ kind: "task", id: task.id, taskIds: [task.id] });
    }
    index += 1;
  }

  const currentIndex = units.findIndex(
    (unit) => unit.kind === "focus_block" && unit.id === input.focusBlockId,
  );

  if (currentIndex === -1) {
    return invalidReorder("We couldn't place that focus block.");
  }

  const targetIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= units.length) {
    return { ok: true, changed: [] };
  }

  const reorderedUnits = [...units];
  [reorderedUnits[currentIndex], reorderedUnits[targetIndex]] = [
    reorderedUnits[targetIndex],
    reorderedUnits[currentIndex],
  ];

  const orderedTaskIds = reorderedUnits.flatMap((unit) => unit.taskIds);

  const { data, error: persistError } = await supabase.rpc("persist_course_task_positions", {
    p_module_id: focusBlock.module_id,
    p_task_ids: orderedTaskIds,
  });

  if (persistError) {
    return invalidReorder(getFriendlyCourseDatabaseError(persistError.message));
  }

  return {
    ok: true,
    changed: normaliseRpcChanges(data),
  };
}
