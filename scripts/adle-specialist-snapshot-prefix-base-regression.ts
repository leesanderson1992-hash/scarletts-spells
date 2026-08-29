import assert from "node:assert/strict";
import { canonicalSnapshotJson } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { compileBaseWordSpecialistSnapshotV3, compileDynamicPrefixSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-prefix-base-compiler";
import { validateCompiledSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-validator";
import { persistSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-persistence";
import { resolvePersistedLessonRoute } from "../lib/adle/composable-lesson/route-resolution";
import { createPersistedRouteMetadataV2 } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { buildDynamicPrefixAssignmentPlan } from "../lib/adle/morphology/dynamic-prefix-assignment-plan";
import { compileDynamicPrefixWordLabDecision } from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import { resolveDynamicPrefixLessonAuthorityV2 } from "../lib/adle/morphology/dynamic-prefix-runtime";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { buildBaseWordFamilyPilotItems } from "../lib/adle/morphology/base-word-family-pilot-plan";
import { resolveBaseWordFamilyLessonAuthorityV2 } from "../lib/adle/morphology/resolved-base-word-family-lesson-v2";
import { loadReviewedPrefixPackageFixtures } from "./lib/adle-reviewed-prefix-package-fixture";
import { planAssignmentPersistence, type AssignmentHeaderDraft, type AssignmentItemDraft } from "../lib/adle/assignment-persistence";
import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import type { ActivatedBaseWordReleaseAuthority } from "../lib/adle/curriculum-release-activation";

const childId="11111111-1111-4111-8111-111111111111", parentId="22222222-2222-4222-8222-222222222222", date="2026-08-23" as const, H="a".repeat(64);
const prefixFixture=loadReviewedPrefixPackageFixtures().find((entry)=>entry.profile.microSkillKey==="D4_MOR_PREFIXES_IN_IM_IL_IR")!;
const governedProfile={...prefixFixture.profile,governance:{profileId:"33333333-3333-4333-8333-333333333333",importBatchId:"44444444-4444-4444-8444-444444444444",sourceRowHash:H},wordsByCanonicalId:new Map(prefixFixture.words.map((word,index)=>[word.canonicalWordId,{...word,governance:{memberId:`55555555-5555-4555-8555-55555555555${index}`,memberSourceRowHash:H,dictionaryWordSourceRowHash:H,dictationId:`66666666-6666-4666-8666-66666666666${index}`,dictationSourceRowHash:H}}]))};
const authentic=prefixFixture.words.slice(0,2).map((word,index)=>({learningItemId:`77777777-7777-4777-8777-77777777777${index}`,childId,canonicalWordId:word.canonicalWordId,microSkillKey:governedProfile.microSkillKey,itemStatus:"pending" as const,sourceKind:"verified_misspelling" as const,sourceRef:"fixture",sourceAttemptText:null,reteachPriority:false,ejectedOn:null,intakeOn:date,rowStatus:"active" as const}));
const selection={profile:governedProfile,authenticTargets:authentic,transfers:prefixFixture.words.slice(2,4)};
const decision=compileDynamicPrefixWordLabDecision(selection,{mode:"shared_authoritative",sourceKind:"reviewed_fixture"}); assert(decision.ok);
const basePlan={childId,planDate:date,composerPolicyVersion:"fixture",schedulePolicyVersion:"fixture",partOne:{},partTwo:{},budget:{budgetResponses:30,estimatedResponses:0,guidedWordCount:0,introTrimmed:false,trims:[]}} as unknown as ComposedDailyPlan;
const prefixPlan=buildDynamicPrefixAssignmentPlan({basePlan,facts:{} as never,selection,payload:decision.payload});
const prefixPersist=planAssignmentPersistence(prefixPlan,{parentUserId:parentId,existingHeaders:[]}); assert(prefixPersist.action==="insert"&&prefixPersist.header);
const prefixResolved=resolveDynamicPrefixLessonAuthorityV2(decision.payload); assert(prefixResolved);
const prefixA=compileDynamicPrefixSpecialistSnapshotV3({payload:prefixResolved,selection,compilerDecision:decision,header:prefixPersist.header,items:prefixPersist.items});
const prefixB=compileDynamicPrefixSpecialistSnapshotV3({payload:prefixResolved,selection,compilerDecision:decision,header:prefixPersist.header,items:prefixPersist.items});
assert.equal(canonicalSnapshotJson(prefixA),canonicalSnapshotJson(prefixB)); assert.equal(prefixA.provenance.sourceFingerprint,prefixB.provenance.sourceFingerprint);
assert.equal(prefixA.activities.flatMap((a)=>a.itemBindings).length,prefixPersist.items.length); assert(validateCompiledSpecialistSnapshotV3(prefixA,{lessonRouteMetadata:prefixPersist.header.lessonRouteMetadata,assignmentGenerationSource:prefixPersist.header.assignmentGenerationSource,items:prefixPersist.items.map((i)=>({sourceEntityId:i.sourceEntityId,position:i.position,sectionKey:i.metadata.sectionKey,canonicalWordId:i.metadata.canonicalWordId,templateKey:i.templateKey,targetWord:i.targetWord,promptData:i.promptData}))}).ok);
// The released IN/IM/IL/IR persistence contract also permits the genuine 20-item
// distribution (2 Split + 4 Meaning + 4 Build + 8 recall + 2 intro).
const twentyPayload={...decision.payload,activities:{...decision.payload.activities,guided:{splitCanonicalWordIds:decision.payload.words.lesson.slice(0,2).map((word)=>word.canonicalWordId),builds:decision.payload.words.lesson.map((word)=>({canonicalWordId:word.canonicalWordId,baseWord:word.baseWord,targetMeaning:word.derivedMeaning,choices:decision.payload.activities.build.choices})),includeMeaningSort:true,meaningCheckKind:"prefix_form" as const,meaningResultsPresentation:"none" as const}}};
const twentyResolved=resolveDynamicPrefixLessonAuthorityV2(twentyPayload); assert(twentyResolved);
const twentyPlan=buildDynamicPrefixAssignmentPlan({basePlan,facts:{} as never,selection,payload:twentyPayload});
const twentyPersist=planAssignmentPersistence(twentyPlan,{parentUserId:parentId,existingHeaders:[]}); assert(twentyPersist.action==="insert"&&twentyPersist.header&&twentyPersist.items.length===20);
const twentySnapshot=compileDynamicPrefixSpecialistSnapshotV3({payload:twentyResolved,selection,compilerDecision:decision,header:twentyPersist.header,items:twentyPersist.items}); assert.equal(twentySnapshot.assignment.itemCount,20); assert.equal(twentySnapshot.activities.flatMap((activity)=>activity.itemBindings).length,20);

const release={activationRevisionId:"88888888-8888-4888-8888-888888888888",environmentKey:"fixture",microSkillKey:BASE_WORD_FAMILY_PREVIEW_PAYLOAD.microSkillKey,releaseManifestId:"99999999-9999-4999-8999-999999999999",releaseKey:"fixture",releaseManifestSha256:H,dependencyFingerprint:H,familyAuthorityId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",familyAuthorityFingerprint:H,family:{schemaVersion:1,microSkillKey:BASE_WORD_FAMILY_PREVIEW_PAYLOAD.microSkillKey,importBatchId:"fixture",families:[]},teachingContentAuthorityId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",teachingContentAuthorityFingerprint:H,teachingContent:{schemaVersion:1,microSkillKey:BASE_WORD_FAMILY_PREVIEW_PAYLOAD.microSkillKey,contentVersionId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",contentVersion:BASE_WORD_FAMILY_PREVIEW_PAYLOAD.contentVersion,teachingObjective:"fixture",childFriendlyExplanation:"fixture",ruleExplanation:"fixture",memoryTip:"fixture",commonMisconceptions:"fixture",firstExposureProgression:[],guidedPracticeProgression:[],reviewProofreadingProgression:[],exampleSelectionGuidance:"fixture",contrastPolicyGuidance:"fixture"},dictionaryClosureAuthorityId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",dictionaryClosureAuthorityFingerprint:H,dictionaryWords:[]} satisfies ActivatedBaseWordReleaseAuthority;
const baseMetadata=createPersistedRouteMetadataV2("base_word_lab",{activationRevisionId:release.activationRevisionId,releaseManifestId:release.releaseManifestId,releaseKey:release.releaseKey,releaseManifestSha256:H,dependencyFingerprint:H});
const baseHeader:AssignmentHeaderDraft={childId,parentUserId:parentId,assignmentDate:date,title:"ADLE Base-word Family Pilot",status:"pending",targetWords:BASE_WORD_FAMILY_PREVIEW_PAYLOAD.independentWords.map((w)=>w.displayWord),reviewWords:[],assignmentGenerationSource:"adle_base_word_family_pilot_v1",lessonRouteMetadata:baseMetadata};
const baseRaw=buildBaseWordFamilyPilotItems({payload:BASE_WORD_FAMILY_PREVIEW_PAYLOAD,parentUserId:parentId,childId,planDate:date});
const baseItems:AssignmentItemDraft[]=baseRaw.map((item)=>({...item,status:"ready",metadata:{planDate:date,sectionKey:String(item.metadata.sectionKey),provenance:"fixture",microSkillKey:BASE_WORD_FAMILY_PREVIEW_PAYLOAD.microSkillKey,canonicalWordId:typeof item.metadata.canonicalWordId==="string"?item.metadata.canonicalWordId:null,expectedEvidenceKind:"fixture",adleLearningItemRef:null,composerPolicyVersion:"fixture",schedulePolicyVersion:"fixture"}}));
const baseResolved=resolveBaseWordFamilyLessonAuthorityV2(BASE_WORD_FAMILY_PREVIEW_PAYLOAD); assert(baseResolved);
const baseA=compileBaseWordSpecialistSnapshotV3({payload:baseResolved,releaseAuthority:release,header:baseHeader,items:baseItems});
const baseB=compileBaseWordSpecialistSnapshotV3({payload:baseResolved,releaseAuthority:release,header:baseHeader,items:baseItems});
assert.equal(canonicalSnapshotJson(baseA),canonicalSnapshotJson(baseB)); assert.equal(baseA.provenance.sourceFingerprint,baseB.provenance.sourceFingerprint);
assert.equal(baseA.activities.flatMap((a)=>a.itemBindings).length,18); assert.equal(new Set(baseA.activities.flatMap((a)=>a.itemBindings.map((b)=>b.sourceEntityId))).size,18);
const context={dynamicPrefixEnabled:true,dynamicAffixEnabled:true,baseWordFamilyEnabled:true};
const routeItems=baseItems.map((i,index)=>({id:`item-${index}`,sourceEntityId:i.sourceEntityId,position:i.position,sectionKey:i.metadata.sectionKey,templateKey:i.templateKey,canonicalWordId:i.metadata.canonicalWordId,targetWord:i.targetWord,promptData:i.promptData}));
const legacy=resolvePersistedLessonRoute({lessonRouteMetadata:baseMetadata,items:routeItems,runtimeContext:context,compiledLessonSnapshot:null});
const frozen=resolvePersistedLessonRoute({lessonRouteMetadata:baseMetadata,items:routeItems,runtimeContext:context,compiledLessonSnapshot:baseA});
assert(legacy.status!=="blocked"&&frozen.status!=="blocked"&&legacy.runtime.adapterKey==="base_word_family_v1"&&frozen.runtime.adapterKey==="base_word_family_v1"); assert.equal(canonicalSnapshotJson(legacy.runtime.resolvedLesson),canonicalSnapshotJson(frozen.runtime.resolvedLesson));
let calls=0;
async function persistenceProof() {
  await persistSpecialistSnapshotV3({persist:async()=>{calls++;return "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";}},{parentUserId:parentId,childId,planDate:date,header:baseHeader,items:baseItems,intakes:[],snapshot:baseA}); assert.equal(calls,1);
  const invalid=structuredClone(baseA); invalid.assignment.itemCount+=1;
  await assert.rejects(()=>persistSpecialistSnapshotV3({persist:async()=>{calls++;return "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";}},{parentUserId:parentId,childId,planDate:date,header:baseHeader,items:baseItems,intakes:[],snapshot:invalid})); assert.equal(calls,1);
  console.log(JSON.stringify({status:"passed",prefix:{items:prefixPersist.items.length,fingerprint:prefixA.provenance.sourceFingerprint,governedTwentyItemFingerprint:twentySnapshot.provenance.sourceFingerprint},baseWord:{items:18,fingerprint:baseA.provenance.sourceFingerprint},atomicPersistenceCalls:calls}));
}
void persistenceProof();
