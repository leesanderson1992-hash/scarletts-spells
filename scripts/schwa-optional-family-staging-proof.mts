/** Bounded disposable staging proof; restores the original approved family link. */
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadReviewedMeaningBundles } from "../lib/teaching-dictionary-manager/multi-sense-export";
import { loadSchwaWorkbookQueue, stageSchwaWorkbookDraft, publishSchwaWorkbookWord, loadSchwaBulkReview } from "../lib/teaching-dictionary-manager/schwa-bulk-review";
import { loadWeakVowelSelectionPool } from "../lib/adle/weak-vowel/readiness-loader";
import { loadSchwaDictionaryFamily } from "../lib/adle/weak-vowel/canonical-family-loader";
import { generateSchwaTestLesson } from "../lib/teaching-dictionary-manager/schwa-test-lesson";
import { childAllowlistActivationReport } from "../lib/adle/route-activation-scope";

assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://qkpjbajicacbrphthibk.supabase.co");
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");
assert(process.env.SUPABASE_STAGING_DB_URL?.includes("qkpjbajicacbrphthibk"));
const dir = "outputs/schwa-optional-family-20261121";
fs.mkdirSync(dir, { recursive: true });
const db = createServiceRoleClient();
const sql = new pg.Client({ connectionString: process.env.SUPABASE_STAGING_DB_URL });
await sql.connect();
const actor = process.env.STAGING_ADMIN_USER_ID!;
const skill = "D4_SCHWA_INITIAL_O_INITIAL";
const key = "occur_verb_reviewed_occur_base_family";
const links = (await sql.query("select * from teaching_dictionary_current_sense_family_memberships where family_key=$1", [key])).rows;
assert.equal(links.length, 2, "Run only against the existing disposable two-word occur pilot");
const anchor = (await sql.query("select canonical_base_word_id id from teaching_dictionary_families_with_current_meaning where family_key=$1 order by revision desc limit 1", [key])).rows[0].id;
const member = links.find(link => link.canonical_word_id !== anchor)!;
assert(member);
const membership = async (action: "approve" | "withdraw") => {
  const result = await db.rpc("review_teaching_dictionary_sense_family_membership", {
    p_request_id: randomUUID(), p_word_id: member.canonical_word_id, p_sense_id: member.sense_id,
    p_sense_morphology_id: member.sense_morphology_id, p_family_key: key,
    p_component_part_id: member.component_part_id, p_relationship_kind: member.relationship_kind,
    p_action: action, p_actor: actor, p_source_reference: "Disposable staging optional-family growth proof",
  });
  assert.ifError(result.error);
};
const childIds: string[] = [];
for (const state of ["Waiting", "Ready"]) {
  const child = await db.from("children").insert({ parent_user_id: actor,
    first_name: `Schwa Family ${state} ${randomUUID().slice(0, 6)}`, notes: "Disposable optional family staging proof" }).select("id").single();
  assert.ifError(child.error); childIds.push(child.data!.id);
}
const head = (await sql.query(`select h.current_revision_id,r.readiness_report,r.release_manifest_sha256
 from adle_route_activation_heads h join adle_route_activation_revisions r on r.id=h.current_revision_id
 where h.environment_key='staging' and h.route_id='weak_vowel_word_lab' and h.micro_skill_key=$1`, [skill])).rows[0];
assert(head);
await sql.query("select set_adle_route_activation_revision_v2($1,$2,'staging','enabled','allow_existing',$3,$4,$5,$6)", [
  head.release_manifest_sha256, skill, JSON.stringify(childAllowlistActivationReport([...new Set([...(head.readiness_report.scope?.childIds ?? []), ...childIds])])),
  head.current_revision_id, "schwa-optional-family-proof", "Owner-authorised disposable staging optional family test",
]);
let withdrawn = false;
try {
  await membership("withdraw"); withdrawn = true;
  const [bundle] = await loadReviewedMeaningBundles(db, [anchor]);
  const old = (await loadSchwaWorkbookQueue(db, skill, [anchor]))[0];
  assert(old);
  const fields = { ...old.fields, family_exploration: "Use approved family",
    activity_syllables: old.fields.activity_syllables.includes("·") ? old.fields.activity_syllables.replaceAll("·", "-") : old.fields.activity_syllables.replaceAll("-", "·") };
  await stageSchwaWorkbookDraft(db, actor, bundle, skill, old.payload.skillSenseIds![skill], fields);
  let row = (await loadSchwaWorkbookQueue(db, skill, [anchor]))[0];
  assert.equal(row.familyState, "waiting"); assert.deepEqual(row.blockers, []);
  const publication = await publishSchwaWorkbookWord(db, actor, skill, row.id);
  const retry = await publishSchwaWorkbookWord(db, actor, skill, row.id);
  assert.deepEqual(retry, publication);
  row = (await loadSchwaWorkbookQueue(db, skill, [anchor]))[0];
  assert(row.published); assert.equal(row.familyState, "waiting");
  const pool = await loadWeakVowelSelectionPool({ client: db, environmentKey: "staging" }, skill);
  assert(pool.words.some(word => word.canonicalWordId === anchor));
  assert(pool.words.some(word => word.canonicalWordId === member.canonical_word_id));
  const review = await loadSchwaBulkReview(db, skill);
  assert(!review.rows.some(word => word.id === anchor), "Waiting enrichment must not return an Active core word to remediation");
  const waiting = await generateSchwaTestLesson(db, actor, childIds[0], skill, anchor);
  const waitingWord = waiting.snapshot.payload.resolvedLesson.words.find(word => word.canonicalWordId === anchor)!;
  assert.equal(waitingWord.detective.family, null);
  await membership("approve"); withdrawn = false;
  const grown = (await loadSchwaWorkbookQueue(db, skill, [anchor]))[0];
  assert.equal(grown.id, row.id); assert(grown.published); assert.equal(grown.familyState, "ready");
  assert.deepEqual(grown.blockers, []);
  const ready = await generateSchwaTestLesson(db, actor, childIds[1], skill, anchor);
  const readyWord = ready.snapshot.payload.resolvedLesson.words.find(word => word.canonicalWordId === anchor)!;
  assert(readyWord.detective.family?.members.some(word => word.canonicalWordId === member.canonical_word_id));
  assert.equal(waitingWord.dinner.contentVersion, readyWord.dinner.contentVersion, "No re-publication required");
  const saved = await db.from("daily_assignments").select("compiled_lesson_snapshot").eq("id", waiting.assignmentId).single();
  assert.ifError(saved.error);
  assert.equal(saved.data!.compiled_lesson_snapshot.payload.resolvedLesson.words.find((word: {canonicalWordId: string}) => word.canonicalWordId === anchor).detective.family, null);
  const family = await loadSchwaDictionaryFamily(db, anchor, old.payload.skillSenseIds![skill], key);
  assert(family);
  const check = async (value: unknown) => (await sql.query("select teaching_dictionary_schwa_optional_family_current($1,$2,$3,$4) ok", [JSON.stringify(value), anchor, old.payload.skillSenseIds![skill], key])).rows[0].ok;
  assert.equal(await check(family), true);
  assert.equal(await check(null), false, "Ready family cannot be omitted at persistence");
  const tampered = structuredClone(family); tampered.members[0].spelling = "forged";
  assert.equal(await check(tampered), false);
  const result = { passed: true, corePublishedWhileWaiting: true, retryReusedPublication: true,
    activeExportMatchesCore: true, familyBecameReadyWithoutRepublish: true,
    newLessonUsesGrownFamily: true, savedLessonUnchanged: true, familyTamperRejected: true,
    waiting: { assignmentId: waiting.assignmentId, childId: childIds[0] },
    ready: { assignmentId: ready.assignmentId, childId: childIds[1] }, productionChanges: 0 };
  fs.writeFileSync(`${dir}/staging-proof.json`, JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  if (withdrawn) await membership("approve");
  await sql.end();
}
