import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";
import type {
  CanonicalWordIdentityFact,
  MicroSkillIdentityFact,
  RawWordSkillRelationshipFact,
} from "../lib/adle/word-skill-relationships/contracts";
import { readLearnerEvidenceProjection } from "../lib/adle/proficiency/evidence/classifier";
import {
  adaptAssignmentAttempt,
  adaptAuthenticUse,
  adaptPromptedReviewAuthenticRepresentation,
  adaptReviewOutcomeRepresentation,
  adaptReviewRepairRepresentation,
  type GovernedCausalMapping,
  type LinkedAttemptTruth,
} from "../lib/adle/proficiency/evidence/adapters";
import type { RawLearnerEvidenceCandidate } from "../lib/adle/proficiency/evidence/contracts";

const WORDS = {
  hopeful: "word-hopeful",
  fearful: "word-fearful",
  specialist: "word-specialist",
  resolver: "word-resolver",
} as const;
const SKILLS = {
  splitE: "skill-split-e",
  suffixFul: "skill-suffix-ful",
  preserveBase: "skill-preserve-base",
  specialist: "skill-specialist",
  resolver: "skill-resolver",
  blocked: "skill-blocked",
} as const;
const LEARNER = "learner-1";

const words: CanonicalWordIdentityFact[] = Object.values(WORDS).map((canonicalWordId) => ({
  canonicalWordId,
  normalisedWord: canonicalWordId.replace("word-", ""),
  state: "active",
  identityStable: true,
}));
const skills: MicroSkillIdentityFact[] = Object.values(SKILLS).filter((key) => key !== SKILLS.blocked).map((microSkillKey) => ({
  microSkillKey,
  state: "active",
  identityStable: true,
}));

function relationshipFact(input: {
  word: string; skill: string; source?: RawWordSkillRelationshipFact["sourceAuthority"];
  provenance: string; approved?: boolean;
}): RawWordSkillRelationshipFact {
  return {
    sourceAuthority: input.source ?? "explicit_reviewed_association",
    provenanceId: input.provenance,
    sourceAuthorityVersion: "fixture-v1",
    canonicalWordId: input.word,
    microSkillKey: input.skill,
    relationshipRole: "demonstrates",
    sourceState: "active",
    exactPairApproval: input.approved === false ? "unapproved" : "approved",
    reviewState: "approved",
    releaseState: "released",
    provenanceMetadata: {},
  };
}

const relationshipAuthority = readCanonicalWordSkillRelationships({
  words,
  microSkills: skills,
  facts: [
    relationshipFact({ word: WORDS.hopeful, skill: SKILLS.splitE, provenance: "hopeful-split" }),
    relationshipFact({ word: WORDS.hopeful, skill: SKILLS.suffixFul, provenance: "hopeful-ful" }),
    relationshipFact({ word: WORDS.hopeful, skill: SKILLS.preserveBase, provenance: "hopeful-base" }),
    relationshipFact({ word: WORDS.fearful, skill: SKILLS.suffixFul, provenance: "fearful-ful" }),
    relationshipFact({ word: WORDS.specialist, skill: SKILLS.specialist, source: "released_specialist_membership", provenance: "specialist-only" }),
    relationshipFact({ word: WORDS.resolver, skill: SKILLS.resolver, source: "approved_resolver_mapping", provenance: "resolver-only" }),
    relationshipFact({ word: WORDS.hopeful, skill: SKILLS.blocked, provenance: "blocked", approved: true }),
    relationshipFact({ word: WORDS.hopeful, skill: SKILLS.resolver, provenance: "unreviewed", approved: false }),
  ],
});
assert.equal(relationshipAuthority.relationships.length, 6, "blocked and unapproved relationships are absent");

const causalMappings: GovernedCausalMapping[] = [
  { mappingId: "map-hopefull", canonicalWordId: WORDS.hopeful, misspellingNormalised: "hopefull", microSkillKey: SKILLS.suffixFul, authorityVersion: "resolver-v1" },
  { mappingId: "map-hopful", canonicalWordId: WORDS.hopeful, misspellingNormalised: "hopful", microSkillKey: SKILLS.preserveBase, authorityVersion: "resolver-v1" },
  { mappingId: "map-fearfull", canonicalWordId: WORDS.fearful, misspellingNormalised: "fearfull", microSkillKey: SKILLS.suffixFul, authorityVersion: "resolver-v1" },
];

function assignment(input: {
  id: string; word?: string; attempt: string; correct: boolean; at: string;
  section?: string; kind?: string; evidenceClass?: string; sourceRef?: string;
}) {
  return adaptAssignmentAttempt({
    id: input.id,
    childId: LEARNER,
    canonicalWordId: input.word ?? WORDS.hopeful,
    createdAt: input.at,
    attemptText: input.attempt,
    isCorrect: input.correct,
    attemptKind: input.kind ?? "lesson_production",
    evidenceClass: input.evidenceClass ?? "first_exposure_lesson_attempt",
    sectionKey: input.section ?? "cover_write",
    templateKey: null,
    sourceRef: input.sourceRef ?? `lesson:${input.id}`,
  }, causalMappings);
}

function run(candidates: RawLearnerEvidenceCandidate[]) {
  return readLearnerEvidenceProjection({ candidates, relationshipAuthority });
}

// Positive multi-skill: one source performance, three positive references.
const hopefulCorrect = assignment({ id: "hopeful-correct", attempt: "hopeful", correct: true, at: "2026-08-01T09:00:00.000Z" });
let result = run([hopefulCorrect]);
assert.equal(result.events.length, 1);
assert.equal(result.projections.filter((row) => row.polarity === "positive").length, 3);
assert.equal(new Set(result.projections.map((row) => row.eventId)).size, 1, "multi-skill projection retains one source event ID");
assert(!result.projections.some((row) => row.microSkillKey === SKILLS.blocked || row.microSkillKey === SKILLS.resolver), "blocked/unapproved Phase B relationships never project");

// Negative asymmetry.
result = run([assignment({ id: "hopefull", attempt: "hopefull", correct: false, at: "2026-08-02T09:00:00.000Z" })]);
assert.deepEqual(result.projections.map((row) => row.microSkillKey), [SKILLS.suffixFul]);
result = run([assignment({ id: "hopful", attempt: "hopful", correct: false, at: "2026-08-03T09:00:00.000Z" })]);
assert.deepEqual(result.projections.map((row) => row.microSkillKey), [SKILLS.preserveBase]);

// Controlled dual outcome remains two events.
result = run([
  assignment({ id: "fearful-cover", word: WORDS.fearful, attempt: "fearful", correct: true, at: "2026-08-04T09:00:00.000Z" }),
  assignment({ id: "fearful-dictation", word: WORDS.fearful, attempt: "fearfull", correct: false, at: "2026-08-04T09:05:00.000Z", kind: "lesson_dictation", section: "sentence_dictation" }),
]);
assert.equal(result.events.length, 2);
assert.equal(result.projections.filter((row) => row.polarity === "positive").length, 1);
assert.equal(result.projections.filter((row) => row.polarity === "negative").length, 1);

// Both controlled wrong plus correct repair: repair stays metadata only.
const wrongCover = assignment({ id: "both-wrong-cover", word: WORDS.fearful, attempt: "fearfull", correct: false, at: "2026-08-05T09:00:00.000Z" });
const wrongDictation = assignment({ id: "both-wrong-dictation", word: WORDS.fearful, attempt: "fearfull", correct: false, at: "2026-08-05T09:05:00.000Z", kind: "lesson_dictation", section: "sentence_dictation" });
const repair = assignment({ id: "repair-correct", word: WORDS.fearful, attempt: "fearful", correct: true, at: "2026-08-05T09:10:00.000Z", kind: "repair_retry", evidenceClass: "immediate_repair_attempt", section: "review_word_repair" });
result = run([wrongCover, wrongDictation, repair]);
assert.equal(result.events.length, 3);
assert.equal(result.events.find((event) => event.sourceEntityId === "repair-correct")?.environment, "REPAIR");
assert.equal(result.projections.filter((row) => row.polarity === "positive").length, 0, "repair creates no positive projection");
assert.equal(result.projections.filter((row) => row.polarity === "negative").length, 2);

// Contextual original writing, direct fallback, and historical authentic naming collision.
const contextual = assignment({ id: "review-contextual", attempt: "hopeful", correct: true, at: "2026-08-06T09:00:00.000Z", kind: "review_production", evidenceClass: "scheduled_review_attempt", section: "review_writing_challenge", sourceRef: "review-r3:session:writing:encounter" });
const contextualLinked: LinkedAttemptTruth = {
  attemptEventId: "review-contextual", learnerId: LEARNER, canonicalWordId: WORDS.hopeful,
  occurredAt: contextual.occurredAt, outcome: "correct", environment: "CONTEXTUAL_TRANSFER",
  independence: "independent", causalMicroSkillKeys: [],
};
const contextualDuplicate = adaptPromptedReviewAuthenticRepresentation({ id: "named-authentic", linkedAttempt: contextualLinked });
const contextualOutcome = adaptReviewOutcomeRepresentation({ id: "review-outcome", linkedAttempt: contextualLinked });
const directFallback = assignment({ id: "review-direct", attempt: "hopeful", correct: true, at: "2026-08-06T09:10:00.000Z", kind: "review_production", evidenceClass: "scheduled_review_attempt", section: "review_audio_check", sourceRef: "review-r3:session:audio:encounter2" });
result = run([contextual, contextualDuplicate, contextualOutcome, directFallback]);
assert.equal(result.events.length, 2);
assert.equal(result.events.find((event) => event.sourceEntityId === "review-contextual")?.environment, "CONTEXTUAL_TRANSFER");
assert.equal(result.events.find((event) => event.sourceEntityId === "review-direct")?.environment, "ISOLATED_RETRIEVAL");
assert.equal(result.reconciliation.duplicateRepresentationsCollapsedCount, 2);
assert.equal(result.reconciliation.promptedReviewNamedAuthenticButContextualCount, 1);

// Genuine authentic, suspected authentic, and verification transition.
const authenticBase = {
  id: "authentic-event", childId: LEARNER, canonicalWordId: WORDS.hopeful,
  occurredOn: "2026-08-07", verifiedAt: "2026-08-09T12:00:00.000Z",
  useKind: "authentic_correct_use", pieceRef: "ws:piece-1", sourceRef: "ws:piece-1",
  rowStatus: "active", provenanceKind: "independent_or_parent_verified_application",
  reviewEncounterId: null, linkedReviewAttempt: null,
};
const suspected = adaptAuthenticUse({ ...authenticBase, parentVerified: false, verifiedAt: null });
const verified = adaptAuthenticUse({ ...authenticBase, parentVerified: true });
const suspectedResult = run([suspected]);
const verifiedResult = run([verified]);
assert.equal(suspectedResult.events[0].environment, "AUTHENTIC_WRITING");
assert.equal(suspectedResult.projections.length, 0, "suspected authentic evidence is ineligible pending verification");
assert.equal(verifiedResult.projections.length, 3);
assert.equal(suspectedResult.events[0].eventId, verifiedResult.events[0].eventId, "verification does not create a new performance identity");
assert.equal(verifiedResult.events[0].occurredAt, "2026-08-07", "verification keeps original occurrence date");

// Original failure and successful repair remain separate and the repair representation collapses to its attempt.
const originalFailure = assignment({ id: "review-failure", attempt: "hopefull", correct: false, at: "2026-08-08T09:00:00.000Z", kind: "review_production", evidenceClass: "scheduled_review_attempt", section: "review_writing_challenge", sourceRef: "review-r3:s:writing:e" });
const repairAttempt = assignment({ id: "review-repair-attempt", attempt: "hopeful", correct: true, at: "2026-08-08T09:02:00.000Z", kind: "repair_retry", evidenceClass: "immediate_repair_attempt", section: "review_word_repair" });
const repairLinked: LinkedAttemptTruth = {
  attemptEventId: "review-repair-attempt", learnerId: LEARNER, canonicalWordId: WORDS.hopeful,
  occurredAt: repairAttempt.occurredAt, outcome: "correct", environment: "REPAIR",
  independence: "answer_visible", causalMicroSkillKeys: [],
};
result = run([originalFailure, repairAttempt, adaptReviewRepairRepresentation({ id: "repair-detail", linkedAttempt: repairLinked })]);
assert.equal(result.events.length, 2);
assert.equal(result.projections.filter((row) => row.polarity === "negative").length, 1);
assert.equal(result.projections.filter((row) => row.polarity === "positive").length, 0);

// Same source through stores collapses; same word/date through genuine different activities does not.
result = run([contextual, contextualOutcome]);
assert.equal(result.events.length, 1);
assert.equal(result.decisions.filter((row) => row.reason === "DUPLICATE_REPRESENTATION_COLLAPSED").length, 1);
result = run([
  assignment({ id: "same-day-a", attempt: "hopeful", correct: true, at: "2026-08-10T09:00:00.000Z" }),
  assignment({ id: "same-day-b", attempt: "hopeful", correct: true, at: "2026-08-10T09:05:00.000Z", kind: "lesson_dictation", section: "sentence_dictation" }),
]);
assert.equal(result.events.length, 2, "same learner/word/day never dedupes without exact lineage");

// Unresolved possible duplicate lineage fails closed.
const unresolvedA = { ...hopefulCorrect, candidateId: "unresolved-a", sourceEntityId: "unresolved-a", performanceLineageKey: "lineage-a", possibleDuplicateLineageKey: "possible-shared" };
const unresolvedB = { ...hopefulCorrect, candidateId: "unresolved-b", sourceKind: "learning_item_evidence" as const, sourceEntityId: "unresolved-b", performanceLineageKey: "lineage-b", possibleDuplicateLineageKey: "possible-shared", representationRole: "compatibility_evidence" as const };
result = run([unresolvedA, unresolvedB]);
assert.equal(result.events.length, 0);
assert.equal(result.reconciliation.ambiguousCount, 2);

// Specialist-only and resolver-only Phase B relationships remain visible.
result = run([
  assignment({ id: "specialist-event", word: WORDS.specialist, attempt: "specialist", correct: true, at: "2026-08-11T09:00:00.000Z" }),
  assignment({ id: "resolver-event", word: WORDS.resolver, attempt: "resolver", correct: true, at: "2026-08-11T09:05:00.000Z" }),
]);
assert.equal(result.reconciliation.specialistOnlyProjectionCount, 1);
assert.equal(result.reconciliation.resolverOnlyProjectionCount, 1);

// Determinism and static safety boundaries.
const deterministicCandidates = [hopefulCorrect, contextual, contextualDuplicate, contextualOutcome, directFallback, verified];
const first = run(deterministicCandidates);
const second = run([...deterministicCandidates].reverse());
assert.deepEqual(first, second, "input order must not change events, projections, decisions, or fingerprints");
assert.equal(JSON.stringify(first), JSON.stringify(run(deterministicCandidates)), "identical reads are byte-identical");

const repositorySource = readFileSync(new URL("../lib/adle/proficiency/evidence/repository.ts", import.meta.url), "utf8");
assert.match(repositorySource, /^import "server-only";/, "live repository remains server-only");
assert.doesNotMatch(repositorySource, /\.(?:insert|update|upsert|delete|rpc)\s*\(/, "live repository remains SELECT-only");
for (const forbidden of ["micro-skill-proficiency", "review-scheduler", "composer", "word-treasure"] as const) {
  assert(!repositorySource.includes(forbidden), `Phase C repository must not import ${forbidden} runtime behaviour`);
}

console.log("ADLE Phase C learner-evidence regression passed.");
