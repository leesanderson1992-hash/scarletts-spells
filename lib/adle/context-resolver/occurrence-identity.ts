import {
  CONTEXT_OCCURRENCE_SCHEMA_VERSION,
  CONTEXT_SURFACE_NORMALIZATION_VERSION,
  type ContextCanonicalWordIdentity,
  type ContextOccurrenceIdentity,
  type ContextSourceClass,
  type ContextWritingSourceIdentity,
} from "./contracts";
import { fingerprintContextValue } from "./fingerprint";

export interface CreateContextOccurrenceIdentityInput {
  learnerId: string;
  source: ContextWritingSourceIdentity;
  canonicalWord: ContextCanonicalWordIdentity;
  observedSurface: string;
  startOffset: number;
  endOffset: number;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`context_occurrence_missing:${label}`);
  return normalized;
}

export function normalizeContextObservedSurface(surface: string): string {
  return surface
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .toLocaleLowerCase("en-GB");
}

export function fingerprintWritingSource(input: {
  sourceClass: ContextSourceClass;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceRevision: string;
  sourceField: string;
  text: string;
}): string {
  return fingerprintContextValue(input);
}

export function createContextOccurrenceIdentity(
  input: CreateContextOccurrenceIdentityInput,
): ContextOccurrenceIdentity {
  const learnerId = requireText(input.learnerId, "learnerId");
  const source: ContextWritingSourceIdentity = {
    sourceClass: input.source.sourceClass,
    sourceEntityType: requireText(input.source.sourceEntityType, "sourceEntityType"),
    sourceEntityId: requireText(input.source.sourceEntityId, "sourceEntityId"),
    sourceRevision: requireText(input.source.sourceRevision, "sourceRevision"),
    sourceFingerprint: requireText(input.source.sourceFingerprint, "sourceFingerprint"),
    sourceField: requireText(input.source.sourceField, "sourceField"),
  };
  const canonicalWord: ContextCanonicalWordIdentity = {
    canonicalWordId: requireText(input.canonicalWord.canonicalWordId, "canonicalWordId"),
    canonicalWordKey: requireText(input.canonicalWord.canonicalWordKey, "canonicalWordKey"),
    normalisedWord: requireText(input.canonicalWord.normalisedWord, "normalisedWord"),
    dialectCode: requireText(input.canonicalWord.dialectCode, "dialectCode"),
  };
  if (!Number.isSafeInteger(input.startOffset) || input.startOffset < 0) {
    throw new Error("context_occurrence_invalid:startOffset");
  }
  if (!Number.isSafeInteger(input.endOffset) || input.endOffset <= input.startOffset) {
    throw new Error("context_occurrence_invalid:endOffset");
  }
  const normalizedObservedSurface = normalizeContextObservedSurface(input.observedSurface);
  if (!normalizedObservedSurface) throw new Error("context_occurrence_missing:observedSurface");
  const observedSurface = requireText(input.observedSurface, "observedSurface");
  const fields = {
    occurrenceSchemaVersion: CONTEXT_OCCURRENCE_SCHEMA_VERSION,
    learnerId,
    source,
    canonicalWord,
    observedSurface,
    normalizedObservedSurface,
    span: {
      startOffset: input.startOffset,
      endOffset: input.endOffset,
    },
  } as const;
  return {
    ...fields,
    occurrenceId: `context-occurrence:${fingerprintContextValue({
      ...fields,
      surfaceNormalizationVersion: CONTEXT_SURFACE_NORMALIZATION_VERSION,
    })}`,
  };
}
