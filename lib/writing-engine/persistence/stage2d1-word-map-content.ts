import type {
  WritingEngineStage2d1CatalogRead,
  WritingEngineStage2d1ContrastPairRead,
  WritingEngineStage2d1LearningItemRead,
  WritingEngineStage2d1RouteSupportRead,
  WritingEngineStage2d1SourceProvenance,
  WritingEngineStage2d1WordMapContentRepository,
  WritingEngineStage2d1WordMapRoute,
  WritingEngineStage2d1WordRead,
} from "../assignments/stage2d1-word-map-content";

type SupabaseServerClient = {
  from(table: string): any;
};

type Stage2d1LearningItemRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  micro_skill_key: string | null;
  practice_route: string | null;
  is_active: boolean;
};

type Stage2d1CatalogRow = {
  micro_skill_key: string;
  mastery_domain_key: string;
  practice_route: string | null;
  is_assignable: boolean;
  is_active: boolean;
};

type Stage2d1RouteSupportRow = {
  id: string;
  import_batch_id: string;
  row_status: string;
  source_sheet: string;
  source_row_number: number;
  source_row_hash: string;
  micro_skill_key: string;
  route: string;
  minimum_words_required: number;
  requires_contrast_words: boolean;
  template_key: string | null;
  enabled_for_mvp: boolean;
};

type Stage2d1WordRow = {
  id: string;
  import_batch_id: string;
  row_status: string;
  source_sheet: string;
  source_row_number: number;
  source_row_hash: string;
  micro_skill_key: string;
  word: string;
  normalised_word: string;
  word_role: string;
  micro_skill_role: string;
  diversity_group_key: string | null;
  complexity_band: string;
  frequency_band: string;
  practice_route: string;
  approved_for_assignment: boolean;
};

type Stage2d1ContrastPairRow = {
  id: string;
  import_batch_id: string;
  row_status: string;
  source_sheet: string;
  source_row_number: number;
  source_row_hash: string;
  target_micro_skill_key: string;
  target_word: string;
  contrast_word: string;
  contrast_micro_skill_key: string;
  contrast_type: string;
  approved_for_assignment: boolean;
};

type Stage2d1BatchRow = {
  id: string;
  batch_status: string;
};

function provenance(row: {
  import_batch_id: string;
  source_sheet: string;
  source_row_number: number;
  source_row_hash: string;
}): WritingEngineStage2d1SourceProvenance {
  return {
    importBatchId: row.import_batch_id,
    sourceSheet: row.source_sheet,
    sourceRowNumber: row.source_row_number,
    sourceRowHash: row.source_row_hash,
  };
}

async function getBatchStatuses(input: {
  supabase: SupabaseServerClient;
  importBatchIds: string[];
}) {
  const uniqueBatchIds = Array.from(new Set(input.importBatchIds.filter(Boolean)));

  if (uniqueBatchIds.length === 0) {
    return new Map<string, string>();
  }

  const { data } = await input.supabase
    .from("canonical_spelling_word_map_import_batches")
    .select("id, batch_status")
    .in("id", uniqueBatchIds);

  return new Map(
    (((data ?? []) as unknown) as Stage2d1BatchRow[]).map((row) => [
      row.id,
      row.batch_status,
    ]),
  );
}

export function createStage2d1SupabaseWordMapContentRepository(
  supabase: SupabaseServerClient,
): WritingEngineStage2d1WordMapContentRepository {
  return {
    async getLearningItem(input) {
      const { data } = await supabase
        .from("learning_items")
        .select("id, child_id, parent_user_id, micro_skill_key, practice_route, is_active")
        .eq("id", input.learningItemId)
        .eq("child_id", input.childId)
        .eq("parent_user_id", input.parentUserId)
        .maybeSingle();

      if (!data) {
        return null;
      }

      const row = data as unknown as Stage2d1LearningItemRow;

      return {
        learningItemId: row.id,
        childId: row.child_id,
        parentUserId: row.parent_user_id,
        microSkillKey: row.micro_skill_key,
        practiceRoute: row.practice_route,
        isActive: row.is_active,
      } satisfies WritingEngineStage2d1LearningItemRead;
    },

    async getCatalogEntry(input) {
      const { data } = await supabase
        .from("micro_skill_catalog")
        .select("micro_skill_key, mastery_domain_key, practice_route, is_assignable, is_active")
        .eq("micro_skill_key", input.microSkillKey)
        .maybeSingle();

      if (!data) {
        return null;
      }

      const row = data as unknown as Stage2d1CatalogRow;

      return {
        microSkillKey: row.micro_skill_key,
        masteryDomainKey: row.mastery_domain_key,
        practiceRoute: row.practice_route,
        isAssignable: row.is_assignable,
        isActive: row.is_active,
      } satisfies WritingEngineStage2d1CatalogRead;
    },

    async getRouteSupport(input) {
      const { data } = await supabase
        .from("canonical_spelling_word_map_route_support")
        .select(
          [
            "id",
            "import_batch_id",
            "row_status",
            "source_sheet",
            "source_row_number",
            "source_row_hash",
            "micro_skill_key",
            "route",
            "minimum_words_required",
            "requires_contrast_words",
            "template_key",
            "enabled_for_mvp",
          ].join(", "),
        )
        .eq("micro_skill_key", input.microSkillKey)
        .eq("route", input.practiceRoute)
        .eq("row_status", "active")
        .eq("enabled_for_mvp", true)
        .order("source_row_number", { ascending: true });

      const rows = ((data ?? []) as unknown) as Stage2d1RouteSupportRow[];
      const batchStatuses = await getBatchStatuses({
        supabase,
        importBatchIds: rows.map((row) => row.import_batch_id),
      });

      return rows.map((row) => ({
        id: row.id,
        importBatchId: row.import_batch_id,
        importBatchStatus: batchStatuses.get(row.import_batch_id) ?? "unknown",
        rowStatus: row.row_status,
        microSkillKey: row.micro_skill_key,
        route: row.route,
        minimumWordsRequired: row.minimum_words_required,
        requiresContrastWords: row.requires_contrast_words,
        templateKey: row.template_key,
        enabledForMvp: row.enabled_for_mvp,
        provenance: provenance(row),
      })) satisfies WritingEngineStage2d1RouteSupportRead[];
    },

    async getWords(input: {
      microSkillKey: string;
      practiceRoute: WritingEngineStage2d1WordMapRoute;
    }) {
      const { data } = await supabase
        .from("canonical_spelling_word_map_words")
        .select(
          [
            "id",
            "import_batch_id",
            "row_status",
            "source_sheet",
            "source_row_number",
            "source_row_hash",
            "micro_skill_key",
            "word",
            "normalised_word",
            "word_role",
            "micro_skill_role",
            "diversity_group_key",
            "complexity_band",
            "frequency_band",
            "practice_route",
            "approved_for_assignment",
          ].join(", "),
        )
        .eq("micro_skill_key", input.microSkillKey)
        .eq("practice_route", input.practiceRoute)
        .eq("row_status", "active")
        .eq("approved_for_assignment", true)
        .order("source_row_number", { ascending: true });

      const rows = ((data ?? []) as unknown) as Stage2d1WordRow[];
      const batchStatuses = await getBatchStatuses({
        supabase,
        importBatchIds: rows.map((row) => row.import_batch_id),
      });

      return rows.map((row) => ({
        id: row.id,
        importBatchId: row.import_batch_id,
        importBatchStatus: batchStatuses.get(row.import_batch_id) ?? "unknown",
        rowStatus: row.row_status,
        microSkillKey: row.micro_skill_key,
        word: row.word,
        normalisedWord: row.normalised_word,
        wordRole: row.word_role,
        microSkillRole: row.micro_skill_role,
        diversityGroupKey: row.diversity_group_key,
        complexityBand: row.complexity_band,
        frequencyBand: row.frequency_band,
        practiceRoute: row.practice_route,
        approvedForAssignment: row.approved_for_assignment,
        provenance: provenance(row),
      })) satisfies WritingEngineStage2d1WordRead[];
    },

    async getContrastPairs(input) {
      const { data } = await supabase
        .from("canonical_spelling_word_map_contrast_pairs")
        .select(
          [
            "id",
            "import_batch_id",
            "row_status",
            "source_sheet",
            "source_row_number",
            "source_row_hash",
            "target_micro_skill_key",
            "target_word",
            "contrast_word",
            "contrast_micro_skill_key",
            "contrast_type",
            "approved_for_assignment",
          ].join(", "),
        )
        .eq("target_micro_skill_key", input.microSkillKey)
        .eq("row_status", "active")
        .eq("approved_for_assignment", true)
        .order("source_row_number", { ascending: true });

      const rows = ((data ?? []) as unknown) as Stage2d1ContrastPairRow[];
      const batchStatuses = await getBatchStatuses({
        supabase,
        importBatchIds: rows.map((row) => row.import_batch_id),
      });

      return rows.map((row) => ({
        id: row.id,
        importBatchId: row.import_batch_id,
        importBatchStatus: batchStatuses.get(row.import_batch_id) ?? "unknown",
        rowStatus: row.row_status,
        targetMicroSkillKey: row.target_micro_skill_key,
        targetWord: row.target_word,
        contrastWord: row.contrast_word,
        contrastMicroSkillKey: row.contrast_micro_skill_key,
        contrastType: row.contrast_type,
        approvedForAssignment: row.approved_for_assignment,
        provenance: provenance(row),
      })) satisfies WritingEngineStage2d1ContrastPairRead[];
    },
  };
}
