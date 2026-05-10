"use client";

import { useMemo, useState } from "react";

type FocusMiniTask = {
  id: string;
  title: string;
  instructions: string;
  estimated_minutes: string;
};

export type FocusMiniTaskInput = FocusMiniTask;

function makeId() {
  return `focus-mini-${Math.random().toString(36).slice(2, 8)}`;
}

function createMiniTask(
  title = "Mini task 1",
  instructions = "",
  estimatedMinutes = "",
): FocusMiniTask {
  return {
    id: makeId(),
    title,
    instructions,
    estimated_minutes: estimatedMinutes,
  };
}

export function FocusBlockMiniTaskBuilder({
  initialTasks,
  compact = false,
}: {
  initialTasks?: FocusMiniTaskInput[];
  compact?: boolean;
}) {
  const [tasks, setTasks] = useState<FocusMiniTask[]>(
    initialTasks?.length
      ? initialTasks
      : [
          createMiniTask("Mini task 1"),
          createMiniTask("Mini task 2"),
        ],
  );
  const [isExpanded, setIsExpanded] = useState(!compact);

  const serialisedTasks = useMemo(
    () =>
      JSON.stringify(
        tasks.map((task, index) => ({
          id: task.id,
          position: index,
          title: task.title,
          instructions: task.instructions,
          estimated_minutes: task.estimated_minutes,
        })),
      ),
    [tasks],
  );

  return (
    <div className="grid gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[rgba(255,247,220,0.24)] px-3 py-3">
      <input type="hidden" name="focus_block_tasks_json" value={serialisedTasks} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Focus block steps
          </p>
          <p className="mt-1 text-sm text-[color:var(--mid)]">
            {tasks.length} mini task{tasks.length === 1 ? "" : "s"} planned
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
          >
            {isExpanded ? "Hide steps" : "Edit steps"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              setTasks((current) => [...current, createMiniTask(`Mini task ${current.length + 1}`)]);
            }}
            className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
          >
            Add mini task
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="grid gap-2.5">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="grid gap-2.5 rounded-[1rem] border border-[var(--border)] bg-white px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--ink)]">
                  Mini task {index + 1}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTasks((current) => {
                        if (index === 0) {
                          return current;
                        }
                        const next = [...current];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next;
                      })
                    }
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[color:var(--mid)]"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTasks((current) => {
                        if (index === current.length - 1) {
                          return current;
                        }
                        const next = [...current];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        return next;
                      })
                    }
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[color:var(--mid)]"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTasks((current) =>
                        current.length === 1 ? current : current.filter((item) => item.id !== task.id),
                      )
                    }
                    className="rounded-full border border-rose-200 px-2.5 py-1 text-xs text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)]"}`}>
                <input
                  type="text"
                  value={task.title}
                  onChange={(event) =>
                    setTasks((current) =>
                      current.map((item) =>
                        item.id === task.id ? { ...item, title: event.target.value } : item,
                      ),
                    )
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Mini task title"
                />
                {compact ? null : (
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={task.estimated_minutes}
                    onChange={(event) =>
                      setTasks((current) =>
                        current.map((item) =>
                          item.id === task.id
                            ? { ...item, estimated_minutes: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Minutes"
                  />
                )}
              </div>

              <textarea
                value={task.instructions}
                onChange={(event) =>
                  setTasks((current) =>
                    current.map((item) =>
                      item.id === task.id
                        ? { ...item, instructions: event.target.value }
                        : item,
                    ),
                  )
                }
                rows={2}
                className="brand-input rounded-2xl px-4 py-3 text-sm"
                placeholder="What should the child do for this mini task?"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[1rem] border border-[var(--border)] bg-white px-3 py-2.5"
            >
              <p className="text-sm font-medium text-[color:var(--ink)]">
                {index + 1}. {task.title}
              </p>
              <span className="text-xs text-[color:var(--mid)]">
                {task.instructions ? "Instructions added" : "No instructions yet"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[color:var(--mid)]">
        The first incomplete mini task becomes the next focus action in the child flow.
      </p>
    </div>
  );
}
