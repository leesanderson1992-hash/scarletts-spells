import { buildSpellcheckSourceText } from "../../courses/spelling-analysis-text";

import type {
  WritingEngineSourceMetadata,
  WritingEngineSourceRef,
  WritingEngineStage3TaskSubmission,
  WritingEngineStage3WritingSample,
} from "../types";

export type WritingEngineAuthenticSubmissionSourceTextOrigin =
  | "writing_sample"
  | "task_submission_text"
  | "missing";

export type WritingEngineAuthenticSubmissionNormalization = {
  taskSubmissionId: string;
  writingSampleId: string | null;
  sourceTextOrigin: WritingEngineAuthenticSubmissionSourceTextOrigin;
  analysisText: string;
};

export type WritingEngineAuthenticSubmissionSourceInput = {
  taskSubmission: WritingEngineStage3TaskSubmission;
  writingSample?: WritingEngineStage3WritingSample | null;
};

export function normalizeAuthenticWritingSubmissionSource(
  input: WritingEngineAuthenticSubmissionSourceInput,
): WritingEngineAuthenticSubmissionNormalization {
  const writingSampleText = input.writingSample?.sampleText?.trim() ?? "";

  if (writingSampleText.length > 0) {
    return {
      taskSubmissionId: input.taskSubmission.id,
      writingSampleId: input.writingSample?.id ?? null,
      sourceTextOrigin: "writing_sample",
      analysisText: writingSampleText,
    };
  }

  const submissionText = buildSpellcheckSourceText({
    submissionText: input.taskSubmission.submissionText ?? "",
  });

  if (submissionText.length > 0) {
    return {
      taskSubmissionId: input.taskSubmission.id,
      writingSampleId: input.writingSample?.id ?? null,
      sourceTextOrigin: "task_submission_text",
      analysisText: submissionText,
    };
  }

  return {
    taskSubmissionId: input.taskSubmission.id,
    writingSampleId: input.writingSample?.id ?? null,
    sourceTextOrigin: "missing",
    analysisText: "",
  };
}

function buildAuthenticWritingSourceEntityId(input: {
  taskSubmissionId: string;
  writingSampleId: string | null;
  positionStart: number;
  positionEnd: number;
  observedText: string;
  targetText: string | null;
}) {
  return [
    "authentic_writing",
    input.taskSubmissionId,
    input.writingSampleId ?? "no_sample",
    `${input.positionStart}-${input.positionEnd}`,
    input.observedText.toLowerCase(),
    (input.targetText ?? "no_target").toLowerCase(),
  ].join("::");
}

export function buildAuthenticWritingSourceRef(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  observedText: string;
  targetText: string | null;
  positionStart: number;
  positionEnd: number;
  metadata: WritingEngineSourceMetadata;
}) {
  return {
    sourceType: "authentic_writing" as const,
    sourceEntityId: buildAuthenticWritingSourceEntityId({
      taskSubmissionId: input.normalization.taskSubmissionId,
      writingSampleId: input.normalization.writingSampleId,
      positionStart: input.positionStart,
      positionEnd: input.positionEnd,
      observedText: input.observedText,
      targetText: input.targetText,
    }),
    taskSubmissionId: input.normalization.taskSubmissionId,
    writingSampleId: input.normalization.writingSampleId,
    metadata: input.metadata,
  } satisfies WritingEngineSourceRef;
}
