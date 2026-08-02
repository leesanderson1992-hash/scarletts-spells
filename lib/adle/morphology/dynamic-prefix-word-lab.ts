import {
  compareOldestItemFirst,
  selectableLearningItems,
  type LearningItemFact,
} from "../learning-items";
import {
  DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT,
  resolveDynamicPrefixFacts,
  type DynamicPrefixLessonPayloadV2,
  type DynamicPrefixProfile,
  type DynamicPrefixSelection,
  type DynamicPrefixWord,
} from "./dynamic-prefix-contracts";
import { compileDynamicPrefixWordLabDecision } from "./dynamic-prefix-compiler-rollout";

export * from "./dynamic-prefix-contracts";

/**
 * Version-two Prefix Word Lab selection. This remains deliberately fact-fed:
 * the review bridge supplies only verified authentic items and reviewed
 * profile content. It neither reads raw corrections nor creates items.
 */
function distinctAuthenticItems(
  items: readonly LearningItemFact[],
  profile: DynamicPrefixProfile,
): LearningItemFact[] {
  const seen = new Set<string>();
  return selectableLearningItems(items)
    .filter((item) =>
      item.microSkillKey === profile.microSkillKey
      && item.sourceKind === "verified_misspelling"
      && profile.wordsByCanonicalId.has(item.canonicalWordId),
    )
    .filter((item) =>
      seen.has(item.canonicalWordId)
        ? false
        : (seen.add(item.canonicalWordId), true),
    );
}

/**
 * Transfer words remain in their reviewed profile order, except that a mixed
 * profile first uses a still-unseen prefix form where one is available.
 */
function coverageFirstTransfers(
  profile: DynamicPrefixProfile,
  used: ReadonlySet<string>,
): DynamicPrefixWord[] {
  const candidates = profile.transferCanonicalWordIds
    .map((canonicalWordId) => profile.wordsByCanonicalId.get(canonicalWordId))
    .filter((word): word is DynamicPrefixWord => Boolean(
      word && word.approvedTransfer && !used.has(word.canonicalWordId),
    ));
  const seenForms = new Set(
    [...used]
      .map((canonicalWordId) => profile.wordsByCanonicalId.get(canonicalWordId))
      .map((word) => word && resolveDynamicPrefixFacts(word, profile)?.text)
      .filter((prefix): prefix is string => Boolean(prefix)),
  );
  const selected: DynamicPrefixWord[] = [];
  const remaining = [...candidates];
  while (remaining.length > 0) {
    const uncovered = remaining.find((word) => {
      const prefix = resolveDynamicPrefixFacts(word, profile)?.text;
      return Boolean(prefix && !seenForms.has(prefix));
    });
    const next = uncovered ?? remaining[0];
    selected.push(next);
    const prefix = resolveDynamicPrefixFacts(next, profile)?.text;
    if (prefix) seenForms.add(prefix);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return selected;
}

/** Select the largest distinct authentic queue, then reteach, age, and key. */
export function selectDynamicPrefixWordLab(params: {
  profiles: readonly DynamicPrefixProfile[];
  learningItems: readonly LearningItemFact[];
}): DynamicPrefixSelection | null {
  const candidates = params.profiles
    .filter((profile) => profile.productionEnabled)
    .map((profile) => ({
      profile,
      authentic: distinctAuthenticItems(params.learningItems, profile),
    }))
    .filter((candidate) => candidate.authentic.length > 0)
    .sort((left, right) => {
      if (left.authentic.length !== right.authentic.length) {
        return right.authentic.length - left.authentic.length;
      }
      const leftReteach = left.authentic.some((item) => item.reteachPriority);
      const rightReteach = right.authentic.some((item) => item.reteachPriority);
      if (leftReteach !== rightReteach) return leftReteach ? -1 : 1;
      const oldest = compareOldestItemFirst(left.authentic[0], right.authentic[0]);
      return oldest || left.profile.microSkillKey.localeCompare(right.profile.microSkillKey);
    });
  const selected = candidates[0];
  if (!selected) return null;
  const authenticTargets = selected.authentic.slice(0, DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT);
  const used = new Set(authenticTargets.map((item) => item.canonicalWordId));
  const transfers: DynamicPrefixWord[] = [];
  if (authenticTargets.length === DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT) {
    return { profile: selected.profile, authenticTargets, transfers };
  }
  for (const word of coverageFirstTransfers(selected.profile, used)) {
    if (used.has(word.canonicalWordId)) continue;
    transfers.push(word);
    used.add(word.canonicalWordId);
    if (authenticTargets.length + transfers.length === DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT) break;
  }
  return authenticTargets.length + transfers.length === DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    ? { profile: selected.profile, authenticTargets, transfers }
    : null;
}

/** Stable public compiler boundary. Detailed blockers are exposed by the decision API. */
export function compileDynamicPrefixWordLabPayload(
  selection: DynamicPrefixSelection,
): DynamicPrefixLessonPayloadV2 | null {
  const decision = compileDynamicPrefixWordLabDecision(selection);
  return decision.ok ? decision.payload : null;
}
