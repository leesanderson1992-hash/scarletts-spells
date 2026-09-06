import assert from "node:assert/strict";
import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";
import { adaptExplicitReviewedAssociations } from "../lib/adle/word-skill-relationships/adapters";
import { publishedAssociationsToPhaseB, validateEnrichmentPackage, type EnrichmentCandidate } from "../lib/writing-engine/whole-writing/knowledge";
import { readWholeWritingShadowEvidence, type WholeWritingEvidenceFact } from "../lib/writing-engine/whole-writing/evidence";
import { wholeWritingCalibrationInputs } from "../lib/writing-engine/whole-writing/calibration";

const words = [{ canonicalWordId:"untaught-word",normalisedWord:"untaught",state:"active" as const,identityStable:true }];
const skills = ["skill-a","skill-b"].map((microSkillKey) => ({ microSkillKey,state:"active" as const,identityStable:true }));
const candidates: EnrichmentCandidate[] = skills.map((skill) => ({ canonicalWordId:"untaught-word",microSkillKey:skill.microSkillKey,relationshipRole:"demonstrates",sourceReference:"fixture",licenceReference:"original",method:"batch_ai_candidate" }));
assert.equal(validateEnrichmentPackage(candidates,new Set(["untaught-word"]),new Set(skills.map((s) => s.microSkillKey))).status,"AWAITING_HUMAN_REVIEW");
assert.equal(validateEnrichmentPackage([...candidates,candidates[0]],new Set(),new Set()).status,"INVALID");
const published = candidates.map((c,index) => ({ id:`pair-${index}`,release_id:"release",canonical_word_id:c.canonicalWordId,micro_skill_key:c.microSkillKey,relationship_role:c.relationshipRole,source_reference:c.sourceReference,licence_reference:c.licenceReference }));
const releases = new Map([["release",{ release_key:"reviewed-fixture",reviewed_by:"human" }]]);
const facts = adaptExplicitReviewedAssociations(publishedAssociationsToPhaseB(published,releases,new Set()));
const authority = readCanonicalWordSkillRelationships({ words,microSkills:skills,facts });
assert.equal(authority.relationships.length,2);
const withdrawn = readCanonicalWordSkillRelationships({ words,microSkills:skills,facts:adaptExplicitReviewedAssociations(publishedAssociationsToPhaseB(published,releases,new Set(["release"]))) });
assert.equal(withdrawn.relationships.length,0);
const occurrence: WholeWritingEvidenceFact = {
  occurrenceId:"original-span",assessmentId:"assessment-1",learnerId:"learner",occurredAt:"2026-09-01T10:00:00Z",
  canonicalWordId:"untaught-word",identityAuthority:"identity-release",fieldProvenance:"learner_response",
  outcome:"correct",independence:"independent",environment:"AUTHENTIC_WRITING",contextStatus:"VALID",
  verification:{ id:"exact-parent-review",verifiedAt:"2026-09-06T10:00:00Z",decision:"verified",scope:"exact_occurrence" },governedCausalSkillKeys:[],
};
const positive = readWholeWritingShadowEvidence([occurrence],authority);
assert.equal(positive.projections.length,2,"never-taught/non-Target word projects through existing Phase B/C");
assert.ok(positive.projections.every((p) => p.occurredAt===occurrence.occurredAt));
const remapped = readWholeWritingShadowEvidence([{...occurrence,assessmentId:"assessment-2"}],authority);
assert.equal(remapped.events[0].eventId,positive.events[0].eventId,"new assessment is not a new performance");
assert.equal(readWholeWritingShadowEvidence([{...occurrence,independence:"unknown"}],authority).events.length,0);
assert.equal(readWholeWritingShadowEvidence([{...occurrence,outcome:"unknown",verification:null}],authority).projections.length,0);
assert.equal(readWholeWritingShadowEvidence([{...occurrence,contextStatus:"INVALID"}],authority).projections.length,0);
assert.equal(readWholeWritingShadowEvidence([{...occurrence,contextStatus:"NOT_ASSESSED"}],authority).projections.length,0);
assert.equal(readWholeWritingShadowEvidence([{...occurrence,environment:"REPAIR"}],authority).projections.length,0);
assert.equal(readWholeWritingShadowEvidence([{...occurrence,independence:"answer_visible"}],authority).projections.length,0);
assert.equal(readWholeWritingShadowEvidence([{...occurrence,fieldProvenance:"unknown"}],authority).projections.length,0);
assert.equal(readWholeWritingShadowEvidence([{...occurrence,canonicalWordId:null}],authority).events.length,0);
const negative = readWholeWritingShadowEvidence([{...occurrence,outcome:"incorrect",governedCausalSkillKeys:["skill-a"]}],authority);
assert.deepEqual(negative.projections.map((p) => [p.microSkillKey,p.polarity]),[["skill-a","negative"]]);
const duplicate = readWholeWritingShadowEvidence([occurrence,{...occurrence,assessmentId:"mirror"}],authority);
assert.equal(duplicate.events.length,1);
const repeated = readWholeWritingShadowEvidence([occurrence,{...occurrence,occurrenceId:"another-span",assessmentId:"second"}],authority);
assert.equal(repeated.events.length,2,"distinct same-day spans remain available; no occurrence-count scoring");
const calibration=wholeWritingCalibrationInputs(repeated.projections);
assert.equal(calibration.length,2);
assert.equal(calibration[0].distinctWords.length,1);
assert.equal(calibration[0].observationDaysUTC.length,1);
assert.equal(calibration[0].authenticWords.length,1);
assert.equal(calibration[0].requiredWordPool,null,"demonstrated knowledge must not construct a required pool");
assert.equal(calibration[0].level,null);
console.log("Whole-writing evidence/knowledge regression passed: governed fan-out, causal negatives, unknown independence, repair exclusion and stable performance lineage.");
