import { LEARNER_EVIDENCE_SOURCE_KINDS, type LearnerEvidenceProjectionResult } from "./contracts";

export function formatLearnerEvidenceReconciliationReport(
  result: LearnerEvidenceProjectionResult,
  label: string,
): string {
  const reconciliation = result.reconciliation;
  const lines = [
    "# ADLE Phase C learner-evidence reconciliation",
    "",
    `Source: ${label}`,
    `Interpretation: \`${reconciliation.interpretationVersion}\``,
    `Source fingerprint: \`${reconciliation.sourceFingerprint}\``,
    `Normalized event fingerprint: \`${reconciliation.eventFingerprint}\``,
    `Projection fingerprint: \`${reconciliation.projectionFingerprint}\``,
    "",
    "## Source adapter decisions",
    "",
    "| Source | Raw | Admitted representations | Excluded | Blocked | Ambiguous | Duplicate representations collapsed |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const source of LEARNER_EVIDENCE_SOURCE_KINDS) {
    const count = reconciliation.sourceCounts[source];
    lines.push(`| ${source} | ${count.sourceRows} | ${count.admitted} | ${count.excluded} | ${count.blocked} | ${count.ambiguous} | ${count.duplicateRepresentationsCollapsed} |`);
  }
  lines.push(
    "",
    "## Normalized stream",
    "",
    `- Raw candidate rows: ${reconciliation.rawCandidateSourceRowCount}`,
    `- Admitted source events: ${reconciliation.admittedSourceEventCount}`,
    `- Duplicate representations collapsed: ${reconciliation.duplicateRepresentationsCollapsedCount}`,
    `- Normalized unique learner word events: ${reconciliation.normalizedUniqueEventCount}`,
    `- Excluded / blocked / ambiguous: ${reconciliation.excludedCount} / ${reconciliation.blockedCount} / ${reconciliation.ambiguousCount}`,
    `- Environments: controlled ${reconciliation.environmentCounts.CONTROLLED_LESSON}; isolated ${reconciliation.environmentCounts.ISOLATED_RETRIEVAL}; contextual ${reconciliation.environmentCounts.CONTEXTUAL_TRANSFER}; authentic ${reconciliation.environmentCounts.AUTHENTIC_WRITING}; repair ${reconciliation.environmentCounts.REPAIR}; exposure ${reconciliation.environmentCounts.EXPOSURE_ONLY}`,
    `- Outcomes: correct ${reconciliation.outcomeCounts.correct}; incorrect ${reconciliation.outcomeCounts.incorrect}; unknown ${reconciliation.outcomeCounts.unknown}`,
    `- Verification: verified ${reconciliation.verificationCounts.verified}; suspected ${reconciliation.verificationCounts.suspected}; rejected ${reconciliation.verificationCounts.rejected}`,
    "",
    "## Skill projections",
    "",
    `- Positive projections: ${reconciliation.positiveSkillProjectionCount}`,
    `- Causal negative projections: ${reconciliation.causalNegativeProjectionCount}`,
    `- Multi-skill positive events: ${reconciliation.multiSkillPositiveEventCount}`,
    `- Prompted Review rows named authentic but classified contextual: ${reconciliation.promptedReviewNamedAuthenticButContextualCount}`,
    `- Specialist-only projections: ${reconciliation.specialistOnlyProjectionCount}`,
    `- Resolver-only projections: ${reconciliation.resolverOnlyProjectionCount}`,
    `- Phase B blocked relationships encountered: ${reconciliation.blockedRelationshipEncounterCount}`,
    "",
    `No-schema projection sufficient: ${reconciliation.noSchemaSufficient ? "YES" : "NO"}`,
  );
  const reasonCounts = new Map<string, number>();
  for (const decision of result.decisions) {
    const key = `${decision.disposition}:${decision.reason}`;
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  lines.push("", "## Decision reasons", "");
  for (const [key, count] of [...reasonCounts.entries()].sort()) lines.push(`- ${key}: ${count}`);
  return lines.join("\n");
}
