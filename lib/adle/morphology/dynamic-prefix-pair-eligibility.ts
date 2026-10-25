import { canonicalPairKey } from "../word-skill-relationships/pair-key";
import type { DynamicPrefixProfile } from "./dynamic-prefix-word-lab";

/** Preserve reviewed profile order while removing pairs explicitly withdrawn
 * by the manager. The native selector retains authentic/transfer choice. */
export function excludeDeassignedDynamicPrefixWords(
  profiles: readonly DynamicPrefixProfile[],
  deassignedPairs: ReadonlySet<string>,
): DynamicPrefixProfile[] {
  if (deassignedPairs.size === 0) return [...profiles];
  return profiles.map((profile) => {
    const allowed = [...profile.wordsByCanonicalId.entries()].filter(([wordId]) =>
      !deassignedPairs.has(canonicalPairKey(wordId, profile.microSkillKey)));
    return {
      ...profile,
      wordsByCanonicalId: new Map(allowed),
      transferCanonicalWordIds: profile.transferCanonicalWordIds.filter((wordId) =>
        !deassignedPairs.has(canonicalPairKey(wordId, profile.microSkillKey))),
    };
  });
}
