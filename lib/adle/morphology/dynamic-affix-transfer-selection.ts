import { extractAuthoredTargetToken } from "./payload";
import { getSharedAffixProfileMapping } from "./shared-affix-profile-registry";
import type {
  DynamicAffixProfile,
  DynamicAffixWord,
} from "./affix-word-lab";

/**
 * Profiles govern membership and pedagogy; this policy ranks every reviewed,
 * route-ready member without treating relation order as curriculum data.
 */
export const DYNAMIC_AFFIX_TRANSFER_SELECTION_POLICY_VERSION =
  "dynamic_affix_transfer_selection_v1" as const;

export type DynamicAffixTransferSelectionBlockerCode =
  | "profile_mapping_missing"
  | "candidate_not_transfer_eligible"
  | "candidate_form_not_declared"
  | "candidate_meaning_group_not_declared"
  | "candidate_lesson_facts_incomplete"
  | "duplicate_semantic_candidate"
  | "insufficient_transfer_candidates";

export type DynamicAffixTransferSelectionResult =
  | {
      ok: true;
      candidates: readonly DynamicAffixWord[];
      selected: readonly DynamicAffixWord[];
      exclusions: readonly {
        semanticWordKey: string;
        blockerCode: DynamicAffixTransferSelectionBlockerCode;
      }[];
    }
  | { ok: false; blockerCode: DynamicAffixTransferSelectionBlockerCode };

/** Stable en-GB curriculum identity; never use an environment-local UUID here. */
export function dynamicAffixSemanticWordKey(word: DynamicAffixWord): string {
  return word.displayWord.normalize("NFKC").toLowerCase();
}

function teachingStrategy(word: DynamicAffixWord): "direct" | "changed" {
  return word.teachingBaseText === word.semanticBaseText ? "direct" : "changed";
}

/** Exact readiness needed by either unchanged V3 compiler after selection. */
export function isDynamicAffixWordLessonReady(
  profile: DynamicAffixProfile,
  word: DynamicAffixWord,
): boolean {
  const mapping = getSharedAffixProfileMapping(profile.microSkillKey);
  const expected = profile.position === "before"
    ? `${word.affixVariant}${word.teachingBaseText}`
    : `${word.teachingBaseText}${word.affixVariant}`;
  const splitPoint = profile.position === "before"
    ? word.affixVariant.length
    : word.teachingBaseText.length;
  return Boolean(
    mapping
    && mapping.routeId === "dynamic_affix_word_lab"
    && mapping.position === profile.position
    && mapping.forms.includes(word.affixVariant)
    && profile.meaningBins.some((bin) => bin.id === word.effect)
    && word.displayWord
    && word.semanticBaseText
    && word.teachingBaseText
    && word.affixVariant
    && expected === word.displayWord
    && word.parts.length >= 2
    && word.joins.length === word.parts.length - 1
    && word.parts.map((part) => part.text).join("") === word.displayWord
    && word.splitPoints.length === 1
    && word.splitPoints[0] === splitPoint
    && splitPoint > 0
    && splitPoint < word.displayWord.length
    && word.audioText === word.dictationSentence
    && extractAuthoredTargetToken(
      word.dictationSentence,
      word.dictationTargetTokenIndex,
    ) === word.displayWord
    && word.trueMorphology.parts.length >= 2
    && word.trueMorphology.joins.length === word.trueMorphology.parts.length - 1
    && word.trueMorphology.parts.map((part) => part.text).join("") === word.displayWord
    && Array.isArray(word.trueMorphology.transformations)
    && word.trueMorphology.notes !== undefined
    && word.trueMorphology.provenance
    && Object.keys(word.trueMorphology.provenance).length > 0
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function curriculumRank(
  profile: DynamicAffixProfile,
  word: DynamicAffixWord,
): readonly [number, number, number, string] {
  const mapping = getSharedAffixProfileMapping(profile.microSkillKey)!;
  const formIndex = mapping.forms.indexOf(word.affixVariant);
  const meaningIndex = profile.meaningBins.findIndex((bin) => bin.id === word.effect);
  return [
    formIndex < 0 ? Number.MAX_SAFE_INTEGER : formIndex,
    meaningIndex < 0 ? Number.MAX_SAFE_INTEGER : meaningIndex,
    teachingStrategy(word) === "direct" ? 0 : 1,
    dynamicAffixSemanticWordKey(word),
  ];
}

function compareCurriculumRank(
  profile: DynamicAffixProfile,
  left: DynamicAffixWord,
  right: DynamicAffixWord,
): number {
  const a = curriculumRank(profile, left);
  const b = curriculumRank(profile, right);
  return a[0] - b[0]
    || a[1] - b[1]
    || a[2] - b[2]
    || compareText(a[3], b[3]);
}

export function eligibleDynamicAffixTransferCandidates(
  profile: DynamicAffixProfile,
  usedCanonicalWordIds: ReadonlySet<string>,
): DynamicAffixTransferSelectionResult {
  const mapping = getSharedAffixProfileMapping(profile.microSkillKey);
  if (!mapping || mapping.routeId !== "dynamic_affix_word_lab") {
    return { ok: false, blockerCode: "profile_mapping_missing" };
  }
  const candidates: DynamicAffixWord[] = [];
  const exclusions: Array<{
    semanticWordKey: string;
    blockerCode: DynamicAffixTransferSelectionBlockerCode;
  }> = [];
  for (const word of profile.wordsByCanonicalId.values()) {
    if (usedCanonicalWordIds.has(word.canonicalWordId)) continue;
    const blockerCode = !word.approvedTransfer
      ? "candidate_not_transfer_eligible" as const
      : !mapping.forms.includes(word.affixVariant)
        ? "candidate_form_not_declared" as const
        : !profile.meaningBins.some((bin) => bin.id === word.effect)
          ? "candidate_meaning_group_not_declared" as const
          : !isDynamicAffixWordLessonReady(profile, word)
            ? "candidate_lesson_facts_incomplete" as const
            : null;
    if (blockerCode) {
      exclusions.push({ semanticWordKey: dynamicAffixSemanticWordKey(word), blockerCode });
    } else {
      candidates.push(word);
    }
  }
  candidates.sort((left, right) => compareCurriculumRank(profile, left, right));
  const semanticKeys = candidates.map(dynamicAffixSemanticWordKey);
  if (new Set(semanticKeys).size !== semanticKeys.length) {
    return { ok: false, blockerCode: "duplicate_semantic_candidate" };
  }
  return { ok: true, candidates, selected: [], exclusions };
}

function coverageState(words: readonly DynamicAffixWord[]) {
  return {
    forms: new Set(words.map((word) => word.affixVariant)),
    meanings: new Set(words.map((word) => word.effect)),
    strategies: new Set(words.map(teachingStrategy)),
  };
}

function coverageGain(
  profile: DynamicAffixProfile,
  candidate: DynamicAffixWord,
  selectedWords: readonly DynamicAffixWord[],
  pool: readonly DynamicAffixWord[],
): readonly [number, number, number] {
  const mapping = getSharedAffixProfileMapping(profile.microSkillKey)!;
  const covered = coverageState(selectedWords);
  const availableStrategies = new Set(pool.map(teachingStrategy));
  const requiresStrategyContrast = mapping.forms.length === 1
    && availableStrategies.has("direct")
    && availableStrategies.has("changed");
  return [
    mapping.forms.length > 1 && !covered.forms.has(candidate.affixVariant) ? 1 : 0,
    profile.includeMeaningSort && !covered.meanings.has(candidate.effect) ? 1 : 0,
    requiresStrategyContrast && !covered.strategies.has(teachingStrategy(candidate)) ? 1 : 0,
  ];
}

/**
 * Greedy coverage is evaluated before the stable curriculum rank. The final
 * selected order is the algorithm's order and is therefore lesson semantics.
 */
export function selectDynamicAffixTransfers(params: {
  profile: DynamicAffixProfile;
  authenticWords: readonly DynamicAffixWord[];
  count: number;
}): DynamicAffixTransferSelectionResult {
  if (params.count === 0) return { ok: true, candidates: [], selected: [], exclusions: [] };
  const used = new Set(params.authenticWords.map((word) => word.canonicalWordId));
  const eligible = eligibleDynamicAffixTransferCandidates(params.profile, used);
  if (!eligible.ok) return eligible;
  const remaining = [...eligible.candidates];
  const selected: DynamicAffixWord[] = [];
  while (selected.length < params.count && remaining.length > 0) {
    const lessonSoFar = [...params.authenticWords, ...selected];
    remaining.sort((left, right) => {
      const a = coverageGain(params.profile, left, lessonSoFar, eligible.candidates);
      const b = coverageGain(params.profile, right, lessonSoFar, eligible.candidates);
      return b[0] - a[0]
        || b[1] - a[1]
        || b[2] - a[2]
        || compareCurriculumRank(params.profile, left, right);
    });
    selected.push(remaining.shift()!);
  }
  return selected.length === params.count
    ? { ok: true, candidates: eligible.candidates, selected, exclusions: eligible.exclusions }
    : { ok: false, blockerCode: "insufficient_transfer_candidates" };
}
