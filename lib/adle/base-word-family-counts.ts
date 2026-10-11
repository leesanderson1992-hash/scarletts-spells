import type { ActivatedBaseWordReleaseAuthority, BaseWordFamilyAuthorityProjection } from "./curriculum-release-activation";
import { baseWordFamilyMemberAppliesToMicroSkill } from "./curriculum-release-activation";

export interface EligibleFamilyCount {
  baseFamilyKey: string;
  eligibleWordIds: ReadonlySet<string>;
  eligibleCount: number;
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
): EligibleFamilyCount[] {
  return authority.families.map((family) => {
    const eligibleWordIds = new Set(family.members.filter((member) =>
      member.assignmentEligible && closureWordIds.has(member.canonicalWordId) &&
      baseWordFamilyMemberAppliesToMicroSkill(authority, member, microSkillKey),
    ).map((member) => member.canonicalWordId));
    return { baseFamilyKey: family.baseFamilyKey, eligibleWordIds, eligibleCount: eligibleWordIds.size };
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
