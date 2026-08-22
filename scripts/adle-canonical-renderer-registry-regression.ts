import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ADLE_ACTIVITY_CATALOGUE } from "../lib/adle/activity-catalogue";
import {
  canonicalActivityContractKey,
  createCanonicalActivityBinding,
  listCanonicalActivityRendererRegistrations,
  loadCanonicalActivityRenderer,
  validateCanonicalActivityBinding,
  validateCanonicalActivitySequence,
} from "../components/adle/activities/canonical-renderer-registry";

const registrations = listCanonicalActivityRendererRegistrations();
const keys = registrations.map(canonicalActivityContractKey);
assert.equal(new Set(keys).size, keys.length, "canonical activity registrations must be unique by concept, mode, and version");

for (const registration of registrations) {
  const catalogue = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === registration.concept);
  assert(catalogue, `${registration.concept} must be owned by the Activity Catalogue`);
  assert(catalogue.supportedModes.includes(registration.mode), `${canonicalActivityContractKey(registration)} must use a Catalogue-supported mode`);
  assert.equal(catalogue.canonicalComponent, registration.catalogueComponent, `${canonicalActivityContractKey(registration)} must select the Catalogue canonical component`);
}

const teaching = createCanonicalActivityBinding({
  id: "teaching",
  label: "Learn",
  concept: "INTRODUCTION",
  mode: "teaching_page",
  contractVersion: 1,
  createProps: () => ({
    config: {
      pages: [{ id: "page-1", type: "teaching", title: "A governed page", paragraphs: ["Read this."] }],
      meetWords: { words: [{ id: "word-1", word: "helpful" }] },
    },
    onComplete: () => undefined,
  }),
});
assert.equal(validateCanonicalActivityBinding(teaching), null, "valid teaching bindings must pass canonical validation");

const invalidDictation = createCanonicalActivityBinding({
  id: "dictation",
  label: "Dictate",
  concept: "DICTATION",
  mode: "whole_sentence",
  contractVersion: 1,
  createProps: () => ({ audioText: "", correctSentence: "", value: "", checked: false }),
});
assert.equal(validateCanonicalActivityBinding(invalidDictation)?.code, "ADLE_ACTIVITY_INVALID_PAYLOAD", "missing authored sentence content must fail closed");

const unknown = createCanonicalActivityBinding({
  id: "unknown",
  label: "Unknown",
  concept: "UNKNOWN",
  mode: "unknown",
  contractVersion: 1,
  createProps: () => ({}),
});
assert.equal(validateCanonicalActivityBinding(unknown)?.code, "ADLE_ACTIVITY_UNKNOWN_CONTRACT", "unknown contracts must fail closed");
assert.deepEqual(validateCanonicalActivitySequence([teaching, invalidDictation]).map((failure) => failure.activityId), ["dictation"], "sequence validation must report every invalid required activity before rendering");

const shell = readFileSync("components/adle/first-impression/first-impression-lesson.tsx", "utf8");
assert(shell.includes('concept: "INTRODUCTION"') && shell.includes('mode: "teaching_page"'), "FirstImpressionLesson must resolve TeachingPages through the canonical registry");
for (const [family, path, requiredContracts] of [
  ["Prefix/Affix", "components/adle/morphology/morphology-guided-lesson.tsx", ["MEANING_DISCOVERY", "CLEAVER", "MEANING_SORT", "WORD_ASSEMBLY", "COVER_CHECK", "DICTATION", "LESSON_REFLECTION"]],
  ["Base Word", "components/adle/morphology/base-word-family-guided-lesson.tsx", ["WORD_FAMILY_REVEAL", "CLEAVER", "WORD_ASSEMBLY", "COVER_CHECK", "DICTATION", "LESSON_REFLECTION"]],
  ["Compound", "components/adle/morphology/closed-compound-guided-lesson.tsx", ["COMPOUND_JIGSAW", "MEANING_MATCH", "COVER_CHECK", "DICTATION", "LESSON_REFLECTION"]],
] as const) {
  const source = readFileSync(path, "utf8");
  for (const concept of requiredContracts) assert(source.includes(`concept: "${concept}"`), `${family} must bind ${concept} through the canonical registry`);
  for (const obsoleteClosure of ["render:", "renderCover=", "renderDictation=", "renderReflection="]) assert(!source.includes(obsoleteClosure), `${family} must not retain specialist component-selection closure ${obsoleteClosure}`);
}

async function main() {
  for (const registration of registrations) {
    assert.equal(typeof registration.load, "function", `${canonicalActivityContractKey(registration)} must own a lazy loader`);
  }
  const cover = registrations.find((registration) => registration.concept === "COVER_CHECK" && registration.mode === "whole_word");
  assert(cover, "the canonical Cover Check registration must exist");
  const renderer = await loadCanonicalActivityRenderer(cover);
  assert.equal(typeof renderer, "function", "a representative lazy loader must resolve its React component outside the browser bundle");

  console.log(`PASS: canonical renderer registry (${registrations.length} versioned concept/mode contracts, lazy loaders, validation, fail-closed handling)`);
}

void main();
