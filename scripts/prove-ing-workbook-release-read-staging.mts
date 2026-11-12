/** Read-only parity proof for the release status returned by workbook approval. */
import assert from "node:assert/strict";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { canUpdateStagingIngLesson, loadStagingIngUpdate, loadStagingIngWordReleaseStatuses } from
  "../lib/teaching-dictionary-manager/ing-staging-release";

assert(canUpdateStagingIngLesson(), "Run against the pinned staging database.");
const db = createServiceRoleClient();
const skill = "D4_INF_ING_ENDINGS_DROP_E";
const started = performance.now();
const update = await loadStagingIngUpdate(db, skill);
const fullMs = Math.round(performance.now() - started);
const current = update.current[0];
const review = update.reviewWords[0];
assert(current && review, "The staging pool needs both a released word and a word awaiting review.");
const change = update.changes[0];
const ids = [current.canonicalWordId, review.wordId, ...(change ? [change.canonicalWordId] : [])];
const scopedStarted = performance.now();
const status = await loadStagingIngWordReleaseStatuses(db, skill, ids);
const scopedMs = Math.round(performance.now() - scopedStarted);
assert.equal(status.get(current.canonicalWordId), "In active lesson pool");
assert(!status.has(review.wordId), "An unapproved word must not appear as publishable.");
if (change) assert.equal(status.get(change.canonicalWordId), "Ready to publish");
assert.equal(status.size, change ? 2 : 1);
console.log(JSON.stringify({ fullMs, scopedMs, checkedReadyToPublish: Boolean(change) }));
