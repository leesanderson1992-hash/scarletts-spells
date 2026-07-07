/**
 * ADLE Slice 7a (7a-B): composer payload-enrichment regression — fixture-backed,
 * DB-independent.
 *
 * Covers the data the interactive activity renderer needs and the data-honest
 * Tier map:
 * - `deriveQuickSortBins` pure logic: concrete bins for single-family D4_SYL
 *   (by syllable count) and D4_SCHWA (by has_schwa); null (warm prompt) for
 *   mixed families, unsupported families, missing metadata, or absent facts.
 * - end-to-end review compose: REVIEW_QUICK_SORT carries childFacingCopy +
 *   concrete sortBins; production/reflection carry their instruction copy.
 * - end-to-end lesson compose: the read-only intro carries display-word
 *   previews (with provenance); guided steps carry childFacingCopy + purpose +
 *   teachingObjective (the Tier-C prompt-shell source); controlled/dictation
 *   production carry instruction copy.
 * - determinism: the same facts compose byte-identical plans.
 * - fail-open: absent word metadata leaves sortBins null (warm prompt).
 */

import { COMPOSER_POLICY_V1 } from "../lib/adle/composer-policy";
import { REVIEW_POLICY_V1, addDays, createReviewBundle } from "../lib/adle/review-scheduler";
import type { ReviewBundleFact, ScheduleWordFact } from "../lib/adle/review-scheduler";
import type { LearningItemFact } from "../lib/adle/learning-items";
import type { ComposerDictionaryFacts } from "../lib/adle/composer-word-selection";
import {
  composeDailyPlan,
  deriveQuickSortBins,
  type ActivityTemplateFact,
  type DailyPlanFacts,
  type FamilyMethodFact,
  type ReviewWordFact,
  type TeachingContentFact,
  type WordStructuralMetadata,
} from "../lib/adle/daily-assignment-composer";
import type {
  BandingVersionFact,
  ChildBandProfile,
  DictionaryWordFact,
  WordBandingFact,
  WordSupportFact,
} from "../lib/adle/dictionary-eligibility";
import { failClosedTaughtWordHistoryProvider } from "../lib/adle/dictionary-eligibility";
import {
  dictionaryWordFromRow,
  wordStructuralMetadataFromRow,
  type DictionaryWordRow,
  type WordStructuralMetadataRow,
} from "../lib/adle/loaders/rows";
import { isAttemptCorrect, normaliseSessionWord } from "../lib/adle/session-correctness";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const TODAY = "2026-07-05";
const CHILD = "child-1";
const policy = REVIEW_POLICY_V1;
const composerPolicy = COMPOSER_POLICY_V1;

const BANDING_VERSION: BandingVersionFact = {
  bandingVersion: "banding_v1.1_2026-07-04",
  isActive: true,
  levelCount: 3,
};
const CHILD_BAND: ChildBandProfile = {
  allowedFrequencyBands: ["high", "medium"],
  allowedAgeBands: ["ks1"],
};

const FAMILY_BY_SKILL = new Map<string, string>([
  ["SKILL_SYL_A", "D4_SYL"],
  ["SKILL_SCHWA_A", "D4_SCHWA"],
  ["SKILL_PG_A", "D4_PG"],
  ["SKILL_PAT_A", "D4_PAT"],
]);

const FAMILY_METHODS: FamilyMethodFact[] = [
  {
    familyKey: "D4_SYL",
    familyName: "Syllable/chunking",
    guidedQuestionSequence: ["SYL_SPLIT", "SYL_REBUILD", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(syllable/chunk)",
    productionTask: "Dictation_No_Image or Must_Use_Freewriting",
    rowStatus: "active",
  },
  {
    familyKey: "D4_SCHWA",
    familyName: "Schwa/weak vowels",
    guidedQuestionSequence: ["SCHWA_STRESS_MARK", "SCHWA_VOWEL_REVEAL", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(hidden vowel/anchor)",
    productionTask: "Dictation_No_Image or Must_Use_Freewriting",
    rowStatus: "active",
  },
  {
    familyKey: "D4_PG",
    familyName: "Phoneme-grapheme choices",
    guidedQuestionSequence: ["PG_SOUND_NOTICE", "PG_GRAPHEME_MAP", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(sound/spelling cue)",
    productionTask: "Dictation_No_Image or Must_Use_Freewriting",
    rowStatus: "active",
  },
  {
    familyKey: "D4_PAT",
    familyName: "Spelling patterns",
    guidedQuestionSequence: ["PAT_PATTERN_SPOT", "PAT_RULE_APPLY", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(rule/pattern)",
    productionTask: "Dictation_No_Image or Must_Use_Freewriting",
    rowStatus: "active",
  },
];

/** Distinct copy/purpose per template so payload flow-through is provable. */
function template(templateKey: string, overrides: Partial<ActivityTemplateFact> = {}): ActivityTemplateFact {
  return {
    templateKey,
    phase: "fixture",
    minWordsRequired: 1,
    requiresSentenceContext: false,
    requiresContrastWords: false,
    evidenceKind: "fixture",
    childFacingCopy: `COPY:${templateKey}`,
    purpose: `PURPOSE:${templateKey}`,
    childResponse: `RESPONSE:${templateKey}`,
    rowStatus: "active",
    ...overrides,
  };
}

const TEMPLATES: ActivityTemplateFact[] = [
  template("MICRO_READ_ONLY_INTRO"),
  template("LESSON_WORDS_INTRO"),
  template("PG_SOUND_NOTICE"),
  template("PG_GRAPHEME_MAP"),
  template("SYL_SPLIT"),
  template("SYL_REBUILD"),
  template("CONTROLLED_SPELLING"),
  template("DICTATION_NO_IMAGE"),
  template("REVIEW_QUICK_SORT", { minWordsRequired: 2 }),
  template("REVIEW_DICTATION"),
  template("ERROR_REFLECTION_CUE"),
  template("DIAGNOSTIC_DICTATION_PROBE"),
];

function teachingContent(skills: readonly string[]): Map<string, TeachingContentFact> {
  return new Map(
    skills.map((skill) => [
      skill,
      {
        microSkillKey: skill,
        teachingObjective: `objective ${skill}`,
        childFriendlyExplanation: `explanation ${skill}`,
        ruleExplanation: `rule ${skill}`,
        commonMisconceptions: `misconceptions ${skill}`,
      },
    ]),
  );
}

interface FixtureWordSpec {
  id: string;
  level: number;
  skills: readonly string[];
  /** True child-facing spelling; defaults to the normalised id. */
  displayWord?: string;
}
function buildDictionary(specs: readonly FixtureWordSpec[]): ComposerDictionaryFacts {
  const words: DictionaryWordFact[] = specs.map((spec) => ({
    canonicalWordId: spec.id,
    wordKey: `${spec.id}_key`,
    normalisedWord: spec.id.replace(/-/g, ""),
    displayWord: spec.displayWord ?? spec.id.replace(/-/g, ""),
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: "high",
    ageBand: "ks1",
  }));
  const supports: WordSupportFact[] = specs.flatMap((spec) =>
    spec.skills.map((skill) => ({
      canonicalWordId: spec.id,
      microSkillKey: skill,
      supportRole: "support_example" as const,
      rowStatus: "active" as const,
      reviewStatus: "approved_for_first_exposure" as const,
    })),
  );
  const bandings: WordBandingFact[] = specs.map((spec) => ({
    canonicalWordId: spec.id,
    bandingVersion: BANDING_VERSION.bandingVersion,
    structuralScore: spec.level,
    complexityLevel: spec.level,
    rowStatus: "active",
  }));
  return {
    words,
    supports,
    bandings,
    overrides: [],
    activeBandingVersion: BANDING_VERSION,
    activeTeachingSkillKeys: new Set(FAMILY_BY_SKILL.keys()),
  };
}

let itemCounter = 0;
function item(
  overrides: Partial<LearningItemFact> & Pick<LearningItemFact, "canonicalWordId" | "microSkillKey">,
): LearningItemFact {
  itemCounter += 1;
  return {
    learningItemId: `item-${String(itemCounter).padStart(3, "0")}`,
    childId: CHILD,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: `fixture:${itemCounter}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-06-20",
    rowStatus: "active",
    ...overrides,
  };
}

function dueBundle(
  bundleId: string,
  wordIds: readonly string[],
): { bundle: ReviewBundleFact; words: ScheduleWordFact[] } {
  const created = createReviewBundle(policy, {
    bundleId,
    childId: CHILD,
    sourceRef: `lesson:${bundleId}`,
    taughtOn: addDays(TODAY, -1),
    words: wordIds.map((canonicalWordId) => ({ canonicalWordId })),
  });
  return { bundle: created.bundle, words: created.words };
}

function reviewWordFacts(entries: readonly [string, string][]): Map<string, ReviewWordFact> {
  return new Map(
    entries.map(([canonicalWordId, microSkillKey]) => [
      canonicalWordId,
      { canonicalWordId, displayWord: canonicalWordId.replace(/-/g, ""), microSkillKey },
    ]),
  );
}

function metadata(
  entries: readonly (Partial<WordStructuralMetadata> & { canonicalWordId: string })[],
): Map<string, WordStructuralMetadata> {
  return new Map(
    entries.map((entry) => [
      entry.canonicalWordId,
      {
        canonicalWordId: entry.canonicalWordId,
        syllables: entry.syllables ?? null,
        hasSchwa: entry.hasSchwa ?? null,
        phonemeHint: entry.phonemeHint ?? null,
        stressPattern: entry.stressPattern ?? null,
      },
    ]),
  );
}

function planFacts(overrides: Partial<DailyPlanFacts>): DailyPlanFacts {
  return {
    childId: CHILD,
    reviewPolicy: policy,
    composerPolicy,
    bundles: [],
    scheduleWords: [],
    reviewWordFacts: new Map(),
    familyMethods: FAMILY_METHODS,
    activityTemplates: TEMPLATES,
    teachingContent: teachingContent([...FAMILY_BY_SKILL.keys()]),
    skillFamilyKeyBySkill: FAMILY_BY_SKILL,
    learningItems: [],
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
    dictionary: buildDictionary([]),
    childBand: CHILD_BAND,
    taughtHistory: failClosedTaughtWordHistoryProvider,
    probeRuns: [],
    probeMissWordIdsToday: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveQuickSortBins — pure, data-honest Tier map
// ---------------------------------------------------------------------------

{
  const sylBins = deriveQuickSortBins(
    [
      { canonicalWordId: "s1", familyKey: "D4_SYL", sortDimension: "syllable/chunk" },
      { canonicalWordId: "s2", familyKey: "D4_SYL", sortDimension: "syllable/chunk" },
      { canonicalWordId: "s3", familyKey: "D4_SYL", sortDimension: "syllable/chunk" },
    ],
    metadata([
      { canonicalWordId: "s1", syllables: "1" },
      { canonicalWordId: "s2", syllables: "2" },
      { canonicalWordId: "s3", syllables: "4" },
    ]),
  );
  assert(sylBins !== null, "single-family D4_SYL derives concrete bins");
  assert(sylBins?.dimensionLabel === "syllable/chunk", "syllable bins carry the dimension label");
  assert(sylBins?.bins.map((bin) => bin.key).join(",") === "1,2,3+", "syllable bins are 1 / 2 / 3+");
  assert(sylBins?.correctBinByWordId.s1 === "1", "1-syllable word bins to 1");
  assert(sylBins?.correctBinByWordId.s2 === "2", "2-syllable word bins to 2");
  assert(sylBins?.correctBinByWordId.s3 === "3+", "4-syllable word bins to 3+");
}

{
  const schwaBins = deriveQuickSortBins(
    [
      { canonicalWordId: "w1", familyKey: "D4_SCHWA", sortDimension: "hidden vowel/anchor" },
      { canonicalWordId: "w2", familyKey: "D4_SCHWA", sortDimension: "hidden vowel/anchor" },
    ],
    metadata([
      { canonicalWordId: "w1", hasSchwa: true },
      { canonicalWordId: "w2", hasSchwa: false },
    ]),
  );
  assert(schwaBins !== null, "single-family D4_SCHWA derives concrete bins");
  assert(schwaBins?.bins.map((bin) => bin.key).join(",") === "schwa,no_schwa", "schwa bins are schwa / no_schwa");
  assert(schwaBins?.correctBinByWordId.w1 === "schwa", "schwa word bins to schwa");
  assert(schwaBins?.correctBinByWordId.w2 === "no_schwa", "non-schwa word bins to no_schwa");
}

{
  const mixed = deriveQuickSortBins(
    [
      { canonicalWordId: "s1", familyKey: "D4_SYL", sortDimension: "syllable/chunk" },
      { canonicalWordId: "p1", familyKey: "D4_PG", sortDimension: "sound/spelling cue" },
    ],
    metadata([
      { canonicalWordId: "s1", syllables: "2" },
      { canonicalWordId: "p1", syllables: "2" },
    ]),
  );
  assert(mixed === null, "mixed-family session falls back to a warm prompt (null)");
}

{
  const unsupported = deriveQuickSortBins(
    [{ canonicalWordId: "p1", familyKey: "D4_PG", sortDimension: "sound/spelling cue" }],
    metadata([{ canonicalWordId: "p1", syllables: "2", hasSchwa: true }]),
  );
  assert(unsupported === null, "a family with no derivable scheme falls back to null");
}

{
  const missing = deriveQuickSortBins(
    [
      { canonicalWordId: "s1", familyKey: "D4_SYL", sortDimension: "syllable/chunk" },
      { canonicalWordId: "s2", familyKey: "D4_SYL", sortDimension: "syllable/chunk" },
    ],
    metadata([{ canonicalWordId: "s1", syllables: "2" }]),
  );
  assert(missing === null, "any word missing its count fails closed to null (no partial sort)");
  assert(deriveQuickSortBins([], undefined) === null, "no metadata facts -> null");
  assert(
    deriveQuickSortBins(
      [{ canonicalWordId: "s1", familyKey: "D4_SYL", sortDimension: "syllable/chunk" }],
      undefined,
    ) === null,
    "absent metadata map -> null",
  );
}

// ---------------------------------------------------------------------------
// End-to-end review compose: enriched quick-sort / production / reflection
// ---------------------------------------------------------------------------

{
  const wordIds = ["syl-1", "syl-2", "syl-3"];
  const { bundle, words } = dueBundle("bundle-syl", wordIds);
  const facts = planFacts({
    bundles: [bundle],
    scheduleWords: words,
    reviewWordFacts: reviewWordFacts(wordIds.map((id) => [id, "SKILL_SYL_A"])),
    wordMetadataByWordId: metadata([
      { canonicalWordId: "syl-1", syllables: "1" },
      { canonicalWordId: "syl-2", syllables: "3" },
      { canonicalWordId: "syl-3", syllables: "2" },
    ]),
  });
  const plan = composeDailyPlan(facts, TODAY);

  const quickSort = plan.partOne.sections.find((section) => section.sectionKey === "review_quick_sort");
  assert(quickSort !== undefined, "quick-sort composes for a due D4_SYL session");
  const sortPayload = quickSort!.items[0].payload as {
    childFacingCopy?: unknown;
    sortBins?: { bins: { key: string }[]; correctBinByWordId: Record<string, string> } | null;
  };
  assert(sortPayload.childFacingCopy === "COPY:REVIEW_QUICK_SORT", "quick-sort payload carries the instruction copy");
  assert(sortPayload.sortBins !== null && sortPayload.sortBins !== undefined, "single-family D4_SYL emits concrete bins");
  assert(
    sortPayload.sortBins!.bins.map((bin) => bin.key).join(",") === "1,2,3+",
    "composed quick-sort bins are the syllable scheme",
  );
  assert(sortPayload.sortBins!.correctBinByWordId["syl-2"] === "3+", "3-syllable word bins to 3+ in the composed plan");

  const production = plan.partOne.sections.find((section) => section.sectionKey === "review_production");
  assert(
    production?.items.every((entry) => entry.payload.childFacingCopy === "COPY:REVIEW_DICTATION"),
    "review production carries the dictation instruction copy",
  );

  const reflection = plan.partOne.sections.find((section) => section.sectionKey === "review_reflection");
  assert(
    reflection?.items.every(
      (entry) =>
        entry.payload.childFacingCopy === "COPY:ERROR_REFLECTION_CUE" &&
        typeof entry.payload.misconceptionHint === "string",
    ),
    "reflection carries instruction copy and the misconception hint",
  );

  // Determinism: same facts -> byte-identical plan.
  const replay = composeDailyPlan(
    planFacts({
      bundles: [bundle],
      scheduleWords: words,
      reviewWordFacts: reviewWordFacts(wordIds.map((id) => [id, "SKILL_SYL_A"])),
      wordMetadataByWordId: metadata([
        { canonicalWordId: "syl-1", syllables: "1" },
        { canonicalWordId: "syl-2", syllables: "3" },
        { canonicalWordId: "syl-3", syllables: "2" },
      ]),
    }),
    TODAY,
  );
  assert(JSON.stringify(plan) === JSON.stringify(replay), "enriched compose is byte-deterministic");
}

// ---------------------------------------------------------------------------
// Fail-open: absent word metadata -> warm-prompt quick sort (sortBins null)
// ---------------------------------------------------------------------------

{
  const wordIds = ["syl-a", "syl-b"];
  const { bundle, words } = dueBundle("bundle-syl-nometa", wordIds);
  const plan = composeDailyPlan(
    planFacts({
      bundles: [bundle],
      scheduleWords: words,
      reviewWordFacts: reviewWordFacts(wordIds.map((id) => [id, "SKILL_SYL_A"])),
      // no wordMetadataByWordId
    }),
    TODAY,
  );
  const quickSort = plan.partOne.sections.find((section) => section.sectionKey === "review_quick_sort");
  const sortPayload = quickSort!.items[0].payload as { sortBins?: unknown };
  assert(sortPayload.sortBins === null, "absent metadata -> sortBins null (warm prompt), never a broken sort");
}

// ---------------------------------------------------------------------------
// End-to-end lesson compose: enriched intro / guided / production payloads
// ---------------------------------------------------------------------------

{
  const dictionary = buildDictionary([
    { id: "wl-1", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wl-2", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wl-3", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wl-4", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wl-5", level: 1, skills: ["SKILL_PG_A"] },
  ]);
  const items = ["wl-1", "wl-2", "wl-3", "wl-4", "wl-5"].map((id, index) =>
    item({ canonicalWordId: id, microSkillKey: "SKILL_PG_A", intakeOn: addDays("2026-06-01", index) }),
  );
  const plan = composeDailyPlan(planFacts({ learningItems: items, dictionary }), TODAY);
  assert(plan.partTwo.composed, "lesson composes for the five-item D4_PG cluster");

  const intro = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_intro");
  const readOnly = intro?.items.find((entry) => entry.templateKey === "MICRO_READ_ONLY_INTRO");
  assert(readOnly !== undefined, "read-only intro composes");
  const introPayload = readOnly!.payload as {
    childFacingCopy?: unknown;
    lessonWordPreviews?: { canonicalWordId: string; displayWord: unknown; provenance: unknown }[];
  };
  assert(introPayload.childFacingCopy === "COPY:MICRO_READ_ONLY_INTRO", "intro carries its instruction copy");
  assert(
    introPayload.lessonWordPreviews?.length === 5 &&
      introPayload.lessonWordPreviews.every(
        (preview) => typeof preview.displayWord === "string" && typeof preview.provenance === "string",
      ),
    "intro carries display-word previews with provenance",
  );
  assert(
    introPayload.lessonWordPreviews?.some((preview) => preview.displayWord === "wl1"),
    "preview display words are the normalised words, not raw ids",
  );

  const guided = plan.partTwo.sections.find((section) => section.sectionKey === "guided_practice");
  const soundNotice = guided?.items.find((entry) => entry.templateKey === "PG_SOUND_NOTICE");
  assert(soundNotice !== undefined, "a guided step composes");
  assert(soundNotice!.payload.childFacingCopy === "COPY:PG_SOUND_NOTICE", "guided step carries its instruction copy");
  assert(soundNotice!.payload.purpose === "PURPOSE:PG_SOUND_NOTICE", "guided step carries its purpose (Tier-C source)");
  assert(soundNotice!.payload.teachingObjective === "objective SKILL_PG_A", "guided step carries the teaching objective");

  const controlled = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_production");
  assert(
    controlled?.items.every((entry) => entry.payload.childFacingCopy === "COPY:CONTROLLED_SPELLING"),
    "controlled spelling carries its instruction copy",
  );
  const dictation = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_dictation");
  assert(
    dictation?.items.every((entry) => entry.payload.childFacingCopy === "COPY:DICTATION_NO_IMAGE"),
    "lesson dictation carries its instruction copy",
  );
}

// ---------------------------------------------------------------------------
// DB row -> fact / metadata mapping (not just in-memory maps)
// ---------------------------------------------------------------------------

{
  // Dictionary row -> fact: display_word preserves casing/punctuation while
  // normalised_word stays the stripped identity; both survive the mapper.
  const row: DictionaryWordRow = {
    id: "cw-1",
    word_key: "mothers_day_key",
    normalised_word: "mothersday",
    display_word: "Mother's-Day",
    row_status: "active",
    review_status: "approved_for_first_exposure",
    frequency_band: "high",
    age_band: "ks1",
  };
  const fact = dictionaryWordFromRow(row);
  assert(fact.displayWord === "Mother's-Day", "row mapper preserves the true display word verbatim");
  assert(fact.normalisedWord === "mothersday", "row mapper keeps the normalised identity separate");

  // A null display_word coalesces to the normalised identity (never blank).
  const nullDisplay = dictionaryWordFromRow({ ...row, display_word: null });
  assert(nullDisplay.displayWord === "mothersday", "null display_word coalesces to the normalised identity");

  // Structural-metadata row -> fact: the fields that back interactions map
  // through; a phonetic string is carried as-is (display only).
  const metaFact = wordStructuralMetadataFromRow({
    canonical_word_id: "cw-1",
    syllables: "3",
    has_schwa: true,
    phoneme_hint: "/mˈʌðɚzdˌeɪ/",
    stress_pattern: "primary-unstressed-secondary",
  } satisfies WordStructuralMetadataRow);
  assert(metaFact.canonicalWordId === "cw-1", "metadata mapper keys on the canonical word id");
  assert(metaFact.syllables === "3" && metaFact.hasSchwa === true, "metadata mapper carries the interaction fields");
  assert(metaFact.phonemeHint === "/mˈʌðɚzdˌeɪ/", "metadata mapper carries the phonetic hint verbatim");
}

// ---------------------------------------------------------------------------
// Display-word preservation across every child-facing lesson payload
// ---------------------------------------------------------------------------

{
  const DISPLAY = "Mother's-Day"; // caps + apostrophe + hyphen
  const dictionary = buildDictionary([
    { id: "wd-1", level: 1, skills: ["SKILL_PG_A"], displayWord: DISPLAY },
    { id: "wd-2", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wd-3", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wd-4", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wd-5", level: 1, skills: ["SKILL_PG_A"] },
  ]);
  // The punctuated word intakes first so it lands in the guided set (guided runs
  // on the earliest lesson words), production, dictation, and the intro preview.
  const items = ["wd-1", "wd-2", "wd-3", "wd-4", "wd-5"].map((id, index) =>
    item({ canonicalWordId: id, microSkillKey: "SKILL_PG_A", intakeOn: addDays("2026-06-01", index) }),
  );
  const plan = composeDailyPlan(planFacts({ learningItems: items, dictionary }), TODAY);
  assert(plan.partTwo.composed, "preservation lesson composes");

  const sectionItemsFor = (sectionKey: string) =>
    plan.partTwo.sections.find((section) => section.sectionKey === sectionKey)?.items ?? [];

  // Intro preview carries the true display word.
  const intro = sectionItemsFor("lesson_intro").find((entry) => entry.templateKey === "MICRO_READ_ONLY_INTRO");
  const previews = (intro?.payload.lessonWordPreviews ?? []) as { canonicalWordId: string; displayWord: unknown }[];
  const introPreview = previews.find((preview) => preview.canonicalWordId === "wd-1");
  assert(introPreview?.displayWord === DISPLAY, "intro preview preserves apostrophes/hyphens/casing");

  // Guided, controlled production, and dictation all target the true display word.
  const guidedTarget = sectionItemsFor("guided_practice").find((entry) => entry.canonicalWordId === "wd-1");
  assert(guidedTarget?.targetWord === DISPLAY, "guided step targets the true display word");
  const productionTarget = sectionItemsFor("lesson_production").find((entry) => entry.canonicalWordId === "wd-1");
  assert(productionTarget?.targetWord === DISPLAY, "controlled production targets the true display word");
  const dictationTarget = sectionItemsFor("lesson_dictation").find((entry) => entry.canonicalWordId === "wd-1");
  assert(dictationTarget?.targetWord === DISPLAY, "lesson dictation targets the true display word");

  // Identity vs display never diverge under correctness: the normalised token
  // still matches an attempt typed without punctuation.
  assert(
    normaliseSessionWord(DISPLAY) === "mothersday",
    "display word normalises to the stripped identity for matching",
  );
  assert(
    isAttemptCorrect("mothersday", productionTarget?.targetWord ?? null),
    "a correctly-spelled attempt still matches the display-word target (no behaviour change)",
  );
}

console.log("adle-composer-payload-regression: all checks passed");
