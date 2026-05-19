"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";
import { AppDialog } from "@/components/app-dialog";
import { StructuredLessonBuilderEditorList } from "@/components/structured-lesson-builder-editor-list";
import { StructuredLessonBuilderPreview } from "@/components/structured-lesson-builder-preview";
import {
  BLOCK_OPTIONS,
  useStructuredLessonBuilderState,
} from "@/components/structured-lesson-builder-state";
import { STRUCTURED_LESSON_PRESETS } from "@/lib/lessons/presets";
import type { StructuredLessonDocument } from "@/lib/lessons/schema";
import {
  buildLessonTemplatePickerOptionFromPersonalTemplate,
  buildLessonTemplatePickerOptionFromPreset,
  buildPersonalLessonTemplateSnapshot,
  type LessonTemplatePickerOption,
  type PersonalLessonTemplate,
} from "@/lib/lessons/templates";

type StructuredLessonBuilderProps = {
  formId?: string;
  taskTitle: string;
  initialLesson?: StructuredLessonDocument | null;
  compact?: boolean;
};

type TemplateSelection =
  | { kind: "preset"; id: string }
  | { kind: "personal"; id: string }
  | null;

type TemplateDialogState =
  | {
      kind: "save";
      name: string;
      error: string | null;
    }
  | {
      kind: "update";
      templateId: string;
      name: string;
      error: string | null;
    }
  | {
      kind: "delete";
      templateId: string;
      error: string | null;
    }
  | {
      kind: "apply-title-choice";
      templateId: string;
      templateKind: LessonTemplatePickerOption["kind"];
      templateLabel: string;
      existingTitle: string;
      suggestedTitle: string;
    }
  | null;

function SectionCard({
  compact,
  children,
}: {
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border border-[var(--border)] bg-white ${
        compact ? "px-4 py-3" : "p-4"
      }`}
    >
      {children}
    </div>
  );
}

function encodeTemplateSelection(selection: TemplateSelection) {
  if (!selection) {
    return "";
  }

  return `${selection.kind}:${selection.id}`;
}

function decodeTemplateSelection(value: string): TemplateSelection {
  if (!value) {
    return null;
  }

  const [kind, id] = value.split(":");
  if (!id) {
    return null;
  }

  return kind === "personal" || kind === "preset" ? { kind, id } : null;
}

function upsertPersonalTemplate(
  templates: PersonalLessonTemplate[],
  template: PersonalLessonTemplate,
) {
  const next = templates.filter((item) => item.id !== template.id);
  next.unshift(template);
  next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return next;
}

function StructuredLessonBuilderHeader({
  compact,
  formId,
  isPreviewOpen,
  onTogglePreview,
  titleError,
  titleErrorId,
}: {
  compact: boolean;
  formId?: string;
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
  titleError: string | null;
  titleErrorId: string;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border border-[var(--border)] bg-[rgba(252,228,244,0.12)] ${
        compact ? "px-4 py-3" : "p-4"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="brand-eyebrow">Lesson builder</p>
            <BuilderInfoHint label="Lesson builder help">
              Build lessons in local block state first, then save through the parent task form when the lesson feels complete.
            </BuilderInfoHint>
          </div>
          <h3 className={`mt-1 font-semibold text-[color:var(--ink)] ${compact ? "text-base" : "text-lg"}`}>
            Build this lesson in blocks
          </h3>
          {titleError ? (
            <p id={titleErrorId} role="alert" className="mt-2 text-sm font-medium text-rose-700">
              {titleError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {formId && !compact ? (
            <button
              type="submit"
              form={formId}
              className="rounded-full bg-[var(--scarlett)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-105"
            >
              Save lesson
            </button>
          ) : null}
          <button
            type="button"
            onClick={onTogglePreview}
            aria-expanded={isPreviewOpen}
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)]"
          >
            {isPreviewOpen ? "Hide preview" : "Show preview"}
          </button>
          {compact ? null : (
            <button
              type="button"
              onClick={() => {
                const target = document.getElementById("structured-lesson-builder-editor");
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)]"
            >
              Jump to editor
            </button>
          )}
          <span className="rounded-full bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] px-4 py-2 text-sm font-medium text-white">
            Structured
          </span>
        </div>
      </div>
    </div>
  );
}

function StructuredLessonTemplatePicker({
  compact,
  selectedTemplateValue,
  onSelectTemplateValue,
  onApplyTemplate,
  onSaveAsTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  templateOptions,
  isLoadingTemplates,
  isTemplateActionPending,
  templateError,
  templateMessage,
}: {
  compact: boolean;
  selectedTemplateValue: string;
  onSelectTemplateValue: (value: string) => void;
  onApplyTemplate: () => void;
  onSaveAsTemplate: () => void;
  onUpdateTemplate: () => void;
  onDeleteTemplate: () => void;
  templateOptions: LessonTemplatePickerOption[];
  isLoadingTemplates: boolean;
  isTemplateActionPending: boolean;
  templateError: string | null;
  templateMessage: string | null;
}) {
  const selectedTemplate = templateOptions.find(
    (option) => encodeTemplateSelection({ kind: option.kind, id: option.id }) === selectedTemplateValue,
  );
  const hasPersonalTemplateSelected = selectedTemplate?.kind === "personal";
  const builtInTemplates = templateOptions.filter((option) => option.kind === "preset");
  const personalTemplates = templateOptions.filter((option) => option.kind === "personal");

  return (
    <SectionCard compact={compact}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="brand-eyebrow">Lesson templates</p>
            <BuilderInfoHint label="Lesson template help">
              Built-in starters and personal templates share one compact picker. Apply one when it speeds you up, then tailor the blocks below.
            </BuilderInfoHint>
          </div>
          <label className="mt-3 grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Template library
            </span>
            <select
              value={selectedTemplateValue}
              onChange={(event) => onSelectTemplateValue(event.target.value)}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
            >
              <option value="">Choose a template</option>
              <optgroup label="Built-in starters">
                {builtInTemplates.map((template) => (
                  <option
                    key={`preset-${template.id}`}
                    value={encodeTemplateSelection({ kind: template.kind, id: template.id })}
                  >
                    {template.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="My templates">
                {personalTemplates.length > 0 ? (
                  personalTemplates.map((template) => (
                    <option
                      key={`personal-${template.id}`}
                      value={encodeTemplateSelection({ kind: template.kind, id: template.id })}
                    >
                      {template.title}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    {isLoadingTemplates ? "Loading personal templates..." : "No personal templates yet"}
                  </option>
                )}
              </optgroup>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApplyTemplate}
            disabled={!selectedTemplateValue || isTemplateActionPending}
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply template
          </button>
          <button
            type="button"
            onClick={onSaveAsTemplate}
            disabled={isTemplateActionPending}
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save as My Template
          </button>
          {hasPersonalTemplateSelected ? (
            <>
              <button
                type="button"
                onClick={onUpdateTemplate}
                disabled={isTemplateActionPending}
                className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Update my template
              </button>
              <button
                type="button"
                onClick={onDeleteTemplate}
                disabled={isTemplateActionPending}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--mid)]">
        {selectedTemplate
          ? selectedTemplate.description ??
            (selectedTemplate.kind === "personal"
              ? "This is one of your saved personal lesson templates."
              : "Apply this starter to begin with a proven structured lesson shape.")
          : "Choose a built-in starter or one of your saved personal templates when you want a faster starting point."}
      </p>
      {templateError ? (
        <p className="mt-3 text-sm font-medium text-rose-700" role="alert">
          {templateError}
        </p>
      ) : null}
      {!templateError && templateMessage ? (
        <p className="mt-3 text-sm font-medium text-emerald-700">{templateMessage}</p>
      ) : null}
    </SectionCard>
  );
}

function StructuredLessonBlockPalette({
  compact,
  onAddBlock,
}: {
  compact: boolean;
  onAddBlock: (blockType: (typeof BLOCK_OPTIONS)[number]["type"]) => void;
}) {
  return (
    <SectionCard compact={compact}>
      <p className="brand-eyebrow">Add block</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {BLOCK_OPTIONS.map((option) => (
          <button
            key={option.type}
            type="button"
            onClick={() => onAddBlock(option.type)}
            className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
          >
            + {option.label}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function TemplateDialog({
  state,
  busy,
  onClose,
  onChangeName,
  onSubmitSave,
  onSubmitUpdate,
  onConfirmDelete,
  onApplyBodyOnly,
  onApplyBodyAndReplaceTitle,
}: {
  state: TemplateDialogState;
  busy: boolean;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onSubmitSave: () => void;
  onSubmitUpdate: () => void;
  onConfirmDelete: () => void;
  onApplyBodyOnly: () => void;
  onApplyBodyAndReplaceTitle: () => void;
}) {
  if (!state) {
    return null;
  }

  const isNameDialog = state.kind === "save" || state.kind === "update";
  const isDeleteDialog = state.kind === "delete";
  const isApplyDialog = state.kind === "apply-title-choice";

  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      size="md"
      closeDisabled={busy}
      eyebrow={
        isNameDialog ? (
          state.kind === "save" ? "Save template" : "Update template"
        ) : isDeleteDialog ? (
          "Delete template"
        ) : isApplyDialog ? (
          "Choose title behavior"
        ) : undefined
      }
      title={
        isNameDialog
          ? state.kind === "save"
            ? "Save this lesson as My Template"
            : "Update your personal template"
          : isDeleteDialog
            ? "Delete this personal template?"
            : isApplyDialog
              ? "Apply template without silently replacing the title"
              : undefined
      }
      description={
        isDeleteDialog ? (
          "This only removes the saved template from your library. Existing course tasks and lesson schemas will stay unchanged."
        ) : isApplyDialog ? (
          <>
            The template{" "}
            <span className="font-medium text-[color:var(--ink)]">
              "{state.templateLabel}"
            </span>{" "}
            suggests the title{" "}
            <span className="font-medium text-[color:var(--ink)]">
              "{state.suggestedTitle}"
            </span>
            , but the current task title is{" "}
            <span className="font-medium text-[color:var(--ink)]">
              "{state.existingTitle}"
            </span>
            .
          </>
        ) : undefined
      }
      footer={
        isNameDialog ? (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={state.kind === "save" ? onSubmitSave : onSubmitUpdate}
              disabled={busy}
              className="rounded-full bg-[var(--scarlett)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? state.kind === "save"
                  ? "Saving..."
                  : "Updating..."
                : state.kind === "save"
                  ? "Save template"
                  : "Update template"}
            </button>
          </>
        ) : isDeleteDialog ? (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={busy}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Deleting..." : "Delete template"}
            </button>
          </>
        ) : isApplyDialog ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)]"
          >
            Cancel
          </button>
        ) : undefined
      }
    >
      {isNameDialog ? (
        <>
          <label className="mt-4 grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Template name
            </span>
            <input
              type="text"
              value={state.name}
              onChange={(event) => onChangeName(event.target.value)}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
              placeholder="My lesson template"
              autoFocus
            />
          </label>
          {state.error ? (
            <p className="mt-3 text-sm font-medium text-rose-700" role="alert">
              {state.error}
            </p>
          ) : null}
        </>
      ) : null}

      {isDeleteDialog && state.error ? (
        <p className="text-sm font-medium text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}

      {isApplyDialog ? (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={onApplyBodyOnly}
            className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm font-medium text-[color:var(--ink)] transition hover:border-[var(--scarlett)]"
          >
            Apply body only and keep current title
          </button>
          <button
            type="button"
            onClick={onApplyBodyAndReplaceTitle}
            className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm font-medium text-[color:var(--ink)] transition hover:border-[var(--scarlett)]"
          >
            Apply body and replace title with "{state.suggestedTitle}"
          </button>
        </div>
      ) : null}
    </AppDialog>
  );
}

export function StructuredLessonBuilder({
  formId,
  taskTitle,
  initialLesson,
  compact = false,
}: StructuredLessonBuilderProps) {
  const [currentTaskTitle, setCurrentTaskTitle] = useState(taskTitle);
  const builder = useStructuredLessonBuilderState({
    taskTitle: currentTaskTitle,
    initialLesson,
    compact,
  });
  const [titleError, setTitleError] = useState<string | null>(null);
  const [personalTemplates, setPersonalTemplates] = useState<PersonalLessonTemplate[]>([]);
  const [selectedTemplateValue, setSelectedTemplateValue] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isTemplateActionPending, setIsTemplateActionPending] = useState(false);
  const [templateDialog, setTemplateDialog] = useState<TemplateDialogState>(null);
  const titleErrorId = useId();
  const formProps = formId ? { form: formId } : {};
  const templateOptions: LessonTemplatePickerOption[] = [
    ...STRUCTURED_LESSON_PRESETS.map((preset) => buildLessonTemplatePickerOptionFromPreset(preset)),
    ...personalTemplates.map((template) =>
      buildLessonTemplatePickerOptionFromPersonalTemplate(template),
    ),
  ];
  const selectedTemplate = templateOptions.find(
    (option) => encodeTemplateSelection({ kind: option.kind, id: option.id }) === selectedTemplateValue,
  );

  useEffect(() => {
    setCurrentTaskTitle(taskTitle);
  }, [taskTitle]);

  useEffect(() => {
    let isMounted = true;

    async function loadPersonalTemplates() {
      setIsLoadingTemplates(true);
      setTemplateError(null);

      try {
        const response = await fetch("/api/lesson-templates", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { templates?: PersonalLessonTemplate[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "We couldn't load your personal lesson templates.");
        }

        if (!isMounted) {
          return;
        }

        setPersonalTemplates(Array.isArray(payload?.templates) ? payload.templates : []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setTemplateError(
          error instanceof Error
            ? error.message
            : "We couldn't load your personal lesson templates.",
        );
      } finally {
        if (isMounted) {
          setIsLoadingTemplates(false);
        }
      }
    }

    void loadPersonalTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const selectedTemplateSelection = decodeTemplateSelection(selectedTemplateValue);
    if (selectedTemplateSelection?.kind !== "personal") {
      return;
    }

    const stillExists = personalTemplates.some((template) => template.id === selectedTemplateSelection.id);
    if (!stillExists) {
      setSelectedTemplateValue("");
    }
  }, [personalTemplates, selectedTemplateValue]);

  useEffect(() => {
    if (!formId) {
      return;
    }

    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const titleInput = form.querySelector<HTMLInputElement>('input[name="title"]');
    if (!titleInput) {
      return;
    }

    const clearTitleError = () => {
      setTitleError(null);
      titleInput.setAttribute("aria-invalid", "false");
      if (titleInput.getAttribute("aria-describedby") === titleErrorId) {
        titleInput.removeAttribute("aria-describedby");
      }
    };

    const syncTitleState = () => {
      setCurrentTaskTitle(titleInput.value.trim());
    };

    const syncTitleError = () => {
      const nextError = titleInput.value.trim()
        ? null
        : "Please enter a task title before saving this lesson.";

      titleInput.setAttribute("aria-invalid", nextError ? "true" : "false");
      if (nextError) {
        titleInput.setAttribute("aria-describedby", titleErrorId);
      } else if (titleInput.getAttribute("aria-describedby") === titleErrorId) {
        titleInput.removeAttribute("aria-describedby");
      }
      setTitleError(nextError);
      syncTitleState();
    };

    const handleSubmit = (event: Event) => {
      if (titleInput.value.trim()) {
        clearTitleError();
        syncTitleState();
        return;
      }

      event.preventDefault();
      syncTitleError();
      titleInput.focus();
    };

    const handleInput = () => {
      syncTitleState();
      if (!titleInput.value.trim()) {
        return;
      }

      clearTitleError();
    };

    syncTitleState();
    form.addEventListener("submit", handleSubmit);
    titleInput.addEventListener("input", handleInput);

    return () => {
      form.removeEventListener("submit", handleSubmit);
      titleInput.removeEventListener("input", handleInput);
    };
  }, [formId, titleErrorId]);

  function getTitleInput() {
    if (!formId) {
      return null;
    }

    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) {
      return null;
    }

    return form.querySelector<HTMLInputElement>('input[name="title"]');
  }

  function getCurrentTaskTitle() {
    const titleInput = getTitleInput();
    return titleInput?.value.trim() ?? currentTaskTitle.trim();
  }

  function setTaskTitle(nextTitle: string) {
    const normalisedTitle = nextTitle.trim();
    const titleInput = getTitleInput();

    if (titleInput) {
      titleInput.value = normalisedTitle;
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    setCurrentTaskTitle(normalisedTitle);
  }

  function resetTemplateFeedback() {
    setTemplateError(null);
    setTemplateMessage(null);
  }

  function closeTemplateDialog() {
    if (isTemplateActionPending) {
      return;
    }

    setTemplateDialog(null);
  }

  async function sendTemplateRequest<T>(
    input: RequestInit & { method: "POST" | "PATCH" | "DELETE" },
  ) {
    const response = await fetch("/api/lesson-templates", {
      ...input,
      headers: {
        "content-type": "application/json",
        ...(input.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => null)) as
      | { template?: PersonalLessonTemplate; error?: string; ok?: boolean }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "We couldn't update your personal lesson templates.");
    }

    return payload as T;
  }

  async function handleSaveAsTemplate() {
    resetTemplateFeedback();

    const suggestedName =
      getCurrentTaskTitle() ||
      (selectedTemplate?.kind === "personal" ? selectedTemplate.title : "") ||
      "My lesson template";
    setTemplateDialog({
      kind: "save",
      name: suggestedName,
      error: null,
    });
  }

  async function submitSaveAsTemplate() {
    if (templateDialog?.kind !== "save") {
      return;
    }

    const trimmedTitle = templateDialog.name.trim();
    if (!trimmedTitle) {
      setTemplateDialog((current) =>
        current?.kind === "save"
          ? { ...current, error: "Please enter a template name." }
          : current,
      );
      return;
    }

    setIsTemplateActionPending(true);

    try {
      const lesson = buildPersonalLessonTemplateSnapshot({
        lesson: builder.structuredDocument,
        taskTitle: getCurrentTaskTitle() || trimmedTitle,
      });
      const payload = await sendTemplateRequest<{ template: PersonalLessonTemplate }>({
        method: "POST",
        body: JSON.stringify({
          title: trimmedTitle,
          lesson,
        }),
      });

      setPersonalTemplates((current) => upsertPersonalTemplate(current, payload.template));
      setSelectedTemplateValue(
        encodeTemplateSelection({ kind: "personal", id: payload.template.id }),
      );
      setTemplateDialog(null);
      setTemplateMessage(`Saved "${payload.template.title}" to My Templates.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We couldn't save that personal template just yet.";
      setTemplateDialog((current) =>
        current?.kind === "save" ? { ...current, error: message } : current,
      );
    } finally {
      setIsTemplateActionPending(false);
    }
  }

  async function handleUpdateTemplate() {
    resetTemplateFeedback();

    const templateSelection = decodeTemplateSelection(selectedTemplateValue);
    if (templateSelection?.kind !== "personal") {
      setTemplateError("Choose one of your personal templates first.");
      return;
    }

    const currentTemplate = personalTemplates.find((template) => template.id === templateSelection.id);
    if (!currentTemplate) {
      setTemplateError("We couldn't find that personal template.");
      return;
    }
    setTemplateDialog({
      kind: "update",
      templateId: currentTemplate.id,
      name: currentTemplate.title,
      error: null,
    });
  }

  async function submitUpdateTemplate() {
    if (templateDialog?.kind !== "update") {
      return;
    }

    const trimmedTitle = templateDialog.name.trim();
    if (!trimmedTitle) {
      setTemplateDialog((current) =>
        current?.kind === "update"
          ? { ...current, error: "Please enter a template name." }
          : current,
      );
      return;
    }

    const currentTemplate = personalTemplates.find(
      (template) => template.id === templateDialog.templateId,
    );
    if (!currentTemplate) {
      setTemplateError("We couldn't find that personal template.");
      setTemplateDialog(null);
      return;
    }

    setIsTemplateActionPending(true);

    try {
      const lesson = buildPersonalLessonTemplateSnapshot({
        lesson: builder.structuredDocument,
        taskTitle: getCurrentTaskTitle() || trimmedTitle,
      });
      const payload = await sendTemplateRequest<{ template: PersonalLessonTemplate }>({
        method: "PATCH",
        body: JSON.stringify({
          templateId: currentTemplate.id,
          title: trimmedTitle,
          lesson,
        }),
      });

      setPersonalTemplates((current) => upsertPersonalTemplate(current, payload.template));
      setSelectedTemplateValue(
        encodeTemplateSelection({ kind: "personal", id: payload.template.id }),
      );
      setTemplateDialog(null);
      setTemplateMessage(`Updated "${payload.template.title}".`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We couldn't update that personal template just yet.";
      setTemplateDialog((current) =>
        current?.kind === "update" ? { ...current, error: message } : current,
      );
    } finally {
      setIsTemplateActionPending(false);
    }
  }

  async function handleDeleteTemplate() {
    resetTemplateFeedback();

    const templateSelection = decodeTemplateSelection(selectedTemplateValue);
    if (templateSelection?.kind !== "personal") {
      setTemplateError("Choose one of your personal templates first.");
      return;
    }

    const currentTemplate = personalTemplates.find((template) => template.id === templateSelection.id);
    if (!currentTemplate) {
      setTemplateError("We couldn't find that personal template.");
      return;
    }
    setTemplateDialog({
      kind: "delete",
      templateId: currentTemplate.id,
      error: null,
    });
  }

  async function confirmDeleteTemplate() {
    if (templateDialog?.kind !== "delete") {
      return;
    }

    const currentTemplate = personalTemplates.find(
      (template) => template.id === templateDialog.templateId,
    );
    if (!currentTemplate) {
      setTemplateError("We couldn't find that personal template.");
      setTemplateDialog(null);
      return;
    }

    setIsTemplateActionPending(true);

    try {
      await sendTemplateRequest<{ ok: true }>({
        method: "DELETE",
        body: JSON.stringify({
          templateId: currentTemplate.id,
        }),
      });

      setPersonalTemplates((current) =>
        current.filter((template) => template.id !== currentTemplate.id),
      );
      setSelectedTemplateValue("");
      setTemplateDialog(null);
      setTemplateMessage(`Deleted "${currentTemplate.title}".`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We couldn't delete that personal template just yet.";
      setTemplateDialog((current) =>
        current?.kind === "delete" ? { ...current, error: message } : current,
      );
    } finally {
      setIsTemplateActionPending(false);
    }
  }

  function applyTemplateWithTitleBehavior(input: {
    template: LessonTemplatePickerOption;
    replaceTitle: boolean;
  }) {
    builder.replaceLessonDocument(input.template.lesson);

    const suggestedTitle = input.template.lesson.title.trim() || input.template.title.trim();
    if (input.replaceTitle && suggestedTitle) {
      setTaskTitle(suggestedTitle);
    }

    setTemplateMessage(
      input.template.kind === "personal"
        ? `Applied "${input.template.title}" from My Templates.`
        : `Applied "${input.template.title}".`,
    );
  }

  function handleApplyTemplate() {
    resetTemplateFeedback();

    if (!selectedTemplate) {
      setTemplateError("Choose a lesson template first.");
      return;
    }

    const suggestedTitle = selectedTemplate.lesson.title.trim() || selectedTemplate.title.trim();
    const existingTitle = getCurrentTaskTitle();

    if (suggestedTitle) {
      if (!existingTitle) {
        applyTemplateWithTitleBehavior({
          template: selectedTemplate,
          replaceTitle: true,
        });
        return;
      }

      if (existingTitle !== suggestedTitle) {
        setTemplateDialog({
          kind: "apply-title-choice",
          templateId: selectedTemplate.id,
          templateKind: selectedTemplate.kind,
          templateLabel: selectedTemplate.title,
          existingTitle,
          suggestedTitle,
        });
        return;
      }
    }

    applyTemplateWithTitleBehavior({
      template: selectedTemplate,
      replaceTitle: false,
    });
  }

  function handleApplyBodyOnly() {
    if (templateDialog?.kind !== "apply-title-choice") {
      return;
    }

    if (!selectedTemplate || selectedTemplate.id !== templateDialog.templateId) {
      setTemplateError("Choose a lesson template first.");
      setTemplateDialog(null);
      return;
    }

    applyTemplateWithTitleBehavior({
      template: selectedTemplate,
      replaceTitle: false,
    });
    setTemplateDialog(null);
  }

  function handleApplyBodyAndReplaceTitle() {
    if (templateDialog?.kind !== "apply-title-choice") {
      return;
    }

    if (!selectedTemplate || selectedTemplate.id !== templateDialog.templateId) {
      setTemplateError("Choose a lesson template first.");
      setTemplateDialog(null);
      return;
    }

    applyTemplateWithTitleBehavior({
      template: selectedTemplate,
      replaceTitle: true,
    });
    setTemplateDialog(null);
  }

  return (
    <div className="grid gap-4">
      <input type="hidden" name="lesson_authoring_mode" value="structured" {...formProps} />
      <input
        type="hidden"
        name="lesson_schema_json"
        value={JSON.stringify(builder.structuredDocument)}
        readOnly
        {...formProps}
      />

      <StructuredLessonBuilderHeader
        compact={compact}
        formId={formId}
        isPreviewOpen={builder.showPreview}
        onTogglePreview={builder.togglePreview}
        titleError={titleError}
        titleErrorId={titleErrorId}
      />

      {builder.isExpanded ? (
        <div className={`grid ${compact ? "gap-3" : "gap-4"}`}>
          <div id="structured-lesson-builder-editor">
            <StructuredLessonBuilderEditorList builder={builder} />
          </div>
          <div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"}`}>
            <StructuredLessonTemplatePicker
              compact={compact}
              selectedTemplateValue={selectedTemplateValue}
              onSelectTemplateValue={setSelectedTemplateValue}
              onApplyTemplate={handleApplyTemplate}
              onSaveAsTemplate={handleSaveAsTemplate}
              onUpdateTemplate={handleUpdateTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              templateOptions={templateOptions}
              isLoadingTemplates={isLoadingTemplates}
              isTemplateActionPending={isTemplateActionPending}
              templateError={templateError}
              templateMessage={templateMessage}
            />
            <StructuredLessonBlockPalette compact={compact} onAddBlock={builder.addBlock} />
          </div>
        </div>
      ) : null}

      {builder.showPreview ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(56,26,48,0.35)] backdrop-blur-[2px]">
          <button
            type="button"
            onClick={builder.togglePreview}
            className="h-full flex-1 cursor-default"
            aria-label="Close preview backdrop"
          />
          <div className="flex h-full w-full max-w-3xl flex-col border-l border-[var(--border)] bg-[rgba(255,249,252,0.98)] shadow-[-18px_0_40px_rgba(79,38,66,0.12)]">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-white/92 px-5 py-4 backdrop-blur">
              <div>
                <p className="brand-eyebrow">Lesson preview</p>
                <h3 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
                  Preview the current lesson
                </h3>
              </div>
              <button
                type="button"
                onClick={builder.togglePreview}
                className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)]"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4 sm:px-5">
              <StructuredLessonBuilderPreview blocks={builder.blocks} />
            </div>
          </div>
        </div>
      ) : null}

      <TemplateDialog
        state={templateDialog}
        busy={isTemplateActionPending}
        onClose={closeTemplateDialog}
        onChangeName={(value) =>
          setTemplateDialog((current) =>
            current?.kind === "save" || current?.kind === "update"
              ? { ...current, name: value, error: null }
              : current,
          )
        }
        onSubmitSave={submitSaveAsTemplate}
        onSubmitUpdate={submitUpdateTemplate}
        onConfirmDelete={confirmDeleteTemplate}
        onApplyBodyOnly={handleApplyBodyOnly}
        onApplyBodyAndReplaceTitle={handleApplyBodyAndReplaceTitle}
      />
    </div>
  );
}
