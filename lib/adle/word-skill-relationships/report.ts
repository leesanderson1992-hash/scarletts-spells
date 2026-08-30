import "server-only";

import type { CanonicalWordSkillRelationshipReadResult } from "./contracts";

export function formatCanonicalWordSkillReconciliationReport(
  result: CanonicalWordSkillRelationshipReadResult,
  label: string,
): string {
  const { reconciliation } = result;
  const lines = [
    `# ADLE Phase B canonical word–skill reconciliation — ${label}`,
    "",
    `Authority interpretation: \`${reconciliation.authorityInterpretationVersion}\``,
    `Source fingerprint: \`${reconciliation.sourceFingerprint}\``,
    "",
    "## Summary",
    "",
    `- Source rows: ${reconciliation.sourceRowCount}`,
    `- Admitted provenance records: ${reconciliation.admittedProvenanceCount} (${reconciliation.admittedProvenanceOccurrenceCount} source occurrences)`,
    `- Deduplicated exact pairs: ${reconciliation.deduplicatedExactPairCount}`,
    `- Multi-provenance pairs: ${reconciliation.multiProvenancePairCount}`,
    `- Specialist-only pairs: ${reconciliation.specialistOnlyPairCount}`,
    `- Resolver-only pairs: ${reconciliation.resolverOnlyPairCount}`,
    `- Generic-support pairs: ${reconciliation.genericSupportPairCount}`,
    `- Explicit-reviewed pairs: ${reconciliation.explicitReviewedPairCount}`,
    `- Contrast-only exclusions: ${reconciliation.contrastOnlyExclusionCount}`,
    `- Inactive-skill exclusions: ${reconciliation.inactiveSkillExclusionCount}`,
    `- Unknown/unstable identities: ${reconciliation.unknownOrUnstableIdentityCount}`,
    `- Unreviewed/unreleased exclusions: ${reconciliation.unreviewedOrUnreleasedExclusionCount}`,
    `- Blocked facts: ${reconciliation.blockedFactCount}`,
    `- Ambiguous relationships: ${reconciliation.ambiguousRelationshipCount}`,
    `- No-schema authority sufficient: ${reconciliation.noSchemaSufficient ? "YES" : "NO"}`,
    "",
    "## Source counts",
    "",
    "| Authority | Rows | Admitted provenance | Occurrences | Excluded | Blocked | Ambiguous |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...Object.entries(reconciliation.sourceCounts).map(([authority, count]) =>
      `| ${authority} | ${count.sourceRows} | ${count.admittedProvenance} | ${count.admittedOccurrences} | ${count.excluded} | ${count.blocked} | ${count.ambiguous} |`),
    "",
    "## ADMITTED relationships",
    "",
    ...result.relationships.flatMap((relationship) => [
      `### \`${relationship.canonicalWordId}\` + \`${relationship.microSkillKey}\``,
      "",
      `Fingerprint: \`${relationship.authorityFingerprint}\``,
      "",
      ...relationship.sourceProvenance.map((provenance) =>
        `- ${provenance.sourceAuthority}: \`${provenance.provenanceId}\` @ \`${provenance.sourceAuthorityVersion}\` (occurrences: ${provenance.occurrenceCount})`),
      "",
    ]),
    "## EXCLUDED / BLOCKED / AMBIGUOUS facts",
    "",
    "| Status | Reason | Word | Skill | Source | Provenance | Version |",
    "|---|---|---|---|---|---|---|",
    ...result.decisions.filter((entry) => entry.disposition !== "ADMITTED").map((entry) =>
      `| ${entry.disposition} | ${entry.reason} | ${entry.canonicalWordId ?? "—"} | ${entry.microSkillKey ?? "—"} | ${entry.sourceAuthority} | ${entry.provenanceId ?? "—"} | ${entry.sourceAuthorityVersion ?? "—"} |`),
    "",
  ];
  return lines.join("\n");
}
