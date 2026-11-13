"use server";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { BaseFamilyReview } from "./lexical-family-review";

/** Only load the relationship editor when the admin opens it. */
export async function loadWordFamilyReview(wordId: string, error?: string, lexicalFamilyKey?: string) {
  await requireAdminUser();
  if (!isUuid(wordId)) throw new Error("TEACHING_WORD_ID_INVALID");
  const db = createServiceRoleClient();
  const [word, morphology, senseSet, senseLinks] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,normalised_word,display_word,dialect_code,row_status,review_status").eq("id", wordId).single(),
    db.from("canonical_teaching_dictionary_word_morphology").select("id,raw_morpholex_pos,analysis_status,review_status,morphology_parts,morphology_joins,morphology_transformations,word_sum").eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("teaching_dictionary_reviewed_sense_sets").select("sense_set").eq("canonical_word_id", wordId).maybeSingle(),
    db.from("teaching_dictionary_current_sense_family_links")
      .select("sense_id,family_key,component_part_id").eq("canonical_word_id", wordId),
  ]);
  if (word.error || morphology.error || senseSet.error || senseLinks.error)
    throw new Error("BASE_FAMILY_REVIEW_READ_FAILED");
  const row = word.data;
  const parts = morphology.data;
  return <BaseFamilyReview word={{ id: row.id, normalisedWord: row.normalised_word, displayWord: row.display_word,
    dialectCode: row.dialect_code, rowStatus: row.row_status, reviewStatus: row.review_status }}
    morphology={parts ? { id: parts.id, rawPartOfSpeech: parts.raw_morpholex_pos ?? "",
      analysisStatus: parts.analysis_status, reviewStatus: parts.review_status,
      parts: parts.morphology_parts, joins: parts.morphology_joins ?? [], transformations: parts.morphology_transformations ?? [], wordSum: parts.word_sum } : null}
    senses={Array.isArray((senseSet.data?.sense_set as { senses?: unknown } | null)?.senses)
      ? (senseSet.data?.sense_set as { senses: { id: string; definition: string; partOfSpeech: string }[] }).senses : []}
    senseLinks={senseLinks.data ?? []}
    lexicalFamilyKey={lexicalFamilyKey && /^[a-z0-9_]+_base_family$/.test(lexicalFamilyKey) ? lexicalFamilyKey : undefined}
    error={error} />;
}
