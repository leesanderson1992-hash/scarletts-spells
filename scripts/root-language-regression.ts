import assert from "node:assert/strict";
import { GREEK_ROOT_SKILL, LATIN_ROOT_SKILL, rootSkillsForMeaning, type RootLanguageAssignment } from "../lib/teaching-dictionary-manager/root-language";
import { evaluateLessonCandidate } from "../lib/teaching-dictionary-manager/lesson-candidate";
const support: RootLanguageAssignment = { canonical_word_id: "port", sense_id: "carry-root", assignment_role: "root_support",
  family_key: "port-root", revision: 1, root_text: "port", origin_language: "Latin", micro_skill_key: LATIN_ROOT_SKILL, display_name: "Common Latin roots" };
assert.equal(rootSkillsForMeaning([support], "carry-root", true)[0].key, LATIN_ROOT_SKILL);
assert.deepEqual(rootSkillsForMeaning([support], "harbour-noun", false), [], "Port's noun cannot inherit its root-support classification");
const member = { ...support, canonical_word_id: "transport", sense_id: "verb", assignment_role: "family_member" as const };
assert.equal(rootSkillsForMeaning([member, member], "verb", false).length, 1);
assert.deepEqual(rootSkillsForMeaning([member], "other-sense", false), []);
const graph = { ...member, origin_language: "Greek", micro_skill_key: GREEK_ROOT_SKILL, display_name: "Common Greek roots", root_text: "graph" };
const geo = { ...graph, root_text: "geo", family_key: "geo-root" };
assert.equal(rootSkillsForMeaning([graph, geo], "verb", false)[0].roots.length, 2, "One skill can cite two reviewed roots");
const candidate = evaluateLessonCandidate({ wordId: "port", displayWord: "port", skillKey: LATIN_ROOT_SKILL,
  senseId: "carry-root", morphology: null, familyLinks: [], senseSet: { pronunciations: [], senses: [
    { id: "carry-root", partOfSpeech: "root", definition: "Carry", pronunciationId: null },
    { id: "harbour-noun", partOfSpeech: "noun", definition: "A harbour", pronunciationId: null },
  ] } });
assert.equal(candidate.status, "not_match");assert(candidate.issues.some(issue => issue.code === "ROOT_SUPPORT_ONLY"));
console.log("Root language regression passed: grouped membership, mixed senses and support-target separation.");
