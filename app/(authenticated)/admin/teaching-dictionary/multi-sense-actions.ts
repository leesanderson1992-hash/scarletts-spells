"use server";
import { saveReviewedSchwaDivisions } from "@/lib/teaching-dictionary-manager/schwa-syllable-authority";
import { isSchwaWorkbookSkill, type SchwaWorkbookFacts } from "@/lib/teaching-dictionary-manager/weak-vowel-workbook";
import { stageSchwaWorkbookDraft, loadSchwaWorkbookQueue } from "@/lib/teaching-dictionary-manager/schwa-bulk-review";

import { isHomophoneReviewSkill } from "@/lib/teaching-dictionary-manager/homophone-review-contract";
import { isCompoundWorkbookSkill, type CompoundWorkbookFacts } from "@/lib/teaching-dictionary-manager/compound-workbook";
import { stageCompoundWorkbookDraft } from "@/lib/teaching-dictionary-manager/compound-workbook-draft";

import { loadReviewedMeaningBundles } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { reviewedWorkbookAuthority } from "@/lib/teaching-dictionary-manager/workbook-authority";

import { randomUUID } from "node:crypto";
import { scheduleFamilyDependencyRecheck } from "@/lib/teaching-dictionary-manager/family-dependency-scheduling";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_DICTIONARY_CSV_BYTES } from "@/lib/teaching-dictionary-manager/csv";
import { approvedWorkbookFamily, createWorkbookFamily, loadWorkbookFamilyChoices } from "@/lib/teaching-dictionary-manager/workbook-family-resolution";
import { readReviewWorkbook, type WorkbookFamilyTask, type WorkbookFamilyDecision } from "@/lib/teaching-dictionary-manager/review-workbook";
import { prepareReviewedCsv } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { hasCandidateRule, isComparativeReviewSkill } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { routeForSkill } from "@/lib/teaching-dictionary-manager/contracts";
import { loadLessonReadiness } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import { canUpdateIngLesson, isStagingIngSkill, loadStagingIngWordReleaseStatuses } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import { type SuffixWorkbookFacts } from "@/lib/teaching-dictionary-manager/able-ible-workbook";
import { isSuffixWorkbookPilot, isIdentifyBaseReview, specialistWorkbookRoute, supportsReviewWorkbook } from "@/lib/teaching-dictionary-manager/bulk-review-scope";
import { stageAbleIbleWord, suffixWorkbookIssues } from "@/lib/teaching-dictionary-manager/able-ible-review";
import { NEGATIVE_PREFIX_SKILL, prefixWorkbookChoice, prefixWorkbookEnabled, prefixWorkbookFieldLabel,
  SUB_INTER_SUPER_PREFIX_SKILL } from "@/lib/teaching-dictionary-manager/prefix-workbook";
import { loadPrefixWorkbookQueue } from "@/lib/teaching-dictionary-manager/prefix-bulk-review";
import { stagePrefixWorkbookDraft } from "@/lib/teaching-dictionary-manager/prefix-workbook-draft";
import { saveBulkSkillApprovals } from "./bulk-assign/actions";

type ImportIssue = { word: string; rows: number[]; wordId?: string; reason: string };
type LessonResult = { word: string; wordId: string; meaning: string; skillKey: string;
  approval: "Approved" | "Already approved" | "Needs review" | "Ready to publish"; release?: string; routeId?: string; draftId?: string };
export type MultiSenseImportState = {
  workbookSummary?: { fileName: string; meaningRows: number; selectedMeanings: number; selectedWords: number };
  lessons?: LessonResult[];
  familyTasks?: WorkbookFamilyTask[];
  conflicts?: ImportIssue[];
  uploadComplete?: boolean; words?: number; approved?: number; alreadyApproved?: number; issues?: ImportIssue[]; error?: string;
};

function importIssue(message: string) {
  if (message.includes("MULTI_SENSE_CSV_SOURCE_CHANGED"))
    return "The dictionary changed during this upload. Upload the workbook again to apply your reviewed facts.";
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

function workbookBasePartOfSpeech(skill: string) {
  if (isSchwaWorkbookSkill(skill) || isCompoundWorkbookSkill(skill) || isSuffixWorkbookPilot(skill) || isComparativeReviewSkill(skill) || skill === SUB_INTER_SUPER_PREFIX_SKILL) return null;
  return skill === NEGATIVE_PREFIX_SKILL ? "adjective" : "verb";
}

export async function importReviewedMultiSenseCsv(
  _previous: MultiSenseImportState, form: FormData,
): Promise<MultiSenseImportState> {
  const actor = await requireAdminUser();
  const workbook = form.get("review_workbook");
  const skill = form.get("workbook_skill");
  if (workbook && !supportsReviewWorkbook(skill))
    return { error: "Workbook review is unavailable for this lesson." };
  const file = workbook ?? form.get("multi_sense_csv");
  if (!(file instanceof File) || !file.size || file.size > MAX_DICTIONARY_CSV_BYTES)
    return { error: workbook ? "Choose a workbook smaller than 4 MB." : "Choose a CSV smaller than 4 MB." };
  const db = createServiceRoleClient();
  let familyTasks: WorkbookFamilyTask[] | undefined;
  let schwaFacts = new Map<number, SchwaWorkbookFacts>();
  let compoundFacts = new Map<number, CompoundWorkbookFacts>();
  let prefixMeanings = new Map<number, string>();
  let suffixFacts = new Map<number, SuffixWorkbookFacts>();
  let entries: ReturnType<typeof prepareReviewedCsv>;
  let workbookSummary: MultiSenseImportState["workbookSummary"];
  try {
    if (workbook && supportsReviewWorkbook(skill)) {
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
      const { csv, rowNumbers, pendingFamilies, reviewSummary, schwaFacts: workbookSchwaFacts, compoundFacts: workbookCompoundFacts, suffixFacts: workbookSuffixFacts, prefixMeanings: workbookPrefixMeanings } = await readReviewWorkbook(await file.arrayBuffer(), skill, {
        targetRow, decisions,
        resolve: (base, decision) => decision.createSenseId
          ? createWorkbookFamily(db, actor.id, base, decision.createSenseId, workbookBasePartOfSpeech(skill))
          : approvedWorkbookFamily(db, decision.familyKey ?? "", true),
      });
      workbookSummary = { fileName: file.name.slice(0, 120), ...reviewSummary };
      schwaFacts = workbookSchwaFacts;
      compoundFacts = workbookCompoundFacts;
      suffixFacts = workbookSuffixFacts;
      prefixMeanings = workbookPrefixMeanings;
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
  const conflicts: ImportIssue[] = [];
  const lessons: LessonResult[] = [];
  let words = 0;
  let completedWords = 0;
  let approved = 0;
  let alreadyApproved = 0;
  for (const entry of entries) {
    const { word, rows, error } = entry;
    let bundle = entry.bundle;
    if (!bundle) {
      issues.push({ word, rows, reason: error ?? "Check the word facts." });
      continue;
    }
    if (workbook && isSuffixWorkbookPilot(skill)) {
      const blockers = bundle.analyses.flatMap((analysis, index) => analysis.requestedSkillKeys.length
        ? suffixWorkbookIssues(suffixFacts.get(rows[index])) : []);
      if (blockers.length) {
        issues.push({ word, rows, reason: [...new Set(blockers)].join(" ") });
        continue;
      }
    }
    if (workbook && isCompoundWorkbookSkill(skill) && bundle.wordId) {
      const [current] = await loadReviewedMeaningBundles(db, [bundle.wordId]);
      const links = await db.from("teaching_dictionary_current_sense_family_memberships")
        .select("sense_id,component_part_id").eq("canonical_word_id", bundle.wordId);
      if (links.error) { issues.push({ word, rows, reason: "Could not verify existing component family links." }); continue; }
      const changedMultipleFamilies = bundle.analyses.some(analysis => {
        if (links.data.filter(link => link.sense_id === analysis.senseId).length < 2) return false;
        const prior = current?.analyses.find(row => row.senseId === analysis.senseId);
        return !prior || semanticJson(prior.parts) !== semanticJson(analysis.parts) || semanticJson(prior.joins) !== semanticJson(analysis.joins)
          || semanticJson(prior.transformations) !== semanticJson(analysis.transformations);
      });
      if (changedMultipleFamilies) { issues.push({ word, rows, reason: "This compound has several reviewed component families. Review changed parts on its word page first so those links are preserved." }); continue; }
    }
    // The admin-reviewed workbook is the new authority. Rebase onto the current
    // revision, then let the transaction validate facts and catch concurrent edits.
    let replacedFields: string[] = [];
    if (workbook && bundle.wordId) {
      const [current] = await loadReviewedMeaningBundles(db, [bundle.wordId]);
      const authority = reviewedWorkbookAuthority(bundle, current);
      bundle = authority.bundle;
      replacedFields = authority.replacedFields;
    }
    const waiting = (familyTasks ?? []).filter(task => rows.includes(task.row));
    const importFacts = {
      p_request_id: randomUUID(), p_word_id: bundle.wordId || null, p_display_word: bundle.displayWord,
      p_expected_reviewed_at: bundle.sourceSenseReviewedAt, p_sense_set: bundle.senseSet,
      p_analyses: bundle.analyses, p_actor: actor.id,
      p_source_reference: `Admin reviewed ${workbook ? "workbook" : "CSV"}: ${file.name.slice(0, 120)}${replacedFields.length
        ? `; workbook superseded ${replacedFields.join(", ")}` : ""}`,
    };
    const applied = workbook ? await db.rpc("import_teaching_dictionary_partial_review", {
      ...importFacts, p_environment: resolveAdleRouteActivationEnvironment(), p_skill: skill,
      p_dependencies: waiting.map(task => ({ senseId: task.senseId, componentPartId: task.componentPartId,
        context: { prefixMeaning: prefixMeanings.get(task.row), suffixFacts: suffixFacts.get(task.row), compoundFacts: compoundFacts.get(task.row), schwaFacts: schwaFacts.get(task.row) } })),
    }) : await db.rpc("import_reviewed_teaching_dictionary_word", importFacts);
    if (applied.error || typeof applied.data !== "string") {
      issues.push({ word, rows, reason: importIssue(applied.error?.code === "23505" ? "23505" : applied.error?.message ?? "") });
      continue;
    }
    words += 1;
    const wordId = applied.data;
    if (workbook && isSchwaWorkbookSkill(skill)) {
      const divisions = rows.map(row => schwaFacts.get(row)?.written_syllable_breakdown).filter(Boolean) as string[];
      if (new Set(divisions).size > 1) { issues.push({ word, wordId, rows, reason: "Use the same Dictionary spoken syllable divisions for all meanings of this spelling." }); continue; }
      if (divisions[0]) try { await saveReviewedSchwaDivisions(db, bundle.displayWord, wordId, divisions[0], actor.id); }
      catch (error) { issues.push({ word, wordId, rows, reason: error instanceof Error ? error.message : "Could not save spoken syllable divisions." }); continue; }
    }
    completedWords += 1;
    if (workbook && waiting.length) {
      const synced = await db.rpc("sync_dictionary_family_components", { p_environment: resolveAdleRouteActivationEnvironment(), p_word: wordId, p_skill: skill });
      if (synced.error) issues.push({ word, wordId, rows, reason: "Reviewed facts are saved. Refresh Family assignment to recheck the remaining components." });
      if (waiting.length > 1) scheduleFamilyDependencyRecheck(undefined, wordId);
    }
    if (replacedFields.length) conflicts.push({ word, rows, wordId,
      reason: `Workbook accepted as the new authority for ${replacedFields.join(", ")}.` });
    for (const [index, analysis] of bundle.analyses.entries()) {
      for (const skillKey of analysis.requestedSkillKeys) {
        const lesson: LessonResult = { word, wordId, skillKey, meaning: bundle.senseSet.senses[index].definition,
          approval: "Needs review", routeId: routeForSkill(skillKey)?.routeId };
        lessons.push(lesson);
        if (!isSchwaWorkbookSkill(skillKey) && waiting.some(task => task.senseId === analysis.senseId)) {
          lesson.release = "Reviewed facts saved. Waiting for the family; this review can be resumed after leaving the page.";
          continue;
        }
        const prefix = `${skillKey} · ${bundle.senseSet.senses[index].definition}`;
        const report = (reason: string) => issues.push({
          word, wordId, rows: [rows[index]], reason: `${prefix}: ${reason}`,
        });
        if (workbook && isSchwaWorkbookSkill(skillKey)) {
          try {
            lesson.draftId = await stageSchwaWorkbookDraft(db, actor.id, { ...bundle, wordId }, skillKey, analysis.senseId, schwaFacts.get(rows[index])!, { reviewWrittenDivisions: true });
            const [review] = await loadSchwaWorkbookQueue(db, skillKey, [wordId]);
            lesson.approval = review && !review.blockers.length ? "Ready to publish" : "Needs review";
            lesson.release = review?.blockers.join(" ") || "Reviewed Dictionary facts saved. Publish from Preview.";
          } catch (error) { report(error instanceof Error ? error.message : "Could not save the Schwa review."); }
          continue;
        }
        if (workbook && isIdentifyBaseReview(skillKey)) {
          lesson.release = "Check and publish from the preview step";
          continue;
        }
        const prefixMeaning = prefixMeanings.get(rows[index]);
        if (prefixMeaning && prefixWorkbookEnabled(skillKey)) {
          try {
            lesson.draftId = await stagePrefixWorkbookDraft(db, actor.id, { ...bundle, wordId }, skillKey, analysis.senseId, prefixMeaning);
            const label = prefixWorkbookChoice(skillKey, prefixMeaning)?.label;
            const [row] = await loadPrefixWorkbookQueue(db, skillKey, [wordId]);
            lesson.release = row && !row.blockers.length ? `Ready to publish · ${label}` : `Complete missing facts in Preview · ${label}`;
          } catch (error) {
            report(error instanceof Error ? error.message : "Could not save the prefix lesson draft.");
            lesson.release = `${prefixWorkbookFieldLabel(skillKey)} needs review`;
          }
          continue;
        }
        if (workbook && isCompoundWorkbookSkill(skillKey)) {
          try {
            lesson.draftId = await stageCompoundWorkbookDraft(db, actor.id, { ...bundle, wordId }, skillKey, analysis.senseId,
              compoundFacts.get(rows[index]) ?? { componentToWholeRelationship: "" }, suffixFacts.get(rows[index]));
            lesson.release = "Saved Dictionary facts. Check and publish the compound from Preview.";
          } catch (error) { report(error instanceof Error ? error.message : "Could not save the compound lesson draft."); }
          continue;
        }
        if (workbook && isComparativeReviewSkill(skillKey)) {
          lesson.release = "Saved Dictionary facts. Publish the complete adjective set from Preview.";
          continue;
        }
        if (workbook && specialistWorkbookRoute(skillKey) && !hasCandidateRule(skillKey)) {
          lesson.release = "Review the lesson’s publication requirements in Preview";
          continue;
        }
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
            if (workbook && isSuffixWorkbookPilot(skillKey)) {
              await stageAbleIbleWord(db, actor.id, { ...bundle, wordId }, analysis.senseId, suffixFacts.get(rows[index])!, skillKey);
              lesson.release = "Ready for publish preview";
            }
            if (isHomophoneReviewSkill(skillKey)) lesson.release = "Dictionary facts approved. Check contrast-set alignment in Bulk review.";
            lesson.approval = result.approvedCount ? "Approved" : "Already approved";
            approved += result.approvedCount;
            alreadyApproved += result.alreadyAssignedCount;
          } else report(result.blocked[0]?.reason ?? result.error ?? "Recheck this lesson request.");
        } catch (error) { report(workbook && isSuffixWorkbookPilot(skillKey) && error instanceof Error
          ? error.message : "The lesson check could not finish. Recheck the saved request."); }
      }
    }
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  }
  if (words) {
    if (workbook) scheduleFamilyDependencyRecheck();
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath("/admin/teaching-dictionary");
    revalidatePath("/admin/teaching-dictionary/import");
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
      if (workbook && (isSuffixWorkbookPilot(skillKey) || isIdentifyBaseReview(skillKey) || specialistWorkbookRoute(skillKey))) return;
      const routeId = results[0].routeId;
      const [lesson] = routeId ? await loadLessonReadiness({ routeId, microSkillKey: skillKey }) : [];
      for (const row of results) row.release = !lesson ? "No lesson release status"
        : !lesson.released ? "Lesson awaiting release" : !lesson.activationEnabled ? "Lesson released · awaiting activation"
          : "Lesson active · check word inclusion";
    } catch {
      for (const row of results) row.release = "Check current lesson readiness";
    }
  }));
  return { words, approved, alreadyApproved, issues, lessons, familyTasks, conflicts, workbookSummary,
    uploadComplete: entries.length > 0 && completedWords === entries.length };
}


export async function getWorkbookFamilyChoices(skill: string, base: string) {
  await requireAdminUser();
  if (!supportsReviewWorkbook(skill) || !/^[a-z][a-z'-]{0,119}$/u.test(base))
    throw new Error("Choose a workbook row with a base spelling.");
  return loadWorkbookFamilyChoices(createServiceRoleClient(), base, true,
    workbookBasePartOfSpeech(skill));
}
