import {guidedSnapshotIssues} from "../lib/adle/homophone/guided-snapshot-validation";
import assert from "node:assert/strict";
import {buildApprovedContextualContent} from "../lib/adle/homophone/approved-contextual-content";
import {compileConvergenceAssignment, validateFrozenConvergenceAssignment} from "../lib/adle/homophone/convergence-assignment";
import {fullHomophonePassage} from "../lib/adle/homophone/lesson";
import {fingerprintSnapshotValue} from "../lib/adle/composable-lesson/canonical-fingerprint";
import source from "../data/adle/homophone/convergence-v1/approved-lesson-content.json";
const skill="D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT";
const lesson=source.lessons.find(row=>row.microSkillKey===skill)!;
const ids=["00000000-0000-4000-8000-000000000011","00000000-0000-4000-8000-000000000012"];
const content=buildApprovedContextualContent(skill,lesson.sets.map(set=>({setId:set.setKey+"@1",setKey:set.setKey,
  microSkillKey:skill,revision:1,semanticFingerprint:"a".repeat(64),reviewStatus:"approved",relationKind:set.relationKind as "confusable",
  members:set.members.map((m,i)=>({canonicalWordId:ids[i],word:m.word,intendedSense:m.intendedSense,
    grammaticalRole:m.grammaticalRole,teachingSentence:m.teachingSentence}))})));
const legacy=compileConvergenceAssignment({content,queuedItems:[{canonicalWordId:ids[0],status:"pending",intakeOn:"2026-11-19"}],masteredWordIds:new Set(),rotationIndex:0})!;
assert(validateFrozenConvergenceAssignment(legacy));
const sentences=["I will accept the invitation to your party.","Everyone except Sam brought a blue bag."];
content.sets=content.sets.map(set=>({...set,members:set.members.map((member,i)=>({...member,
  intendedSense:i===0?"To agree to take something that is offered.":"Not including someone or something.",teachingSentence:sentences[i]}))}));
content.dictionaryFacts=content.sets.flatMap(set=>set.members).map((m,i)=>({wordId:m.canonicalWordId,senseId:"chosen",
  sense:{id:"chosen",definition:m.intendedSense,partOfSpeech:m.grammaticalRole,pronunciationId:"uk",dictationSentence:sentences[i]},
  pronunciation:{id:"uk",ipa:"/test/",spokenSyllableCount:2,stressPattern:"unstressed-primary"},
  parts:[],joins:[],transformations:[],wordSum:m.word,dictationAuthorityId:ids[i],dictationSourceHash:"a".repeat(64)}));
const next=compileConvergenceAssignment({content,queuedItems:[{canonicalWordId:ids[0],status:"pending",intakeOn:"2026-11-19"}],masteredWordIds:new Set(),rotationIndex:0})!;
assert(validateFrozenConvergenceAssignment(next));
assert.deepEqual(guidedSnapshotIssues(next.guidedLesson,true),[]);
assert(guidedSnapshotIssues(next.guidedLesson).includes("content_version_mismatch"),"Retained lessons keep their strict original authority");
const wrongActivities=structuredClone(next.guidedLesson);wrongActivities.activities=[];
assert(guidedSnapshotIssues(wrongActivities,true).includes("activity_contract_mismatch"));
for(const member of content.sets.flatMap(set=>set.members)){
  assert.equal(next.guidedLesson.lesson.teachingGroups?.flatMap(g=>g.words).find(w=>w.word===member.word)?.definition,member.intendedSense);
  assert.equal(next.guidedLesson.lesson.words.find(w=>w.word===member.word)?.memoryCue,member.intendedSense);
  assert(next.guidedLesson.lesson.dictationPassages.some(p=>fullHomophonePassage(p).includes(member.teachingSentence)));
}
assert.notEqual(next.sourceFingerprint,legacy.sourceFingerprint);
assert.equal(fingerprintSnapshotValue(next.contextCheck.questions),fingerprintSnapshotValue(legacy.contextCheck.questions),"Independent authored questions remain reviewed lesson content");
const invalid=structuredClone(content);invalid.sets[0].members[0].teachingSentence="No target word here.";
assert.throws(()=>compileConvergenceAssignment({content:invalid,queuedItems:[{canonicalWordId:ids[0],status:"pending",intakeOn:"2026-11-19"}],masteredWordIds:new Set(),rotationIndex:0}),/sentence_target_invalid/);
console.log({canonicalMeaningInTeaching:true,canonicalSentenceInDictation:true,reviewedPracticeQuestionsPreserved:true,legacyUnchanged:true,missingTargetRejected:true});
