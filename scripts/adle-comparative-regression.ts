import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDraftDegreeFamilies } from "../lib/adle/inflection/content";
import { COMPARATIVE_MICRO_SKILLS, adjectiveFamilyBlockers, gradePairedDegreeAttempt, type AdjectiveFamilyV1 } from "../lib/adle/inflection/contracts";
import { comparativePreviewFixture } from "../lib/adle/inflection/preview-fixture";
import { selectDegreeFamilies } from "../lib/adle/inflection/selection";
import { compileComparativeLesson, validateComparativeLesson } from "../lib/adle/inflection/lesson";
import { comparativeProgressValid, comparativeProgressTransitionValid, initialComparativeProgress, comparativeCheckpointReplayVersion } from "../lib/adle/inflection/resume";
import { compileComparativeSnapshotV3, validateComparativeSnapshotV3 } from "../lib/adle/inflection/snapshot";
import { buildComparativeReleasePackage, comparativeReleasePackageValid } from "../lib/adle/inflection/release";
import type { LearningItemFact } from "../lib/adle/learning-items";
import { sentenceSuffixPayloadValid, transformTargetPayloadValid, pairedWordGapsPayloadValid } from "../lib/adle/inflection/activity-contracts";
import { comparativeReadinessFacts } from "../lib/adle/inflection/readiness-facts";
import { ADLE_CURRICULUM_ROUTE_REGISTRY, getNewAssignmentCurriculumRouteForMicroSkill, validateCurriculumRouteRegistry } from "../lib/adle/curriculum-readiness/route-registry";

let checks = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
// Synthetic reviewer references are test fixtures only, never publication input.
const families: AdjectiveFamilyV1[] = createDraftDegreeFamilies().map(f => {
  const words = f.words.map(w => ({ ...w, canonicalWordId: randomUUID() })) as unknown as AdjectiveFamilyV1["words"];
  return { ...f, words, rowStatus: "active", reviewStatus: "approved_for_first_exposure", provenance: { ...f.provenance, reviewerRef: "test-only", approvalRef: "test-only" },
    lexicalVerification: { adjective: true, gradable: true, acceptsErEst: true, childSuitable: true, oneSyllable: f.rule === "double_final_consonant", shortVowelBeforeFinalConsonant: f.rule === "double_final_consonant" },
    content: { ...f.content, pairedSentence: { ...f.content.pairedSentence, targets: [1, 2].map(i => ({ ...words[i], audioText: words[i].word })) as unknown as AdjectiveFamilyV1["content"]["pairedSentence"]["targets"] } } };
});
const item = (f: AdjectiveFamilyV1, degree: 1 | 2, i: number): LearningItemFact => ({ learningItemId: randomUUID(), canonicalWordId: f.words[degree].canonicalWordId, childId: "child", microSkillKey: f.microSkillKey, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "test-only", sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: `2026-09-${20+i}`, rowStatus: "active" });
for (const skill of COMPARATIVE_MICRO_SKILLS) {
  check(getNewAssignmentCurriculumRouteForMicroSkill(skill)?.routeId === "comparative_superlative_word_lab", "exact dedicated route ownership");
  const pool = families.filter(f => f.microSkillKey === skill);
  for (const f of pool) check(!adjectiveFamilyBlockers(f).length, `complete ${f.familyKey}`);
  check(!selectDegreeFamilies("child", skill, pool, [item(pool[0], 1, 0), item(pool[0], 2, 1)]).ok, "same family cannot activate");
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (const count of [2, 3, 4] as const) {
    const queue = [item(pool[a], 1, 0), ...(count >= 3 ? [item(pool[a], 2, 1)] : []), item(pool[b], 1, 2), ...(count === 4 ? [item(pool[b], 2, 3)] : []), item(pool[(b+1)%6 === a ? (b+2)%6 : (b+1)%6], 1, 4)];
    const s = selectDegreeFamilies("child", skill, pool, queue);
    assert.ok(s.ok);
    const lesson = compileComparativeLesson(s, "test:assignment");
    check(validateComparativeLesson(lesson), "valid compiled lesson");
    check(lesson.words.length === 6 && lesson.cleaverTasks.length === count && lesson.deferredLearningItemIds.length === 1, "six forms/all queued targets/third deferred");
    check(lesson.sentenceTasks.filter(t => t.degree === "comparative").length === 3 && lesson.sentenceTasks.filter(t => t.degree === "superlative").length === 3, "six balanced gaps");
    const transformed = JSON.parse(JSON.stringify(lesson, (_k, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
    check(validateComparativeLesson(transformed), "jsonb key order survives replay");
  }
  const preview = comparativePreviewFixture(skill, 4);
  check(!validateComparativeLesson(preview) && validateComparativeLesson(preview, true), "fixture authority cannot enter released writer");
  const paired = preview.dictationTasks[0];
  check(pairedWordGapsPayloadValid({sentence:paired,audioOrder:[1,0]}) && !pairedWordGapsPayloadValid({sentence:paired,audioOrder:[0,0]}), "paired mode explicit order validator");
  check(!pairedWordGapsPayloadValid({sentence:{...paired,targets:paired.targets.map(t=>({...t,audioText:""}))},audioOrder:[1,0]}), "missing audio fails content readiness");
  check(transformTargetPayloadValid(preview.cleaverTasks[0]) && !transformTargetPayloadValid({transformation:preview.cleaverTasks[0].transformation,question:{...preview.cleaverTasks[0].question,options:[]}}), "three-option transformation contract");
  check(sentenceSuffixPayloadValid({sentence:preview.sentenceTasks[0],baseWord:preview.families[0].words[0].word,forms:preview.families[0].words.slice(1)}), "sentence mode contract");
  const badCards=clone(preview); badCards.teaching.meetWords.words[0].word="wrong";
  check(!validateComparativeLesson(badCards,true), "frozen introduction cannot misbind a word");
  check(gradePairedDegreeAttempt(paired, [paired.targets[1].word, paired.targets[0].word]).every(o => o.spellingCorrect && !o.placementCorrect), "swaps are placement only");
  check(gradePairedDegreeAttempt(paired, [paired.targets[0].word, paired.targets[0].word]).filter(o => o.spellingCorrect).length === 1, "duplicate answer never earns double credit");
  check(gradePairedDegreeAttempt(paired, ["wrong", paired.targets[1].word]).filter(o => !o.spellingCorrect).length === 1, "misspellings attributed separately");
  const progress = initialComparativeProgress(preview);
  check(comparativeProgressValid(progress, preview), "initial resume");
  check(!comparativeProgressValid({ ...progress, finished: true, stageId: "reflection", reflection: "done" }, preview), "cannot skip tasks");
  const locked = { ...progress, dictationValues: { [paired.id]: [paired.targets[0].word, paired.targets[1].word] as [string, string] }, dictationChecked: { [paired.id]: true } };
  check(!comparativeProgressTransitionValid(locked, { ...locked, dictationValues: { [paired.id]: ["edited", "edited"] } }, preview), "checked answers immutable");
  check(comparativeCheckpointReplayVersion({state:locked},{state:clone(locked)},2,1)===2, "lost checkpoint response recovers its committed version without writing");
  check(comparativeCheckpointReplayVersion({state:locked},{state:progress},2,1)===null, "different stale checkpoint never bypasses CAS");
}
const pkg = buildComparativeReleasePackage(families, "test-only-release", ["test-only-approval"]);
check(validateCurriculumRouteRegistry(ADLE_CURRICULUM_ROUTE_REGISTRY).length===0, "canonical registry remains valid");
check(adjectiveFamilyBlockers({...families[0],lexicalVerification:{...families[0].lexicalVerification,adjective:null}}).length>0, "null lexical verification is not approval");
check(adjectiveFamilyBlockers({...families[0],provenance:{...families[0].provenance,reviewerRef:true}}).length>0, "malformed reviewer is not approval");
check(comparativeReleasePackageValid(pkg) && pkg.activation === "inactive", "checksummed inactive package");
assert.throws(() => buildComparativeReleasePackage(createDraftDegreeFamilies(), "draft", ["test"])); checks++;
const selection = selectDegreeFamilies("child", families[0].microSkillKey, families, [item(families[0],1,0),item(families[1],1,1),item(families[0],2,2)]);
assert.ok(selection.ok);
const lesson = compileComparativeLesson(selection, "test");
const refs = { activationRevisionId: randomUUID(), releaseManifestId: randomUUID(), releaseKey: "test", releaseManifestSha256: "a".repeat(64), dependencyFingerprint: "b".repeat(64) };
const contentAuthorities = ["release_manifest","activation_revision","dependency_set","adjective_degree_families","teaching_content","teaching_dictionary_closure","recipe_content"].map(kind => ({ authorityType: kind, authorityId: kind === "release_manifest" ? refs.releaseManifestId : kind === "activation_revision" ? refs.activationRevisionId : randomUUID(), version: "1", sourceHash: kind === "release_manifest" ? refs.releaseManifestSha256 : kind === "dependency_set" ? refs.dependencyFingerprint : "c".repeat(64) })) as Parameters<typeof compileComparativeSnapshotV3>[0]["contentAuthorities"];
const compiled = compileComparativeSnapshotV3({ lesson, release: refs, contentAuthorities, childId: "child", parentUserId: "parent", date: "2026-09-29" });
const readiness = comparativeReadinessFacts(lesson,refs,"child");
check(readiness.routeSelections.length===3 && readiness.routeContent.every(f=>f.dependencyFingerprint===refs.dependencyFingerprint), "exact release-scoped readiness facts");
check(validateComparativeSnapshotV3(compiled.snapshot).ok && compiled.items.length === 23, "v3 frozen snapshot");
const corrupt = clone(compiled.snapshot); corrupt.payload.resolvedLesson.words[0].word = "broken";
check(!validateComparativeSnapshotV3(corrupt).ok, "tamper fails");
console.log(`comparative regression: ${checks} checks passed`);
