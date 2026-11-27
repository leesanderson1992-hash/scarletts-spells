import assert from "node:assert/strict";
import { prepareCanonicalLatinRootLesson, validateCanonicalLatinRootLesson, latinRootWordBlocker, type CanonicalLatinRootWord, type CanonicalLatinRootFamily } from "../lib/adle/morphology/latin-root-canonical";
import { latinRootPreviewContent } from "../lib/adle/morphology/latin-root-preview-fixture";
import { initialLatinRootProgress, latinRootProgressValid, latinRootProgressTransitionValid, latinRootReadyToFinish } from "../lib/adle/morphology/latin-root-progress";
import { latinRootTreeBuildModel } from "../lib/adle/morphology/latin-root-tree-build";
import { compileLatinRootSnapshotV3, validateLatinRootSnapshotV3 } from "../lib/adle/morphology/latin-root-snapshot";
import { latinRootCompletionFacts } from "../lib/adle/morphology/latin-root-completion";
import { buildLatinRootReleasePackage } from "../lib/adle/morphology/latin-root-release";
import { fingerprintAdleCurriculumReleaseManifest } from "../lib/adle/curriculum-release-authority";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import type { LearningItemFact } from "../lib/adle/learning-items";

// Synthetic reviewed facts exercise the gate; this fixture creates no dictionary approval.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const preview = latinRootPreviewContent(1,5).families[0];
const family: CanonicalLatinRootFamily = { familyKey: "port-test", revision: 2, rootWordId: uuid(90), rootSenseId: "root",
  root: "port", meaning: "Carry", origin: "Latin", reviewStatus: "approved" };
const words: CanonicalLatinRootWord[] = preview.words.map((word,index) => ({
  canonicalWordId: uuid(index+1), spelling: word.word, familyKey: family.familyKey,
  senseId: "test-sense", definition: word.meaning, partOfSpeech: "noun", ipa: "/test/", sentence: word.sentence,
  targetTokenIndex: word.sentence.split(/\s+/).findIndex(token => token.toLowerCase() === word.word),
  reviewStatus: "approved_for_first_exposure", reviewedAt: "2026-11-27T00:00:00.000Z", morphologyId: uuid(index+10),
  componentPartId: "root", wordSum: word.parts.map(part=>part.text).join(" + ")+" → "+word.word,
  parts: word.parts.map((part,partIndex)=>({id:part.role === "root" ? "root" : `affix-${partIndex}`,kind:part.role,sourceText:part.text,surfaceText:part.text,gloss:part.meaning})),
  joins: word.parts.slice(1).map(()=>({joinType:"none"})), transformations: [],
}));
const target: LearningItemFact = { learningItemId: uuid(80), childId: uuid(70), canonicalWordId: words[0].canonicalWordId,
  microSkillKey: "D4_MOR_ROOTS_COMMON_LATIN_ROOTS", itemStatus: "pending", sourceKind: "verified_misspelling",
  sourceRef: "synthetic:latin-roots", sourceAttemptText: null, reteachPriority:false, ejectedOn:null,intakeOn:"2026-11-27",rowStatus:"active" };
const input = { childId: target.childId, assignmentKey: "canonical-root-test", families:[family],words,learningItems:[target],allowedFamilyKeys:new Set([family.familyKey]) };
const ready = prepareCanonicalLatinRootLesson(input);
assert.equal(ready.status,"ready"); if(ready.status!=="ready")throw Error("Expected ready");
assert(validateCanonicalLatinRootLesson(ready.lesson));
assert.equal(ready.lesson.words.filter(word=>word.learningItemId).length,1);
assert.equal(ready.lesson.content.families[0].words[0].parts.find(part=>part.role==="root")?.meaning,"Carry");
assert.equal(prepareCanonicalLatinRootLesson({...input,words:words.slice(1)}).status,"blocked","Missing target is not replaced");
assert.equal(prepareCanonicalLatinRootLesson({...input,words:[...words,{...words[0],senseId:"other"}]}).status,"blocked","Ambiguous target sense blocks");
assert.equal(prepareCanonicalLatinRootLesson({...input,words:words.slice(0,4)}).status,"blocked","No four-word padding");
assert.equal(prepareCanonicalLatinRootLesson({...input,learningItems:[{...target,childId:uuid(71)}]}).status,"blocked","Cross-child lineage rejected");
assert.equal(latinRootWordBlocker({...words[0],partOfSpeech:"root"},family),"root_support_is_not_a_spelling_target");
assert.equal(latinRootWordBlocker({...words[0],targetTokenIndex:999},family),"meaning_sentence_target_invalid");
assert.equal(latinRootWordBlocker({...words[0],parts:words[0].parts.map(part=>part.kind==="prefix"?{...part,gloss:""}:part)},family),"unsupported_or_incomplete_reviewed_word_parts");
const tampered=structuredClone(ready.lesson);tampered.content.families[0].meaning="See";assert(!validateCanonicalLatinRootLesson(tampered));

const pkg=buildLatinRootReleasePackage({releaseKey:"synthetic-port",approvalRefs:["Synthetic test only"],families:[family],words});
const refs=fingerprintAdleCurriculumReleaseManifest(pkg.manifest);
const compiled=compileLatinRootSnapshotV3({lesson:ready.lesson,childId:target.childId,parentUserId:uuid(75),date:"2026-11-27",
  release:{activationRevisionId:uuid(95),releaseManifestId:uuid(96),releaseKey:pkg.manifest.releaseKey,...refs},
  contentAuthorities:[{authorityType:"release_manifest",authorityId:uuid(96),version:"2",sourceHash:refs.releaseManifestSha256},
    {authorityType:"activation_revision",authorityId:uuid(95),version:"2",sourceHash:fingerprintSnapshotValue({test:true})},
    {authorityType:"dependency_set",authorityId:uuid(96),version:"2",sourceHash:refs.dependencyFingerprint},
    ...ready.lesson.words.map(word=>({authorityType:"teaching_content" as const,authorityId:`${word.canonicalWordId}:${word.senseId}`,version:"1",sourceHash:word.sourceFingerprint}))]});
assert.equal(compiled.items.length,17);
assert(validateLatinRootSnapshotV3(compiled.snapshot).ok);
const broken=structuredClone(compiled.snapshot);broken.words[1].learningItemId=target.learningItemId;assert(!validateLatinRootSnapshotV3(broken).ok);
const p=initialLatinRootProgress(ready.lesson.content);
assert(latinRootProgressValid(p,ready.lesson.content));
const corrupt=structuredClone(p);corrupt.familyProgress[family.familyKey]={placements:{},completedTargetIds:"bad" as unknown as string[]};assert(!latinRootProgressValid(corrupt,ready.lesson.content));
const complete=structuredClone(p);
for(const f of ready.lesson.content.families){const model=latinRootTreeBuildModel(f);complete.familyProgress[f.id]={placements:Object.fromEntries(model.targets.map(t=>[t.id,[...t.expectedPieceIds]])),completedTargetIds:model.targets.map(t=>t.id)}}
complete.spellComplete=true;complete.stage="reflect";complete.reflection="The root port means carry.";
for(const word of ready.lesson.content.families.flatMap(f=>f.words)){complete.coverAttempts[word.id]=word.word;complete.sentenceAttempts[word.id]=word.sentence;}
assert(latinRootProgressValid(complete,ready.lesson.content));assert(latinRootReadyToFinish(complete,ready.lesson.content));
const changed=structuredClone(complete);changed.coverAttempts[words[0].canonicalWordId]="repaired";assert(!latinRootProgressTransitionValid(complete,changed,ready.lesson.content));
const erased=structuredClone(complete);delete erased.sentenceAttempts[words[0].canonicalWordId];assert(!latinRootProgressTransitionValid(complete,erased,ready.lesson.content));
const stolen=structuredClone(complete);const placements=stolen.familyProgress[family.familyKey].placements;const ids=Object.keys(placements);placements[ids[1]][0]=placements[ids[0]][0];assert(!latinRootProgressValid(stolen,ready.lesson.content));
const facts=latinRootCompletionFacts(compiled.snapshot,{...complete,finished:true});
assert.equal(facts.producedWords.length,5);assert(facts.producedWords.every(word=>word.correct));
assert.equal(facts.wordPolicies.filter(word=>word.evidenceEligible).length,1,"Practice words do not invent independent learner lineage");
console.log("PASS: canonical word/meaning gates, no filler, target provenance, immutable snapshot, five-word capacity, complete trees, resume validation, first-attempt locks and evidence policies.");
