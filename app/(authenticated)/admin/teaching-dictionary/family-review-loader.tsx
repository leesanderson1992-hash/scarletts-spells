"use server";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { BaseFamilyReview } from "./base-family-review";

/** Only load the relationship editor when the admin opens it. */
export async function loadWordFamilyReview(wordId: string, manualFamilyId?: string, error?: string, lexicalFamilyKey?: string) {
  await requireAdminUser();
  if (!isUuid(wordId)) throw new Error("TEACHING_WORD_ID_INVALID");
  const db = createServiceRoleClient();
  const [word, morphology, definition] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,normalised_word,display_word,dialect_code,row_status,review_status").eq("id", wordId).single(),
    db.from("canonical_teaching_dictionary_word_morphology").select("id,analysis_status,review_status,morphology_parts,morphology_joins,morphology_transformations,word_sum").eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("teaching_dictionary_definition_versions").select("definition").eq("canonical_word_id", wordId).is("route_id", null).order("published_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (word.error || morphology.error || definition.error) throw new Error("BASE_FAMILY_REVIEW_READ_FAILED");
  const row = word.data;
  const parts = morphology.data;
  return <BaseFamilyReview word={{ id: row.id, normalisedWord: row.normalised_word, displayWord: row.display_word,
    dialectCode: row.dialect_code, rowStatus: row.row_status, reviewStatus: row.review_status }}
    morphology={parts ? { id: parts.id, analysisStatus: parts.analysis_status, reviewStatus: parts.review_status,
      parts: parts.morphology_parts, joins: parts.morphology_joins ?? [], transformations: parts.morphology_transformations ?? [], wordSum: parts.word_sum } : null}
    meaning={definition.data?.definition ?? ""} manualFamilyId={manualFamilyId && isUuid(manualFamilyId) ? manualFamilyId : undefined}
    lexicalFamilyKey={lexicalFamilyKey && /^[a-z0-9_]+_base_family$/.test(lexicalFamilyKey) ? lexicalFamilyKey : undefined}
    error={error} />;
}
