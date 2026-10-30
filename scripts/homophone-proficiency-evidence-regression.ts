import assert from "node:assert/strict";
import { homophoneLessonEvidence } from "../lib/adle/proficiency/homophone-context";
import { homophoneWritingEvidence } from "../lib/adle/proficiency/homophone-writing";
import { homophoneAdleReviewEvidence } from "../lib/adle/proficiency/homophone-adle-review";
import { extractAdleAuthenticWriting } from "../lib/writing-engine/whole-writing/authentic-use-credit";
import { createHash } from "node:crypto";
import { calculateProficiencyV2, type V2Evidence } from "../lib/adle/proficiency/v2";
import { fingerprint } from "../lib/writing-engine/baseline/source";

const skill = "D4_HOM_TEST";
const words = ["were", "where", "wear"].map((normalised_word) => ({ id: normalised_word, normalised_word }));
const members = words.map((word) => ({ micro_skill_key: skill, member_normalized: word.normalised_word }));
const pairs = [{ micro_skill_key: skill, member_a: "wear", member_b: "where" },
  { micro_skill_key: skill, member_a: "were", member_b: "where" }];
const passage = { id: "p1", targets: ["where", "wear"], segments: ["I know ", " to ", " it."] };
const assignment = { id: "a", status: "completed", compiled_lesson_snapshot: { route: { routeId: "homophone_word_lab" },
  payload: { resolvedLesson: { activities: [{ id: "dictation-1", answerVisibility: "recall_neutral" }],
    lesson: { microSkillKey: skill, dictationPassages: [passage] } } } } };
const item = { id: "i", daily_assignment_id: "a", metadata: { microSkillKey: skill, canonicalWordId: "where" },
  prompt_data: { homophoneActivityId: "dictation:0", passageId: "p1", targetSlot: 0, segments: passage.segments } };
const attempt = { id: "first", daily_assignment_id: "a", assignment_item_id: "i", canonical_word_id: "where",
  attempt_text: "wear", is_correct: false, section_key: "lesson_dictation", attempt_kind: "lesson_dictation",
  source_ref: `lesson:child:2026-10-01:${skill}:passage:p1:slot:0`, created_at: "2026-10-01T12:00:00Z", micro_skill_key: skill };
const lesson = homophoneLessonEvidence({ words, members, pairs, assignments: [assignment], items: [item],
  attempts: [attempt, { ...attempt, id: "typo", attempt_text: "wher" },
    { ...attempt, id: "correct", attempt_text: "where", is_correct: true },
    { ...attempt, id: "visible", section_key: "lesson_context_choice" },
    { ...attempt, id: "repair", attempt_kind: "repair" }], checkpoints: [] });
assert.deepEqual(lesson.get(skill)?.map(row => row.polarity), ["negative", "positive"]);
assert.equal(lesson.get(skill)?.[0].groupKey, "role:where");
assert.equal(homophoneLessonEvidence({ words: words.slice(1), members: members.slice(1),
  pairs: pairs.slice(0, 1), assignments: [assignment], items: [item], attempts: [attempt], checkpoints: [] })
  .get(skill)?.[0].polarity, "negative");
assert.equal(homophoneLessonEvidence({ words, members, pairs, assignments: [assignment],
  items: [{ ...item, prompt_data: { ...item.prompt_data, segments: ["wrong", "", ""] } }],
  attempts: [attempt], checkpoints: [] }).get(skill)?.length ?? 0, 0);

const contextual = homophoneLessonEvidence({ words, members, pairs, attempts: [], items: [],
  assignments: [{ id: "new", status: "completed", compiled_lesson_snapshot: { route: { routeId: "homophone_contextual_choice" },
    sourceFingerprint: "f", microSkillKey: skill, guidedLesson: {
      activities: [{ id: "dictation-1", answerVisibility: "recall_neutral" }],
      lesson: { dictationPassages: [passage] } } } }],
  checkpoints: [{ daily_assignment_id: "new", adapter_key: "homophone_contextual_v1", lesson_snapshot_fingerprint: "f",
    checkpoint_payload: { state: { completed: true, guided: { dictationChecked: { "0": true },
      dictationValues: { "0": ["where", "where"] } } } }, completed_at: "2026-10-02T12:00:00Z" }] });
assert.deepEqual(contextual.get(skill)?.map(row => row.polarity), ["positive", "negative"]);

const field = "I know where to wear it. were";
const occurrence = (id: string, observed_text: string, start_utf16: number) => ({ id, snapshot_id: "s", observed_text,
  provenance: "learner_response", field_hash: fingerprint(field), field_path: "/draftPayload/text",
  start_utf16, end_utf16: start_utf16 + observed_text.length });
const writing = homophoneWritingEvidence({ words, members, pairs,
  snapshots: [{ id: "s", occurred_at: "2026-10-03T12:00:00Z", envelope: { draftPayload: { text: field } } }],
  occurrences: [occurrence("o1", "where", 7), occurrence("o2", "wear", 16), occurrence("o3", "were", 25)],
  credits: [{ id: "credit", review_id: "approved", snapshot_id: "s", canonical_word_id: "where",
    occurrence_ids: ["o1", "o1"], observed_word: "where", supplied_spelling: false },
    { id: "unapproved-credit", review_id: "returned", snapshot_id: "s", canonical_word_id: "were",
      occurrence_ids: ["o3"], observed_word: "were", supplied_spelling: false }],
  reviews: [{ id: "approved", parent_action: "approved", snapshot_id: "s" },
    { id: "returned", parent_action: "returned", snapshot_id: "s" }],
  decisions: [{ id: "d", occurrence_id: "o2", classification: "INVALID", intended_member: "where", supersedes_decision_id: null },
    { id: "suggestion", occurrence_id: "o3", classification: "UNCERTAIN", intended_member: null, supersedes_decision_id: null }],
  addedCases: [], caseReviews: [], caseLinks: [] });
assert.deepEqual(writing.get(skill)?.map(row => row.polarity), ["positive", "negative"]);
assert.match(writing.get(skill)?.[0].challengeKey ?? "", /^context:sentence:[a-f0-9]{64}$/);
const duplicateSentence = homophoneWritingEvidence({ words, members, pairs,
  snapshots: [{ id: "s", occurred_at: "2026-10-03T12:00:00Z", envelope: { draftPayload: { text: field } } },
    { id: "s2", occurred_at: "2026-10-10T12:00:00Z", envelope: { draftPayload: { text: field } } }],
  occurrences: [occurrence("o1", "where", 7), { ...occurrence("o4", "where", 7), snapshot_id: "s2" }],
  credits: [{ id: "c1", review_id: "r1", snapshot_id: "s", canonical_word_id: "where", occurrence_ids: ["o1"],
    observed_word: "where", supplied_spelling: false },
    { id: "c2", review_id: "r2", snapshot_id: "s2", canonical_word_id: "where", occurrence_ids: ["o4"],
      observed_word: "where", supplied_spelling: false }],
  reviews: [{ id: "r1", parent_action: "approved", snapshot_id: "s" },
    { id: "r2", parent_action: "approved", snapshot_id: "s2" }],
  decisions: [], addedCases: [], caseReviews: [], caseLinks: [] });
assert.equal(duplicateSentence.get(skill)?.length, 2);
assert.equal(duplicateSentence.get(skill)?.[0].challengeKey, duplicateSentence.get(skill)?.[1].challengeKey);
const reviewedAddedCase = homophoneWritingEvidence({ words, members, pairs,
  snapshots: [{ id: "s", occurred_at: "2026-10-03T12:00:00Z", envelope: { draftPayload: { text: field } } }],
  occurrences: [occurrence("o2", "wear", 16)], credits: [], reviews: [], decisions: [],
  addedCases: [{ id: "added", occurrence_id: "o2", intended_member: "where" }],
  caseReviews: [{ id: "catalog", parent_added_case_id: "added", case_status: "reviewed" }],
  caseLinks: [{ catalog_case_id: "catalog", micro_skill_key: skill }] });
assert.equal(reviewedAddedCase.get(skill)?.[0].polarity, "negative");
const reviewText = "I know where to wear it.";
const reviewHash = createHash("sha256").update(reviewText).digest("hex");
const reviewOccurrence = extractAdleAuthenticWriting({ sourceId: "source", sourceHash: reviewHash,
  text: reviewText }).occurrences.find(row => row.observedText === "where")!;
const adleInputs = { words, members, pairs,
  credits: [{ id: "credit", adle_review_id: "review", adle_source_id: "source", canonical_word_id: "where",
    occurrence_ids: [reviewOccurrence.id], observed_word: "where", supplied_spelling: false }],
  reviews: [{ id: "review", review_session_id: "session", source_id: "source", source_hash: reviewHash }],
  sources: [{ id: "source", review_session_id: "session", submitted_text: reviewText,
    source_hash: reviewHash, submitted_at: "2026-10-10T12:00:00Z" }],
  receipts: [{ review_session_id: "session" }], choices: [], findings: [], decisions: [] };
assert.equal(homophoneAdleReviewEvidence(adleInputs).get(skill)?.[0].polarity, "positive");
assert.equal(homophoneAdleReviewEvidence({ ...adleInputs, receipts: [] }).get(skill)?.length ?? 0, 0);
assert.equal(homophoneAdleReviewEvidence({ ...adleInputs, choices: [{ id: "choice", review_session_id: "session",
  source_hash: reviewHash, start_utf16: 7, end_utf16: 12, observed_text: "where", intended_word: "wear",
  decision: "pending" }] }).get(skill)?.length, 1);
const reviewNegative = homophoneAdleReviewEvidence({ ...adleInputs,
  credits: [], choices: [{ id: "choice", review_session_id: "session", source_hash: reviewHash,
    start_utf16: 7, end_utf16: 12, observed_text: "where", intended_word: "wear", decision: "confirmed" }] });
assert.equal(reviewNegative.get(skill)?.[0].polarity, "negative");

const base: V2Evidence = { eventId: "success", wordId: "where", groupKey: "role:where", occurredOn: "2026-10-01",
  polarity: "positive", environment: "CONTROLLED_LESSON", challengeKey: null, sourceKind: "test" };
const input = (evidence: V2Evidence[]) => calculateProficiencyV2({ learnerId: "child", skillKey: skill,
  familyKey: "D4_HOM", asOf: "2026-10-30", requiredGroupKeys: ["role:where", "role:wear"], evidence,
  unscoredCount: 0, unresolvedGroupCount: 0, relationshipFingerprint: "r", evidenceFingerprint: "e",
  groupFingerprint: "g", homophoneTwoDateSetback: true });
const miss = (id: string, occurredOn: string): V2Evidence => ({ ...base, eventId: id, occurredOn, polarity: "negative" });
assert.equal(input([base]).level, 1);
assert.equal(input([base, { ...base, eventId: "same-day", polarity: "negative" }]).level, null);
assert.equal(input([base, miss("m1", "2026-10-05")]).level, 1);
assert.equal(input([base, miss("m1", "2026-10-05")]).recentSetback, true);
assert.equal(input([base, miss("m1", "2026-10-05"), miss("m2", "2026-10-10")]).level, null);
assert.equal(input([base, miss("m1", "2026-10-05"), miss("m2", "2026-10-10"),
  { ...base, eventId: "recovered", occurredOn: "2026-10-20" }]).level, 1);
console.log("homophone proficiency evidence regression passed");
