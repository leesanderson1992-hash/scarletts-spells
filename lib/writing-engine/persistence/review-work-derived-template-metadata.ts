import type { createClient } from "../../supabase/server";
import { resolveStage2dLessonTemplateKey } from "../spelling/stage2d-lesson-template-registry";
import type { WritingEnginePracticeRoute } from "../types";

import { getStage1d1CatalogEntries } from "./stage1d1-catalog-entries";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ReviewWorkDerivedTemplateMetadata =
  | {
      status: "available";
      microSkillKey: string;
      practiceRoute: WritingEnginePracticeRoute;
      templateKey: string;
      sourceRefs: string[];
    }
  | {
      status: "unavailable";
      microSkillKey: string;
      practiceRoute: WritingEnginePracticeRoute | null;
      reason:
        | "missing_catalog_entry"
        | "missing_template_registry_candidates"
        | "preferred_template_key_unavailable"
        | "dictation_template_key_unavailable";
      sourceRefs: string[];
    };

export async function getReviewWorkDerivedTemplateMetadataByMicroSkillKeys(input: {
  supabase: SupabaseServerClient;
  microSkillKeys: string[];
}) {
  const microSkillKeys = Array.from(
    new Set(
      input.microSkillKeys
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  if (microSkillKeys.length === 0) {
    return {} as Record<string, ReviewWorkDerivedTemplateMetadata>;
  }

  const catalogEntries = await getStage1d1CatalogEntries({
    supabase: input.supabase,
    microSkillKeys,
  });
  const catalogEntryByMicroSkillKey = new Map(
    catalogEntries.map((entry) => [entry.microSkillKey, entry] as const),
  );
  const metadataByMicroSkillKey: Record<string, ReviewWorkDerivedTemplateMetadata> = {};

  microSkillKeys.forEach((microSkillKey) => {
    const catalogEntry = catalogEntryByMicroSkillKey.get(microSkillKey) ?? null;

    if (!catalogEntry) {
      metadataByMicroSkillKey[microSkillKey] = {
        status: "unavailable",
        microSkillKey,
        practiceRoute: null,
        reason: "missing_catalog_entry",
        sourceRefs: [],
      };
      return;
    }

    const templateResolution = resolveStage2dLessonTemplateKey({
      catalogEntry,
      practiceRoute: catalogEntry.practiceRoute,
      preferredTemplateKeys: catalogEntry.allowedTemplateKeys,
    });

    if (templateResolution.status === "resolved") {
      metadataByMicroSkillKey[microSkillKey] = {
        status: "available",
        microSkillKey,
        practiceRoute: templateResolution.practiceRoute,
        templateKey: templateResolution.templateKey,
        sourceRefs: [...templateResolution.sourceRefs],
      };
      return;
    }

    metadataByMicroSkillKey[microSkillKey] = {
      status: "unavailable",
      microSkillKey,
      practiceRoute: templateResolution.practiceRoute,
      reason: templateResolution.reason,
      sourceRefs: [...templateResolution.sourceRefs],
    };
  });

  return metadataByMicroSkillKey;
}
