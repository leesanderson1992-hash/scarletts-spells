"use client";

import { useMemo, useRef, useState } from "react";

import { PreSubmitChecklist } from "@/components/pre-submit-checklist";

type EmbeddedLessonResponseProps = {
  contentHtml: string;
  submitLabel: string;
  prefillFields?: Record<string, string>;
  injectedLinks?: Record<string, string>;
  draftValues?: Record<string, unknown>;
  saveDraftAction: (formData: FormData) => void | Promise<void>;
};

type FieldMetaMap = Record<
  string,
  {
    label: string;
    type: string;
    excludeFromSpelling?: boolean;
  }
>;

function injectBranding(html: string) {
  const brandStyle = `
<style id="scarlett-lesson-overrides">
  html, body {
    background: #fffdf8 !important;
    color: #2f2430 !important;
    font-family: "Nunito", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }
  body {
    margin: 0 !important;
  }
  button, input, textarea, select {
    font: inherit !important;
  }
  textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="number"], select {
    border-radius: 12px !important;
    border: 1.5px solid #e7d9df !important;
    background: #fff !important;
  }
  textarea:focus, input:focus, select:focus {
    outline: 2px solid rgba(195, 30, 101, 0.18) !important;
    outline-offset: 1px !important;
  }
  a {
    color: #b91c64 !important;
  }
</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${brandStyle}</head>`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${brandStyle}</head>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${brandStyle}
  </head>
  <body>${html}</body>
</html>`;
}

function getFieldLabel(element: Element, index: number) {
  const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const id = field.id;

  if (id) {
    const label = field.ownerDocument.querySelector(`label[for="${id}"]`);
    if (label?.textContent?.trim()) {
      return label.textContent.trim();
    }
  }

  const nearestLabel = field.closest("label");
  if (nearestLabel?.textContent?.trim()) {
    return nearestLabel.textContent.trim();
  }

  if (field.getAttribute("aria-label")?.trim()) {
    return field.getAttribute("aria-label")!.trim();
  }

  if ("placeholder" in field && field.placeholder?.trim()) {
    return field.placeholder.trim();
  }

  if ("name" in field && field.name?.trim()) {
    return field.name.trim();
  }

  return `Answer ${index + 1}`;
}

function applyFieldFeedback(
  frameDocument: Document,
  draftValues?: Record<string, unknown>,
) {
  if (!draftValues) {
    return;
  }

  const rawFeedback = draftValues.__field_feedback;
  if (!rawFeedback || typeof rawFeedback !== "object" || Array.isArray(rawFeedback)) {
    return;
  }

  frameDocument.querySelectorAll("[data-scarlett-feedback]").forEach((node) => node.remove());

  Object.entries(rawFeedback).forEach(([key, value]) => {
    if (typeof value !== "string" || !value.trim()) {
      return;
    }

    const feedbackText = value.trim();
    const byId = frameDocument.getElementById(key);
    const byName = frameDocument.querySelector(
      `[name="${CSS.escape(key)}"]`,
    );
    const target =
      byId instanceof HTMLElement
        ? byId
        : byName instanceof HTMLElement
          ? byName
          : null;

    if (!target) {
      return;
    }

    const note = frameDocument.createElement("div");
    note.setAttribute("data-scarlett-feedback", "true");
    note.setAttribute("role", "note");
    note.style.marginTop = "8px";
    note.style.padding = "10px 12px";
    note.style.borderRadius = "12px";
    note.style.border = "1px solid #f3c57a";
    note.style.background = "#fff7df";
    note.style.color = "#7a4b00";
    note.style.fontSize = "0.85rem";
    note.style.lineHeight = "1.55";
    note.innerHTML = `<strong style="display:block;margin-bottom:4px;">Feedback to fix</strong>${feedbackText}`;

    target.style.borderColor = "#e7a23a";
    target.style.background = "#fffdf5";

    const anchor = target.closest(".field-group, .ladder-rung, .statement-row, .idea-row, td, label, .choice-q-body, .profile-fields > div") ?? target;
    anchor.insertAdjacentElement("afterend", note);
  });
}

export function EmbeddedLessonResponse({
  contentHtml,
  submitLabel,
  prefillFields,
  injectedLinks,
  draftValues,
  saveDraftAction,
}: EmbeddedLessonResponseProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const submissionRef = useRef<HTMLInputElement | null>(null);
  const reviewSummaryRef = useRef<HTMLInputElement | null>(null);
  const draftPayloadRef = useRef<HTMLInputElement | null>(null);
  const [frameHeight, setFrameHeight] = useState(980);

  const srcDoc = useMemo(() => injectBranding(contentHtml), [contentHtml]);

  function applyPrefillValues() {
    const frameDocument = iframeRef.current?.contentDocument;

    if (!frameDocument) {
      return;
    }

    Object.entries(prefillFields ?? {}).forEach(([fieldId, value]) => {
      if (!value.trim()) {
        return;
      }

      const element = frameDocument.getElementById(fieldId);

      if (
        !element ||
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        )
      ) {
        return;
      }

      if (element.value.trim()) {
        return;
      }

      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });

    if (!draftValues) {
      return;
    }

    Object.entries(draftValues).forEach(([key, rawValue]) => {
      if (typeof rawValue === "string") {
        const byId = frameDocument.getElementById(key);
        if (
          byId instanceof HTMLInputElement ||
          byId instanceof HTMLTextAreaElement ||
          byId instanceof HTMLSelectElement
        ) {
          if (!byId.value.trim()) {
            byId.value = rawValue;
            byId.dispatchEvent(new Event("input", { bubbles: true }));
            byId.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }

        const radioGroup = frameDocument.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(key)}"]`,
        );
        if (radioGroup.length > 0) {
          radioGroup.forEach((input) => {
            input.checked = input.value === rawValue;
          });
          return;
        }

        const byName = frameDocument.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          `[name="${CSS.escape(key)}"]`,
        );
        if (byName && !byName.value.trim()) {
          byName.value = rawValue;
          byName.dispatchEvent(new Event("input", { bubbles: true }));
          byName.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      if (Array.isArray(rawValue)) {
        const values = rawValue.filter((item): item is string => typeof item === "string");
        const checkboxes = frameDocument.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][name="${CSS.escape(key)}"]`,
        );
        checkboxes.forEach((input) => {
          input.checked = values.includes(input.value);
        });
        return;
      }

      if (typeof rawValue === "boolean") {
        const checkbox = frameDocument.getElementById(key);
        if (checkbox instanceof HTMLInputElement && checkbox.type === "checkbox") {
          checkbox.checked = rawValue;
        }
      }
    });
  }

  function applyInjectedLinks() {
    const frameDocument = iframeRef.current?.contentDocument;

    if (!frameDocument || !injectedLinks) {
      return;
    }

    Object.entries(injectedLinks).forEach(([elementId, href]) => {
      const element = frameDocument.getElementById(elementId);

      if (!(element instanceof HTMLAnchorElement) || !href.trim()) {
        return;
      }

      element.href = href;
      element.style.display = "inline-flex";
    });
  }

  function captureLessonResponse() {
    const frameDocument = iframeRef.current?.contentDocument;

    if (
      !frameDocument ||
      !submissionRef.current ||
      !reviewSummaryRef.current ||
      !draftPayloadRef.current
    ) {
      return true;
    }

    const fields = Array.from(
      frameDocument.querySelectorAll("textarea, input, select"),
    ).filter((element) => {
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        )
      ) {
        return false;
      }

      if (!(element instanceof HTMLInputElement)) {
        return true;
      }

      return !["hidden", "button", "submit", "reset"].includes(element.type);
    });

    const seenRadioGroups = new Set<string>();
    const lines: string[] = [];
    const quizSummaryLines: string[] = [];
    const draftPayload: Record<string, unknown> = {};
    const fieldMeta: FieldMetaMap = {};

    fields.forEach((element, index) => {
      const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

      if (element instanceof HTMLInputElement) {
        if (element.type === "radio") {
          const groupName = element.name || `radio-${index}`;
          if (seenRadioGroups.has(groupName)) {
            return;
          }

          seenRadioGroups.add(groupName);
          const checked = frameDocument.querySelector<HTMLInputElement>(
            `input[type="radio"][name="${CSS.escape(groupName)}"]:checked`,
          );

          if (checked?.value?.trim()) {
            lines.push(`${getFieldLabel(checked, index)}: ${checked.value.trim()}`);
            draftPayload[groupName] = checked.value.trim();
            fieldMeta[groupName] = {
              label: getFieldLabel(checked, index),
              type: checked.type,
              excludeFromSpelling: checked.dataset.spellingSource === "exclude",
            };
          }

          return;
        }

        if (element.type === "checkbox") {
          const checkboxKey = element.name || element.id || `checkbox-${index}`;

          if (element.name) {
            const selectedCheckboxes = frameDocument.querySelectorAll<HTMLInputElement>(
              `input[type="checkbox"][name="${CSS.escape(element.name)}"]:checked`,
            );
            draftPayload[checkboxKey] = Array.from(selectedCheckboxes)
              .map((input) => input.value.trim())
              .filter(Boolean);
            fieldMeta[checkboxKey] = {
              label: getFieldLabel(element, index),
              type: element.type,
              excludeFromSpelling: element.dataset.spellingSource === "exclude",
            };
          } else {
            draftPayload[checkboxKey] = element.checked;
            fieldMeta[checkboxKey] = {
              label: getFieldLabel(element, index),
              type: element.type,
              excludeFromSpelling: element.dataset.spellingSource === "exclude",
            };
          }

          if (element.checked && element.value.trim()) {
            lines.push(`${getFieldLabel(element, index)}: ${element.value.trim()}`);
          }
          return;
        }
      }

      const rawValue = field.value;
      const value = typeof rawValue === "string" ? rawValue.trim() : "";

      if (!value) {
        return;
      }

      const draftKey =
        field.id ||
        (typeof field.name === "string"
          ? field.name
          : `field-${index}`);

      draftPayload[draftKey] = value;
      fieldMeta[draftKey] = {
        label: getFieldLabel(element, index),
        type:
          element instanceof HTMLTextAreaElement
            ? "textarea"
            : element instanceof HTMLSelectElement
              ? "select-one"
              : field instanceof HTMLInputElement
                ? field.type || "text"
                : "text",
        excludeFromSpelling: field.dataset.spellingSource === "exclude",
      };
      lines.push(`${getFieldLabel(element, index)}: ${value}`);
    });

    const quizQuestions = Array.from(frameDocument.querySelectorAll(".quiz-q"));
    let answeredQuestions = 0;
    let correctQuestions = 0;

    quizQuestions.forEach((question, index) => {
      const questionText =
        question.querySelector(".q-text")?.textContent?.trim() ?? `Question ${index + 1}`;
      const chosenWrong = question.querySelector(".quiz-opt.wrong")?.textContent?.trim() ?? "";
      const chosenCorrect = question.querySelector(".quiz-opt.correct")?.textContent?.trim() ?? "";

      if (chosenWrong) {
        answeredQuestions += 1;
        quizSummaryLines.push(
          `${questionText} | selected: ${chosenWrong} | correct: ${chosenCorrect || "Not captured"}`,
        );
        return;
      }

      if (chosenCorrect) {
        answeredQuestions += 1;
        correctQuestions += 1;
        quizSummaryLines.push(`${questionText} | selected: ${chosenCorrect}`);
      }
    });

    if (answeredQuestions > 0) {
      quizSummaryLines.unshift(`Quiz score: ${correctQuestions}/${quizQuestions.length}`);

      const scoreMessage =
        frameDocument.getElementById("score-msg")?.textContent?.trim() ?? "";

      if (scoreMessage) {
        quizSummaryLines.splice(1, 0, `Quiz feedback: ${scoreMessage}`);
      }
    }

    submissionRef.current.value = lines.join("\n\n");
    reviewSummaryRef.current.value = quizSummaryLines.join("\n");
    draftPayload.__field_meta = fieldMeta;
    draftPayloadRef.current.value = JSON.stringify(draftPayload);
    return true;
  }

  function syncHeight() {
    const frameDocument = iframeRef.current?.contentDocument;

    if (!frameDocument) {
      return;
    }

    const nextHeight = Math.max(
      frameDocument.documentElement.scrollHeight,
      frameDocument.body?.scrollHeight ?? 0,
      780,
    );

    setFrameHeight(nextHeight + 8);
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-white shadow-[0_14px_40px_rgba(79,38,66,0.06)]">
        <iframe
          ref={iframeRef}
          title="Lesson content"
          srcDoc={srcDoc}
          onLoad={() => {
            applyPrefillValues();
            applyInjectedLinks();
            applyFieldFeedback(
              iframeRef.current?.contentDocument as Document,
              draftValues,
            );
            syncHeight();
            window.setTimeout(syncHeight, 250);
          }}
          style={{ height: `${frameHeight}px` }}
          className="w-full border-0 bg-white"
        />
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-white/90 px-4 py-4">
        <p className="text-sm leading-6 text-[color:var(--mid)]">
          Write inside the lesson boxes, then save your work here so it can be reviewed and fed into spelling later if needed.
        </p>
        <input ref={submissionRef} type="hidden" name="submission_text" />
        <input ref={reviewSummaryRef} type="hidden" name="lesson_review_summary" />
        <input ref={draftPayloadRef} type="hidden" name="draft_payload" />
        <div className="mt-3">
          <PreSubmitChecklist
            submitLabel={submitLabel}
            onBeforeSubmit={captureLessonResponse}
            saveDraftAction={saveDraftAction}
            onBeforeSaveDraft={captureLessonResponse}
          />
        </div>
      </div>
    </div>
  );
}
