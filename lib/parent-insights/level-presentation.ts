import type { InsightLevel, InsightSkill } from "./proficiency";

export function proficiencyLevelNumbers(skills: readonly InsightSkill[]) {
  return [...new Set(skills.flatMap((skill) => skill.levels.map((level) => level.level)))].sort((a, b) => a - b);
}

export function selectedProficiencyLevel(skills: readonly InsightSkill[], skillKey: string, levelNumber: number) {
  const skill = skills.find((item) => item.key === skillKey) ?? null;
  const level = skill?.levels.find((item) => item.level === levelNumber && item.populated) ?? null;
  return skill && level ? { skill, level } : null;
}

export function evidenceStage(state: string) {
  return state === "review_retired" ? "secure" : state;
}

const stageRank: Record<string, number> = { mastered: 5, secure: 4, review_retired: 4, produced: 3, active: 2, unseen: 1 };

export function sortedLevelWords(level: InsightLevel) {
  return [...level.words].sort((a, b) =>
    (stageRank[b.state] ?? 0) - (stageRank[a.state] ?? 0) || a.word.localeCompare(b.word),
  );
}
