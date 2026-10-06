import type { InsightSkill } from "./proficiency";

export function averageAchievedLevel(skills: readonly InsightSkill[]) {
  const reportable = skills.filter((skill) => skill.firstPopulatedLevel !== null);
  if (!reportable.length) return null;
  return {
    average: reportable.reduce((sum, skill) => sum + (skill.achievedLevel ?? 0), 0) / reportable.length,
    count: reportable.length,
  };
}

export function familyAverages(skills: readonly InsightSkill[]) {
  const groups = new Map<string, InsightSkill[]>();
  for (const skill of skills) {
    const group = groups.get(skill.familyKey) ?? [];
    group.push(skill);
    groups.set(skill.familyKey, group);
  }
  return [...groups.entries()].flatMap(([familyKey, members]) => {
    const result = averageAchievedLevel(members);
    if (!result) return [];
    const first = members.find((skill) => skill.firstPopulatedLevel !== null)!;
    return [{ familyKey, familyLabel: first.familyLabel, ...result,
      policyVersion: first.policyVersion, bandingVersion: first.bandingVersion }];
  }).sort((a, b) => a.familyLabel.localeCompare(b.familyLabel));
}
