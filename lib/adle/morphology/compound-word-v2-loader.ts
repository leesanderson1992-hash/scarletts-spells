/* Governed relation rows are validated at the fail-closed boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningItemFact } from "../learning-items";
import {
  COMPOUND_WORD_MICRO_SKILL_KEYS,
  validateCompoundWordStructureV2,
  type CompoundWordMicroSkillKey,
  type CompoundWordStructureV2,
} from "./compound-word-structure-v2";
import {
  DICTATION_TARGET_SPAN_SCHEMA_VERSION,
  validateDictationTargetSpanV2,
} from "./dictation-target-span";
import type { CompoundWordDictationSourceV2 } from "./compound-word-lesson-v2";

export type LoadedCompoundWordV2Authority = {
  structures: CompoundWordStructureV2[];
  dictationByCanonicalId: Map<string, CompoundWordDictationSourceV2>;
  learningItems: LearningItemFact[];
};

function iso(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "";
  return new Date(value).toISOString();
}

export async function loadCompoundWordV2Authority(
  client: SupabaseClient,
  childId: string,
  microSkillKey: CompoundWordMicroSkillKey,
  exactAuthority?: {
    structureAuthorityId: string;
    dictionaryClosureAuthorityId: string;
    reviewedAt: string;
  },
): Promise<LoadedCompoundWordV2Authority> {
  if (!COMPOUND_WORD_MICRO_SKILL_KEYS.includes(microSkillKey)) {
    throw new Error("loadCompoundWordV2Authority: unsupported Compound Word micro-skill");
  }
  const [{ data: structureRows, error: structureError }, { data: itemRows, error: itemError }] = await Promise.all([
    client
      .from("canonical_teaching_dictionary_compound_structures_v2")
      .select("id,canonical_word_id,micro_skill_key,schema_version,child_friendly_meaning,component_to_whole_relationship,morphology_provenance,assignment_eligible,transfer_eligible,review_status,reviewed_by,reviewed_at,source_sheet,source_row_number,source_row_hash,source_metadata")
      .eq("micro_skill_key", microSkillKey)
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure")
      .eq("assignment_eligible", true),
    client
      .from("adle_learning_items")
      .select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status")
      .eq("child_id", childId)
      .eq("micro_skill_key", microSkillKey)
      .eq("row_status", "active"),
  ]);
  if (structureError || itemError) {
    throw new Error(`loadCompoundWordV2Authority: ${structureError?.message ?? itemError?.message}`);
  }

  const structureIds = (structureRows ?? []).map((row: any) => row.id);
  const canonicalWordIds = (structureRows ?? []).map((row: any) => row.canonical_word_id);
  const [wordResult, componentResult, joinResult] = await Promise.all([
    canonicalWordIds.length
      ? client.from("canonical_teaching_dictionary_words").select("id,display_word").in("id", canonicalWordIds)
      : Promise.resolve({ data: [], error: null }),
    structureIds.length
      ? client.from("canonical_teaching_dictionary_compound_components_v2").select("structure_id,component_ordinal,canonical_component_word_id,display_surface,component_meaning,component_sense").in("structure_id", structureIds)
      : Promise.resolve({ data: [], error: null }),
    structureIds.length
      ? client.from("canonical_teaching_dictionary_compound_joins_v2").select("structure_id,join_ordinal,join_kind").in("structure_id", structureIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (wordResult.error || componentResult.error || joinResult.error) {
    throw new Error(`loadCompoundWordV2Authority: ${wordResult.error?.message ?? componentResult.error?.message ?? joinResult.error?.message}`);
  }
  const wordsById = new Map((wordResult.data ?? []).map((row: any) => [row.id, row.display_word]));
  const componentsByStructure = new Map<string, any[]>();
  for (const component of componentResult.data ?? []) {
    const list = componentsByStructure.get((component as any).structure_id) ?? [];
    list.push(component);
    componentsByStructure.set((component as any).structure_id, list);
  }
  const joinsByStructure = new Map<string, any[]>();
  for (const join of joinResult.data ?? []) {
    const list = joinsByStructure.get((join as any).structure_id) ?? [];
    list.push(join);
    joinsByStructure.set((join as any).structure_id, list);
  }

  const structures: CompoundWordStructureV2[] = [];
  for (const raw of structureRows ?? []) {
    if (
      exactAuthority &&
      (raw as any).source_metadata?.dependencyAuthorityId !== exactAuthority.structureAuthorityId
    ) continue;
    const components = [...(componentsByStructure.get((raw as any).id) ?? [])]
      .sort((left: any, right: any) => left.component_ordinal - right.component_ordinal)
      .map((component: any) => ({
        ordinal: component.component_ordinal,
        canonicalWordId: component.canonical_component_word_id,
        displaySurface: component.display_surface,
        meaning: component.component_meaning,
        sense: component.component_sense,
      }));
    const joins = [...(joinsByStructure.get((raw as any).id) ?? [])]
      .sort((left: any, right: any) => left.join_ordinal - right.join_ordinal)
      .map((join: any) => ({ ordinal: join.join_ordinal, kind: join.join_kind }));
    const candidate = validateCompoundWordStructureV2({
      schemaVersion: (raw as any).schema_version,
      wholeCanonicalWordId: (raw as any).canonical_word_id,
      microSkillKey: (raw as any).micro_skill_key,
      wholeWord: wordsById.get((raw as any).canonical_word_id),
      components,
      joins,
      childFriendlyMeaning: (raw as any).child_friendly_meaning,
      componentToWholeRelationship: (raw as any).component_to_whole_relationship,
      morphologyProvenance: (raw as any).morphology_provenance,
      assignmentEligible: (raw as any).assignment_eligible,
      transferEligible: (raw as any).transfer_eligible,
      review: {
        status: (raw as any).review_status,
        reviewedBy: (raw as any).reviewed_by,
        reviewedAt: iso((raw as any).reviewed_at),
      },
      source: {
        artifact: "canonical_teaching_dictionary_compound_structures_v2",
        sourceRowHash: (raw as any).source_row_hash,
        sheet: (raw as any).source_sheet,
        row: (raw as any).source_row_number,
      },
    });
    if (candidate.ok) structures.push(candidate.structure);
  }

  const ids = structures.map((structure) => structure.wholeCanonicalWordId);
  const { data: dictationRows, error: dictationError } = ids.length
    ? exactAuthority
      ? await client
        .from("adle_teaching_dictionary_closure_words")
        .select("canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text,dictation_target_end_exclusive,exact_governed_answer,dictation_source_row_hash")
        .eq("authority_id", exactAuthority.dictionaryClosureAuthorityId)
        .in("canonical_word_id", ids)
      : await client
        .from("canonical_teaching_dictionary_dictation_sentences")
        .select("canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text,review_status,reviewed_by,reviewed_at,source_sheet,source_row_hash")
        .in("canonical_word_id", ids)
        .eq("row_status", "active")
        .eq("review_status", "approved_for_first_exposure")
    : { data: [], error: null };
  if (dictationError) throw new Error(`loadCompoundWordV2Authority dictation: ${dictationError.message}`);
  const structuresById = new Map(structures.map((structure) => [structure.wholeCanonicalWordId, structure]));
  const dictationByCanonicalId = new Map<string, CompoundWordDictationSourceV2>();
  for (const raw of dictationRows ?? []) {
    const structure = structuresById.get((raw as any).canonical_word_id);
    if (!structure) continue;
    const targetTokenCount = structure.wholeWord.trim().split(/\s+/u).length;
    const targetSpan = {
      schemaVersion: DICTATION_TARGET_SPAN_SCHEMA_VERSION,
      startTokenIndex: (raw as any).dictation_target_token_index,
      endTokenIndexExclusive: exactAuthority
        ? (raw as any).dictation_target_end_exclusive
        : (raw as any).dictation_target_token_index + targetTokenCount,
      exactAnswer: exactAuthority
        ? (raw as any).exact_governed_answer
        : structure.wholeWord,
    } as const;
    if (!validateDictationTargetSpanV2((raw as any).dictation_sentence, targetSpan)) continue;
    dictationByCanonicalId.set(structure.wholeCanonicalWordId, {
      canonicalWordId: structure.wholeCanonicalWordId,
      sentence: (raw as any).dictation_sentence,
      audioText: (raw as any).audio_text,
      targetSpan,
      review: {
        status: exactAuthority ? "approved_for_first_exposure" : (raw as any).review_status,
        reviewedBy: exactAuthority ? "immutable_teaching_dictionary_closure" : (raw as any).reviewed_by,
        reviewedAt: exactAuthority ? exactAuthority.reviewedAt : iso((raw as any).reviewed_at),
      },
      source: {
        artifact: exactAuthority ? "adle_teaching_dictionary_closure_words" : (raw as any).source_sheet || "canonical_teaching_dictionary_dictation_sentences",
        sourceRowHash: exactAuthority
          ? (raw as any).dictation_source_row_hash
          : (raw as any).source_row_hash,
      },
    });
  }

  const learningItems = (itemRows ?? []).map((row: any) => ({
    learningItemId: row.id,
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    microSkillKey: row.micro_skill_key,
    itemStatus: row.item_status,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    sourceAttemptText: row.source_attempt_text,
    reteachPriority: row.reteach_priority,
    ejectedOn: row.ejected_on,
    intakeOn: row.intake_on,
    rowStatus: row.row_status,
  })) as LearningItemFact[];
  return { structures, dictationByCanonicalId, learningItems };
}
