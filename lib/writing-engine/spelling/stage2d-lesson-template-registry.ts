import type {
  WritingEnginePracticeRoute,
  WritingEngineStage1d1CatalogEntry,
} from "../types";
import { resolveStage2SpellingCatalogContent } from "./stage2a-content-resolver";

export type WritingEngineSpellingLessonTemplateKey = string;

export type WritingEngineStage2dLessonTemplateRegistryEntry = {
  microSkillKey: string;
  allowedTemplateKeys: WritingEngineSpellingLessonTemplateKey[];
  dictationTemplateKey: WritingEngineSpellingLessonTemplateKey | null;
  dictationTemplateKeys: WritingEngineSpellingLessonTemplateKey[];
  sourceRefs: string[];
};

export type WritingEngineStage2dLessonTemplateResolutionResolved = {
  status: "resolved";
  microSkillKey: string;
  practiceRoute: WritingEnginePracticeRoute;
  templateKey: WritingEngineSpellingLessonTemplateKey;
  sourceRefs: string[];
};

export type WritingEngineStage2dLessonTemplateResolutionUnresolved = {
  status: "unresolved";
  microSkillKey: string;
  practiceRoute: WritingEnginePracticeRoute;
  reason:
    | "missing_template_registry_candidates"
    | "preferred_template_key_unavailable"
    | "dictation_template_key_unavailable";
  sourceRefs: string[];
};

export type WritingEngineStage2dLessonTemplateResolution =
  | WritingEngineStage2dLessonTemplateResolutionResolved
  | WritingEngineStage2dLessonTemplateResolutionUnresolved;

function normalizeTemplateKey(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function dedupeTemplateKeys(values: Array<string | null | undefined>) {
  const normalizedValues = values
    .map((value) => normalizeTemplateKey(value))
    .filter((value): value is string => value !== null);

  return normalizedValues.filter(
    (value, index) => normalizedValues.indexOf(value) === index,
  );
}

export function readStage2dLessonTemplateRegistryEntry(
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "allowedTemplateKeys" | "metadata" | "displayName"
  >,
): WritingEngineStage2dLessonTemplateRegistryEntry | null {
  const content = resolveStage2SpellingCatalogContent(catalogEntry);
  const templateRegistryCandidates = content.templateRegistryCandidates;

  if (
    templateRegistryCandidates.availability !== "confirmed_canonical" ||
    !templateRegistryCandidates.isPresent ||
    !templateRegistryCandidates.value
  ) {
    return null;
  }

  return {
    microSkillKey: catalogEntry.microSkillKey,
    allowedTemplateKeys: [
      ...dedupeTemplateKeys(templateRegistryCandidates.value.allowedTemplateKeys),
    ],
    dictationTemplateKey: normalizeTemplateKey(
      templateRegistryCandidates.value.dictationTemplateKey,
    ),
    dictationTemplateKeys: [
      ...dedupeTemplateKeys(templateRegistryCandidates.value.dictationTemplateKeys),
    ],
    sourceRefs: [...templateRegistryCandidates.sourceRefs],
  };
}

export function resolveStage2dLessonTemplateKey(input: {
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "allowedTemplateKeys" | "metadata" | "displayName"
  >;
  practiceRoute: WritingEnginePracticeRoute;
  preferredTemplateKeys?: Array<string | null | undefined>;
}): WritingEngineStage2dLessonTemplateResolution {
  const registryEntry = readStage2dLessonTemplateRegistryEntry(input.catalogEntry);

  if (!registryEntry) {
    return {
      status: "unresolved",
      microSkillKey: input.catalogEntry.microSkillKey,
      practiceRoute: input.practiceRoute,
      reason: "missing_template_registry_candidates",
      sourceRefs: resolveStage2SpellingCatalogContent(input.catalogEntry)
        .templateRegistryCandidates.sourceRefs,
    };
  }

  if (input.practiceRoute === "dictation") {
    const dictationTemplateCandidates = dedupeTemplateKeys([
      registryEntry.dictationTemplateKey,
      ...registryEntry.dictationTemplateKeys,
    ]).filter((key) => registryEntry.allowedTemplateKeys.includes(key));

    const selectedTemplateKey = dictationTemplateCandidates[0] ?? null;

    if (!selectedTemplateKey) {
      return {
        status: "unresolved",
        microSkillKey: input.catalogEntry.microSkillKey,
        practiceRoute: input.practiceRoute,
        reason: "dictation_template_key_unavailable",
        sourceRefs: [...registryEntry.sourceRefs],
      };
    }

    return {
      status: "resolved",
      microSkillKey: input.catalogEntry.microSkillKey,
      practiceRoute: input.practiceRoute,
      templateKey: selectedTemplateKey,
      sourceRefs: [...registryEntry.sourceRefs],
    };
  }

  const preferredTemplateKeys = dedupeTemplateKeys(input.preferredTemplateKeys ?? []);
  const selectedTemplateKey =
    preferredTemplateKeys.find((key) => registryEntry.allowedTemplateKeys.includes(key)) ??
    null;

  if (!selectedTemplateKey) {
    return {
      status: "unresolved",
      microSkillKey: input.catalogEntry.microSkillKey,
      practiceRoute: input.practiceRoute,
      reason: "preferred_template_key_unavailable",
      sourceRefs: [...registryEntry.sourceRefs],
    };
  }

  return {
    status: "resolved",
    microSkillKey: input.catalogEntry.microSkillKey,
    practiceRoute: input.practiceRoute,
    templateKey: selectedTemplateKey,
    sourceRefs: [...registryEntry.sourceRefs],
  };
}
