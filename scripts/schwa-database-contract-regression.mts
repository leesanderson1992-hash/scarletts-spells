/** Rollback-only proof against the disposable, all-pattern staging pilot. */
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadReviewedMeaningBundles } from "../lib/teaching-dictionary-manager/multi-sense-export";
import { loadSchwaWorkbookQueue, publishSchwaWorkbookWord } from "../lib/teaching-dictionary-manager/schwa-bulk-review";
const connection = process.env.SUPABASE_STAGING_DB_URL;
assert(connection?.includes("qkpjbajicacbrphthibk"));
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");
const prepared = JSON.parse(fs.readFileSync(process.env.SCHWA_PREPARED_FIXTURE ?? "outputs/schwa-bulk-workflow-20261121/initial-o-prepared.json", "utf8"));
const actor = process.env.STAGING_ADMIN_USER_ID!;
assert.equal(prepared.header.parentUserId, actor);
const client = createServiceRoleClient();
const word = prepared.snapshot.payload.resolvedLesson.words.find((word: { spelling: string }) => word.spelling === "occurred");
assert(word.detective.family?.authorityId.startsWith("dictionary:"));
const [bundle] = await loadReviewedMeaningBundles(client, [word.canonicalWordId]);
const db = new pg.Client({ connectionString: connection }); await db.connect();
const check = () => db.query("select assert_adle_weak_vowel_assignment_v1($1,$2,$3,$4,$5)", [
  JSON.stringify(prepared.snapshot), JSON.stringify(prepared.header.lessonRouteMetadata), JSON.stringify(prepared.items),
  prepared.header.childId, actor,
]);
try {
  await db.query("begin"); await check();
  const family = word.detective.family;
  const validFamily = await db.query("select teaching_dictionary_schwa_family_current($1,$2,$3,$4) valid", [JSON.stringify(family), bundle.wordId, bundle.senseSet.senses[0].id, family.authorityId.slice(11)]);
  assert.equal(validFamily.rows[0].valid, true);
  const tampered = structuredClone(family); tampered.members[0].spelling = "wrong";
  const badFamily = await db.query("select teaching_dictionary_schwa_family_current($1,$2,$3,$4) valid", [JSON.stringify(tampered), bundle.wordId, bundle.senseSet.senses[0].id, family.authorityId.slice(11)]);
  assert.equal(badFamily.rows[0].valid, false);
  const before = await db.query("select teaching_dictionary_schwa_sense_fingerprint($1,$2) fingerprint", [bundle.wordId, bundle.senseSet.senses[0].id]);
  await db.query("savepoint canonical_change");
  const changed = structuredClone(bundle.senseSet); changed.senses[0].definition = "A deliberately different meaning in a rollback-only staging test.";
  await db.query("select import_reviewed_teaching_dictionary_word($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(), bundle.wordId, bundle.displayWord, bundle.sourceSenseReviewedAt, JSON.stringify(changed), JSON.stringify(bundle.analyses), actor, "Rollback-only Schwa stale-canonical-facts regression"]);
  const after = await db.query("select teaching_dictionary_schwa_sense_fingerprint($1,$2) fingerprint", [bundle.wordId, bundle.senseSet.senses[0].id]);
  assert.notEqual(before.rows[0].fingerprint, after.rows[0].fingerprint);
  await assert.rejects(check, /WEAK_VOWEL_WORD_PUBLICATION_CHANGED/);
  await db.query("rollback to savepoint canonical_change"); await check(); await db.query("rollback");
} finally { await db.end(); }
const row = (await loadSchwaWorkbookQueue(client, "D4_SCHWA_INITIAL_O_INITIAL", [bundle.wordId])).find(row => row.published)!;
assert(row);
const first = await publishSchwaWorkbookWord(client, actor, "D4_SCHWA_INITIAL_O_INITIAL", row.id);
const retry = await publishSchwaWorkbookWord(client, actor, "D4_SCHWA_INITIAL_O_INITIAL", row.id);
assert.deepEqual(retry, first);
console.log({ passed: true, canonicalChangesRejected: true, restoredFactsAccepted: true, familyTamperingRejected: true, publishRetryReusedVersion: true, fixtureMutationsRolledBack: true });
