import "server-only";

import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { CanonicalPart } from "./canonical-morphology";
import type { DictionarySenseSet } from "./senses";

type Db = ReturnType<typeof createServiceRoleClient>;
export type WorkbookFamily = { key: string; base: string; meaning: string; partOfSpeech: string };
export type WorkbookBaseChoice = { wordId: string; senseId: string; partId: string; meaning: string; partOfSpeech: string };

export async function approvedWorkbookFamily(db: Db, key: string): Promise<WorkbookFamily | null> {
  const result = await db.from("canonical_teaching_dictionary_lexical_base_families")
    .select("family_key,base_lemma,base_meaning,base_part_of_speech,base_kind,review_status")
    .eq("family_key", key).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error("Could not read the approved word family.");
  const row = result.data;
  return row?.review_status === "approved" && row.base_kind === "free_base"
    ? { key: row.family_key, base: row.base_lemma, meaning: row.base_meaning, partOfSpeech: row.base_part_of_speech } : null;
}

async function loadWorkbookBases(db: Db, base: string) {
  const word = await db.from("canonical_teaching_dictionary_words").select("id,display_word")
    .eq("normalised_word", base).eq("dialect_code", "en-GB").eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure").maybeSingle();
  if (word.error) throw new Error("Could not load the reviewed base.");
  const bases: WorkbookBaseChoice[] = [];
  if (word.data) {
    const wordId = word.data.id;
    const [reviewed, analyses] = await Promise.all([
      db.from("teaching_dictionary_reviewed_sense_sets").select("sense_set").eq("canonical_word_id", wordId).maybeSingle(),
      db.from("teaching_dictionary_current_sense_morphology").select("sense_id,morphology_parts").eq("canonical_word_id", wordId),
    ]);
    if (reviewed.error || analyses.error) throw new Error("Could not load the reviewed base meanings.");
    const senseSet = reviewed.data?.sense_set as DictionarySenseSet | undefined;
    for (const sense of senseSet?.senses ?? []) {
      const parts = analyses.data.find(row => row.sense_id === sense.id)?.morphology_parts as CanonicalPart[] | undefined;
      const part = parts?.find(item => item.kind === "base" && item.sourceText === base
        && item.surfaceText === word.data?.display_word && item.gloss === sense.definition);
      if (part && sense.partOfSpeech === "verb")
        bases.push({ wordId, senseId: sense.id, partId: part.id, meaning: sense.definition, partOfSpeech: sense.partOfSpeech });
    }
  }
  return { bases, baseWordId: word.data?.id ?? null };
}

export async function loadWorkbookFamilyChoices(db: Db, base: string) {
  const [familyRows, reviewedBases] = await Promise.all([
    db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,base_lemma,base_meaning,base_part_of_speech,review_status,base_kind")
      .eq("base_lemma", base).order("revision", { ascending: false }),
    loadWorkbookBases(db, base),
  ]);
  if (familyRows.error) throw new Error("Could not load the approved word families.");
  const families: WorkbookFamily[] = [];
  const seen = new Set<string>();
  for (const row of familyRows.data) {
    if (seen.has(row.family_key)) continue;
    seen.add(row.family_key);
    if (row.review_status === "approved" && row.base_kind === "free_base")
      families.push({ key: row.family_key, base: row.base_lemma, meaning: row.base_meaning, partOfSpeech: row.base_part_of_speech });
  }
  return { families, ...reviewedBases };
}

export async function createWorkbookFamily(db: Db, actor: string, base: string, senseId: string) {
  const { bases } = await loadWorkbookBases(db, base);
  const choice = bases.find(item => item.senseId === senseId);
  if (!choice) throw new Error("Choose a reviewed verb meaning for the base.");
  const existing = async () => {
    const result = await db.from("canonical_teaching_dictionary_lexical_base_families").select("family_key")
      .eq("canonical_base_word_id", choice.wordId).eq("canonical_base_sense_id", choice.senseId)
      .order("revision", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error("Could not check whether this family already exists.");
    return result.data?.family_key ? approvedWorkbookFamily(db, result.data.family_key) : null;
  };
  const prior = await existing();
  if (prior) return prior;
  const created = await db.rpc("create_reviewed_free_base_family_from_sense", {
    p_request_id: randomUUID(), p_base_word_id: choice.wordId, p_base_sense_id: choice.senseId,
    p_word_id: choice.wordId, p_word_sense_id: choice.senseId, p_component_part_id: choice.partId,
    p_relationship_kind: "free_base", p_reviewer: actor, p_source_reference: "Bulk review workbook family decision",
  });
  const family = created.error || typeof created.data !== "string"
    ? await existing() : await approvedWorkbookFamily(db, created.data);
  if (!family) throw new Error("The family could not be created. Check the reviewed base and its word parts.");
  return family;
}
