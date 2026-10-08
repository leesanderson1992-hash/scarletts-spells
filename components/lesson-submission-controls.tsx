"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";

type PreservedFormEntry = { name: string; value: string };
type PreservedLessonSubmission = {
  savedAt: string;
  entries: PreservedFormEntry[];
};

export function getLessonSubmissionStorageKey(taskId: string, childId: string) {
  return `lesson-submission:${childId}:${taskId}`;
}

function getFormIdentity(form: HTMLFormElement) {
  const data = new FormData(form);
  const taskId = data.get("task_id");
  const childId = data.get("child_id");
  return typeof taskId === "string" &&
    typeof childId === "string" &&
    taskId &&
    childId
    ? { taskId, childId }
    : null;
}

function preserveForm(form: HTMLFormElement | null) {
  if (!form) return;
  const identity = getFormIdentity(form);
  if (!identity) return;
  const entries = [...new FormData(form).entries()]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, value]) => ({ name, value }));
  const snapshot: PreservedLessonSubmission = {
    savedAt: new Date().toISOString(),
    entries,
  };
  sessionStorage.setItem(
    getLessonSubmissionStorageKey(identity.taskId, identity.childId),
    JSON.stringify(snapshot),
  );
}

export function readPreservedSubmissionValue(
  taskId: string,
  childId: string,
  name: string,
) {
  try {
    const raw = sessionStorage.getItem(
      getLessonSubmissionStorageKey(taskId, childId),
    );
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as PreservedLessonSubmission;
    return (
      snapshot.entries.findLast((entry) => entry.name === name)?.value ?? null
    );
  } catch {
    return null;
  }
}

function restoreForm(form: HTMLFormElement) {
  const identity = getFormIdentity(form);
  if (!identity) return;
  const storageKey = getLessonSubmissionStorageKey(
    identity.taskId,
    identity.childId,
  );
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const snapshot = JSON.parse(raw) as PreservedLessonSubmission;
    const valuesByName = new Map<string, string[]>();
    for (const entry of snapshot.entries) {
      valuesByName.set(entry.name, [
        ...(valuesByName.get(entry.name) ?? []),
        entry.value,
      ]);
    }
    form
      .querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("[name]")
      .forEach((field) => {
        const values = valuesByName.get(field.name);
        if (
          !values ||
          (field instanceof HTMLInputElement && field.type === "file")
        )
          return;
        if (
          field instanceof HTMLInputElement &&
          (field.type === "checkbox" || field.type === "radio")
        ) {
          field.checked = values.includes(field.value);
        } else {
          field.value = values.at(-1) ?? "";
        }
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
  } catch {
    sessionStorage.removeItem(storageKey);
  }
}

type LessonSubmissionControlsProps = {
  submitLabel: string;
  canSubmit?: boolean;
  onBeforeSubmit?: () => void | Promise<void>;
  saveDraftAction?: (formData: FormData) => void | Promise<void>;
  onBeforeSaveDraft?: () => void | Promise<void>;
};

export function LessonSubmissionControls({
  submitLabel,
  canSubmit = true,
  onBeforeSubmit,
  saveDraftAction,
  onBeforeSaveDraft,
}: LessonSubmissionControlsProps) {
  const { pending } = useFormStatus();
  const requestIdRef = useRef<HTMLInputElement | null>(null);
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState(false);
  const [pendingKind, setPendingKind] = useState<"submission" | "draft">(
    "submission",
  );

  function ensureRequestId() {
    if (requestIdRef.current && !requestIdRef.current.value) {
      requestIdRef.current.value = crypto.randomUUID();
    }
  }

  useEffect(() => {
    ensureRequestId();
    const form = requestIdRef.current?.form;
    if (form && new URLSearchParams(window.location.search).has("error"))
      restoreForm(form);
  }, []);

  function beginFormAction(
    event: MouseEvent<HTMLButtonElement>,
    kind: "submission" | "draft",
    onBeforeAction?: () => void | Promise<void>,
  ) {
    if (preparingRef.current) {
      event.preventDefault();
      return;
    }
    ensureRequestId();
    setPendingKind(kind);
    setPreparationError(false);
    if (!onBeforeAction) {
      preserveForm(requestIdRef.current?.form ?? null);
      return;
    }

    event.preventDefault();
    const button = event.currentTarget;
    preparingRef.current = true;
    setPreparing(true);
    void (async () => {
      try {
        await onBeforeAction();
        const form = button.form;
        if (!form) throw new Error("Lesson form is unavailable");
        preserveForm(form);
        form.requestSubmit(button);
      } catch {
        setPreparationError(true);
      } finally {
        preparingRef.current = false;
        setPreparing(false);
      }
    })();
  }

  return (
    <div className="grid gap-3">
      <input
        ref={requestIdRef}
        type="hidden"
        name="submission_request_id"
        defaultValue=""
      />
      {pending || preparing ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-center text-sky-900"
        >
          <p className="font-semibold">
            {pendingKind === "draft"
              ? "Saving your draft…"
              : "Submitting your lesson…"}
          </p>
          <p className="mt-1 text-sm">
            {pendingKind === "draft"
              ? "Your latest answers are being saved."
              : "Your work is safe. Please wait."}
          </p>
        </div>
      ) : null}
      {preparationError ? (
        <p role="alert" className="text-sm text-rose-700">
          Could not start that action. Your answers are still here; please try again.
        </p>
      ) : null}
      <div className={`flex flex-wrap gap-3 ${pending || preparing ? "hidden" : ""}`}>
        {saveDraftAction ? (
          <button
            type="submit"
            formAction={saveDraftAction}
            onClick={(event) => beginFormAction(event, "draft", onBeforeSaveDraft)}
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)] disabled:cursor-wait disabled:opacity-50"
          >
            Save draft
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!canSubmit}
          onClick={(event) => beginFormAction(event, "submission", onBeforeSubmit)}
          className="brand-primary-btn w-fit disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
