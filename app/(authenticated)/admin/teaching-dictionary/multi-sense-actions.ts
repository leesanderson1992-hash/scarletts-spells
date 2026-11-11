"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_DICTIONARY_CSV_BYTES } from "@/lib/teaching-dictionary-manager/csv";
import { parseMultiSenseCsv } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { saveBulkSkillApprovals } from "./bulk-assign/actions";

export type MultiSenseImportState = { wordId?: string; reviewed?: number; approved?: number;
  pending?: string[]; error?: string };

export async function importReviewedMultiSenseCsv(
  _previous: MultiSenseImportState, form: FormData,
): Promise<MultiSenseImportState> {
  const actor = await requireAdminUser();
  const file = form.get("multi_sense_csv");
  if (!(file instanceof File) || !file.size || file.size > MAX_DICTIONARY_CSV_BYTES)
    return { error: "Choose a CSV smaller than 4 MB." };
  let bundles: ReturnType<typeof parseMultiSenseCsv>;
  try { bundles = parseMultiSenseCsv(await file.text()); }
  catch (error) { return { error: error instanceof Error ? error.message : "The sheet format is invalid." }; }
  if (bundles.length !== 1)
    return { error: "Import one complete word and all of its meanings at a time." };
  const bundle = bundles[0];
  const db = createServiceRoleClient();
  const requestId = randomUUID();
  const applied = await db.rpc("review_teaching_dictionary_multi_sense_csv", {
    p_request_id: requestId, p_word_id: bundle.wordId,
    p_expected_reviewed_at: bundle.sourceSenseReviewedAt,
    p_sense_set: bundle.senseSet, p_analyses: bundle.analyses,
    p_actor: actor.id, p_source_reference: `Reviewed multi-meaning CSV: ${file.name.slice(0, 120)}`,
  });
  if (applied.error) return { error: applied.error.message.match(/MULTI_SENSE_CSV_[A-Z_]+|SENSE_(?:MORPHOLOGY|FAMILY)_[A-Z_]+/)?.[0]
    ?.replaceAll("_", " ").toLowerCase() ?? "The reviewed meanings could not be imported." };
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath(`/admin/teaching-dictionary/${bundle.wordId}`);
  let approved = 0;
  const pending: string[] = [];
  for (const analysis of bundle.analyses) for (const skillKey of analysis.requestedSkillKeys) {
    if (!hasCandidateRule(skillKey)) {
      pending.push(`${skillKey} · ${analysis.senseId}: Use the bulk assigner to review this lesson.`);
      continue;
    }
    const result = await saveBulkSkillApprovals({ microSkillKey: skillKey,
      applyWordIds: [bundle.wordId], excludeWordIds: [], clearWordIds: [], deassignWordIds: [],
      senseIds: { [bundle.wordId]: analysis.senseId }, requestId: randomUUID(),
      sourceKind: "teaching_dictionary_import" });
    if (result.ok) approved += 1;
    else pending.push(`${skillKey} · ${analysis.senseId}: ${result.blocked[0]?.reason ?? result.error ?? "Recheck in the bulk assigner."}`);
  }
  return { wordId: bundle.wordId, reviewed: bundle.senseSet.senses.length, approved, pending };
}
