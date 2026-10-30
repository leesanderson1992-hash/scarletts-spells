import assert from "node:assert/strict";
import { calculateProficiencyV2, isV2ScoredEvent, type V2Evidence, type V2SkillInput } from "../lib/adle/proficiency/v2";
import { deriveV2WordGroups } from "../lib/adle/proficiency/v2-groups";
import { isAdleCoverCheckSource } from "../lib/adle/proficiency/v2-source-policy";

const asOf = "2026-10-23";
const base = (override: Partial<V2SkillInput> = {}): V2SkillInput => ({
  learnerId: "learner-a", skillKey: "D4_PAT_TEST", familyKey: "D4_PAT", asOf,
  requiredGroupKeys: ["a", "b", "c", "d", "e", "f"], evidence: [],
  unscoredCount: 0, unresolvedGroupCount: 0, relationshipFingerprint: "relations-v1",
  evidenceFingerprint: "events-v1", groupFingerprint: "groups-v1", ...override,
});
const evidence = (id: string, groupKey: string, occurredOn: string,
  polarity: V2Evidence["polarity"] = "positive", environment: V2Evidence["environment"] = "ISOLATED_RETRIEVAL",
  challengeKey: string | null = null): V2Evidence => ({
  eventId: id, wordId: groupKey, groupKey, occurredOn, polarity, environment, challengeKey, sourceKind: "assessment",
});

assert.equal(calculateProficiencyV2(base()).status, "ready_to_discover");
const coverIds = new Set(["covered-word"]);
assert.equal(isAdleCoverCheckSource([{ sourceKind: "adle_assignment_attempt_event",
  sourceEntityId: "covered-word" }], coverIds), true);
assert.equal(isAdleCoverCheckSource([{ sourceKind: "adle_assignment_attempt_event",
  sourceEntityId: "dictated-target" }], coverIds), false);
assert.equal(calculateProficiencyV2(base({ evidence: [evidence("1", "a", "2026-10-01", "positive", "CONTROLLED_LESSON")] })).level, 1);
const sameDay = [evidence("1", "a", "2026-10-01"), evidence("2", "a", "2026-10-01"), evidence("3", "b", "2026-10-01")];
assert.equal(calculateProficiencyV2(base({ evidence: sameDay })).level, 1, "same-day repetitions do not satisfy retention");
const causalMiss = [...sameDay, evidence("4", "a", "2026-10-01", "negative")];
assert.equal(calculateProficiencyV2(base({ evidence: causalMiss })).observed.groups, 2,
  "a misspelt word is unscored even when its cause is known");
assert.equal(isV2ScoredEvent(evidence("miss", "a", "2026-10-01", "negative"), "D4_HOM"), false,
  "a misspelt homophone is not a contextual-choice setback");
assert.equal(isV2ScoredEvent({ ...evidence("choice", "role:where", "2026-10-01", "negative"),
  sourceKind: "homophone_lesson_dictation" }, "D4_HOM"), true,
  "a correctly spelled alternative in the wrong context remains a choice setback");
const twoDates = [evidence("1", "a", "2026-10-01"), evidence("2", "b", "2026-10-01"),
  evidence("3", "a", "2026-10-05"), evidence("4", "b", "2026-10-05")];
assert.equal(calculateProficiencyV2(base({ evidence: twoDates })).level, 2);
const transfer = [...twoDates, evidence("5", "c", "2026-10-12", "positive", "CONTEXTUAL_TRANSFER", "new-context") ,
  evidence("6", "d", "2026-10-12")];
assert.equal(calculateProficiencyV2(base({ evidence: transfer })).level, 3);
assert.equal(calculateProficiencyV2(base({ evidence: transfer.map((entry) => ({ ...entry, challengeKey: null })) })).level, 2,
  "Level 3 requires relevant transfer");
assert.equal(calculateProficiencyV2(base({ learnerId: "learner-b", evidence: transfer })).versions.inputFingerprint ===
  calculateProficiencyV2(base({ evidence: transfer })).versions.inputFingerprint, false,
  "fingerprints are learner-scoped");
assert.equal(calculateProficiencyV2(base({ requiredGroupKeys: [] })).status, "unresolved");
assert.equal(calculateProficiencyV2(base({ evidence: transfer, unscoredCount: 2 })).confidence, "limited");
const advancedOptional = calculateProficiencyV2(base({ requiredGroupKeys: ["a"], evidence: [
  evidence("required", "a", "2026-10-01"), evidence("advanced", "advanced", "2026-10-02"),
] }));
assert.equal(advancedOptional.levels[1].gates[1].required, 1,
  "advanced knowledge does not enlarge the learner's mandatory V2 group pool");
assert.equal(advancedOptional.levels[1].gates[1].observed, 2,
  "a governed advanced word can add optional V2 breadth evidence");
assert.throws(() => calculateProficiencyV2(base({ asOf: "2026-99-99" })), /invalid_calculation_date/);
const longHistory = [
  ...["a", "b", "c"].map((group, index) => evidence(`old-${index}`, group, "2026-07-01", "positive", "CONTEXTUAL_TRANSFER", `task-${index}`)),
  ...["d", "e", "f"].map((group, index) => evidence(`mid-${index}`, group, "2026-08-01", "positive", "CONTEXTUAL_TRANSFER", `task-${index + 3}`)),
  ...["a", "b", "c"].map((group, index) => evidence(`later-${index}`, group, "2026-09-01", "positive", "CONTEXTUAL_TRANSFER", `task-${index + 6}`)),
  ...["d", "e", "f"].map((group, index) => evidence(`now-${index}`, group, "2026-10-20", "positive", "CONTEXTUAL_TRANSFER", `task-${index + 9}`)),
];
assert.equal(calculateProficiencyV2(base({ evidence: longHistory })).level, 5);
assert.equal(calculateProficiencyV2(base({ evidence: longHistory.map((event) => ({ ...event, challengeKey: event.occurredOn === "2026-10-20" ? event.challengeKey : null })) })).level, 4,
  "upper levels need varied transfer on different dates");
const closed = ["2026-07-01", "2026-07-15", "2026-08-01", "2026-08-20", "2026-09-15", "2026-10-20"]
  .flatMap((date, index) => ["role:peace", "role:piece"].map((role, offset) =>
    evidence(`closed-${index}-${offset}`, role, date, "positive", "CONTEXTUAL_TRANSFER", `context-${index}-${offset}`)));
assert.equal(calculateProficiencyV2(base({ familyKey: "D4_HOM", requiredGroupKeys: ["role:piece", "role:peace"], evidence: closed })).level, 5,
  "two-word meaning sets can reach Level 5 through varied contexts and retention");

const groups = deriveV2WordGroups({
  words: [{ id: "play", normalisedWord: "play" }, { id: "played", normalisedWord: "played" },
    { id: "jump", normalisedWord: "jump" }],
  members: [{ canonical_word_id: "play", base_word_family_id: "play-family", row_status: "active", review_status: "approved_for_first_exposure" },
    { canonical_word_id: "played", base_word_family_id: "play-family", row_status: "active", review_status: "approved_for_first_exposure" }],
  morphology: [],
});
assert.equal(groups.byWordId.get("play")?.key, groups.byWordId.get("played")?.key,
  "released derivatives share one breadth group");
assert.notEqual(groups.byWordId.get("jump")?.key, groups.byWordId.get("play")?.key);
const canonicalGroups = deriveV2WordGroups({
  words: [{ id: "play", normalisedWord: "play" }, { id: "played", normalisedWord: "played" },
    { id: "football", normalisedWord: "football" }, { id: "footballer", normalisedWord: "footballer" },
    { id: "draft", normalisedWord: "draft" }],
  canonicalFamilies: [
    { id: "play-family", decision_status: "owner_reviewed" },
    { id: "foot-family", decision_status: "owner_reviewed", canonical_base_word_id: "foot" },
    { id: "ball-family", decision_status: "owner_reviewed", canonical_base_word_id: "ball" },
    { id: "draft-family", decision_status: "owner_decision_interpreted" },
  ],
  canonicalMembers: [
    { canonical_word_id: "play", canonical_family_id: "play-family", source_family_keys: ["play_old", "play_current"] },
    { canonical_word_id: "played", canonical_family_id: "play-family", source_family_keys: ["play_old", "play_current"] },
    { canonical_word_id: "football", canonical_family_id: "foot-family", source_family_keys: ["foot_current"] },
    { canonical_word_id: "football", canonical_family_id: "ball-family", source_family_keys: ["ball_current"] },
    { canonical_word_id: "draft", canonical_family_id: "draft-family", source_family_keys: ["draft_current"] },
  ],
  legacyFamilies: [
    { base_family_key: "play_old", micro_skill_key: "BASE", row_status: "superseded", review_status: "superseded" },
    { base_family_key: "play_current", micro_skill_key: "BASE", row_status: "active", review_status: "approved_for_first_exposure" },
    { base_family_key: "foot_current", micro_skill_key: "FOOT", row_status: "active", review_status: "approved_for_first_exposure" },
    { base_family_key: "ball_current", micro_skill_key: "BALL", row_status: "active", review_status: "approved_for_first_exposure" },
    { base_family_key: "draft_current", micro_skill_key: "BASE", row_status: "active", review_status: "approved_for_first_exposure" },
  ],
  compoundFacts: [{ canonical_word_id: "football", micro_skill_key: "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
    first_word: "foot", second_word: "ball", assignment_eligible: true,
    row_status: "active", review_status: "approved_for_first_exposure" },
  { canonical_word_id: "footballer", micro_skill_key: "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
    first_word: "foot", second_word: "ball", assignment_eligible: true,
    row_status: "active", review_status: "approved_for_first_exposure" }],
  morphology: [],
});
assert.equal(canonicalGroups.forSkill("play", "BASE")?.key, canonicalGroups.forSkill("played", "BASE")?.key,
  "superseded aliases do not make one reviewed root ambiguous");
assert.equal(canonicalGroups.forSkill("football", "FOOT")?.key, "family:foot-family",
  "a compound can use its reviewed skill-specific root");
assert.equal(canonicalGroups.forSkill("football", "BALL")?.key, "family:ball-family");
assert.equal(canonicalGroups.forSkill("football", "SOUND", new Set(["foot"]))?.key, "family:foot-family",
  "a reviewed base that shares the assessed skill selects the relevant compound root");
assert.equal(canonicalGroups.forSkill("football", "BASE")?.key, "word:football",
  "a compound can still provide one exact-word group for an unrelated skill");
assert.equal(canonicalGroups.forSkill("football", "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS")?.key,
  "compound:foot|ball", "a reviewed compound counts as one component-pair breadth group");
assert.equal(canonicalGroups.forSkill("footballer", "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS")?.key,
  canonicalGroups.forSkill("football", "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS")?.key,
  "a derivative cannot add another compound breadth group");
assert.equal(canonicalGroups.forSkill("draft", "BASE")?.resolved, false,
  "interpreted decisions cannot silently certify breadth");
assert.equal(canonicalGroups.forSkill("draft", "UNRELATED")?.key, "word:draft",
  "a pending family decision does not erase exact-word evidence for an unrelated skill");
const compoundMorphology = deriveV2WordGroups({
  words: [{ id: "home", normalisedWord: "home" }, { id: "work", normalisedWord: "work" },
    { id: "homework", normalisedWord: "homework" }],
  morphology: [{ canonical_word_id: "homework", morphology_parts: [
    { type: "base", text: "home" }, { type: "base", text: "work" }],
    analysis_status: "approved", row_status: "active", review_status: "approved_for_first_exposure" }],
});
assert.equal(compoundMorphology.forSkill("homework", "O_E", new Set(["home", "homework"]))?.key,
  compoundMorphology.forSkill("home", "O_E", new Set(["home", "homework"]))?.key,
  "a multi-base word shares breadth with its uniquely relevant reviewed base");
console.log("ADLE proficiency V2 regression passed");
