import assert from "node:assert/strict";
import { wordRouteStatus } from "../lib/teaching-dictionary-manager/word-route-status";
import type { LessonReadinessRow } from "../lib/teaching-dictionary-manager/lesson-preflight";

const skill = "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR";
const lesson = {
  routeId: "homophone_word_lab", routeVersion: "v2", microSkillKey: skill,
  released: true, activationEnabled: true,
  words: [{ id: "where", word: "where", role: "released lesson word", ready: true,
    blockers: [], editHref: "", contentPreview: {} }],
} as unknown as LessonReadinessRow;

const where = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set([skill]), lesson });
assert.equal(where.administrativeCandidate, true);
assert.equal(where.childEligibility, "not_evaluated");
assert.equal(where.technicalFacts, "complete");
assert.equal(where.contractVersion, "adle_route_content_contract_v1");

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

const completeDraftAwaitingReview = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set([skill]), lesson: { ...lesson, released: false,
    words: [{ ...lesson.words[0], role: "route content candidate", requiredForRelease: false,
      editorialApproved: false, reviewedDraftId: null, ready: false,
      validationBlockers: [], blockers: ["Editorial sign-off missing or stale"] }] } });
assert.equal(completeDraftAwaitingReview.contentPresent, true);
assert.equal(completeDraftAwaitingReview.technicalFacts, "complete");
assert.equal(completeDraftAwaitingReview.editorialApproved, false);
assert.equal(completeDraftAwaitingReview.administrativeCandidate, false);
assert(completeDraftAwaitingReview.blockerDetails.some(blocker => blocker.code === "CONTENT_REVIEW_PENDING"));
assert(!completeDraftAwaitingReview.blockerDetails.some(blocker => blocker.code === "ROUTE_CONTENT_MISSING"));

const memberReviewWithdrawn = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set([skill]), lesson: { ...lesson,
    words: [{ ...lesson.words[0], editorialApproved: false, ready: false,
      blockers: ["Member review pending"] }] } });
assert.equal(memberReviewWithdrawn.editorialApproved, false);
assert.equal(memberReviewWithdrawn.administrativeCandidate, false);

const staleContract = wordRouteStatus({ wordId: "where", dictionaryApproved: true,
  approvedSkillKeys: new Set([skill]), lesson: { ...lesson, routeVersion: "v1" } });
assert.equal(staleContract.contractVersion, null);
assert(staleContract.blockerDetails.some(blocker => blocker.code === "ROUTE_CONTRACT_UNAVAILABLE"));
console.log("word route status regression passed");
