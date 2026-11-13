"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_DICTIONARY_CSV_BYTES } from "@/lib/teaching-dictionary-manager/csv";
import { approvedWorkbookFamily, createWorkbookFamily, loadWorkbookFamilyChoices } from "@/lib/teaching-dictionary-manager/workbook-family-resolution";
import { readReviewWorkbook, type WorkbookFamilyTask, type WorkbookFamilyDecision } from "@/lib/teaching-dictionary-manager/review-workbook";
import { prepareReviewedCsv } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { routeForSkill } from "@/lib/teaching-dictionary-manager/contracts";
import { loadLessonReadiness } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import { canUpdateIngLesson, isStagingIngSkill, loadStagingIngWordReleaseStatuses } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import { saveBulkSkillApprovals } from "./bulk-assign/actions";

type ImportIssue = { word: string; rows: number[]; wordId?: string; reason: string };
type LessonResult = { word: string; wordId: string; meaning: string; skillKey: string;
  approval: "Approved" | "Already approved" | "Needs review"; release?: string; routeId?: string };
export type MultiSenseImportState = {
  lessons?: LessonResult[];
  familyTasks?: WorkbookFamilyTask[];
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
  const workbook = form.get("review_workbook");
  const skill = form.get("workbook_skill");
  if (workbook && (!canUpdateIngLesson() || !isStagingIngSkill(skill)))
    return { error: "Workbook review is available for the four -ing lessons." };
  const file = workbook ?? form.get("multi_sense_csv");
  if (!(file instanceof File) || !file.size || file.size > MAX_DICTIONARY_CSV_BYTES)
    return { error: workbook ? "Choose a workbook smaller than 4 MB." : "Choose a CSV smaller than 4 MB." };
  const db = createServiceRoleClient();
  let familyTasks: WorkbookFamilyTask[] | undefined;
  let entries: ReturnType<typeof prepareReviewedCsv>;
  try {
    if (workbook && isStagingIngSkill(skill)) {
      const rawTarget = form.get("family_target_row");
      const targetRow = typeof rawTarget === "string" ? Number(rawTarget) : undefined;
      const rawDecisions = form.get("family_decisions");
      const decisions = typeof rawDecisions === "string" ? JSON.parse(rawDecisions) as WorkbookFamilyDecision[] : [];
      if (targetRow !== undefined && (!Number.isSafeInteger(targetRow) || targetRow < 4)
        || !Array.isArray(decisions) || decisions.length > 20 || decisions.some(item =>
          !item || !Number.isSafeInteger(item.row) || item.row < 4 ||
          (typeof item.familyKey === "string") === (typeof item.createSenseId === "string") ||
          (item.familyKey?.length ?? 0) > 200 || (item.createSenseId?.length ?? 0) > 200))
        throw new Error("Choose a valid family decision.");
      const { csv, rowNumbers, pendingFamilies } = await readReviewWorkbook(await file.arrayBuffer(), skill, {
        targetRow, decisions,
        resolve: (base, decision) => decision.createSenseId
          ? createWorkbookFamily(db, actor.id, base, decision.createSenseId)
          : approvedWorkbookFamily(db, decision.familyKey ?? ""),
      });
      familyTasks = pendingFamilies;
      entries = !rowNumbers.length ? [] : prepareReviewedCsv(csv).map(entry => {
        const rows = entry.rows.map(row => rowNumbers[row - 2]);
        if (entry.bundle) return { ...entry, rows };
        return { ...entry, rows,
          error: entry.error.replace(/^Row (\d+):/u, (_, row) => `Row ${rowNumbers[Number(row) - 2]}:`) };
      });
    } else entries = prepareReviewedCsv(await file.text());
  }
  catch (error) { return { error: error instanceof Error ? error.message : "The sheet format is invalid." }; }
  const issues: ImportIssue[] = [];
  const lessons: LessonResult[] = [];
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
      p_source_reference: `Admin reviewed ${workbook ? "workbook" : "CSV"}: ${file.name.slice(0, 120)}`,
    });
    if (applied.error || typeof applied.data !== "string") {
      issues.push({ word, rows, reason: importIssue(applied.error?.code === "23505" ? "23505" : applied.error?.message ?? "") });
      continue;
    }
    words += 1;
    const wordId = applied.data;
    for (const [index, analysis] of bundle.analyses.entries()) {
      for (const skillKey of analysis.requestedSkillKeys) {
        const lesson: LessonResult = { word, wordId, skillKey, meaning: bundle.senseSet.senses[index].definition,
          approval: "Needs review", routeId: routeForSkill(skillKey)?.routeId };
        lessons.push(lesson);
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
            sourceKind: "teaching_dictionary_import", workbookReadback: Boolean(workbook) });
          if (result.ok) {
            lesson.approval = result.approvedCount ? "Approved" : "Already approved";
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
    revalidatePath("/admin/teaching-dictionary/lesson-updates");
  }
  await Promise.all([...new Set(lessons.map(lesson => lesson.skillKey))].map(async skillKey => {
    const results = lessons.filter(lesson => lesson.skillKey === skillKey);
    try {
      if (isStagingIngSkill(skillKey) && canUpdateIngLesson()) {
        const statuses = await loadStagingIngWordReleaseStatuses(db, skillKey,
          results.filter(row => row.approval !== "Needs review").map(row => row.wordId));
        for (const row of results) row.release = row.approval === "Needs review" ? "Release review needed"
          : statuses.get(row.wordId) ?? "Release review needed";
        return;
      }
      const routeId = results[0].routeId;
      const [lesson] = routeId ? await loadLessonReadiness({ routeId, microSkillKey: skillKey }) : [];
      for (const row of results) row.release = !lesson ? "No lesson release status"
        : !lesson.released ? "Lesson awaiting release" : !lesson.activationEnabled ? "Lesson released · awaiting activation"
          : "Lesson active · check word inclusion";
    } catch {
      for (const row of results) row.release = "Check current lesson readiness";
    }
  }));
  return { words, approved, alreadyApproved, issues, lessons, familyTasks };
}


export async function getWorkbookFamilyChoices(skill: string, base: string) {
  await requireAdminUser();
  if (!canUpdateIngLesson() || !isStagingIngSkill(skill) || !/^[a-z][a-z'-]{0,119}$/u.test(base))
    throw new Error("Choose a workbook row with a base spelling.");
  return loadWorkbookFamilyChoices(createServiceRoleClient(), base);
}
