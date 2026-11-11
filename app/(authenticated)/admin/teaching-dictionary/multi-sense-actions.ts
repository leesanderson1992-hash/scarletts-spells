"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_DICTIONARY_CSV_BYTES } from "@/lib/teaching-dictionary-manager/csv";
import { prepareReviewedCsv } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { saveBulkSkillApprovals } from "./bulk-assign/actions";

type ImportIssue = { word: string; rows: number[]; wordId?: string; reason: string };
export type MultiSenseImportState = {
  words?: number; approved?: number; alreadyApproved?: number; issues?: ImportIssue[]; error?: string;
};

function importIssue(message: string) {
  if (message.includes("MULTI_SENSE_CSV_SOURCE_CHANGED"))
    return "The reviewed meanings changed. Download a fresh sheet and reapply your edits.";
  if (message.includes("REVIEWED_CSV_WORD_EXISTS") || message.includes("23505"))
    return "This spelling already exists. Use its dictionary word ID and current export to update it.";
  if (message.includes("REVIEWED_CSV_IDENTITY_MISMATCH"))
    return "The dictionary word ID does not match this spelling. Use the ID from the word's export.";
  if (message.includes("MULTI_SENSE_CSV_EXISTING_SENSE_MISSING"))
    return "Keep every existing meaning ID. Download a fresh export to see the full list.";
  if (message.includes("MULTI_SENSE_CSV_APPROVED_WORD_REQUIRED"))
    return "Use an active, approved dictionary entry for this update.";
  if (message.includes("SENSE_FAMILY_"))
    return "Check that the family key, base or root part, and relationship match the approved family.";
  if (message.includes("SENSE_MORPHOLOGY_"))
    return "Check the word parts, joins and spelling changes against the spelling.";
  return "The word could not be saved. Check the sheet and retry.";
}

export async function importReviewedMultiSenseCsv(
  _previous: MultiSenseImportState, form: FormData,
): Promise<MultiSenseImportState> {
  const actor = await requireAdminUser();
  const file = form.get("multi_sense_csv");
  if (!(file instanceof File) || !file.size || file.size > MAX_DICTIONARY_CSV_BYTES)
    return { error: "Choose a CSV smaller than 4 MB." };
  let entries: ReturnType<typeof prepareReviewedCsv>;
  try { entries = prepareReviewedCsv(await file.text()); }
  catch (error) { return { error: error instanceof Error ? error.message : "The sheet format is invalid." }; }
  const db = createServiceRoleClient();
  const issues: ImportIssue[] = [];
  let words = 0;
  let approved = 0;
  let alreadyApproved = 0;
  for (const { word, rows, bundle, error } of entries) {
    if (!bundle) {
      issues.push({ word, rows, reason: error ?? "Check the word facts." });
      continue;
    }
    const applied = await db.rpc("import_reviewed_teaching_dictionary_word", {
      p_request_id: randomUUID(), p_word_id: bundle.wordId || null, p_display_word: bundle.displayWord,
      p_expected_reviewed_at: bundle.sourceSenseReviewedAt, p_sense_set: bundle.senseSet,
      p_analyses: bundle.analyses, p_actor: actor.id,
      p_source_reference: `Admin reviewed CSV: ${file.name.slice(0, 120)}`,
    });
    if (applied.error || typeof applied.data !== "string") {
      issues.push({ word, rows, reason: importIssue(applied.error?.code === "23505" ? "23505" : applied.error?.message ?? "") });
      continue;
    }
    words += 1;
    const wordId = applied.data;
    for (const [index, analysis] of bundle.analyses.entries()) {
      for (const skillKey of analysis.requestedSkillKeys) {
        const prefix = `${skillKey} · ${bundle.senseSet.senses[index].definition}`;
        const report = (reason: string) => issues.push({
          word, wordId, rows: [rows[index]], reason: `${prefix}: ${reason}`,
        });
        if (!hasCandidateRule(skillKey)) {
          report("This lesson does not have automatic approval checks yet. Review it in the bulk assigner.");
          continue;
        }
        try {
          const result = await saveBulkSkillApprovals({ microSkillKey: skillKey,
            applyWordIds: [wordId], excludeWordIds: [], clearWordIds: [], deassignWordIds: [],
            senseIds: { [wordId]: analysis.senseId }, requestId: randomUUID(),
            sourceKind: "teaching_dictionary_import" });
          if (result.ok) {
            approved += result.approvedCount;
            alreadyApproved += result.alreadyAssignedCount;
          } else report(result.blocked[0]?.reason ?? result.error ?? "Recheck this lesson request.");
        } catch { report("The lesson check could not finish. Recheck the saved request."); }
      }
    }
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  }
  if (words) {
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath("/admin/teaching-dictionary");
  }
  return { words, approved, alreadyApproved, issues };
}
