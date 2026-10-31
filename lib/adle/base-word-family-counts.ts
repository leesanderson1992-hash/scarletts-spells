import type { ActivatedBaseWordReleaseAuthority, BaseWordFamilyAuthorityProjection } from "./curriculum-release-activation";
import { baseWordFamilyMemberAppliesToMicroSkill, baseWordFamilyMemberStructuralRole } from "./curriculum-release-activation";
import { baseWordMemberSelectable } from "./base-word-regularity";

export interface EligibleFamilyCount {
  baseFamilyKey: string;
  eligibleWordIds: ReadonlySet<string>;
  eligibleCount: number;
  regularityExclusions: readonly { canonicalWordId: string; status: "irregular" | "needs_review"; source: string; reason: string }[];
}

const releaseCountIndex = new Map<string, readonly EligibleFamilyCount[]>();
const MAX_INDEXED_RELEASES = 128;

/** Immutable authority IDs make this index safe to reuse across lesson reads
 * in a server process. New activation revisions receive their own entry. */
export function indexedEligibleBaseFamilyCounts(
  activation: ActivatedBaseWordReleaseAuthority,
): readonly EligibleFamilyCount[] {
  const key = [activation.releaseManifestId, activation.microSkillKey,
    activation.familyAuthorityId, activation.dictionaryClosureAuthorityId].join(":");
  const existing = releaseCountIndex.get(key);
  if (existing) return existing;
  const counts = eligibleBaseFamilyCounts(activation.family, activation.microSkillKey,
    new Set(activation.dictionaryWords.map((word) => word.canonicalWordId)));
  if (releaseCountIndex.size >= MAX_INDEXED_RELEASES)
    releaseCountIndex.delete(releaseCountIndex.keys().next().value!);
  releaseCountIndex.set(key, counts);
  return counts;
}

/** Read-side index of the exact immutable release. Counts are distinct words,
 * scoped to one skill and its frozen dictionary closure. */
export function eligibleBaseFamilyCounts(
  authority: BaseWordFamilyAuthorityProjection,
  microSkillKey: string,
  closureWordIds: ReadonlySet<string>,
  excludedWordIds: ReadonlySet<string> = new Set(),
): EligibleFamilyCount[] {
  return authority.families.map((family) => {
    const regularityExclusions = authority.schemaVersion === 2 && authority.selectionPolicyVersion === "base_word_regularity_v1"
      ? family.members.flatMap((member) => member.lessonRegularity?.status === "irregular" || member.lessonRegularity?.status === "needs_review"
        ? [{ canonicalWordId: member.canonicalWordId, status: member.lessonRegularity.status,
          source: member.lessonRegularity.source, reason: member.lessonRegularity.reason }]
        : []) : [];
    const eligibleWordIds = new Set(family.members.filter((member) =>
      baseWordMemberSelectable(authority, member) && closureWordIds.has(member.canonicalWordId) &&
      (baseWordFamilyMemberStructuralRole(member) === "base" || !excludedWordIds.has(member.canonicalWordId)) &&
      baseWordFamilyMemberAppliesToMicroSkill(authority, member, microSkillKey),
    ).map((member) => member.canonicalWordId));
    return { baseFamilyKey: family.baseFamilyKey, eligibleWordIds, eligibleCount: eligibleWordIds.size, regularityExclusions };
  }).sort((a, b) => a.baseFamilyKey.localeCompare(b.baseFamilyKey));
}

/** A cheap necessary condition for the six-word, two-family recipe. The
 * selector still decides learner, complexity, and content eligibility. */
export function shortlistBaseFamilyPairs(
  counts: readonly EligibleFamilyCount[],
  greaterThan = 1,
  lessonWordCount = 6,
): Array<readonly [string, string]> {
  const eligible = counts.filter((family) => family.eligibleCount > greaterThan);
  const pairs: Array<readonly [string, string]> = [];
  for (let left = 0; left < eligible.length; left += 1) {
    for (let right = left + 1; right < eligible.length; right += 1) {
      if (new Set([...eligible[left].eligibleWordIds, ...eligible[right].eligibleWordIds]).size >= lessonWordCount)
        pairs.push([eligible[left].baseFamilyKey, eligible[right].baseFamilyKey]);
    }
  }
  return pairs;
}

/** Explain families that are reviewed but cannot supply this recipe's six
 * distinct words with any other released family. */
export function unpairableBaseFamilyBlockers(
  counts: readonly EligibleFamilyCount[],
  pairs: readonly (readonly [string, string])[],
): string[] {
  const paired = new Set(pairs.flatMap(([left, right]) => [left, right]));
  return counts.filter((family) => family.eligibleCount > 1 && !paired.has(family.baseFamilyKey))
    .map((family) => `${family.baseFamilyKey} has ${family.eligibleCount} eligible words. This lesson needs six distinct words from two families; add approved family members or pair it with a larger family.`);
}
