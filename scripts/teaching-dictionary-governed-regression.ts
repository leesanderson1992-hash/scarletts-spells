import { recordJoinedBaseSkillReview } from "../lib/teaching-dictionary-manager/word-skill-review";
import { compoundDictionaryWordIds } from "../lib/teaching-dictionary-manager/structural-package";
import { nativeWordFacts } from "../lib/teaching-dictionary-manager/native-word-facts";
import { bindNativePackageFingerprints } from "../lib/teaching-dictionary-manager/package-fingerprint";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildGovernedPackage } from "../lib/teaching-dictionary-manager/governed-package";
import { collectWordFacts, profileCompilerReady, profileWordErrorsBlockRoute } from "../lib/teaching-dictionary-manager/lesson-preflight";
import { preflightGovernedRelease, requiredBaseWordPreflightTargets } from "../lib/teaching-dictionary-manager/governed-preflight";
import { applyIngDictationVariants } from "../lib/adle/ing/reviewed-dictation";
import { ING_MICRO_SKILLS, ingWordBlockers } from "../lib/adle/ing/contracts";
import { ingPreviewPool } from "../lib/adle/ing/preview-fixture";
import { buildIngReleasePackage } from "../lib/adle/ing/release";
import { buildHomophoneReleasePackage } from "../lib/adle/homophone/release";
import { HOMOPHONE_LESSONS, compileHomophoneLessonSnapshot, validateHomophoneLessonSnapshot } from "../lib/adle/homophone/lesson";
import { selectHomophonePassageVariant } from "../lib/adle/homophone/passage-variants";
import { createDraftDegreeFamilies } from "../lib/adle/inflection/content";
import { buildComparativeReleasePackage } from "../lib/adle/inflection/release";
import type { AdjectiveFamilyV1 } from "../lib/adle/inflection/contracts";
import { emptyMetadata, emptyMorphology, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import approvedContextual from "../data/adle/homophone/convergence-v1/approved-lesson-content.json";
import { buildApprovedContextualContent } from "../lib/adle/homophone/approved-contextual-content";
import { loadApprovedContextualContentForSkills } from "../lib/adle/homophone/published-contextual-content-loader";
import { buildWeakVowelReleasePackage } from "../lib/adle/weak-vowel/release";
import type { SupabaseClient } from "@supabase/supabase-js";

async function main() {
const v1BaseMembers = [
  { canonicalWordId: "base-only", memberRole: "base", assignmentEligible: true,
    lessonContentEligible: true, authenticSelectionEligible: true },
  { canonicalWordId: "target", memberRole: "authentic_target", assignmentEligible: true,
    lessonContentEligible: true, authenticSelectionEligible: true },
  { canonicalWordId: "transfer-only", memberRole: "transfer", assignmentEligible: true,
    lessonContentEligible: true, authenticSelectionEligible: true },
];
assert.deepEqual(requiredBaseWordPreflightTargets(1, v1BaseMembers), ["target"],
  "historical reference and transfer words do not veto an authentic-target release");
assert.deepEqual(requiredBaseWordPreflightTargets(2, v1BaseMembers),
  ["base-only", "target", "transfer-only"], "v2 applicable members remain fully covered");
assert.equal(profileWordErrorsBlockRoute({ productionEnabled: true, validatedMemberCount: 4,
  minimumLessonWords: 4, unreadyExistingMembers: 1, unreadyReviewedCandidates: 0 }), false,
"one incomplete member does not turn a compiling active suffix profile off");
assert.equal(profileWordErrorsBlockRoute({ productionEnabled: true, validatedMemberCount: 3,
  minimumLessonWords: 4, unreadyExistingMembers: 2, unreadyReviewedCandidates: 0 }), true);
assert.equal(profileWordErrorsBlockRoute({ productionEnabled: true, validatedMemberCount: 4,
  minimumLessonWords: 4, unreadyExistingMembers: 0, unreadyReviewedCandidates: 1 }), true,
"an invalid proposed reviewed addition still blocks its new release");
const validatedSuffixMembers = new Set(["careful", "careless", "hopeful", "hopeless"]);
assert.equal(profileCompilerReady({ coverageComplete: true, productionEnabled: true,
  validatedMemberIds: validatedSuffixMembers,
  proposedMemberIds: [...validatedSuffixMembers, "helpful"], reviewedCandidateIds: [] }), true,
"an active profile compiles from its four approved valid words while an existing unreviewed word stays blocked");
assert.equal(profileCompilerReady({ coverageComplete: true, productionEnabled: true,
  validatedMemberIds: validatedSuffixMembers,
  proposedMemberIds: [...validatedSuffixMembers, "helpful"], reviewedCandidateIds: ["helpful"] }), false,
"a newly reviewed but invalid candidate must block its proposed release");
assert.equal(profileCompilerReady({ coverageComplete: true, productionEnabled: false,
  validatedMemberIds: validatedSuffixMembers,
  proposedMemberIds: [...validatedSuffixMembers, "helpful"], reviewedCandidateIds: [] }), false,
"an inactive profile cannot be released with incomplete proposed membership");
const found=new Map<string,unknown>();collectWordFacts({structures:[{wholeCanonicalWordId:"whole",components:[{canonicalWordId:"component"}]}]},found);
const scoped=new Map<string,unknown>();collectWordFacts({families:[{members:[{canonicalWordId:"applicable",applicableMicroSkillKeys:["skill"]},{canonicalWordId:"other",applicableMicroSkillKeys:["different"]}]}]},scoped,0,"skill");assert(scoped.has("applicable"));assert(!scoped.has("other"));
assert.deepEqual(compoundDictionaryWordIds([{wholeCanonicalWordId:"whole",components:[{canonicalWordId:"component"},{canonicalWordId:"component"}]}]),["whole","component"],"component identities must remain in the immutable dictionary closure");
assert(found.has("whole"));assert(!found.has("component"),"a component is required teaching content, not a whole-word compound skill member");
const db={from:()=>{throw new Error("Preflight must not read or mutate learner assignments");}} as unknown as SupabaseClient;
let skillReviewWrites=0;
const joinedReviewDb=(joined:boolean)=>({from:(table:string)=>{const data=table==="adle_route_activation_heads"?{current_revision_id:"revision"}:table==="adle_route_activation_revisions"?{release_manifest_id:"release"}:table==="adle_curriculum_release_dependencies"?{authority_id:"family"}:{id:"family",semantic_fingerprint:"source",semantic_projection:{schemaVersion:2,families:[{members:[{canonicalWordId:joined?"joined":"other",applicableMicroSkillKeys:["D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX"]}]}]}};const query={eq:()=>query,select:()=>query,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null})};return query;},rpc:async()=>{skillReviewWrites++;return {data:null,error:{message:"Stop before test writes"}};}} as unknown as SupabaseClient);
const joinedInput={wordId:"joined",microSkillKey:"D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",actorId:randomUUID(),environment:"production" as const};
await assert.rejects(recordJoinedBaseSkillReview(joinedReviewDb(false),joinedInput),/BASE_FAMILY_EXACT_SKILL_APPROVAL_MISSING/);assert.equal(skillReviewWrites,0);
await assert.rejects(recordJoinedBaseSkillReview(joinedReviewDb(true),joinedInput),/WORD_SKILL_PACKAGE_CREATE_FAILED/);assert.equal(skillReviewWrites,1,"only exact released family membership may be confirmed by lesson Save");

const projection=(p:ReturnType<typeof buildIngReleasePackage>)=>p.authorities.map(a=>({id:randomUUID(),authority_key:a.authorityKey,authority_type:a.authorityType,schema_version:a.schemaVersion,semantic_projection:a.semanticProjection,semantic_fingerprint:a.semanticFingerprint}));
const dictionary:WordDraftPayload={displayWord:"jumping",definition:"moving off the ground",dictationSentence:"She is jumping.",dictationTargetTokenIndex:2,
  dictationVariants:[{id:"primary",sentence:"She is jumping.",targetTokenIndex:2,audioText:"She is jumping."},{id:"repeat",sentence:"Jumping means jumping.",targetTokenIndex:2,audioText:"Jumping means jumping."}],
  writtenSyllableBreakdown:"jump-ing",ageBand:"middle_primary",frequencyBand:"common",complexityBand:"simple",metadata:emptyMetadata(),canonicalMorphology:emptyMorphology(),
  provenance:{sourceCategory:"internal_authored",sourceName:"Test",sourceUrl:"",sourceLicence:"",sourceUseNote:"Test only",confidence:"high"},skillKeys:[],routeContents:[]};
const ingWords=ING_MICRO_SKILLS.flatMap(skill=>ingPreviewPool(skill).map(word=>({...word,canonicalWordId:randomUUID(),rowStatus:"active" as const,reviewStatus:"approved_for_first_exposure" as const,reviewerRef:"test",approvalRef:"test"})));
const ingPackage=buildIngReleasePackage(ingWords,"test:ing",["test"]);
const word=ingWords.find(word=>word.word==="jumping")!;
const candidate={id:randomUUID(),canonicalWordId:word.canonicalWordId,reviewedBy:randomUUID(),dictionary,route:{routeId:"ing_endings_word_lab",routeVersion:"v1",microSkillKey:word.microSkillKey,wordMeaning:dictionary.definition,wordSum:"",content:{base:"jump"}}};
const ing=buildGovernedPackage({routeId:candidate.route.routeId,manifest:ingPackage.manifest,authorities:projection(ingPackage).reverse(),candidates:[candidate]});
assert.deepEqual(ing.blockers,[]);assert(ing.package);
const ingAuthority=ing.package.authorities.find(a=>a.authorityType==="ing_word_members"&&a.semanticProjection.microSkillKey===word.microSkillKey)!;
const varied=applyIngDictationVariants(ingAuthority.semanticProjection.words,ingAuthority.semanticProjection.dictationSets,"stable-date",ingAuthority.semanticFingerprint);
assert.deepEqual(ingWordBlockers(varied.find(w=>w.canonicalWordId===word.canonicalWordId)!),[]);
const shared={db,revision:{id:randomUUID()},release:{id:randomUUID(),release_key:"test",release_manifest_sha256:"a".repeat(64),dependency_fingerprint:"b".repeat(64)},environment:"staging" as const};
const contextualLesson=approvedContextual.lessons[0];
const contextualIds=new Map<string,string>();
const contextualContent=buildApprovedContextualContent(contextualLesson.microSkillKey,contextualLesson.sets.map(set=>({
  setId:`${set.setKey}@1`,setKey:set.setKey,microSkillKey:contextualLesson.microSkillKey,
  revision:1,semanticFingerprint:"a".repeat(64),reviewStatus:"approved" as const,
  relationKind:set.relationKind as "homophone" | "near_homophone" | "confusable" | "morphological_contrast" | "contraction_real_word",
  members:set.members.map(member=>({canonicalWordId:contextualIds.get(member.word)??(() => {const id=randomUUID();contextualIds.set(member.word,id);return id;})(),...member})),
})));
const contextualProjection={schemaVersion:1,microSkillKey:contextualLesson.microSkillKey,content:contextualContent};
const contextualTables:Record<string,Array<Record<string,unknown>>>={
  homophone_contrast_sets:contextualContent.sets.map(set=>({set_key:set.setKey,revision:set.revision,
    micro_skill_key:contextualContent.microSkillKey,relation_kind:set.relationKind,review_status:"approved",
    semantic_fingerprint:set.semanticFingerprint})),
  homophone_contrast_set_members:contextualContent.sets.flatMap(set=>set.members.map((member,index)=>({
    set_key:set.setKey,revision:set.revision,member_ordinal:index+1,canonical_word_id:member.canonicalWordId,
    intended_sense:member.intendedSense,grammatical_role:member.grammaticalRole,target_sentence:member.teachingSentence}))),
  canonical_teaching_dictionary_words:contextualContent.sets.flatMap(set=>set.members.map(member=>({
    id:member.canonicalWordId,normalised_word:member.word,row_status:"active",
    review_status:"approved_for_first_exposure",dialect_code:"en-GB"}))),
};
const contextualReads:string[]=[];
const contextualDb={from:(table:string)=>{const filters:Array<(row:Record<string,unknown>)=>boolean>=[];let window:[number,number]=[0,499];const query={
  select:()=>query,in:(column:string,values:unknown[])=>{filters.push(row=>values.includes(row[column]));return query;},
  eq:(column:string,value:unknown)=>{filters.push(row=>row[column]===value);return query;},order:()=>query,
  range:(first:number,last:number)=>{window=[first,last];return query;},
  then:(resolve:(value:{data:Record<string,unknown>[];error:null})=>unknown)=>{contextualReads.push(table);
    return Promise.resolve({data:(contextualTables[table]??[]).filter(row=>filters.every(filter=>filter(row)))
      .slice(window[0],window[1]+1),error:null}).then(resolve);},
};return query;}} as unknown as SupabaseClient;
const currentContextual=await loadApprovedContextualContentForSkills(contextualDb,[contextualLesson.microSkillKey]);
assert.equal(fingerprintSnapshotValue(currentContextual.get(contextualLesson.microSkillKey)?.content),fingerprintSnapshotValue(contextualContent));
assert.deepEqual(contextualReads,["homophone_contrast_sets","homophone_contrast_set_members","canonical_teaching_dictionary_words"]);
contextualTables.homophone_contrast_sets=[];
assert.match((await loadApprovedContextualContentForSkills(contextualDb,[contextualLesson.microSkillKey]))
  .get(contextualLesson.microSkillKey)?.blocker??"",/sets_missing/);
const contextualAuthority={id:randomUUID(),authority_type:"homophone_contextual_content",semantic_projection:contextualProjection,
  semantic_fingerprint:fingerprintSnapshotValue(contextualProjection)};
const contextualCheck=await preflightGovernedRelease({...shared,routeId:"homophone_contextual_choice",skill:contextualLesson.microSkillKey,authorities:[contextualAuthority]});
assert(contextualCheck.ready,contextualCheck.blockers.join(","));
assert.equal(Object.keys(contextualCheck.witnesses).length,contextualIds.size);
assert.equal((await preflightGovernedRelease({...shared,routeId:"homophone_contextual_choice",skill:contextualLesson.microSkillKey,
  authorities:[contextualAuthority],currentContextualContent:null,currentContextualBlocker:"review withdrawn"})).blockers[0],"review withdrawn");
const changedCurrent=structuredClone(contextualContent);
changedCurrent.teachingExplanation="A different reviewed explanation.";
assert.equal((await preflightGovernedRelease({...shared,routeId:"homophone_contextual_choice",skill:contextualLesson.microSkillKey,
  authorities:[contextualAuthority],currentContextualContent:changedCurrent})).ready,false);
const contextualChanged=structuredClone(contextualAuthority);
contextualChanged.semantic_projection.content.sets[0].members[0].teachingSentence="This unreviewed sentence changed.";
assert.equal((await preflightGovernedRelease({...shared,routeId:"homophone_contextual_choice",skill:contextualLesson.microSkillKey,authorities:[contextualChanged]})).ready,false);
const weakRelease=buildWeakVowelReleasePackage({releaseKey:"test:weak",approvalRefs:["test"]});
const weakAuthority=weakRelease.authorities[0];
const weakInput={...shared,routeId:"weak_vowel_word_lab",skill:weakAuthority.semanticProjection.microSkillKey,
  authorities:[{id:randomUUID(),authority_type:weakAuthority.authorityType,semantic_projection:weakAuthority.semanticProjection,
    semantic_fingerprint:weakAuthority.semanticFingerprint}]};
assert((await preflightGovernedRelease(weakInput)).ready,"the immutable weak-vowel teaching template must validate");
const weakChanged={...weakInput,authorities:structuredClone(weakInput.authorities)};
weakChanged.authorities[0].semantic_projection.teachingTemplateSha256="0".repeat(64);
assert.equal((await preflightGovernedRelease(weakChanged)).ready,false);
const nativeAuthorities=(pkg:NonNullable<typeof ing.package>,skill:string)=>pkg.authorities.filter(a=>a.semanticProjection.microSkillKey===skill).map(a=>({id:a.authorityKey,authority_type:a.authorityType,semantic_projection:a.semanticProjection,semantic_fingerprint:a.semanticFingerprint}));
const preflight=await preflightGovernedRelease({...shared,routeId:candidate.route.routeId,skill:word.microSkillKey,authorities:nativeAuthorities(ing.package,word.microSkillKey)});
assert(preflight.ready,preflight.blockers.join(","));assert.equal(Object.keys(preflight.witnesses).length,7);
const invalid=structuredClone(ing.package);invalid.authorities.find(a=>a.authorityKey===ingAuthority.authorityKey)!.semanticProjection.dictationSets[word.canonicalWordId][1].targetTokenIndex=1;
assert.equal((await preflightGovernedRelease({...shared,routeId:candidate.route.routeId,skill:word.microSkillKey,authorities:nativeAuthorities(invalid,word.microSkillKey)})).ready,false);

const canonicalWords=Object.fromEntries(HOMOPHONE_LESSONS.map(lesson=>[lesson.microSkillKey,Object.fromEntries(lesson.words.map(word=>[word.word,randomUUID()]))]));
const homoPackage=buildHomophoneReleasePackage({releaseKey:"test:homo",approvalRefs:["test"],canonicalWords});
const base=compileHomophoneLessonSnapshot(HOMOPHONE_LESSONS[0].microSkillKey);const old=JSON.stringify(base);
const alternate=structuredClone(base.lesson.dictationPassages).map(p=>({...p,id:`alternate:${p.id}`,segments:[`Later, ${p.segments[0]}`,p.segments[1],p.segments[2]] as [string,string,string]}));
const passageSets=[{id:"primary",passages:base.lesson.dictationPassages},{id:"alternate",passages:alternate}];
for(let day=0;day<4;day++)assert.deepEqual(validateHomophoneLessonSnapshot(selectHomophonePassageVariant(base,passageSets,`day:${day}`,"a".repeat(64))),[]);
assert.equal(JSON.stringify(base),old,"variation must not mutate existing assignment content");
const homoCandidate={...candidate,canonicalWordId:canonicalWords[base.microSkillKey][base.lesson.words[0].word],route:{...candidate.route,routeId:"homophone_word_lab",routeVersion:"v2",microSkillKey:base.microSkillKey,content:{dictationPassageVariants:passageSets}}};
const homo=buildGovernedPackage({routeId:"homophone_word_lab",manifest:homoPackage.manifest,authorities:projection(homoPackage as unknown as ReturnType<typeof buildIngReleasePackage>).reverse(),candidates:[homoCandidate]});
assert(homo.package);assert.deepEqual(homo.blockers,[]);
assert.deepEqual(homo.package.authorities.map(a=>a.semanticProjection.lesson.microSkillKey),HOMOPHONE_LESSONS.map(lesson=>lesson.microSkillKey),"the native content pin requires its original lesson order");
const homoCheck=await preflightGovernedRelease({...shared,routeId:"homophone_word_lab",skill:base.microSkillKey,authorities:nativeAuthorities(homo.package,base.microSkillKey)});
assert(homoCheck.ready,homoCheck.blockers.join(","));
const conflict=buildGovernedPackage({routeId:"homophone_word_lab",manifest:homoPackage.manifest,authorities:projection(homoPackage as unknown as ReturnType<typeof buildIngReleasePackage>),candidates:[homoCandidate,{...homoCandidate,id:randomUUID(),route:{...homoCandidate.route,content:{dictationPassageVariants:[passageSets[0]]}}}]});
assert.equal(conflict.package,null);assert.match(conflict.blockers.join(),/Conflicting paired/);

const families:AdjectiveFamilyV1[]=createDraftDegreeFamilies().map(f=>{const words=f.words.map(w=>({...w,canonicalWordId:randomUUID()})) as unknown as AdjectiveFamilyV1["words"];return {...f,words,rowStatus:"active",reviewStatus:"approved_for_first_exposure",provenance:{...f.provenance,reviewerRef:"test",approvalRef:"test"},lexicalVerification:{adjective:true,gradable:true,acceptsErEst:true,childSuitable:true,oneSyllable:f.rule==="double_final_consonant",shortVowelBeforeFinalConsonant:f.rule==="double_final_consonant"},content:{...f.content,pairedSentence:{...f.content.pairedSentence,targets:[1,2].map(i=>({...words[i],audioText:words[i].word})) as unknown as AdjectiveFamilyV1["content"]["pairedSentence"]["targets"]}}};});
const degreePackage=buildComparativeReleasePackage(families,"test:degree",["test"]);const family=families[0];
const nativeDegree=nativeWordFacts("comparative_superlative_word_lab","v1",family.microSkillKey,family.words[0].canonicalWordId,[{authorityType:"adjective_degree_families",content:{families:[family]}}]);assert.deepEqual(nativeDegree?.content.sourceRefs,family.provenance.sourceRefs);
const degree=buildGovernedPackage({routeId:"comparative_superlative_word_lab",manifest:degreePackage.manifest,authorities:projection(degreePackage as unknown as ReturnType<typeof buildIngReleasePackage>),candidates:[{...candidate,canonicalWordId:family.words[1].canonicalWordId,route:{...candidate.route,routeId:"comparative_superlative_word_lab",microSkillKey:family.microSkillKey,content:{familyKey:family.familyKey,pairedSentenceVariants:[family.content.pairedSentence,{...family.content.pairedSentence,id:"alternate",segments:["Today, "," is less warm than ","."]}]}}}]});
assert(degree.package);assert.deepEqual(degree.blockers,[]);
const degreeCheck=await preflightGovernedRelease({...shared,routeId:"comparative_superlative_word_lab",skill:family.microSkillKey,authorities:nativeAuthorities(degree.package,family.microSkillKey)});
assert(degreeCheck.ready,degreeCheck.blockers.join(","));
const {packageSha256,...body}=degree.package;assert.equal(packageSha256,fingerprintSnapshotValue(body));
const databaseHash="d".repeat(64);let hashCalls=0;
const fingerprintDb={rpc:async(name:string,input:{p_value:unknown})=>{assert.equal(name,"adle_generic_snapshot_json_sha256_v1");assert(input.p_value);hashCalls++;return {data:databaseHash,error:null};}} as unknown as Pick<SupabaseClient,"rpc">;
const bound=await bindNativePackageFingerprints(fingerprintDb,degree.package);
assert.equal(bound.packageSha256,databaseHash);assert.equal(hashCalls,bound.authorities.length+1);
assert(bound.authorities.every(a=>a.semanticFingerprint===databaseHash));
assert(bound.manifest.microSkills.every((s:{dependencies:Array<{semanticFingerprint:string}>})=>s.dependencies.every(d=>d.semanticFingerprint===databaseHash)));
assert.equal(degree.package.packageSha256,packageSha256,"database binding preserves the pure proposed package");
const compoundHash="c".repeat(64);const compoundDb={rpc:async(name:string)=>({data:name==="adle_snapshot_json_sha256_v1"?compoundHash:databaseHash,error:null})} as unknown as Pick<SupabaseClient,"rpc">;
const compoundBound=await bindNativePackageFingerprints(compoundDb,{schemaVersion:1,activation:"inactive",manifest:{microSkills:[{dependencies:[{authorityType:"compound_structure",authorityKey:"compound"}]}]},authorities:[{authorityType:"compound_structure",authorityKey:"compound",semanticProjection:{schemaVersion:1,structures:[]}}],packageSha256:"old"});
assert.equal(compoundBound.authorities[0].semanticFingerprint,compoundHash,"the compound publisher uses its established snapshot fingerprint algorithm");
assert.equal(compoundBound.manifest.microSkills[0].dependencies[0].semanticFingerprint,compoundHash);
assert.equal(compoundBound.packageSha256,databaseHash);


console.log("PASS: real governed compilers, all word variants, paired passage groups, conflict detection and old snapshot preservation");

}
main().catch(error=>{console.error(error);process.exitCode=1;});
