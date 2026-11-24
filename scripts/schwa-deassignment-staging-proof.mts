/** Disposable staging regression: preserve facts; explicitly restore the fixture afterwards. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadSchwaBulkReview, loadSchwaWorkbookQueue, publishSchwaWorkbookWord, publishCheckedSchwaWorkbookWord } from "../lib/teaching-dictionary-manager/schwa-bulk-review";
import { saveBulkSkillApprovalsAsActor } from "../lib/teaching-dictionary-manager/bulk-approval-service";
import { loadSavedFamilyReviews } from "../lib/teaching-dictionary-manager/family-dependencies";
import { loadReviewedMeaningBundles } from "../lib/teaching-dictionary-manager/multi-sense-export";
import { loadWeakVowelSelectionPool } from "../lib/adle/weak-vowel/readiness-loader";
import { startSchwaPublishJob, processSchwaPublishBatch } from "../lib/teaching-dictionary-manager/schwa-publish-jobs";

assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://qkpjbajicacbrphthibk.supabase.co");
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");
const db = createServiceRoleClient(), actor = process.env.STAGING_ADMIN_USER_ID!;
const wordId = "b07d448a-0941-44e1-a1e0-be08b9864c14", skill = "D4_SCHWA_INITIAL_E_INITIAL";
const scope = { environment: "staging" as const, actor, skill };
const [stale] = await loadSchwaWorkbookQueue(db, skill, [wordId], false);
assert(stale?.published, "Use the existing disposable enough workbook fixture");
const before = await loadReviewedMeaningBundles(db, [wordId]);
const publications = async () => { const r = await db.from("adle_weak_vowel_content_publications").select("content_version_id").eq("canonical_word_id", wordId).eq("micro_skill_key", skill); assert.ifError(r.error); return r.data; };
const originalPublications = await publications();
const edit = (apply: boolean) => saveBulkSkillApprovalsAsActor({microSkillKey: skill, applyWordIds: apply ? [wordId] : [], excludeWordIds: [], clearWordIds: [], deassignWordIds: apply ? [] : [wordId], senseIds: apply ? {[wordId]: stale.payload.skillSenseIds![skill]} : {}, requestId: randomUUID(), workbookReadback: true, sourceKind: "teaching_dictionary_import"}, actor);
let removed = false;
try {
  const result = await edit(false); assert(result.ok, JSON.stringify(result)); removed = true;
  if (process.argv.includes("--baseline")) {
    const baselinePath = "../lib/teaching-dictionary-manager/.schwa-deassignment-baseline";
    const baseline = await import(baselinePath) as typeof import("../lib/teaching-dictionary-manager/schwa-bulk-review");
    const rows = await baseline.loadSchwaWorkbookQueue(db, skill, [wordId], false);
    assert(rows.some(row => row.wordId === wordId), "Baseline must reproduce the stale draft");
    console.log({reproduced: true, staleDraftSurvivesDeassignment: true});
  } else {
    assert.deepEqual(await loadSchwaWorkbookQueue(db, skill, [wordId], false), []);
    const review = await loadSchwaBulkReview(db, skill, true);
    assert(!review.rows.some(row => row.id === wordId)); assert(!review.queue.some(row => row.wordId === wordId));
    assert(!review.bundles.some(row => row.wordId === wordId)); assert(!review.current.some(row => row.canonicalWordId === wordId));
    assert(!(await loadSavedFamilyReviews(db, "staging", skill)).some(row => row.canonical_word_id === wordId));
    await assert.rejects(() => publishSchwaWorkbookWord(db, actor, skill, stale.id), /latest Schwa preview/u);
    await assert.rejects(() => publishCheckedSchwaWorkbookWord(db, actor, skill, stale), /de-assigned/u);
    const refused = await saveBulkSkillApprovalsAsActor({microSkillKey: skill, applyWordIds: [wordId], excludeWordIds: [], clearWordIds: [], deassignWordIds: [], senseIds: {[wordId]: stale.payload.skillSenseIds![skill]}, requestId: randomUUID(), workbookReadback: true, sourceKind: "teaching_dictionary_import", allowReassignment: false}, actor);
    assert(!refused.ok); assert.match(refused.error!, /de-assigned/u);
    const job = await startSchwaPublishJob(db, scope, randomUUID(), [stale.id]); assert(job);
    const processed = await processSchwaPublishBatch(db, scope, job.id); assert(processed);
    assert.equal(processed.status, "completed"); assert.equal(processed.items[0].status, "blocked");
    const pool = await loadWeakVowelSelectionPool({client: db, environmentKey: "staging"}, skill);
    assert(!pool.approvedIds.has(wordId)); assert(!pool.words.some(row => row.canonicalWordId === wordId));
    assert.deepEqual(await publications(), originalPublications);
    assert.deepEqual(await loadReviewedMeaningBundles(db, [wordId]), before);
    const report = {passed: true, deassignedHiddenFromReviewWorkbookPreviewAndFamilyStep: true, staleDirectAndCachedDraftRejected: true, implicitReassignmentRefused: true, stalePublishJobBlocked: true, excludedFromTargetsAndPractice: true, approvedFactsAndPublicationsPreserved: true};
    fs.mkdirSync("outputs/schwa-deassignment-20261124", {recursive: true}); fs.writeFileSync("outputs/schwa-deassignment-20261124/staging-proof.json", JSON.stringify(report, null, 2)); console.log(report);
  }
} finally {
  if (removed) { const restored = await edit(true); assert(restored.ok, JSON.stringify(restored)); }
}
const restoredPool = await loadWeakVowelSelectionPool({client: db, environmentKey: "staging"}, skill);
assert(restoredPool.approvedIds.has(wordId)); assert(restoredPool.words.some(row => row.canonicalWordId === wordId));
console.log({explicitReassignmentWorks: true, fixtureRestored: true});
