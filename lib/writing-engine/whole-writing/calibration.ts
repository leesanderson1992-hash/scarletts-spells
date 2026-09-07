import type { LearnerSkillEvidenceProjection } from "../../adle/proficiency/evidence/contracts";

/** Mathematics §§6.1–6.4 input sets only. No requirements, level calculation,
 * recurrence interpretation, complexity-band allocation or pool eligibility.
 */
export function wholeWritingCalibrationInputs(projections: readonly LearnerSkillEvidenceProjection[]) {
  const profiles = new Map<string, { learnerId:string; microSkillKey:string; words:Set<string>; independent:Set<string>; contextual:Set<string>; authentic:Set<string>; days:Set<string>; sourceEvents:Set<string> }>();
  for (const projection of projections) {
    if (projection.polarity !== "positive" || projection.environment === "REPAIR" || projection.environment === "EXPOSURE_ONLY") continue;
    if (!Number.isFinite(Date.parse(projection.occurredAt))) throw new Error("CALIBRATION_OCCURRENCE_TIME_INVALID");
    const key = `${projection.learnerId}:${projection.microSkillKey}`;
    const row = profiles.get(key) ?? { learnerId:projection.learnerId,microSkillKey:projection.microSkillKey,words:new Set<string>(),independent:new Set<string>(),contextual:new Set<string>(),authentic:new Set<string>(),days:new Set<string>(),sourceEvents:new Set<string>() };
    row.words.add(projection.canonicalWordId);
    row.sourceEvents.add(projection.eventId);
    row.days.add(new Date(projection.occurredAt).toISOString().slice(0,10));
    if (["ISOLATED_RETRIEVAL","CONTEXTUAL_TRANSFER","AUTHENTIC_WRITING"].includes(projection.environment)) row.independent.add(projection.canonicalWordId);
    if (projection.environment === "CONTEXTUAL_TRANSFER") row.contextual.add(projection.canonicalWordId);
    if (projection.environment === "AUTHENTIC_WRITING") row.authentic.add(projection.canonicalWordId);
    profiles.set(key,row);
  }
  const sorted = (values:Set<string>) => [...values].sort();
  return [...profiles.values()].map((row) => ({
    learnerId:row.learnerId,microSkillKey:row.microSkillKey,distinctWords:sorted(row.words),
    independentWords:sorted(row.independent),contextualWords:sorted(row.contextual),authenticWords:sorted(row.authentic),
    observationDaysUTC:sorted(row.days),sourceEventIds:sorted(row.sourceEvents),
    requiredWordPool:null,representativeGroups:null,complexityBands:null,level:null,
    missingInputs:["GOVERNED_ELIGIBILITY_POOL","GOVERNED_REPRESENTATIVE_GROUPS","GOVERNED_COMPLEXITY_PROFILE","OWNER_APPROVED_REQUIREMENTS"],
  })).sort((a,b) => a.learnerId.localeCompare(b.learnerId) || a.microSkillKey.localeCompare(b.microSkillKey));
}
