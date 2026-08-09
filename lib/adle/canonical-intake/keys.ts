export function canonicalWordSkillPair(
  canonicalWordId: string,
  microSkillKey: string,
): string {
  return `${canonicalWordId}\u0000${microSkillKey}`;
}
