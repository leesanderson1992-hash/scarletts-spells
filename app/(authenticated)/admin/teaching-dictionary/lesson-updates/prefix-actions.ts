"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { writtenSyllableBlockers } from "@/lib/teaching-dictionary-manager/authoring";
import { DICTIONARY_BANDS } from "@/lib/teaching-dictionary-manager/contracts";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { loadLessonReadiness } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import { loadReviewedMeaningBundles } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { stagePrefixWorkbookDraft } from "@/lib/teaching-dictionary-manager/prefix-workbook-draft";
import { prefixWorkbookChoice, prefixWorkbookEnabled, PREFIX_PUBLISH_BATCH_SIZE, PREFIX_WORKBOOK_ROUTE, type PrefixWorkbookSkill } from "@/lib/teaching-dictionary-manager/prefix-workbook";
import { ingReviewEnvironment } from "@/lib/teaching-dictionary-manager/ing-staging-scope";
import { loadPrefixWorkbookQueue } from "@/lib/teaching-dictionary-manager/prefix-bulk-review";
import { saveBulkSkillApprovals } from "../bulk-assign/actions";

const base = "/admin/teaching-dictionary/lesson-updates";
type Db = ReturnType<typeof createServiceRoleClient>;
type QueueRow = Awaited<ReturnType<typeof loadPrefixWorkbookQueue>>[number];

async function currentBundle(db: Db, skill: PrefixWorkbookSkill, row: QueueRow) {
  const [bundle] = await loadReviewedMeaningBundles(db, [row.wordId]);
  const route = row.payload.routeContents.find(route => route.microSkillKey === skill);
  const senseId = row.payload.skillSenseIds?.[skill];
  const meaning = route?.content.meaningBinKey;
  if (!bundle || !senseId || !route || typeof meaning !== "string" || !prefixWorkbookChoice(skill, meaning)
    || route.content.workbookSenseRevision !== bundle.sourceSenseReviewedAt)
    throw new Error("The reviewed word changed. Download a fresh workbook for this meaning.");
  return { bundle, senseId, meaning };
}

function refresh() {
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath(base);
  revalidatePath("/admin/adle-lesson-readiness");
}

export async function savePrefixWorkbookDetails(form: FormData) {
  const actor = await requireAdminUser();
  const skill = form.get("skill");
  if (!prefixWorkbookEnabled(skill)) redirect(base);
  const path = `${base}?skill=${skill}&view=preview`;
  let message = "";
  try {
    const wordId = String(form.get("word_id") ?? "");
    if (!isUuid(wordId)) throw new Error("Choose a valid word.");
    const db = createServiceRoleClient();
    const [row] = await loadPrefixWorkbookQueue(db, skill, [wordId]);
    if (!row || row.id !== form.get("draft_id")) throw new Error("The draft changed. Refresh the review.");
    const { bundle, senseId, meaning } = await currentBundle(db, skill, row);
    const band = (key: keyof typeof DICTIONARY_BANDS) => {
      const value = String(form.get(key) ?? "");
      if (value && !(DICTIONARY_BANDS[key] as readonly string[]).includes(value)) throw new Error("Choose a listed dictionary band.");
      return value;
    };
    const schwa = form.get("hasSchwa");
    const written = String(form.get("writtenSyllableBreakdown") ?? "").trim();
    if (written.length > 140 || (schwa !== null && schwa !== "" && schwa !== "yes" && schwa !== "no"))
      throw new Error("Check the written syllables and schwa choice.");
    const [syllableError] = writtenSyllableBlockers(bundle.displayWord, written);
    if (syllableError) throw new Error(syllableError);
    await stagePrefixWorkbookDraft(db, actor.id, bundle, skill, senseId, meaning, {
      ageBand: band("ageBand"), frequencyBand: band("frequencyBand"), complexityBand: band("complexityBand"),
      writtenSyllableBreakdown: written, hasSchwa: schwa === "yes" ? true : schwa === "no" ? false : undefined,
    });
    refresh();
  } catch (error) { message = error instanceof Error ? error.message : "Could not save the word facts."; }
  redirect(message ? `${path}&error=${encodeURIComponent(message)}` : path);
}

export async function publishPrefixWorkbookWords(form: FormData) {
  const actor = await requireAdminUser();
  const skill = form.get("skill");
  if (!prefixWorkbookEnabled(skill)) redirect(base);
  const path = `${base}?skill=${skill}&view=preview`;
  let message = "";
  let published = 0;
  try {
    const ids = form.getAll("word_id").map(String);
    const draftIds = form.getAll("draft_id").map(String);
    if (!ids.length || ids.length > PREFIX_PUBLISH_BATCH_SIZE || new Set(ids).size !== ids.length || ids.some(id => !isUuid(id))
      || draftIds.length !== ids.length || draftIds.some(id => !isUuid(id))) throw new Error("Choose a valid group of words.");
    const db = createServiceRoleClient();
    const rows = await loadPrefixWorkbookQueue(db, skill, ids);
    if (rows.length !== ids.length || rows.some(row => row.id !== draftIds[ids.indexOf(row.wordId)] || row.blockers.length))
      throw new Error("The selection has missing facts or changed drafts. Refresh and recheck.");
    const [before] = await loadLessonReadiness({ routeId: PREFIX_WORKBOOK_ROUTE, microSkillKey: skill });
    const versions = await db.from("teaching_dictionary_route_content_versions").select("id,draft_id").in("draft_id", draftIds)
      .eq("route_id", PREFIX_WORKBOOK_ROUTE).eq("micro_skill_key", skill);
    if (versions.error || versions.data.length !== rows.length) throw new Error("Could not verify the staged lesson drafts.");
    const versionByDraft = new Map(versions.data.map(row => [row.draft_id, row.id]));
    const selectedVersions = new Set(versions.data.map(row => row.id));
    if (!before?.releaseId || before.reviewedCandidateIds.some(id => !selectedVersions.has(id)))
      throw new Error("Another reviewed update is waiting on this lesson. Open lesson readiness to check it first.");

    const senseIds: Record<string, string> = {};
    for (const row of rows) {
      const { bundle, senseId, meaning } = await currentBundle(db, skill, row);
      if (await stagePrefixWorkbookDraft(db, actor.id, bundle, skill, senseId, meaning) !== row.id)
        throw new Error("Current dictionary facts changed. Check the refreshed preview before publishing.");
      senseIds[row.wordId] = senseId;
    }
    for (const row of rows) {
      const overview = await db.rpc("review_teaching_dictionary_overview", { p_draft: row.id, p_actor: actor.id });
      if (overview.error) throw new Error(`Could not review the dictionary facts for ${row.payload.displayWord}.`);
      const review = await db.rpc("review_teaching_dictionary_route_content", { p_content_version: versionByDraft.get(row.id)!, p_actor: actor.id });
      if (review.error) throw new Error(`Could not review the lesson facts for ${row.payload.displayWord}.`);
    }
    const [current] = await loadLessonReadiness({ routeId: PREFIX_WORKBOOK_ROUTE, microSkillKey: skill });
    if (current?.status !== "ready_to_launch" || !current.compilerReady || !current.releaseId || !current.profileSourceHash
      || current.reviewedCandidateIds.length !== selectedVersions.size || current.reviewedCandidateIds.some(id => !selectedVersions.has(id)))
      throw new Error(current?.blockers.join(" ") || "The lesson checks changed. Refresh the preview to retry.");
    const approvals = await saveBulkSkillApprovals({ microSkillKey: skill,
      applyWordIds: ids, excludeWordIds: [], clearWordIds: [], deassignWordIds: [], senseIds,
      requestId: randomUUID(), workbookReadback: true, sourceKind: "teaching_dictionary_import" });
    if (!approvals.ok) throw new Error(approvals.blocked[0]?.reason ?? approvals.error ?? "Could not approve the selected meanings.");
    const launch = await db.rpc("launch_teaching_dictionary_lesson_v2", {
      p_route_id: PREFIX_WORKBOOK_ROUTE, p_micro_skill_key: skill, p_versions: current.reviewedCandidateIds,
      p_actor: actor.id, p_expected_profile: current.releaseId, p_expected_profile_hash: current.profileSourceHash,
      p_preflight_fingerprint: current.preflightFingerprint, p_compiler_witnesses: current.compilerWitnesses,
    });
    if (launch.error || !launch.data) throw new Error("Lesson publication did not complete. Recheck the preview and retry.");
    let verified = false;
    try {
      const { profiles } = await loadDynamicPrefixProfiles(db, "00000000-0000-4000-8000-000000000001",
        { microSkillKeys: [skill], allowStagingProfiles: ingReviewEnvironment() === "staging" });
      verified = profiles.some(profile => rows.every(row => profile.wordsByCanonicalId.get(row.wordId)?.effect
        === row.payload.routeContents[0]?.content.meaningBinKey));
    } catch { /* Roll back when runtime verification is unavailable. */ }
    if (!verified) {
      const rollback = await db.rpc("rollback_teaching_dictionary_launch_v2", { p_launch: launch.data, p_actor: actor.id,
        p_reason: "Bulk review release did not pass runtime word verification" });
      if (rollback.error) throw new Error("The release could not be verified or rolled back. Open lesson readiness.");
      throw new Error("The release did not pass runtime verification and was rolled back.");
    }
    published = rows.length;
  } catch (error) { message = error instanceof Error ? error.message : "Could not publish the lesson."; }
  refresh();
  redirect(message ? `${path}&error=${encodeURIComponent(message)}` : `${path}&published=${published}`);
}
