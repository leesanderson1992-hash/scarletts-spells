"use client";

import type { ReactNode } from "react";

import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";
import { StructuredLessonBuilderEditorList } from "@/components/structured-lesson-builder-editor-list";
import { StructuredLessonBuilderPreview } from "@/components/structured-lesson-builder-preview";
import {
  BLOCK_OPTIONS,
  useStructuredLessonBuilderState,
} from "@/components/structured-lesson-builder-state";
import { STRUCTURED_LESSON_PRESETS } from "@/lib/lessons/presets";
import type { StructuredLessonDocument } from "@/lib/lessons/schema";

type StructuredLessonBuilderProps = {
  formId?: string;
  taskTitle: string;
  initialLesson?: StructuredLessonDocument | null;
  compact?: boolean;
};

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

function StructuredLessonBuilderHeader({
  compact,
  isExpanded,
  onToggleExpanded,
  onToggleFullPreview,
}: {
  compact: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onToggleFullPreview: () => void;
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {compact ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)]"
            >
              {isExpanded ? "Hide builder" : "Open builder"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleFullPreview}
              aria-expanded={isExpanded}
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)]"
            >
              {isExpanded ? "Hide preview" : "Show preview"}
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

function StructuredLessonPresetPicker({
  compact,
  onLoadPreset,
}: {
  compact: boolean;
  onLoadPreset: (presetId: string) => void;
}) {
  return (
    <SectionCard compact={compact}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="brand-eyebrow">Starter templates</p>
            <BuilderInfoHint label="Lesson template help">
              Presets are a fast starting point for common lesson shapes. Load one when it saves time, then tailor the blocks below.
            </BuilderInfoHint>
          </div>
          <h4 className="mt-1 text-base font-semibold text-[color:var(--ink)]">
            Load a structured lesson preset
          </h4>
        </div>
      </div>

      {compact ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {STRUCTURED_LESSON_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onLoadPreset(preset.id)}
              className="rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.18)] px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
              title={preset.description}
              aria-label={`Load ${preset.label} preset`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {STRUCTURED_LESSON_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="rounded-[1.5rem] border border-[var(--border)] bg-[rgba(252,228,244,0.18)] p-4"
            >
              <h5 className="text-base font-semibold text-[color:var(--ink)]">{preset.label}</h5>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">{preset.description}</p>
              <button
                type="button"
                onClick={() => onLoadPreset(preset.id)}
                className="mt-4 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
              >
                Load preset
              </button>
            </div>
          ))}
        </div>
      )}
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

export function StructuredLessonBuilder({
  formId,
  taskTitle,
  initialLesson,
  compact = false,
}: StructuredLessonBuilderProps) {
  const builder = useStructuredLessonBuilderState({
    taskTitle,
    initialLesson,
    compact,
  });
  const formProps = formId ? { form: formId } : {};
  const handleFullPreviewToggle = () => {
    if (builder.isExpanded) {
      if (builder.showPreview) {
        builder.togglePreview();
      }
      builder.toggleExpanded();
      return;
    }

    builder.toggleExpanded();
    if (!builder.showPreview) {
      builder.togglePreview();
    }
  };

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
        isExpanded={builder.isExpanded}
        onToggleExpanded={builder.toggleExpanded}
        onToggleFullPreview={handleFullPreviewToggle}
      />

      {builder.isExpanded ? (
        <div className={`grid ${compact ? "gap-3" : "gap-4"}`}>
          <StructuredLessonPresetPicker compact={compact} onLoadPreset={builder.loadPreset} />
          <StructuredLessonBlockPalette compact={compact} onAddBlock={builder.addBlock} />

          {builder.showPreview ? <StructuredLessonBuilderPreview blocks={builder.blocks} /> : null}

          <StructuredLessonBuilderEditorList builder={builder} />
        </div>
      ) : null}
    </div>
  );
}
