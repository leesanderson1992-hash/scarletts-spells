import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { renderMultiSenseCsvBundles, type MultiSenseCsvBundle } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";

export const dynamic = "force-dynamic";
export const MULTI_SENSE_EXPORT_BATCH_SIZE = 100;

export async function GET(request: Request) {
  await requireAdminUser();
  const params = new URL(request.url).searchParams;
  const wordId = params.get("word_id") ?? "";
  const batch = params.get("batch") ? Number(params.get("batch")) : null;
  if (wordId && !isUuid(wordId) || wordId && batch !== null || !wordId &&
    (batch === null || !Number.isSafeInteger(batch) || batch < 1))
    return Response.json({ error: "Choose a word or a valid reviewed-meanings batch." }, { status: 400 });
  const db = createServiceRoleClient();
  const page = wordId ? null : await db.from("teaching_dictionary_reviewed_sense_sets")
    .select("canonical_word_id").order("canonical_word_id")
    .range((batch! - 1) * MULTI_SENSE_EXPORT_BATCH_SIZE, batch! * MULTI_SENSE_EXPORT_BATCH_SIZE - 1);
  if (page?.error) throw new Error("MULTI_SENSE_CSV_EXPORT_PAGE_READ_FAILED");
  const ids = wordId ? [wordId] : page?.data?.map(row => row.canonical_word_id) ?? [];
  if (!ids.length) return Response.json({ error: "No reviewed meanings in this batch." }, { status: 404 });
  const [word, reviewed, analyses, links] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,display_word")
      .in("id", ids).eq("row_status", "active"),
    db.from("teaching_dictionary_reviewed_sense_sets")
      .select("canonical_word_id,sense_set,reviewed_at").in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_morphology")
      .select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,morphology_transformations,word_sum")
      .in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_family_memberships")
      .select("canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind")
      .in("canonical_word_id", ids),
  ]);
  if (word.error || reviewed.error || analyses.error || links.error)
    throw new Error("MULTI_SENSE_CSV_EXPORT_READ_FAILED");
  if (!word.data?.length || !reviewed.data?.length)
    return Response.json({ error: "Review the word's meanings in Overview first." }, { status: 404 });
  const bundles: MultiSenseCsvBundle[] = word.data.flatMap(item => {
    const source = reviewed.data.find(row => row.canonical_word_id === item.id);
    if (!source) return [];
    const senseSet = source.sense_set as DictionarySenseSet;
    return [{ wordId: item.id, displayWord: item.display_word,
    sourceSenseReviewedAt: source.reviewed_at, senseSet,
    analyses: senseSet.senses.flatMap(sense => {
      const analysis = (analyses.data ?? []).find(row => row.canonical_word_id === item.id
        && row.sense_id === sense.id);
      if (!analysis) return [];
      const matching = (links.data ?? []).filter(row => row.canonical_word_id === item.id
        && row.sense_id === sense.id
        && row.sense_morphology_id === analysis.id);
      const family = matching.length === 1 ? matching[0] : null;
      return [{ senseId: sense.id,
        parts: analysis.morphology_parts as MultiSenseCsvBundle["analyses"][number]["parts"],
        joins: analysis.morphology_joins as MultiSenseCsvBundle["analyses"][number]["joins"],
        transformations: analysis.morphology_transformations as MultiSenseCsvBundle["analyses"][number]["transformations"],
        wordSum: analysis.word_sum, familyKey: family?.family_key ?? "",
        componentPartId: family?.component_part_id ?? "",
        relationshipKind: family?.relationship_kind ?? "", requestedSkillKeys: [] }];
    }) }];
  });
  return new NextResponse(renderMultiSenseCsvBundles(bundles), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="teaching-dictionary-meanings-${wordId || `batch-${batch}`}.csv"`,
    "Cache-Control": "no-store",
  } });
}
