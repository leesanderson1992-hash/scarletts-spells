import type {
  WritingEngineStage2aAuditFrequencySignal,
  WritingEngineStage2aCanonicalMappingSignal,
  WritingEngineStage2aParentLocalPromotedMappingSignal,
  WritingEngineStage2aRecommendationInput,
  WritingEngineStage2aReviewedEvidenceSignal,
  WritingEngineStage2aWordMapMetadataSignal,
} from "../spelling/stage2a-micro-skill-recommendation";
import type { WritingEngineStage1d1CatalogEntry } from "../types";

type Stage2aSupabaseReadQuery = PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
}> & {
  eq(column: string, value: unknown): Stage2aSupabaseReadQuery;
};

type SupabaseServerClient = {
  from(table: string): {
    select(columns: string): Stage2aSupabaseReadQuery;
  };
};

type CatalogRow = {
  micro_skill_key: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  practice_route: WritingEngineStage1d1CatalogEntry["practiceRoute"];
  is_assignable: boolean;
  is_active: boolean;
  display_name: string;
  allowed_template_keys: string[] | null;
  metadata: Record<string, unknown> | null;
};

type CanonicalMappingRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string;
};

type ParentLocalMappingRow = {
  id: string;
  parent_user_id: string;
  child_id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  candidate_status: string;
  promotion_scope: string;
};

type WritingIssueRow = {
  id: string;
  observed_text: string | null;
  suggested_replacement: string | null;
  approved_replacement: string | null;
  micro_skill_key: string;
  final_classification: string | null;
  issue_status: string;
};

type MisspellingFrequencyRow = {
  id: string;
  misspelled_word: string;
  corrected_word: string;
};

type WordMapDiagnosticRow = {
  id: string;
  misspelling_normalised: string;
  correction_normalised: string;
  micro_skill_key: string;
  confidence: string;
};

type WordMapWordRow = {
  id: string;
  normalised_word: string;
  micro_skill_key: string;
};

function normalizeWord(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function isOptionalRecommendationSourceUnavailableError(error: {
  message: string;
  code?: string;
}) {
  const message = error.message.toLowerCase();

  return (
    error.code === "42501" ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("permission denied") ||
    message.includes("could not find the table") ||
    message.includes("could not find the schema cache") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

async function optionalSelect<T>(
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
) {
  const { data, error } = await query;

  if (error) {
    if (isOptionalRecommendationSourceUnavailableError(error)) {
      return [] as T[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as T[];
}

export async function buildStage2aMicroSkillRecommendationReadModel(input: {
  supabase: SupabaseServerClient;
  misspelling: string | null | undefined;
  correction: string | null | undefined;
  contextText?: string | null;
  parentUserId?: string | null;
  childId?: string | null;
  taskSubmissionId?: string | null;
  writingSampleId?: string | null;
  trustedCanonicalMappings?: WritingEngineStage2aCanonicalMappingSignal[];
}): Promise<WritingEngineStage2aRecommendationInput> {
  const misspellingNormalized = normalizeWord(input.misspelling);
  const correctionNormalized = normalizeWord(input.correction);

  const [
    catalogRows,
    canonicalRows,
    parentLocalRows,
    writingIssueRows,
    frequencyRows,
    wordMapDiagnosticRows,
    wordMapWordRows,
  ] = await Promise.all([
    optionalSelect<CatalogRow>(
      input.supabase
        .from("micro_skill_catalog")
        .select(
          [
            "micro_skill_key",
            "mastery_domain_key",
            "skill_family_key",
            "skill_cluster_key",
            "practice_route",
            "is_assignable",
            "is_active",
            "display_name",
            "allowed_template_keys",
            "metadata",
          ].join(", "),
        )
        .eq("mastery_domain_key", "D4")
        .eq("is_active", true)
        .eq("is_assignable", true),
    ),
    misspellingNormalized
      ? optionalSelect<CanonicalMappingRow>(
          input.supabase
            .from("spelling_canonical_mappings")
            .select(
              "id, misspelling_normalized, correct_spelling_normalized, micro_skill_key, mapping_status",
            )
            .eq("misspelling_normalized", misspellingNormalized)
            .eq("mapping_status", "active"),
        )
      : Promise.resolve([]),
    input.parentUserId && input.childId && misspellingNormalized
      ? optionalSelect<ParentLocalMappingRow>(
          input.supabase
            .from("parent_verified_spelling_candidate_mappings")
            .select(
              "id, parent_user_id, child_id, misspelling_normalized, correct_spelling_normalized, micro_skill_key, candidate_status, promotion_scope",
            )
            .eq("parent_user_id", input.parentUserId)
            .eq("child_id", input.childId)
            .eq("misspelling_normalized", misspellingNormalized)
            .eq("candidate_status", "parent_local_promoted"),
        )
      : Promise.resolve([]),
    correctionNormalized || misspellingNormalized
      ? optionalSelect<WritingIssueRow>(
          input.supabase
            .from("writing_issues")
            .select(
              "id, observed_text, suggested_replacement, approved_replacement, micro_skill_key, final_classification, issue_status",
            )
            .eq("issue_status", "finalised"),
        )
      : Promise.resolve([]),
    misspellingNormalized
      ? optionalSelect<MisspellingFrequencyRow>(
          input.supabase
            .from("misspelling_instances")
            .select("id, misspelled_word, corrected_word")
            .eq("misspelled_word", misspellingNormalized),
        )
      : Promise.resolve([]),
    misspellingNormalized
      ? optionalSelect<WordMapDiagnosticRow>(
          input.supabase
            .from("canonical_spelling_word_map_diagnostic_examples")
            .select("id, misspelling_normalised, correction_normalised, micro_skill_key, confidence")
            .eq("misspelling_normalised", misspellingNormalized),
        )
      : Promise.resolve([]),
    correctionNormalized
      ? optionalSelect<WordMapWordRow>(
          input.supabase
            .from("canonical_spelling_word_map_words")
            .select("id, normalised_word, micro_skill_key")
            .eq("normalised_word", correctionNormalized),
        )
      : Promise.resolve([]),
  ]);

  const historicalReviewedEvidence: WritingEngineStage2aReviewedEvidenceSignal[] =
    writingIssueRows.flatMap((row) => {
      const rowMisspelling = normalizeWord(row.observed_text);
      const rowCorrection = normalizeWord(row.approved_replacement ?? row.suggested_replacement);

      if (
        !rowMisspelling ||
        !rowCorrection ||
        rowMisspelling !== misspellingNormalized ||
        rowCorrection !== correctionNormalized
      ) {
        return [];
      }

      return [{
        sourceId: row.id,
        misspellingNormalized: rowMisspelling,
        correctSpellingNormalized: rowCorrection,
        microSkillKey: row.micro_skill_key,
        finalClassification: row.final_classification,
        reviewStatus: row.issue_status,
      }];
    });

  const frequencyByMicroSkill = new Map<string, WritingEngineStage2aAuditFrequencySignal>();
  for (const row of frequencyRows) {
    const rowMisspelling = normalizeWord(row.misspelled_word);
    const rowCorrection = normalizeWord(row.corrected_word);

    if (
      !rowMisspelling ||
      !rowCorrection ||
      rowMisspelling !== misspellingNormalized ||
      rowCorrection !== correctionNormalized
    ) {
      continue;
    }

    for (const evidence of historicalReviewedEvidence) {
      const current = frequencyByMicroSkill.get(evidence.microSkillKey);
      frequencyByMicroSkill.set(evidence.microSkillKey, {
        sourceId: current?.sourceId ?? row.id,
        misspellingNormalized: rowMisspelling,
        correctSpellingNormalized: rowCorrection,
        microSkillKey: evidence.microSkillKey,
        evidenceCount: (current?.evidenceCount ?? 0) + 1,
      });
    }
  }

  const wordMapMetadataSignals: WritingEngineStage2aWordMapMetadataSignal[] = [
    ...wordMapDiagnosticRows.map((row) => ({
      sourceId: row.id,
      misspellingNormalized: row.misspelling_normalised,
      correctSpellingNormalized: row.correction_normalised,
      microSkillKey: row.micro_skill_key,
      confidence: row.confidence,
    })),
    ...wordMapWordRows.map((row) => ({
      sourceId: row.id,
      wordNormalized: row.normalised_word,
      microSkillKey: row.micro_skill_key,
      confidence: "medium",
    })),
  ];

  return {
    misspelling: input.misspelling,
    correction: input.correction,
    contextText: input.contextText,
    parentUserId: input.parentUserId,
    childId: input.childId,
    taskSubmissionId: input.taskSubmissionId,
    writingSampleId: input.writingSampleId,
    catalogEntries: catalogRows.map((row) => ({
      microSkillKey: row.micro_skill_key,
      masteryDomainKey: row.mastery_domain_key,
      skillFamilyKey: row.skill_family_key,
      skillClusterKey: row.skill_cluster_key,
      practiceRoute: row.practice_route,
      isAssignable: row.is_assignable,
      isActive: row.is_active,
      displayName: row.display_name,
      allowedTemplateKeys: row.allowed_template_keys ?? [],
      metadata: row.metadata ?? {},
    })),
    canonicalMappings: [
      ...(input.trustedCanonicalMappings ?? []),
      ...canonicalRows.map((row): WritingEngineStage2aCanonicalMappingSignal => ({
        mappingId: row.id,
        misspellingNormalized: row.misspelling_normalized,
        correctSpellingNormalized: row.correct_spelling_normalized,
        microSkillKey: row.micro_skill_key,
        mappingStatus: row.mapping_status,
      })),
    ],
    parentLocalPromotedMappings: parentLocalRows.map(
      (row): WritingEngineStage2aParentLocalPromotedMappingSignal => ({
        mappingId: row.id,
        parentUserId: row.parent_user_id,
        childId: row.child_id,
        misspellingNormalized: row.misspelling_normalized,
        correctSpellingNormalized: row.correct_spelling_normalized,
        microSkillKey: row.micro_skill_key,
        candidateStatus: row.candidate_status,
        promotionScope: row.promotion_scope,
      }),
    ),
    historicalReviewedEvidence,
    auditFrequencySignals: [...frequencyByMicroSkill.values()],
    wordMapMetadataSignals,
  };
}
