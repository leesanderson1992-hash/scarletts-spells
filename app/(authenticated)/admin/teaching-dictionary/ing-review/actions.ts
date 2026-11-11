"use server";

import { randomUUID } from "node:crypto";
import { updateTag, revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { normaliseWord } from "@/lib/teaching-dictionary-manager/contracts";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { REGULAR_ING_SKILL, ingReviewBase, parseIngReviewSheet, planIngReview,
  type IngExisting, type IngInput, type IngReviewRow } from "@/lib/teaching-dictionary-manager/ing-bulk-review";
import { saveBulkSkillApprovals } from "../bulk-assign/actions";

type Batch = { id: string; filename: string; version: number; entries: IngReviewRow[] };
type Db = ReturnType<typeof createServiceRoleClient>;
type Edit = { number: number; senseId?: string; familyKey?: string; input?: Partial<IngInput> };

function viewBatch(batch: Batch) {
  return {
    id: batch.id, filename: batch.filename, version: batch.version,
    rows: batch.entries.map(row => {
      const plan = planIngReview(row);
      const meanings = row.existing?.senses?.senses.map(sense => ({
        id: sense.id, definition: sense.definition, partOfSpeech: sense.partOfSpeech,
        ipa: row.existing?.senses?.pronunciations.find(item => item.id === sense.pronunciationId)?.ipa,
        sentence: sense.dictationSentence,
      })) ?? [];
      const current = meanings.find(sense => sense.id === plan.senseId);
      return { number: row.number, input: row.input, match: row.existing ? "Existing" : "New",
        wordId: row.existing?.id, current, meanings, families: row.families, familyKey: row.familyKey,
        senseId: plan.senseId, base: ingReviewBase(row.input), group: plan.group, message: plan.message,
        outcome: row.outcome };
    }),
  };
}
export type ReviewBatchView = ReturnType<typeof viewBatch>;

async function loadBatch(db: Db, actor: string, id: string): Promise<Batch> {
  if (!isUuid(id)) throw new Error("Choose a saved batch.");
  const result = await db.from("teaching_dictionary_ing_review_batches")
    .select("id,filename,version,entries").eq("id", id).eq("created_by", actor).maybeSingle();
  if (result.error || !result.data) throw new Error("Could not open this batch.");
  return result.data as Batch;
}

async function writeBatch(db: Db, actor: string, batch: Batch) {
  const updated = await db.from("teaching_dictionary_ing_review_batches")
    .update({ entries: batch.entries, version: batch.version + 1, updated_at: new Date().toISOString() })
    .eq("id", batch.id).eq("created_by", actor).eq("version", batch.version).select("id").maybeSingle();
  if (updated.error || !updated.data) throw new Error("This batch changed. Reopen it and try again.");
  return viewBatch({ ...batch, version: batch.version + 1 });
}

export async function openIngReview(id: string) {
  const actor = await requireAdminUser();
  return viewBatch(await loadBatch(createServiceRoleClient(), actor.id, id));
}

export async function previewIngReview(form: FormData) {
  const actor = await requireAdminUser();
  const file = form.get("csv");
  if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024)
    return { error: "Choose a CSV smaller than 4 MB." };
  let parsed: ReturnType<typeof parseIngReviewSheet>;
  try { parsed = parseIngReviewSheet(await file.text()); }
  catch (error) { return { error: error instanceof Error ? error.message : "Could not read this CSV." }; }
  const db = createServiceRoleClient();
  const spellings = [...new Set(parsed.map(row => normaliseWord(row.input.word)))];
  const bases = [...new Set(parsed.map(row => ingReviewBase(row.input)))];
  const [words, familyRows] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,display_word,normalised_word,row_status,review_status,source_name,source_url")
      .eq("dialect_code", "en-GB").in("row_status", ["active","draft"]).in("normalised_word", spellings),
    db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,base_lemma,base_meaning,revision,review_status,base_kind,base_part_of_speech")
      .in("base_lemma", bases).order("revision", { ascending: false }).limit(1000),
  ]);
  if (words.error || familyRows.error || familyRows.data.length === 1000)
    return { error: "Could not read current words and base families. Try a smaller sheet." };
  const families = new Map(familyRows.data.slice().reverse().map(row => [row.family_key,row]));
  const ids = words.data.map(word => word.id);
  const [sets, parts, links] = ids.length ? await Promise.all([
    db.from("teaching_dictionary_reviewed_sense_sets").select("canonical_word_id,sense_set,reviewed_at").in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_morphology").select("*").in("canonical_word_id", ids).limit(1000),
    db.from("teaching_dictionary_current_sense_family_memberships").select("id,canonical_word_id,sense_id,family_key,component_part_id,relationship_kind")
      .in("canonical_word_id", ids).limit(1000),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (sets.error || parts.error || links.error || parts.data.length === 1000 || links.data.length === 1000)
    return { error: "Could not read all reviewed meanings. Try a smaller sheet." };
  const entries: IngReviewRow[] = parsed.map(row => {
    const matches = words.data.filter(word => word.normalised_word === normaliseWord(row.input.word));
    const word = matches[0];
    const set = sets.data.find(item => item.canonical_word_id === word?.id);
    const existing: IngExisting | null = word ? {
      id: word.id, display: word.display_word, revision: set?.reviewed_at ?? "",
      senses: set?.sense_set as IngExisting["senses"] ?? null,
      approved: word.row_status === "active" && word.review_status === "approved_for_first_exposure",
      source: word.source_url || word.source_name,
      analyses: parts.data.filter(part => part.canonical_word_id === word.id).map(part => ({
        id: part.id, senseId: part.sense_id, parts: part.morphology_parts, joins: part.morphology_joins,
        transformations: part.morphology_transformations, wordSum: part.word_sum,
        familyKey: "", componentPartId: "", relationshipKind: "", requestedSkillKeys: [],
      })),
      links: links.data.filter(link => link.canonical_word_id === word.id).map(link => ({
        id: link.id, senseId: link.sense_id, familyKey: link.family_key,
        componentPartId: link.component_part_id, relationshipKind: link.relationship_kind,
      })),
    } : null;
    return { ...row, requestId: randomUUID(), existing,
      error: matches.length > 1 ? "This spelling has multiple dictionary records. Resolve them in the dictionary first." : undefined,
      families: [...families.values()].filter(family => family.base_lemma === ingReviewBase(row.input) &&
        family.review_status === "approved" && family.base_kind === "free_base" && family.base_part_of_speech === "verb")
        .map(family => ({ key: family.family_key, meaning: family.base_meaning, revision: family.revision })) };
  });
  const result = await db.from("teaching_dictionary_ing_review_batches")
    .insert({ created_by: actor.id, filename: file.name.slice(0, 120), entries })
    .select("id,filename,version,entries").single();
  if (result.error) return { error: "Could not save your preview. Try again." };
  revalidatePath("/admin/teaching-dictionary/ing-review");
  return { batch: viewBatch(result.data as Batch) };
}

export async function editIngReview(id: string, version: number, edits: Edit[]) {
  const actor = await requireAdminUser();
  const db = createServiceRoleClient();
  const batch = await loadBatch(db, actor.id, id);
  if (batch.version !== version || !Array.isArray(edits) || edits.length > 100)
    throw new Error("Reopen the batch to get its latest state.");
  for (const edit of edits) {
    const row = batch.entries.find(item => item.number === edit.number);
    if (!row || row.outcome) continue;
    if (edit.senseId !== undefined && row.existing?.senses?.senses.some(sense => sense.id === edit.senseId)) {
      row.senseId = edit.senseId;
      row.familyKey = undefined;
    }
    if (edit.familyKey && row.families.some(family => family.key === edit.familyKey)) row.familyKey = edit.familyKey;
    for (const key of ["meaning","ipa","syllables","stress","sentence"] as const) {
      const value = edit.input?.[key];
      if (typeof value === "string" && value.length <= 2000) row.input[key] = value.trim();
    }
  }
  return writeBatch(db, actor.id, batch);
}

export async function applyIngReviewWord(id: string, version: number, number: number) {
  const actor = await requireAdminUser();
  const db = createServiceRoleClient();
  let batch = await loadBatch(db, actor.id, id);
  const index = batch.entries.findIndex(row => row.number === number);
  if (batch.version !== version || index < 0) throw new Error("Reopen the batch to get its latest state.");
  const row = batch.entries[index];
  const plan = planIngReview(row);
  if (!plan.bundle || (row.outcome && row.outcome.status !== "saved")) return viewBatch(batch);
  let wordId = row.outcome?.wordId;
  if (!wordId) {
    const saved = await db.rpc("apply_teaching_dictionary_ing_review_word", {
      p_batch: id, p_actor: actor.id, p_version: version, p_index: index, p_bundle: plan.bundle,
    });
    if (saved.error) {
      if (saved.error.message.includes("ING_REVIEW_BATCH_CHANGED")) return viewBatch(await loadBatch(db, actor.id, id));
      row.outcome = { status: "needs attention", message: saved.error.message.includes("SOURCE_CHANGED") ||
        saved.error.message.includes("WORD_EXISTS") || saved.error.code === "23505"
        ? "The dictionary changed after preview. Upload the row again to see the current facts."
        : "The dictionary could not save these facts. Review the word and base family." };
      return writeBatch(db, actor.id, batch);
    }
    wordId = saved.data as string;
    batch = await loadBatch(db, actor.id, id);
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
    revalidatePath("/admin/teaching-dictionary");
  }
  try {
    const result = await saveBulkSkillApprovals({ microSkillKey: REGULAR_ING_SKILL,
      applyWordIds: [wordId], excludeWordIds: [], clearWordIds: [], deassignWordIds: [],
      senseIds: { [wordId]: plan.senseId! }, requestId: randomUUID(), sourceKind: "teaching_dictionary_import" });
    batch.entries[index].outcome = result.ok ? { status: result.approvedCount ? "approved" : "already approved", wordId }
      : { status: "saved", wordId, message: result.blocked[0]?.reason ?? result.error ?? "Check lesson approval again." };
  } catch {
    batch.entries[index].outcome = { status: "saved", wordId, message: "Dictionary facts saved. Check lesson approval again." };
  }
  return writeBatch(db, actor.id, batch);
}
