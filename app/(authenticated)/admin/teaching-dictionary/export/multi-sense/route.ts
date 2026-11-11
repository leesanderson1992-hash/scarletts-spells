import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { renderMultiSenseCsv, type MultiSenseCsvBundle } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdminUser();
  const wordId = new URL(request.url).searchParams.get("word_id") ?? "";
  if (!isUuid(wordId)) return Response.json({ error: "Choose a dictionary word." }, { status: 400 });
  const db = createServiceRoleClient();
  const [word, reviewed, analyses, links] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,display_word")
      .eq("id", wordId).eq("row_status", "active").maybeSingle(),
    db.from("teaching_dictionary_reviewed_sense_sets").select("sense_set,reviewed_at")
      .eq("canonical_word_id", wordId).maybeSingle(),
    db.from("teaching_dictionary_current_sense_morphology")
      .select("id,sense_id,morphology_parts,morphology_joins,morphology_transformations,word_sum")
      .eq("canonical_word_id", wordId),
    db.from("teaching_dictionary_current_sense_family_memberships")
      .select("sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind")
      .eq("canonical_word_id", wordId),
  ]);
  if (word.error || reviewed.error || analyses.error || links.error)
    throw new Error("MULTI_SENSE_CSV_EXPORT_READ_FAILED");
  if (!word.data || !reviewed.data)
    return Response.json({ error: "Review the word's meanings in Overview first." }, { status: 404 });
  const senseSet = reviewed.data.sense_set as DictionarySenseSet;
  const bundle: MultiSenseCsvBundle = { wordId, displayWord: word.data.display_word,
    sourceSenseReviewedAt: reviewed.data.reviewed_at, senseSet,
    analyses: senseSet.senses.flatMap(sense => {
      const analysis = (analyses.data ?? []).find(row => row.sense_id === sense.id);
      if (!analysis) return [];
      const matching = (links.data ?? []).filter(row => row.sense_id === sense.id
        && row.sense_morphology_id === analysis.id);
      const family = matching.length === 1 ? matching[0] : null;
      return [{ senseId: sense.id,
        parts: analysis.morphology_parts as MultiSenseCsvBundle["analyses"][number]["parts"],
        joins: analysis.morphology_joins as MultiSenseCsvBundle["analyses"][number]["joins"],
        transformations: analysis.morphology_transformations as MultiSenseCsvBundle["analyses"][number]["transformations"],
        wordSum: analysis.word_sum, familyKey: family?.family_key ?? "",
        componentPartId: family?.component_part_id ?? "",
        relationshipKind: family?.relationship_kind ?? "", requestedSkillKeys: [] }];
    }) };
  return new NextResponse(renderMultiSenseCsv(bundle), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="teaching-dictionary-meanings-${wordId}.csv"`,
    "Cache-Control": "no-store",
  } });
}
