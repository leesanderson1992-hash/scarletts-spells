import { bindNativePackageFingerprints } from "../lib/teaching-dictionary-manager/package-fingerprint";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildGovernedPackage } from "../lib/teaching-dictionary-manager/governed-package";
import { collectWordFacts } from "../lib/teaching-dictionary-manager/lesson-preflight";
import { preflightGovernedRelease } from "../lib/teaching-dictionary-manager/governed-preflight";
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
import type { SupabaseClient } from "@supabase/supabase-js";

async function main() {
const found=new Map<string,unknown>();collectWordFacts({structures:[{wholeCanonicalWordId:"whole",components:[{canonicalWordId:"component"}]}]},found);
const scoped=new Map<string,unknown>();collectWordFacts({families:[{members:[{canonicalWordId:"applicable",applicableMicroSkillKeys:["skill"]},{canonicalWordId:"other",applicableMicroSkillKeys:["different"]}]}]},scoped,0,"skill");assert(scoped.has("applicable"));assert(!scoped.has("other"));
assert(found.has("whole"));assert(!found.has("component"),"a component is required teaching content, not a whole-word compound skill member");
const db={from:()=>{throw new Error("Preflight must not read or mutate learner assignments");}} as unknown as SupabaseClient;
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
const degree=buildGovernedPackage({routeId:"comparative_superlative_word_lab",manifest:degreePackage.manifest,authorities:projection(degreePackage as unknown as ReturnType<typeof buildIngReleasePackage>),candidates:[{...candidate,canonicalWordId:family.words[1].canonicalWordId,route:{...candidate.route,routeId:"comparative_superlative_word_lab",microSkillKey:family.microSkillKey,content:{familyKey:family.familyKey,pairedSentenceVariants:[family.content.pairedSentence,{...family.content.pairedSentence,id:"alternate",segments:["Today, "," is less warm than ","."]}]}}}]});
assert(degree.package);assert.deepEqual(degree.blockers,[]);
const degreeCheck=await preflightGovernedRelease({...shared,routeId:"comparative_superlative_word_lab",skill:family.microSkillKey,authorities:nativeAuthorities(degree.package,family.microSkillKey)});
assert(degreeCheck.ready,degreeCheck.blockers.join(","));
const {packageSha256,...body}=degree.package;assert.equal(packageSha256,fingerprintSnapshotValue(body));
const databaseHash="d".repeat(64);let hashCalls=0;
const fingerprintDb={rpc:async(name:string,input:any)=>{assert.equal(name,"adle_generic_snapshot_json_sha256_v1");assert(input.p_value);hashCalls++;return {data:databaseHash,error:null};}} as unknown as Pick<SupabaseClient,"rpc">;
const bound=await bindNativePackageFingerprints(fingerprintDb,degree.package);
assert.equal(bound.packageSha256,databaseHash);assert.equal(hashCalls,bound.authorities.length+1);
assert(bound.authorities.every(a=>a.semanticFingerprint===databaseHash));
assert(bound.manifest.microSkills.every((s:any)=>s.dependencies.every((d:any)=>d.semanticFingerprint===databaseHash)));
assert.equal(degree.package.packageSha256,packageSha256,"database binding preserves the pure proposed package");

console.log("PASS: real governed compilers, all word variants, paired passage groups, conflict detection and old snapshot preservation");

}
main().catch(error=>{console.error(error);process.exitCode=1;});
