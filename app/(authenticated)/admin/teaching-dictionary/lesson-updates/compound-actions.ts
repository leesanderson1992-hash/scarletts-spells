"use server";

import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ingReviewEnvironment } from "@/lib/teaching-dictionary-manager/ing-staging-scope";
import { isCompoundWorkbookSkill } from "@/lib/teaching-dictionary-manager/compound-workbook";
import { stageCompoundWorkbookDraft, loadPendingCompoundWorkbookQueue } from "@/lib/teaching-dictionary-manager/compound-workbook-draft";
import { loadLessonReadiness } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import { compoundReviewSource } from "@/lib/teaching-dictionary-manager/compound-review";
import { loadReviewedMeaningBundles } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { saveBulkSkillApprovals } from "../bulk-assign/actions";

export async function publishCompoundWorkbookWords(form: FormData) {
  const actor = await requireAdminUser();
  const skill = form.get("skill");
  if (!isCompoundWorkbookSkill(skill)) redirect("/admin/teaching-dictionary/lesson-updates");
  const path = `/admin/teaching-dictionary/lesson-updates?skill=${skill}&view=preview`;
  let message = ""; let count = 0;
  try {
    const db = createServiceRoleClient();
    const ids = [...new Set(form.getAll("word_id").map(String))];
    const draftIds = form.getAll("draft_id").map(String);
    if (!ids.length || ids.length > 30 || draftIds.length !== ids.length) throw new Error("Choose up to 30 reviewed compounds.");
    const pending = await loadPendingCompoundWorkbookQueue(db, skill);
    const rows = ids.map((id, index) => pending.find(row => row.wordId === id && row.id === draftIds[index]));
    if (rows.some(row => !row || row.blockers.length)) throw new Error("Some compound facts changed or are incomplete. Refresh the preview.");
    const bundles = await loadReviewedMeaningBundles(db, ids);
    const senseIds: Record<string, string> = {};
    for (const row of rows) {
      const bundle = bundles.find(bundle => bundle.wordId === row!.wordId);
      const route = row!.payload.routeContents.find(route => route.microSkillKey === skill)!;
      if (!bundle || route.content.workbookSenseRevision !== bundle.sourceSenseReviewedAt) throw new Error("The approved Dictionary facts changed. Upload the refreshed compound workbook.");
      senseIds[row!.wordId] = row!.payload.skillSenseIds![skill];
    }
    const versions = await db.from("teaching_dictionary_route_content_versions").select("id,draft_id").in("draft_id", draftIds).eq("route_id", "compound_word_lab").eq("micro_skill_key", skill);
    if (versions.error || versions.data.length !== rows.length) throw new Error("Could not verify the compound drafts.");
    for (const row of rows) {
      const overview = await db.rpc("review_teaching_dictionary_overview", { p_draft: row!.id, p_actor: actor.id });
      if (overview.error) throw new Error(`Could not approve the Dictionary facts for ${row!.payload.displayWord}.`);
      const review = await db.rpc("review_teaching_dictionary_route_content", { p_content_version: versions.data.find(version => version.draft_id === row!.id)!.id, p_actor: actor.id });
      if (review.error) throw new Error(`Could not approve the compound lesson facts for ${row!.payload.displayWord}.`);
    }
    const [current] = await loadLessonReadiness({ routeId: "compound_word_lab", microSkillKey: skill });
    const selected = new Set(versions.data.map(row => row.id));
    if (!current?.compilerReady || current.status !== "ready_to_launch" || !current.releasePackage || current.reviewedCandidateIds.length !== selected.size || current.reviewedCandidateIds.some(id => !selected.has(id)))
      throw new Error(current?.blockers.join(" ") || "The complete compound lesson did not pass its checks.");
    const approvals = await saveBulkSkillApprovals({ microSkillKey: skill, applyWordIds: ids, excludeWordIds: [], clearWordIds: [], deassignWordIds: [], senseIds, requestId: randomUUID(), sourceKind: "teaching_dictionary_import", workbookReadback: true });
    if (!approvals.ok) throw new Error(approvals.blocked[0]?.reason ?? approvals.error ?? "Could not approve these compounds for the lesson.");
    const published = await db.rpc("launch_teaching_dictionary_governed_package_v1", {
      p_route_id: "compound_word_lab", p_micro_skill_key: skill, p_versions: current.reviewedCandidateIds, p_actor: actor.id,
      p_package: current.releasePackage, p_package_sha256: current.releasePackage.packageSha256,
      p_expected_revision: current.activationRevisionId, p_environment: ingReviewEnvironment(),
      p_preflight_fingerprint: current.preflightFingerprint, p_compiler_witnesses: current.compilerWitnesses,
    });
    if (published.error || !published.data) throw new Error(published.error?.message ?? "The compound lesson could not publish.");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    try {
      const release = await compoundReviewSource(db, skill);
      for (const row of rows) {
        const actual = release.curriculum.structures.find(structure => structure.wholeCanonicalWordId === row!.wordId);
        const expected = row!.payload.routeContents.find(route => route.microSkillKey === skill)!.content;
        const dictation = release.curriculum.dictationByCanonicalId.get(row!.wordId);
        if (!actual || actual.childFriendlyMeaning !== row!.payload.definition
          || semanticJson(actual.components) !== semanticJson(expected.components)
          || semanticJson(actual.joins.map(join => join.kind)) !== semanticJson(expected.joins)
          || actual.componentToWholeRelationship !== expected.componentToWholeRelationship
          || dictation?.sentence !== row!.payload.dictationSentence)
          throw new Error("The published compound does not match the reviewed Dictionary facts.");
      }
    } catch {
      const rollback = await db.rpc("rollback_teaching_dictionary_launch_v2", { p_launch: published.data, p_actor: actor.id, p_reason: "Compound Bulk review publication failed runtime verification" });
      if (rollback.error) throw new Error("The compound release could not be verified or rolled back. Open lesson readiness.");
      throw new Error("The compound update failed its runtime check and was rolled back. Your review remains available to retry.");
    }
    count = ids.length;
  } catch (error) { message = error instanceof Error ? error.message : "Could not publish the compound lesson."; }
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath("/admin/teaching-dictionary/lesson-updates");
  redirect(message ? `${path}&error=${encodeURIComponent(message)}` : `${path}&published=${count}`);
}

export async function saveCompoundWorkbookDetails(form: FormData) {
  const actor = await requireAdminUser();
  const skill = form.get("skill");
  if (!isCompoundWorkbookSkill(skill)) redirect("/admin/teaching-dictionary/lesson-updates");
  const path = `/admin/teaching-dictionary/lesson-updates?skill=${skill}&view=preview`;
  let message = "";
  try {
    const db = createServiceRoleClient();
    const row = (await loadPendingCompoundWorkbookQueue(db, skill)).find(row => row.id === form.get("draft_id") && row.wordId === form.get("word_id"));
    if (!row) throw new Error("The compound draft changed. Refresh before editing.");
    const explanation = String(form.get("componentToWholeRelationship") ?? "").trim();
    if (!explanation || explanation.length > 1000) throw new Error("Explain how the parts make this meaning in one short sentence.");
    const [bundle] = await loadReviewedMeaningBundles(db, [row.wordId]);
    const route = row.payload.routeContents.find(route => route.microSkillKey === skill)!;
    if (!bundle || bundle.sourceSenseReviewedAt !== route.content.workbookSenseRevision) throw new Error("The Dictionary facts changed. Upload the refreshed workbook.");
    await stageCompoundWorkbookDraft(db, actor.id, bundle, skill, row.payload.skillSenseIds![skill], { componentToWholeRelationship: explanation },
      { age_band: row.payload.ageBand, frequency_band: row.payload.frequencyBand, complexity_band: row.payload.complexityBand, has_schwa: row.payload.metadata.has_schwa == null ? "" : row.payload.metadata.has_schwa ? "yes" : "no" });
  } catch (error) { message = error instanceof Error ? error.message : "Could not save the compound explanation."; }
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG); revalidatePath("/admin/teaching-dictionary/lesson-updates");
  redirect(message ? `${path}&error=${encodeURIComponent(message)}` : path);
}
