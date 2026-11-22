"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ResolveWorkbookFamilies } from "./resolve-workbook-families";
import { assignSavedReviewFamily } from "./family-dependency-actions";
import type { WorkbookFamilyTask } from "@/lib/teaching-dictionary-manager/review-workbook";

export type SavedFamilyTask = WorkbookFamilyTask & { dependencyId: string; wordId: string; updatedAt: string; detail: string };
export function SavedFamilyAssignments({ tasks, skill }: { tasks: SavedFamilyTask[]; skill: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <div className="space-y-3">
    {error && <p role="alert" className="text-rose-900">{error}</p>}
    <ResolveWorkbookFamilies tasks={tasks} skill={skill} saving={pending}
      savedWordIds={Object.fromEntries(tasks.map(task => [task.row, task.wordId]))}
      onResolve={decision => {
        const task = tasks.find(task => task.row === decision.row);
        if (!task) return;
        setError("");
        start(async () => {
          try {
            const result = await assignSavedReviewFamily({ id: task.dependencyId, expectedUpdatedAt: task.updatedAt,
              familyKey: decision.familyKey, createSenseId: decision.createSenseId });
            if (!result.ok) setError(result.error ?? "Could not save the family. Try again.");
          } catch { setError("Could not save the family. Your review is retained; retry."); }
          router.refresh();
        });
      }} />
    {tasks.length > 0 && <ul className="space-y-1 text-sm">{tasks.map(task => <li key={task.dependencyId}><strong>{task.word}</strong> · {task.detail}</li>)}</ul>}
  </div>;
}
