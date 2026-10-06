import type { InsightSkill } from "./proficiency";

export function familyAverages(skills: readonly InsightSkill[]) {
  const totals = new Map<string, { familyKey: string; familyLabel: string; total: number; count: number; policyVersion: string; bandingVersion: string }>();
  for (const skill of skills) {
    if (skill.firstPopulatedLevel === null) continue;
    const entry = totals.get(skill.familyKey) ?? {
      familyKey: skill.familyKey, familyLabel: skill.familyLabel, total: 0, count: 0,
      policyVersion: skill.policyVersion, bandingVersion: skill.bandingVersion,
    };
    entry.total += skill.achievedLevel ?? 0;
    entry.count += 1;
    totals.set(skill.familyKey, entry);
  }
  return [...totals.values()].map((entry) => ({
    familyKey: entry.familyKey,
    familyLabel: entry.familyLabel,
    average: entry.total / entry.count,
    count: entry.count,
    policyVersion: entry.policyVersion,
    bandingVersion: entry.bandingVersion,
  })).sort((a, b) => a.familyLabel.localeCompare(b.familyLabel));
}
