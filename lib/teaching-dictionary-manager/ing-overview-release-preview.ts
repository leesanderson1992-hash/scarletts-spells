import { ING_MICRO_SKILLS, type IngDictionaryWordV1, type IngMicroSkill } from "@/lib/adle/ing/contracts";
import { buildIngReleasePackage, type IngReleasePackageV1 } from "@/lib/adle/ing/release";

export type IngOverviewReleasePreview =
  | { status: "needs_words"; package: null; counts: Record<IngMicroSkill, number>;
      missing: { skill: IngMicroSkill; count: number }[] }
  | { status: "ready"; package: IngReleasePackageV1; counts: Record<IngMicroSkill, number>;
      missing: [] };

/** Build an inactive package only when every rule has a complete reviewed pool.
 * This is a read-only preflight; publication and activation have separate gates. */
export function previewIngOverviewRelease(words: readonly IngDictionaryWordV1[], releaseKey: string): IngOverviewReleasePreview {
  const counts = Object.fromEntries(ING_MICRO_SKILLS.map(skill =>
    [skill, words.filter(word => word.microSkillKey === skill).length])) as Record<IngMicroSkill, number>;
  const missing = ING_MICRO_SKILLS.flatMap(skill => counts[skill] < 6
    ? [{ skill, count: 6 - counts[skill] }] : []);
  if (missing.length) return { status: "needs_words", package: null, counts, missing };
  const approvalRefs = [...new Set(words.map(word => word.approvalRef).filter((ref): ref is string => Boolean(ref)))];
  return { status: "ready", package: buildIngReleasePackage(words, releaseKey, approvalRefs), counts, missing: [] };
}
