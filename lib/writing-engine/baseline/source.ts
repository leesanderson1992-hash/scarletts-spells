import { createHash } from "node:crypto";

import { extractSpellcheckFieldsFromDraftPayload } from "../../courses/spelling-analysis-text";
import type { WritingEngineStage3TaskSubmission, WritingEngineStage3WritingSample } from "../types";

/** Offline source adapters. No loaders, database clients or runtime writers. */
export type BaselineSourceInput = {
  sourceId: string;
  revision: string;
  promptText?: string;
} & (
  | { kind: "course_draft"; draftPayload: unknown }
  | { kind: "task_submission"; submissionText: string }
  | { kind: "writing_sample"; sampleText: string }
);

export type SourceField = Readonly<{
  key: string;
  rawText: string;
  textHash: string;
  selectedForBaseline: boolean;
}>;

export type BaselineSource = Readonly<{
  kind: BaselineSourceInput["kind"];
  sourceId: string;
  revision: string;
  promptText: string | null;
  fields: readonly SourceField[];
  provenance: "field_metadata_selection" | "unsegmented_text_authorship_unknown";
}>;

export type WritingOccurrence = Readonly<{
  id: string;
  fieldKey: string;
  start: number;
  end: number;
  observedText: string;
  contextStatus: "NOT_ASSESSED";
}>;

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Accept existing Writing Engine records without fetching or modifying them.
 * Prefer explicit draft fields; never fall back to a flattened copy when all
 * draft fields were excluded. A historical sample is not proof of authorship.
 */
export function sourceInputFromRecords(input: {
  taskSubmission: WritingEngineStage3TaskSubmission;
  writingSample?: WritingEngineStage3WritingSample | null;
  draftPayload?: unknown;
  revision: string;
  promptText?: string;
}): BaselineSourceInput {
  const common = { revision: input.revision, promptText: input.promptText };
  if (input.writingSample && input.writingSample.taskSubmissionId !== input.taskSubmission.id) {
    throw new Error("Writing sample does not belong to the supplied submission");
  }
  if (input.draftPayload !== undefined) {
    return { ...common, kind: "course_draft", sourceId: input.taskSubmission.id, draftPayload: input.draftPayload };
  }
  if (input.writingSample?.sampleText?.trim()) {
    return { ...common, kind: "writing_sample", sourceId: input.writingSample.id, sampleText: input.writingSample.sampleText };
  }
  if (input.taskSubmission.submissionText === null) throw new Error("No source writing available");
  return { ...common, kind: "task_submission", sourceId: input.taskSubmission.id, submissionText: input.taskSubmission.submissionText };
}

export function adaptBaselineSource(input: BaselineSourceInput): BaselineSource {
  if (!input.sourceId?.trim() || !input.revision?.trim()) {
    throw new Error("Source identity and revision are required");
  }
  if (input.promptText !== undefined && typeof input.promptText !== "string") {
    throw new Error("promptText must be a string");
  }
  let fields: SourceField[];
  if (input.kind === "course_draft") {
    if (!input.draftPayload || typeof input.draftPayload !== "object" || Array.isArray(input.draftPayload)) {
      throw new Error("course_draft requires an object draftPayload");
    }
    const selected = new Set(extractSpellcheckFieldsFromDraftPayload(input.draftPayload).map((f) => f.key));
    fields = Object.entries(input.draftPayload)
      .filter(([key, value]) => !key.startsWith("__") && typeof value === "string")
      .map(([key, value]) => ({ key, rawText: value as string, textHash: fingerprint(value), selectedForBaseline: selected.has(key) }));
  } else {
    const text = input.kind === "task_submission" ? input.submissionText : input.kind === "writing_sample" ? input.sampleText : undefined;
    if (typeof text !== "string") throw new Error("Expected task_submission or writing_sample text");
    fields = [{ key: input.kind === "task_submission" ? "submission_text" : "sample_text", rawText: text, textHash: fingerprint(text), selectedForBaseline: true }];
  }
  return Object.freeze({
    kind: input.kind,
    sourceId: input.sourceId,
    revision: input.revision,
    promptText: input.promptText ?? null,
    fields: Object.freeze(fields.map((field) => Object.freeze(field))),
    provenance: input.kind === "course_draft" ? "field_metadata_selection" : "unsegmented_text_authorship_unknown",
  });
}

/** UTF-16, end-exclusive offsets into original text, never normalised text. */
export function anchorOccurrence(source: BaselineSource, fieldKey: string, start: number, end: number): WritingOccurrence {
  const field = source.fields.find((item) => item.key === fieldKey);
  if (!field || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > field.rawText.length) {
    throw new Error("Invalid source span");
  }
  const splitsSurrogate = (offset: number) => /[\uD800-\uDBFF]/.test(field.rawText.charAt(offset - 1)) && /[\uDC00-\uDFFF]/.test(field.rawText.charAt(offset));
  if (splitsSurrogate(start) || splitsSurrogate(end)) throw new Error("Span splits a Unicode surrogate pair");
  return Object.freeze({
    id: `writing-occurrence-v1:${fingerprint([source.kind, source.sourceId, source.revision, field.key, field.textHash, start, end])}`,
    fieldKey, start, end, observedText: field.rawText.slice(start, end), contextStatus: "NOT_ASSESSED",
  });
}

export function extractOccurrences(source: BaselineSource, field: SourceField): WritingOccurrence[] {
  // Preserve Unicode letters, combining marks, contractions and hyphenated forms.
  // This is an inspection tokenizer, not a lexical-validity decision.
  const pattern = new RegExp("[\\p{L}\\p{M}]+(?:['’\\-][\\p{L}\\p{M}]+)*", "gu");
  return Array.from(field.rawText.matchAll(pattern), (match) => anchorOccurrence(source, field.key, match.index!, match.index! + match[0].length));
}
