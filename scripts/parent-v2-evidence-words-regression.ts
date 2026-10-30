import assert from "node:assert/strict";
import { contributingV2Words } from "../lib/parent-insights/v2-evidence-words";
import type { V2Evidence } from "../lib/adle/proficiency/v2";

const event = (eventId: string, wordId: string, groupKey: string, occurredOn: string,
  polarity: V2Evidence["polarity"] = "positive", sourceKind = "independent_assessment"): V2Evidence => ({
  eventId, wordId, groupKey, occurredOn, polarity, sourceKind,
  environment: "ISOLATED_RETRIEVAL", challengeKey: null,
});
const names = new Map([["base", "happy"], ["derivative", "happiness"], ["typo", "happier"],
  ["where", "where"]]);
const wordName = (id: string) => names.get(id) ?? id;
const words = contributingV2Words([
  event("1", "base", "family:happy", "2026-10-01"),
  event("1", "base", "family:happy", "2026-10-01"),
  event("2", "derivative", "family:happy", "2026-10-10"),
  event("3", "typo", "family:happy", "2026-10-11", "negative"),
], "D4_MOR", "2026-10-30", wordName);
assert.deepEqual(words.map((word) => [word.word, word.groupKey, word.attempts]), [
  ["happiness", "family:happy", 1], ["happy", "family:happy", 1],
]);
assert.equal(new Set(words.map((word) => word.groupKey)).size, 1, "derivatives share breadth");
const contextual = contributingV2Words([
  event("1", "where", "role:where", "2026-10-01", "positive", "homophone_lesson_dictation"),
  event("2", "where", "role:where", "2026-10-01", "negative", "homophone_lesson_dictation"),
  event("3", "where", "role:where", "2026-10-10", "positive", "homophone_lesson_dictation"),
], "D4_HOM", "2026-10-30", wordName);
assert.deepEqual(contextual.map((word) => [word.word, word.attempts, word.dates]), [["where", 1, 1]],
  "a confirmed contextual miss wins over a same-role, same-date success");
assert.equal(contributingV2Words([event("late", "base", "family:happy", "2026-11-01")],
  "D4_MOR", "2026-10-30", wordName).length, 0, "future evidence is hidden");
console.log("Parent V2 evidence word regression passed");
