import assert from "node:assert/strict";
import { wordRouteStatus } from "../lib/teaching-dictionary-manager/word-route-status";
import type { LessonReadinessRow } from "../lib/teaching-dictionary-manager/lesson-preflight";

const skill = "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR";
const lesson = {
  routeId: "homophone_word_lab", routeVersion: "v2", microSkillKey: skill,
  released: true, activationEnabled: true,
  words: [{ id: "where", word: "where", role: "released lesson word", ready: true,
    blockers: [], editHref: "", contentPreview: {} }],
} as LessonReadinessRow;

const where = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set([skill]), lesson });
assert.equal(where.administrativeCandidate, true);
assert.equal(where.childEligibility, "not_evaluated");

const everywhere = wordRouteStatus({ wordId: "everywhere", dictionaryApproved: true,
  approvedSkillKeys: new Set(), lesson });
assert.equal(everywhere.administrativeCandidate, false);
assert.equal(everywhere.contentPresent, false);
assert.equal(everywhere.relationshipApproved, false);
assert(everywhere.blockers.some(blocker => blocker.includes("not in the reviewed route content")));

const withdrawn = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set(), lesson });
assert.equal(withdrawn.administrativeCandidate, false);
assert.equal(withdrawn.contentPresent, true);

const deactivated = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set([skill]), lesson: { ...lesson, activationEnabled: false } });
assert.equal(deactivated.administrativeCandidate, false);
assert(deactivated.blockers.includes("ADLE route is not activated"));

const awaitingReview = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set([skill]), lesson: { ...lesson, released: false,
    words: [{ ...lesson.words[0], ready: false, blockers: ["Editorial sign-off missing or stale"] }] } });
assert.equal(awaitingReview.editorialApproved, false);
assert.equal(awaitingReview.administrativeCandidate, false);
console.log("word route status regression passed");
