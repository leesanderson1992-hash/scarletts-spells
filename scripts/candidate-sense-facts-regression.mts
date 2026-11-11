import assert from "node:assert/strict";
import { candidateFactsForSense } from "../lib/teaching-dictionary-manager/candidate-sense-facts";

const senseSet = {
  schemaVersion: 1 as const,
  pronunciations: [],
  senses: [
    { id: "live-alive", definition: "To remain alive", partOfSpeech: "verb", pronunciationId: "short-i" },
    { id: "live-stage", definition: "Happening on stage", partOfSpeech: "adjective", pronunciationId: "long-i" },
  ],
};
const legacy = { id: "legacy-id", parts: [{ kind: "base" }], joins: [], wordSum: "live → live",
  analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" };
const common = { wordId: "word-id", senseId: "live-alive", senseSet,
  legacyMorphology: legacy, legacyLinks: [{ id: "legacy-link", canonical_word_id: "word-id",
    sense_id: "live-alive", family_key: "live_verb_base_family", component_part_id: "base",
    relationship_kind: "free_base" }], senseLinks: [] };
const missing = candidateFactsForSense({ ...common, senseAnalyses: [] });
assert.equal(missing.morphology, null);
assert.equal(missing.morphologyId, null);
assert.deepEqual(missing.familyLinks, []);
const selected = candidateFactsForSense({ ...common,
  senseAnalyses: [
    { id: "alive-analysis", canonical_word_id: "word-id", sense_id: "live-alive",
      morphology_parts: [{ kind: "base", sourceText: "live" }], morphology_joins: [], word_sum: "live → live" },
    { id: "stage-analysis", canonical_word_id: "word-id", sense_id: "live-stage",
      morphology_parts: [{ kind: "base", sourceText: "live" }], morphology_joins: [], word_sum: "live → live" },
  ], senseLinks: [{ id: "alive-link", canonical_word_id: "word-id", sense_id: "live-alive",
    sense_morphology_id: "alive-analysis", family_key: "live_verb_base_family",
    component_part_id: "base", relationship_kind: "free_base" }] });
assert.equal(selected.source, "sense");
assert.equal(selected.morphologyId, "alive-analysis");
assert.deepEqual(selected.familyLinkIds, ["alive-link"]);
const oneSense = candidateFactsForSense({ ...common,
  senseSet: { ...senseSet, senses: [senseSet.senses[0]] }, senseAnalyses: [] });
assert.equal(oneSense.source, "legacy");
assert.equal(oneSense.morphologyId, "legacy-id");
assert.deepEqual(oneSense.familyLinkIds, ["legacy-link"]);
console.log("candidate sense facts regression passed");
