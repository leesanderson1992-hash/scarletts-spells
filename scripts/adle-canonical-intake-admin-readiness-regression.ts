import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { summarizeReadiness, intakeOutcome, distinctOccurrences, distinctUsersWaiting, groupIsArchived, groupMatchesView, matchesProjectedUnresolvedView } from "../app/(authenticated)/admin/adle-canonical-intake-readiness/readiness-groups";
import { projectReadiness, type ProjectionInput } from "../app/(authenticated)/admin/adle-canonical-intake-readiness/readiness-projection";

const ready = (): ProjectionInput => ({
  target: "unlocked", microSkillKey: "D4_MOR_PREFIXES_UN", routeId: "adle_word_level",
  candidates: [{ childId: "child-1", misspelling: "unlokced", target: "unlocked", microSkillKey: "D4_MOR_PREFIXES_UN" }],
  mappings: [{ misspelling: "unlokced", target: "unlocked", microSkillKey: "D4_MOR_PREFIXES_UN",
    status: "active", visibility: "visible", hasEnableEvent: true }],
  words: [{ id: "word-1", target: "unlocked", rowStatus: "active", reviewStatus: "approved_for_first_exposure",
    ageBand: "middle_primary", frequencyBand: "high" }],
  routeFacts: [{ childId: "child-1", enabled: true, readyPair: true, exactReady: null, blockerCodes: [], hasSelector: true }],
  teaching: { active: true, signedOff: true, childExplanation: "A child explanation", ruleExplanation: "A rule explanation" },
  skill: { active: true, assignable: true, domain: "D4" }, hasApprovedSupport: false,
  allowedAgeBands: ["middle_primary"], allowedFrequencyBands: ["high"],
});

const allReady = projectReadiness(ready());
assert.deepEqual(Object.values(allReady).map((facet) => facet.state), ["complete", "complete", "complete", "complete", "complete"]);

const missingMapping = ready();
missingMapping.mappings = [];
assert.equal(projectReadiness(missingMapping).resolver.state, "missing");

const missingDictionary = ready();
missingDictionary.words = [];
assert.equal(projectReadiness(missingDictionary).dictionary.state, "missing");
assert.equal(projectReadiness(missingDictionary).metadata.state, "unknown");

const missingMetadata = ready();
missingMetadata.words[0].ageBand = null;
assert.equal(projectReadiness(missingMetadata).metadata.state, "complete",
  "missing age band does not block an authentic child target");

const outOfBand = ready();
outOfBand.words[0].ageBand = "upper_primary";
assert.equal(projectReadiness(outOfBand).metadata.state, "complete",
  "V2 treats advanced child knowledge as optional evidence, not mandatory pool membership");

const incompleteContent = ready();
incompleteContent.teaching!.ruleExplanation = null;
assert.match(projectReadiness(incompleteContent).teaching.details.join(" "), /rule_explanation/);

const disabledRoute = ready();
disabledRoute.routeFacts[0].enabled = false;
assert.equal(projectReadiness(disabledRoute).lesson.state, "missing");
const unknownRoute = ready();
unknownRoute.routeFacts = [];
assert.equal(projectReadiness(unknownRoute).lesson.state, "unknown");

const staleStoredBlocker = ready();
assert.deepEqual(projectReadiness(staleStoredBlocker), allReady, "historical demand blockers must not affect live facets");

const specialist = ready();
specialist.routeId = "weak_vowel_word_lab";
specialist.routeFacts[0] = { ...specialist.routeFacts[0], contentReady: false, memberReady: true,
  exactReady: false, contentEvidence: ["required_route_content_unpublished"] };
assert.equal(projectReadiness(specialist).teaching.state, "missing",
  "generic signed-off teaching cannot certify an unpublished specialist word");
specialist.routeFacts[0] = { ...specialist.routeFacts[0], contentReady: true, memberReady: true,
  exactReady: true };
assert.equal(projectReadiness(specialist).teaching.state, "complete");
specialist.routeFacts.push({ ...specialist.routeFacts[0], childId: "child-2", contentReady: false, exactReady: false });
specialist.candidates.push({ ...specialist.candidates[0], childId: "child-2" });
assert.equal(projectReadiness(specialist).teaching.state, "missing", "mixed child readiness cannot appear universally complete");
specialist.routeFacts[1] = { ...specialist.routeFacts[1], contentReady: true, exactReady: false,
  routeActive: true, childEligible: false };
assert.match(projectReadiness(specialist).lesson.details.join(" "), /outside its activation scope/);
specialist.routeFacts[1] = { ...specialist.routeFacts[1], routeActive: false, childEligible: false };
assert.match(projectReadiness(specialist).lesson.details.join(" "), /release is missing, stale or disabled/);

const candidates = [
  { child_id: "child-1", source_candidate_mapping_id: "source-1" },
  { child_id: "child-1", source_candidate_mapping_id: "source-1" },
  { child_id: "child-1", source_candidate_mapping_id: "source-2" },
  { child_id: "child-2", source_candidate_mapping_id: "source-3" },
];
assert.equal(distinctOccurrences(candidates), 3);
assert.equal(distinctUsersWaiting(candidates), 2);
const demands = [
  { lifecycle_status: "activated", archived_at: null },
  { lifecycle_status: "pending", archived_at: "2026-10-02T12:00:00Z" },
  { lifecycle_status: "in_review", archived_at: "2026-10-02T12:00:00Z" },
];
assert.equal(groupIsArchived(demands), true, "a historical activated demand must not unarchive current work");
assert.equal(groupMatchesView({ demands, waiting: candidates, archived: true }, "current"), false);
assert.equal(groupMatchesView({ demands, waiting: candidates, archived: true }, "archived"), true);
const restored = demands.map((demand) => ({ ...demand, archived_at: null }));
assert.equal(groupIsArchived(restored), false);
assert.equal(groupMatchesView({ demands: restored, waiting: candidates, archived: false }, "current"), true);
assert.equal(groupMatchesView({ demands: [{ lifecycle_status: "activated", archived_at: null }], waiting: [], archived: false }, "resolved"), true);
assert.equal(groupMatchesView({ demands: restored, waiting: [], archived: false }, "other"), true);
assert.equal(matchesProjectedUnresolvedView({ waitingCandidates: 2, states: ["complete", "missing"] }, "current"), true);
assert.equal(matchesProjectedUnresolvedView({ waitingCandidates: 2, states: ["complete", "missing"] }, "other"), false);
assert.equal(matchesProjectedUnresolvedView({ waitingCandidates: 2, states: ["complete", "unknown"] }, "other"), false);
assert.equal(matchesProjectedUnresolvedView({ waitingCandidates: 0, states: ["missing"] }, "other"), true);

const migration = readFileSync("supabase/migrations/20261002120000_add_adle_intake_demand_archive.sql", "utf8");
assert.match(migration, /adle_inherit_canonical_intake_demand_archive/);
assert.match(migration, /before insert on public\.adle_canonical_intake_demands/);

console.log("adle-canonical-intake-admin-readiness-regression: ok");

const activatedDemand = [{ lifecycle_status: "activated", archived_at: null }];
const activatedCandidate = [{ candidate_state: "activated", activationConfirmed: true }];
assert.equal(intakeOutcome(activatedDemand, activatedCandidate).resolved, true);
assert.equal(intakeOutcome(activatedDemand, [{ candidate_state: "activated", activationConfirmed: false }]).resolved, false, "a stored activation without a matching learning item is not proof of resolution");
assert.equal(intakeOutcome([{ lifecycle_status: "pending", archived_at: null }], activatedCandidate).state, "inconsistent", "stale demand history must be reconciled");
const waitingIntake = intakeOutcome([{ lifecycle_status: "pending", archived_at: null }], [{ candidate_state: "pending_content", activationConfirmed: false }]);
assert.equal(waitingIntake.resolved, false, "live complete readiness does not activate a waiting intake");
assert.equal(groupMatchesView({demands: activatedDemand, waiting: [], archived: false, intakeResolved: false}, "resolved"), false);
assert.equal(groupMatchesView({demands: activatedDemand, waiting: [], archived: false, intakeResolved: false}, "other"), true);
assert.equal(intakeOutcome([{ lifecycle_status: "rejected", archived_at: null }], []).label, "Rejected");
assert.equal(intakeOutcome([{ lifecycle_status: "superseded", archived_at: null }], []).label, "Superseded");

assert.equal(matchesProjectedUnresolvedView({ waitingCandidates: 2, states: ["complete", "unknown"] }, "current"), true, "unknown requirements remain visible as blockers");

const historicalSummary = summarizeReadiness([{key:"resolved",word:"responsible",microSkillKey:"able_ible",occurrences:1,usersWaiting:0}], new Map([["resolved", [candidates[0]]]]), new Map());
assert.equal(historicalSummary.occurrencesTotal,1);
assert.equal(historicalSummary.usersWaiting,0);
assert.deepEqual(historicalSummary.topThree,[],"resolved words must not appear under Needs Attention or be described as in queue");
const mixedSummary = summarizeReadiness([{key:"mixed",word:"example",microSkillKey:"skill",occurrences:2,usersWaiting:1}],new Map([["mixed",[candidates[0],candidates[2]]]]),new Map([["mixed",[candidates[2]]]]));
assert.equal(mixedSummary.topThree[0].occurrences,1,"demand rankings count only occurrences still waiting");
