import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { derivePrefixRouteFacts } from "../lib/teaching-dictionary-manager/prefix-content";
import { publicationBlockers, routeBlockers } from "../lib/teaching-dictionary-manager/contracts";
import { compileDynamicPrefixWordLabDecision } from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import { DYNAMIC_PREFIX_PEDAGOGY_VERSION, type DynamicPrefixWord } from "../lib/adle/morphology/dynamic-prefix-contracts";
import { loadReviewedPrefixPackageFixtures, selectReviewedPrefixFixture } from "./lib/adle-reviewed-prefix-package-fixture";

const [row] = parseDictionaryCsv([
  "targetWord,routeId,routeVersion,microSkillKey,wordMeaning,wordSum,wordPartsJSON,dictation1_sentence",
  'renew,dynamic_prefix_word_lab,v2,D4_MOR_PREFIXES_RE_PRE,"make new, again","re + new → renew","[{""text"":""re"",""partType"":""prefix"",""meaning"":""again""},{""text"":""new"",""partType"":""free_base"",""meaning"":""new""}]","We renew the book."',
].join("\n"));
assert.equal(row.normalisedWord, "renew");
assert.equal(row.payload.dictationTargetTokenIndex, 1);
assert.equal(row.payload.definition, "make new, again");
const route = row.payload.routeContents[0]!;
route.content = derivePrefixRouteFacts({ word: "renew", source: route.content,
  meaningBins: [{ id: "again_back", prefixText: "re" }, { id: "before", prefixText: "pre" }],
  choiceForms: ["re", "pre", "un"] });
assert.equal(route.content.baseWord, "new");
assert.equal(route.content.meaningBinKey, "again_back");
assert.deepEqual(route.content.choiceAudit, { word: "renew", choiceVerdicts: { re: true, pre: false, un: false } });
row.payload.complexityBand = "moderate";
row.payload.metadata = { syllables: "re-new", phoneme_hint: "rɪˈnjuː", grapheme_notes: "",
  stress_pattern: "second", has_schwa: false, morphemes: "re + new", morphology_notes: "prefix plus base", irregularity_notes: "" };
row.payload.ageBand = "middle_primary";
row.payload.frequencyBand = "medium";
assert.deepEqual(routeBlockers(route, row.payload), []);
assert.deepEqual(publicationBlockers(row.payload, "renew"), []);
row.payload.dictationTargetTokenIndex = 0;
assert(publicationBlockers(row.payload, "renew").some((blocker) => blocker.includes("target token")));
const [badMorphology] = parseDictionaryCsv('normalised_word,morphology_parts\nrenew,"{bad}"');
assert.match(badMorphology.error ?? "", /morphology JSON/);
row.payload.canonicalMorphology.analysisStatus = "approved";
assert(publicationBlockers(row.payload, "renew").some((blocker) => blocker.includes("canonical morphology")));

// A reviewed choice audit lets renew join the existing re-/pre- profile and
// compile the same route as the seven already approved member words.
const fixture = loadReviewedPrefixPackageFixtures().find((entry) => entry.profile.microSkillKey === "D4_MOR_PREFIXES_RE_PRE")!;
const manifest = JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json", "utf8"));
const policy = manifest.profiles.find((entry: { microSkillKey: string }) => entry.microSkillKey === "D4_MOR_PREFIXES_RE_PRE");
const definitions = new Map<string, { text: string; label: string; meaning: string; rules: string[] }>(manifest.prefixDefinitions.map((entry: { text: string; label: string; meaning: string; rules: string[] }) => [entry.text, entry]));
const renew: DynamicPrefixWord = {
  canonicalWordId: "renew-reviewed-fixture", displayWord: "renew", audioText: "We will renew our library card tomorrow.",
  baseWord: "new", teachingBuildText: "new", baseMeaning: "new", derivedMeaning: "make new again",
  effect: "again_back", parts: [
    { id: "part_1", text: "re", sourceText: "re", role: "prefix", gloss: "again", start: 0, end: 2 },
    { id: "part_2", text: "new", sourceText: "new", role: "base", gloss: "new", start: 2, end: 5 },
  ], joins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }], splitPoints: [2],
  dictationSentence: "We will renew our library card tomorrow.", dictationTargetTokenIndex: 2,
  prefixText: "re", prefixLabel: "re-", prefixMeaning: "again", approvedTransfer: false,
};
const profile = {
  ...fixture.profile,
  wordsByCanonicalId: new Map([...fixture.profile.wordsByCanonicalId, [renew.canonicalWordId, renew] as const]),
  meaningBins: policy.meaningBins,
  prefixChoices: policy.choiceForms.map((form: string, index: number) => ({ ...definitions.get(form)!, outcome: null,
    status: index === 0 ? "target" as const : "valid_alternative" as const, reviewedSource: "manager-reviewed-fixture" })),
  pedagogy: { version: DYNAMIC_PREFIX_PEDAGOGY_VERSION, teachingCards: policy.targetForms.map((form: string) => definitions.get(form)!),
    validChoiceAudit: [...policy.validChoiceAudit, { word: "renew", choiceVerdicts: { re: true, pre: false, un: false } }],
    meaningCheckKind: policy.meaningCheckKind, meaningResultsPresentation: "none" as const,
    coverClosePolicy: { kind: "track_ratio" as const, threshold: 0.8 } },
};
const selection = selectReviewedPrefixFixture(profile, renew);
const compiled = compileDynamicPrefixWordLabDecision(selection, { mode: "shared_authoritative", sourceKind: "reviewed_fixture" });
assert(compiled.ok, `renew prefix lesson must compile: ${compiled.ok ? "" : compiled.blockerCode}`);
console.log("Teaching Dictionary Manager regression passed");
