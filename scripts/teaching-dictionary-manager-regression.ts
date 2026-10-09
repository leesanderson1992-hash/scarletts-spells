import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { derivePrefixRouteFacts } from "../lib/teaching-dictionary-manager/prefix-content";
import { emptyMorphology, publicationBlockers, routeBlockers, routeContentFromStoredRow } from "../lib/teaching-dictionary-manager/contracts";
import { matchesPublishedFactsForDefinitionOnly } from "../lib/teaching-dictionary-manager/definition-only";
import { hasReleasedRouteContent, routeContentForReadiness, routeRequirements } from "../lib/teaching-dictionary-manager/readiness";
import { compileDynamicPrefixWordLabDecision } from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import { DYNAMIC_PREFIX_PEDAGOGY_VERSION, type DynamicPrefixWord } from "../lib/adle/morphology/dynamic-prefix-contracts";
import { loadReviewedPrefixPackageFixtures, selectReviewedPrefixFixture } from "./lib/adle-reviewed-prefix-package-fixture";
import { activityVariantsForRoute, validateActivityVariantInventory } from "../lib/adle/composable-lesson/activity-variants";
import { assessWordActivities } from "../lib/teaching-dictionary-manager/activity-assessment";
import { deriveReviewedSuffixCandidate } from "../lib/adle/morphology/derived-suffix-candidate";
import { isDynamicAffixWordLessonReady } from "../lib/adle/morphology/dynamic-affix-transfer-selection";

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
const publishedRoute = routeContentFromStoredRow({ route_id: route.routeId, route_version: route.routeVersion,
  micro_skill_key: route.microSkillKey, content: route });
assert.deepEqual(publishedRoute.content, route.content);
assert.deepEqual(routeBlockers(publishedRoute, row.payload), []);
assert.equal(hasReleasedRouteContent("base", true, ["released_route_content"]), true);
assert.equal(hasReleasedRouteContent("base", true, ["approved_resolver_mapping"]), false);
assert.equal(hasReleasedRouteContent("suffix", true, []), true);
assert.equal(hasReleasedRouteContent("suffix", false, []), false);
const suffixChecklist = routeRequirements(routeContentForReadiness({
  routeId: "dynamic_affix_word_lab", routeVersion: "v3", microSkillKey: "D4_MOR_SUFFIXES_ITY",
}, row.payload), row.payload);
assert(suffixChecklist.some((item) => item.label === "suffix form" && item.status === "missing"
  && item.editTarget === "td-route-D4_MOR_SUFFIXES_ITY-suffixVariant"));
assert(suffixChecklist.some((item) => item.label === "the dictionary dictation sentence" && item.status === "present"));
assert(routeRequirements(publishedRoute, row.payload, (target) => target.includes("td-route-"))
  .some((item) => item.status === "needs_review"));
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

assert.deepEqual(validateActivityVariantInventory(), []);
const ityVariants = activityVariantsForRoute("dynamic_affix_word_lab", "D4_MOR_SUFFIXES_ITY");
assert(ityVariants.some((variant) => variant.kind === "dictation" && variant.wordScope === "independent_words"));
assert(ityVariants.some((variant) => variant.kind === "meaning_sort" && !variant.enabled));
assert(ityVariants.some((variant) => variant.requiredFacts.some((fact) => fact.factKey === "route_applicability"
  && fact.owner === "reviewed_word_route_facts")));
const ityAssessments = assessWordActivities({ microSkillKey: "D4_MOR_SUFFIXES_ITY", payload: row.payload,
  routeContent: null, releasedMember: false });
assert.equal(ityAssessments.find((item) => item.variant.kind === "meaning_sort")?.status, "not_used");
assert.equal(ityAssessments.find((item) => item.variant.kind === "dictation")?.status, "needs_review");
assert.equal(ityAssessments.find((item) => item.variant.kind === "cleaver")?.status, "missing");

const ityProfile = { microSkillKey: "D4_MOR_SUFFIXES_ITY", position: "after" as const,
  meaningBins: [{ id: "state", label: "state", description: "the state of being" }] };
const directFacts = {
  word: { id: "reviewed-activity", displayWord: "activity", sourceRowHash: "a".repeat(64),
    ageBand: "middle_primary", frequencyBand: "medium", complexityBand: "moderate",
    rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  morphology: { id: "reviewed-morphology-activity", parts: [{ text: "activ", type: "base", gloss: "doing things" },
    { text: "ity", type: "suffix", gloss: "state of" }], joins: [], wordSum: "activ + ity → activity",
    analysisStatus: "approved", reviewStatus: "approved_for_first_exposure",
    sourceRowHash: "b".repeat(64), sourceName: "reviewed editor" },
  metadata: { syllables: "ac-tiv-i-ty", phonemeHint: "ak-tiv-i-tee", stressPattern: "second", hasSchwa: false,
    rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  dictation: { id: "dictation-activity", sourceRowHash: "c".repeat(64), sentence: "The activity was fun.",
    targetTokenIndex: 1, audioText: "The activity was fun.", rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  definition: "something you do",
};
const direct = deriveReviewedSuffixCandidate(ityProfile, directFacts);
assert(direct.word, direct.blockers.join(", "));
assert(isDynamicAffixWordLessonReady({ ...ityProfile, productionEnabled: true, affixLabel: "-ity", affixText: "ity",
  affixMeaning: "state", includeMeaningSort: false, wordsByCanonicalId: new Map(), choices: [],
  introduction: { title: "", paragraphs: [], spellingRules: [], examples: [] },
  reflection: { promptKey: "", promptText: "" } }, direct.word));
const complex = deriveReviewedSuffixCandidate(ityProfile, { ...directFacts, morphology: {
  ...directFacts.morphology, parts: [{ text: "act", type: "root", gloss: "do" },
    { text: "ive", type: "suffix", gloss: "doing" }, { text: "ity", type: "suffix", gloss: "state" }],
} });
assert(complex.blockers.includes("two_part_analysis_required"));
const ambiguous = deriveReviewedSuffixCandidate({ ...ityProfile, meaningBins: [...ityProfile.meaningBins,
  { id: "quality", label: "quality", description: "quality of" }] }, directFacts);
assert(ambiguous.blockers.includes("meaning_group_ambiguous"));
const definitionPayload = { ...row.payload, definition: "a revised child-friendly meaning",
  routeContents: [], canonicalMorphology: emptyMorphology() };
const publishedFacts = {
  payload: definitionPayload,
  word: { display_word: definitionPayload.displayWord, age_band: definitionPayload.ageBand,
    frequency_band: definitionPayload.frequencyBand, complexity_band: definitionPayload.complexityBand,
    source_category: definitionPayload.provenance.sourceCategory,
    source_name: definitionPayload.provenance.sourceName,
    source_url: definitionPayload.provenance.sourceUrl,
    source_licence: definitionPayload.provenance.sourceLicence,
    source_use_note: definitionPayload.provenance.sourceUseNote,
    confidence: definitionPayload.provenance.confidence },
  metadata: { ...definitionPayload.metadata },
  dictation: { dictation_sentence: definitionPayload.dictationSentence,
    audio_text: definitionPayload.dictationSentence,
    dictation_target_token_index: definitionPayload.dictationTargetTokenIndex },
  morphology: null,
};
assert(matchesPublishedFactsForDefinitionOnly(publishedFacts));
assert(!matchesPublishedFactsForDefinitionOnly({ ...publishedFacts,
  payload: { ...definitionPayload, dictationSentence: "A changed sentence." } }));
assert(!matchesPublishedFactsForDefinitionOnly({ ...publishedFacts,
  payload: { ...definitionPayload, routeContents: [publishedRoute] } }));
console.log("Teaching Dictionary Manager regression passed");
