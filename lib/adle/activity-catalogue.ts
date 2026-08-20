/**
 * Canonical architectural inventory of child-facing ADLE activities.
 *
 * This is deliberately descriptive. Runtime dispatch remains owned by
 * activity-template-registry.ts and the registered specialist route adapters.
 * Nothing in this module writes learner state or changes route activation.
 */

export type ActivityArchitecturalStatus =
  | "CANONICAL"
  | "CANONICAL_MODE"
  | "COMPATIBILITY_ONLY"
  | "DUPLICATE_TO_MIGRATE"
  | "DEAD_OR_UNREFERENCED"
  | "REQUIRES_ARCHITECTURE_DECISION";

export interface ActivityCatalogueEntry {
  activityKey: string;
  displayName: string;
  pedagogicalPurpose: string;
  interactionFamily: string;
  canonicalComponent: string | null;
  canonicalComponentPath: string | null;
  supportedModes: readonly string[];
  modeDescriptions: Readonly<Record<string, string>>;
  requiredInputs: readonly string[];
  optionalInputs: readonly string[];
  capturesAttempt: boolean;
  evidenceBearing: boolean;
  supportsPointer: boolean;
  supportsKeyboard: boolean;
  supportsReducedMotion: boolean;
  supportsAudio: boolean;
  usedByRoutes: readonly string[];
  usedByMicroSkills: readonly string[];
  firstImpressionEligible: boolean;
  reviewEligible: boolean;
  compatibilityImplementations: readonly string[];
  duplicateImplementations: readonly string[];
  templateKeys: readonly string[];
  status: ActivityArchitecturalStatus;
  whenToUse: string;
  whenNotToUse: string;
  notes: string;
}

export interface ActivityImplementationAuditRow {
  implementationName: string;
  filePath: string;
  activityConcept: string;
  interactionFamily: string;
  currentRouteUsages: readonly string[];
  currentMicroSkillUsages: readonly string[];
  registryTemplateKeys: readonly string[];
  propsConfigDifferences: string;
  visualDifferences: string;
  behaviouralDifferences: string;
  persistenceEvidenceDifferences: string;
  canonicalCandidate: string | null;
  classification: ActivityArchitecturalStatus;
  recommendedAction: string;
  migrationRisk: "low" | "medium" | "high";
  historicalReplayDependency: boolean;
  evidence: string;
  notes: string;
}

export interface ActivityConvergenceBacklogItem {
  priority: "P0" | "P1" | "P2";
  title: string;
  currentImplementations: readonly string[];
  targetCanonicalImplementation: string;
  intendedModes: readonly string[];
  routesAffected: readonly string[];
  regressionRequirements: readonly string[];
  learnerRuntimeRisk: "low" | "medium" | "high";
  modelCReleaseChangeRequired: boolean;
  consolidationOpportunity: string;
}

const GENERIC_ROUTE = "generic_composer:v1";
const PREFIX_ROUTES = ["dynamic_prefix_word_lab:v2", "fixed_un_prefix_word_lab:v1"] as const;
const AFFIX_ROUTE = "dynamic_affix_word_lab:v3";
const BASE_ROUTE = "base_word_lab:v2";
const COMPOUND_ROUTES = ["compound_word_lab:v2", "closed_compound_word_lab:v1"] as const;
const ALL_SPECIALIST_ROUTES = [...PREFIX_ROUTES, AFFIX_ROUTE, BASE_ROUTE, ...COMPOUND_ROUTES] as const;

const PREFIX_SKILLS = [
  "D4_MOR_PREFIXES_UN",
  "D4_MOR_PREFIXES_DIS_MIS",
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "D4_MOR_PREFIXES_RE_PRE",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
] as const;
const AFFIX_SKILLS = [
  "D4_MOR_SUFFIXES_ABLE_IBLE", "D4_MOR_SUFFIXES_AL", "D4_MOR_SUFFIXES_FUL_LESS",
  "D4_MOR_SUFFIXES_ITY", "D4_MOR_SUFFIXES_LY", "D4_MOR_SUFFIXES_MENT",
  "D4_MOR_SUFFIXES_NESS", "D4_MOR_SUFFIXES_OUS", "D4_MOR_SUFFIXES_SION",
  "D4_MOR_SUFFIXES_TION",
] as const;
const BASE_SKILLS = [
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_BASE_WORDS_PRESERVE_BASE",
] as const;
const COMPOUND_SKILLS = [
  "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
  "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
] as const;
const MORPHOLOGY_SKILLS = [...PREFIX_SKILLS, ...AFFIX_SKILLS, ...BASE_SKILLS, ...COMPOUND_SKILLS] as const;

function activity(
  input: Pick<ActivityCatalogueEntry,
    "activityKey" | "displayName" | "pedagogicalPurpose" | "interactionFamily" |
    "canonicalComponent" | "canonicalComponentPath" | "supportedModes" |
    "modeDescriptions" | "requiredInputs" | "usedByRoutes" | "usedByMicroSkills" |
    "status" | "whenToUse" | "whenNotToUse"> &
    Partial<Omit<ActivityCatalogueEntry,
      "activityKey" | "displayName" | "pedagogicalPurpose" | "interactionFamily" |
      "canonicalComponent" | "canonicalComponentPath" | "supportedModes" |
      "modeDescriptions" | "requiredInputs" | "usedByRoutes" | "usedByMicroSkills" |
      "status" | "whenToUse" | "whenNotToUse">>,
): ActivityCatalogueEntry {
  return {
    optionalInputs: [], capturesAttempt: false, evidenceBearing: false,
    supportsPointer: false, supportsKeyboard: true, supportsReducedMotion: true,
    supportsAudio: false, firstImpressionEligible: true, reviewEligible: false,
    compatibilityImplementations: [], duplicateImplementations: [], templateKeys: [], notes: "",
    ...input,
  };
}

export const ADLE_ACTIVITY_CATALOGUE_VERSION = "adle_activity_catalogue_v1" as const;

export const ADLE_ACTIVITY_CATALOGUE: readonly ActivityCatalogueEntry[] = [
  activity({
    activityKey: "INTRODUCTION", displayName: "Introduction", interactionFamily: "teaching_read",
    pedagogicalPurpose: "Introduce the rule, strategy, or concept before practice.",
    canonicalComponent: "IntroActivity", canonicalComponentPath: "components/adle/activities/intro-activity.tsx",
    supportedModes: ["rule_explanation", "lesson_words"], modeDescriptions: {
      rule_explanation: "Shows the teaching objective and explanation.",
      lesson_words: "Introduces the lesson-word set with provenance labels.",
    }, requiredInputs: ["teachingObjective or childFriendlyExplanation"], optionalInputs: ["ruleExplanation", "lessonWordPreviews"],
    usedByRoutes: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES], usedByMicroSkills: ["generic composer catalogue", ...MORPHOLOGY_SKILLS],
    templateKeys: ["MICRO_READ_ONLY_INTRO", "LESSON_WORDS_INTRO"], status: "CANONICAL",
    whenToUse: "At the start of a lesson to explain the idea or meet the lesson words.",
    whenNotToUse: "For multi-page authored reading; use READING_PAGE.",
    duplicateImplementations: ["LearnIntroduction", "BaseWordFamily Intro", "Compound inline intro"],
    notes: "Specialist routes currently render bespoke introductions and should converge through a future first-impression shell.",
  }),
  activity({
    activityKey: "READING_PAGE", displayName: "Reading page", interactionFamily: "teaching_read",
    pedagogicalPurpose: "Teach a concept through two or three ordered, child-readable pages.",
    canonicalComponent: "CompoundReadingPage", canonicalComponentPath: "components/adle/morphology/closed-compound-guided-lesson.tsx",
    supportedModes: ["ordered_pages"], modeDescriptions: { ordered_pages: "Back/next reading pages with examples and optional lesson-word reveal." },
    requiredInputs: ["ordered reading pages"], optionalInputs: ["examples", "lesson words"],
    usedByRoutes: ["compound_word_lab:v2"], usedByMicroSkills: [...COMPOUND_SKILLS], status: "REQUIRES_ARCHITECTURE_DECISION",
    whenToUse: "When the child needs substantial authored explanation before interaction.",
    whenNotToUse: "For a short rule card that fits INTRODUCTION.",
    notes: "The only implementation is embedded in Compound; extraction is required before it can be a platform activity.",
  }),
  activity({
    activityKey: "MEANING_DISCOVERY", displayName: "Meaning discovery", interactionFamily: "meaning_choice",
    pedagogicalPurpose: "Let the child observe how adding an affix changes meaning, then choose the new meaning.",
    canonicalComponent: "Discovery", canonicalComponentPath: "components/adle/morphology/morphology-guided-lesson.tsx",
    supportedModes: ["prefix", "suffix"], modeDescriptions: { prefix: "Add a prefix then choose the meaning.", suffix: "Add a suffix then choose the resulting meaning." },
    requiredInputs: ["base word", "derived word", "correct meaning", "distractor meaning"], optionalInputs: ["affix label"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...PREFIX_ROUTES, AFFIX_ROUTE], usedByMicroSkills: [...PREFIX_SKILLS, ...AFFIX_SKILLS],
    status: "CANONICAL", whenToUse: "To teach an affix's semantic effect before sorting or building.",
    whenNotToUse: "For matching several whole words to definitions; use MEANING_MATCH.",
  }),
  activity({
    activityKey: "WORD_FAMILY_REVEAL", displayName: "Word family reveal", interactionFamily: "teaching_reveal",
    pedagogicalPurpose: "Reveal related words around a stable base so the child sees a reusable spelling anchor.",
    canonicalComponent: "FamilyReveal", canonicalComponentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx",
    supportedModes: ["base_led_family"], modeDescriptions: { base_led_family: "Tap an authentic target to reveal its base and related words." },
    requiredInputs: ["base word", "family members", "meanings"], optionalInputs: ["authentic target provenance"],
    supportsPointer: true, usedByRoutes: [BASE_ROUTE], usedByMicroSkills: [...BASE_SKILLS], status: "CANONICAL",
    whenToUse: "When a familiar base anchors several related spellings.", whenNotToUse: "For assembling one target word; use WORD_ASSEMBLY.",
    notes: "The persisted MOR_BASE_FAMILY_REVEAL binding is route-specific and intentionally not in the generic runtime registry.",
  }),
  activity({
    activityKey: "CLEAVER", displayName: "Cleaver", interactionFamily: "boundary_split",
    pedagogicalPurpose: "Find one or more meaningful boundaries inside a written word.",
    canonicalComponent: "SplitHandle", canonicalComponentPath: "components/adle/activities/shared/split-handle.tsx",
    supportedModes: ["find_boundaries", "identify_components"], modeDescriptions: {
      find_boundaries: "Strike all governed split points, with optional two-miss scaffold.",
      identify_components: "After success, display supplied component strings and tailored explanation.",
    }, requiredInputs: ["word", "splitPoints"], optionalInputs: ["components", "feedback copy", "scaffold policy"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...PREFIX_ROUTES, AFFIX_ROUTE, BASE_ROUTE], usedByMicroSkills: [...PREFIX_SKILLS, ...AFFIX_SKILLS, ...BASE_SKILLS],
    templateKeys: ["MOR_STRIP_BUILD"], status: "CANONICAL", whenToUse: "To locate meaningful morpheme or word-part boundaries.",
    whenNotToUse: "To reorder parts into a word; use WORD_ASSEMBLY.", duplicateImplementations: ["BaseWordCleaver"],
    notes: "Target convergence adds isolate_base and final_y_restoration modes to SplitHandle; those are not current SplitHandle capabilities.",
  }),
  activity({
    activityKey: "WORD_ASSEMBLY", displayName: "Word assembly", interactionFamily: "tile_assembly",
    pedagogicalPurpose: "Build a word by selecting or dragging governed word-part tiles into order.",
    canonicalComponent: "DefinitionWordBuilder", canonicalComponentPath: "components/adle/activities/shared/definition-word-builder.tsx",
    supportedModes: ["definition_word_builder", "manual_check", "fixed_prefix", "fixed_suffix", "governed_joins"], modeDescriptions: {
      definition_word_builder: "Shows meaning first, then candidate parts, manual construction, word sum and resulting meaning.", manual_check: "Lets the child rearrange then check.",
      fixed_prefix: "Places immutable parts before the selectable bank.", fixed_suffix: "Places immutable parts after the selectable bank.",
      governed_joins: "Assembles none, space, or hyphen joins.",
    }, requiredInputs: ["definition", "tiles", "expectedIds", "wordSum", "resultingMeaning"], optionalInputs: ["fixedTiles", "joins", "restored progress", "feedback policy"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...PREFIX_ROUTES, AFFIX_ROUTE, BASE_ROUTE], usedByMicroSkills: [...PREFIX_SKILLS, ...AFFIX_SKILLS, ...BASE_SKILLS],
    templateKeys: ["MOR_BUILD_WORD"], status: "CANONICAL", whenToUse: "When the learning action is choosing and ordering word parts.",
    whenNotToUse: "For several simultaneous targets in one mixed puzzle bank; use COMPOUND_JIGSAW.",
    notes: "DefinitionWordBuilder and CompoundJigsawActivity share OrderedBuildEngine placement, reordering, validation and restoration mechanics.",
  }),
  activity({
    activityKey: "COMPOUND_JIGSAW", displayName: "Compound jigsaw", interactionFamily: "tile_assembly",
    pedagogicalPurpose: "Join compound components in governed order while preserving spaces and hyphens.",
    canonicalComponent: "CompoundJigsawActivity", canonicalComponentPath: "components/adle/morphology/compound-jigsaw-activity.tsx",
    supportedModes: ["jigsaw_multi_target"], modeDescriptions: { jigsaw_multi_target: "Two-or-more governed components per target, compact joined trays above one mixed bank, with spaces and hyphens represented as draggable pieces." },
    requiredInputs: ["compound targets", "components", "joins"], optionalInputs: ["resume progress"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...COMPOUND_ROUTES], usedByMicroSkills: [...COMPOUND_SKILLS],
    templateKeys: ["MOR_COMPOUND_JIGSAW"], status: "CANONICAL", whenToUse: "For compound structure where puzzle joining is itself pedagogically meaningful.",
    whenNotToUse: "For one definition-led affix/base target; use WORD_ASSEMBLY.", compatibilityImplementations: ["ClosedCompoundLessonPayloadV1 data adapter"],
    notes: "Connector identity is derived from canonical joins without changing payloads. Historical firstWord/secondWord payloads normalise to the generalized two-piece/no-join contract before rendering; component-only open/hyphenated resumes expand with empty connector slots.",
  }),
  activity({
    activityKey: "MEANING_MATCH", displayName: "Meaning match", interactionFamily: "meaning_match",
    pedagogicalPurpose: "Connect each word to its whole-word definition.",
    canonicalComponent: "MeaningConnectionActivity", canonicalComponentPath: "components/adle/morphology/meaning-connection-activity.tsx",
    supportedModes: ["word_to_definition", "component_clues"], modeDescriptions: { word_to_definition: "Select a word then its definition.", component_clues: "Shows component meanings as clues." },
    requiredInputs: ["words", "definitions"], optionalInputs: ["component meanings", "component-to-whole explanation"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...COMPOUND_ROUTES, ...PREFIX_ROUTES, AFFIX_ROUTE, GENERIC_ROUTE], usedByMicroSkills: [...COMPOUND_SKILLS, ...PREFIX_SKILLS, ...AFFIX_SKILLS, "generic homophone/morphology skills"],
    templateKeys: ["HOM_MEANING_MATCH", "MOR_MEANING_MATCH", "MOR_COMPOUND_MEANING_CONNECTION"], status: "CANONICAL",
    whenToUse: "When each word must be paired with a distinct definition.", whenNotToUse: "When words belong in reusable semantic groups; use MEANING_SORT.",
    notes: "Generic HOM/MOR keys still render the warm GuidedActivity shell; the rich canonical component is only wired by Compound routes.",
  }),
  activity({
    activityKey: "MEANING_SORT", displayName: "Meaning sort", interactionFamily: "sorting",
    pedagogicalPurpose: "Sort words into reusable meaning or affix-form groups.",
    canonicalComponent: "BinSort", canonicalComponentPath: "components/adle/activities/shared/bin-sort.tsx",
    supportedModes: ["meaning", "prefix_form", "immediate_feedback", "end_of_round"], modeDescriptions: {
      meaning: "Sort by semantic group.", prefix_form: "Sort base words by the prefix form they take.", immediate_feedback: "Respond after each choice.", end_of_round: "Delay summary feedback.",
    }, requiredInputs: ["items with destinations", "bins"], optionalInputs: ["feedback policy", "specialist teaching cards"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...PREFIX_ROUTES, AFFIX_ROUTE], usedByMicroSkills: [...PREFIX_SKILLS, ...AFFIX_SKILLS],
    status: "CANONICAL", whenToUse: "When several words share meaningful categories.", whenNotToUse: "For a short review activation over a mixed bundle; use REVIEW_SORT.",
  }),
  activity({
    activityKey: "REVIEW_SORT", displayName: "Review quick sort", interactionFamily: "sorting",
    pedagogicalPurpose: "Reactivate a review bundle through fast categorisation before retrieval.",
    canonicalComponent: "QuickSortActivity", canonicalComponentPath: "components/adle/activities/quick-sort-activity.tsx",
    supportedModes: ["tap_bins", "spoken_fallback"], modeDescriptions: { tap_bins: "Tap a configured bin for every review word.", spoken_fallback: "Read-only prompt when concrete bins are absent." },
    requiredInputs: ["review words"], optionalInputs: ["sortBins"], supportsPointer: true, supportsAudio: true,
    usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["all review-eligible generic micro-skills"], templateKeys: ["REVIEW_QUICK_SORT"],
    status: "CANONICAL", firstImpressionEligible: false, reviewEligible: true,
    whenToUse: "As a low-stakes review warm-up before production.", whenNotToUse: "As mastery evidence or a first-impression meaning lesson.",
  }),
  activity({
    activityKey: "COVER_CHECK", displayName: "Cover Check", interactionFamily: "cover_recall",
    pedagogicalPurpose: "Study a visible word, hide it, recall it, and compare the attempt.",
    canonicalComponent: "CoverShutter", canonicalComponentPath: "components/adle/activities/shared/cover-shutter.tsx",
    supportedModes: ["whole_word", "component_marked", "ratio_close_policy"], modeDescriptions: { whole_word: "Show and cover a whole word.", component_marked: "Show governed components separated visually.", ratio_close_policy: "Require a configured proportion of the shutter track." },
    requiredInputs: ["word", "splitPoints"], optionalInputs: ["components", "closePolicy", "resume state"],
    capturesAttempt: true, evidenceBearing: true, supportsPointer: true, supportsAudio: true,
    usedByRoutes: [...ALL_SPECIALIST_ROUTES], usedByMicroSkills: [...MORPHOLOGY_SKILLS], status: "CANONICAL", reviewEligible: true,
    whenToUse: "For supported study-cover-recall practice where a teaching view is intentional.", whenNotToUse: "For cold dictation or diagnostic retrieval.",
  }),
  activity({
    activityKey: "CONTROLLED_SPELLING", displayName: "Controlled spelling", interactionFamily: "typed_recall",
    pedagogicalPurpose: "Type a target word under a controlled reveal or recall policy.",
    canonicalComponent: "SpellingField", canonicalComponentPath: "components/adle/activities/shared/spelling-field.tsx",
    supportedModes: ["visible_copy", "hide_write", "audio_recall"], modeDescriptions: { visible_copy: "Target remains visible.", hide_write: "Target is hidden before typing.", audio_recall: "Target is spoken and not displayed." },
    requiredInputs: ["target word", "value", "change handler"], optionalInputs: ["reveal", "sentenceContext", "audio"],
    capturesAttempt: true, evidenceBearing: true, supportsAudio: true, usedByRoutes: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES], usedByMicroSkills: ["generic composer catalogue", ...MORPHOLOGY_SKILLS],
    templateKeys: ["HIDE_WRITE", "CONTROLLED_SPELLING"], status: "CANONICAL", reviewEligible: true,
    whenToUse: "For a single-word controlled production response.", whenNotToUse: "For an authored whole sentence; use DICTATION sentence mode.",
    notes: "Specialist CONTROLLED_SPELLING uses CoverShutter, while generic CONTROLLED_SPELLING currently shows the word and asks the child to copy it.",
  }),
  activity({
    activityKey: "DICTATION", displayName: "Dictation", interactionFamily: "typed_recall",
    pedagogicalPurpose: "Retrieve a word or sentence from authored audio without visual copying.",
    canonicalComponent: "SpellingField", canonicalComponentPath: "components/adle/activities/shared/spelling-field.tsx",
    supportedModes: ["word", "sentence_context", "whole_sentence", "diagnostic_probe", "review"], modeDescriptions: {
      word: "Hear and spell one word.", sentence_context: "Spell a word in a meaning-bearing sentence.", whole_sentence: "Transcribe an authored sentence.", diagnostic_probe: "Cold, non-punitive first attempt.", review: "Scheduled retrieval evidence.",
    }, requiredInputs: ["authored audio text", "target binding"], optionalInputs: ["sentence", "target token index", "evidence mode"],
    capturesAttempt: true, evidenceBearing: true, supportsAudio: true, usedByRoutes: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES], usedByMicroSkills: ["generic composer catalogue", ...MORPHOLOGY_SKILLS],
    templateKeys: ["REVIEW_DICTATION", "DICTATION_NO_IMAGE", "DICTATION_SENTENCE_CONTEXT", "DIAGNOSTIC_DICTATION_PROBE"],
    status: "CANONICAL", reviewEligible: true, whenToUse: "For cold or scheduled retrieval from authored audio.", whenNotToUse: "For a visible study-copy task or free writing.",
    duplicateImplementations: ["Morphology Dictation", "Base Word Dictation", "Compound inline Dictation"],
  }),
  activity({
    activityKey: "ERROR_REPAIR", displayName: "Error repair", interactionFamily: "reveal_hide_retry",
    pedagogicalPurpose: "Teach the correct spelling after an error, hide it, then collect a controlled retry.",
    canonicalComponent: "ReflectionActivity", canonicalComponentPath: "components/adle/activities/reflection-activity.tsx",
    supportedModes: ["reveal_hide_retry"], modeDescriptions: { reveal_hide_retry: "Show prior/correct spelling, require Hide Word, then enable retry." },
    requiredInputs: ["prior attempt", "correct word", "retry value"], optionalInputs: ["misconception hint"],
    capturesAttempt: true, evidenceBearing: true, supportsPointer: true, usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["review micro-skills with misses"],
    templateKeys: ["ERROR_REFLECTION_CUE"], status: "CANONICAL", firstImpressionEligible: false, reviewEligible: true,
    whenToUse: "Immediately after a known spelling error when a reveal-hide-retry sequence is required.", whenNotToUse: "For end-of-lesson metacognition or a child-created mnemonic.",
  }),
  activity({
    activityKey: "LESSON_REFLECTION", displayName: "Lesson reflection", interactionFamily: "metacognitive_reflection",
    pedagogicalPurpose: "Review mistakes and state a rule learned for next time at the end of a first-impression lesson.",
    canonicalComponent: "LessonReflection", canonicalComponentPath: "components/adle/activities/lesson-reflection.tsx",
    supportedModes: ["standard_lesson_reflection"], modeDescriptions: { standard_lesson_reflection: "Compare normalized attempted and correct spellings, answer one governed lesson-specific question, and complete through the owning route adapter." },
    requiredInputs: ["normalized mistake summary", "lesson-specific prompt", "controlled child response", "completion callback or submit boundary"], optionalInputs: ["context recap", "specialist recap", "route-specific success message"],
    capturesAttempt: true, evidenceBearing: true, usedByRoutes: [...ALL_SPECIALIST_ROUTES], usedByMicroSkills: [...MORPHOLOGY_SKILLS],
    status: "CANONICAL", reviewEligible: false,
    whenToUse: "Once, at the end of every first-impression lesson.", whenNotToUse: "For retrying one misspelling or authoring a mnemonic.",
    compatibilityImplementations: ["Common Word Lab FixtureActivity reflection"],
    notes: "Prefix/Affix, Base Word and Compound adapters derive route-specific correctness, governed prompts and optional recap data before rendering one LessonReflection. Persistence, completion and historical prompt replay stay outside the component.",
  }),
  activity({
    activityKey: "MEMORY_CUE", displayName: "Memory cue", interactionFamily: "mnemonic_authoring",
    pedagogicalPurpose: "Let the child create a personal cue for remembering a spelling.",
    canonicalComponent: "GuidedActivity", canonicalComponentPath: "components/adle/activities/guided-activity.tsx",
    supportedModes: ["child_authored_cue"], modeDescriptions: { child_authored_cue: "Prompt and store a child-authored mnemonic or remembering idea." },
    requiredInputs: ["target word", "prompt"], optionalInputs: ["audio"], capturesAttempt: true, evidenceBearing: true, supportsAudio: true,
    usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["generic irregular/common-word micro-skills"], templateKeys: ["MEMORY_CUE"], status: "CANONICAL",
    whenToUse: "When the pedagogical aim is to author a mnemonic.", whenNotToUse: "As the standard final lesson reflection or error retry.",
  }),
  activity({
    activityKey: "FREE_WRITING", displayName: "Must-use free writing", interactionFamily: "authentic_writing",
    pedagogicalPurpose: "Use required target words in original, meaning-bearing writing.",
    canonicalComponent: null, canonicalComponentPath: null,
    supportedModes: ["first_impression_transfer", "review_transfer"], modeDescriptions: { first_impression_transfer: "Original writing after teaching.", review_transfer: "Delayed original writing using review words." },
    requiredInputs: ["required words", "writing prompt"], optionalInputs: ["sentence count", "meaning guidance"], capturesAttempt: true, evidenceBearing: true,
    usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["generic micro-skills configured for authentic transfer"],
    templateKeys: ["MUST_USE_FREEWRITING", "REVIEW_MUST_USE_WRITING"], status: "REQUIRES_ARCHITECTURE_DECISION", reviewEligible: true,
    whenToUse: "When authentic transfer writing is the intended evidence.", whenNotToUse: "For isolated word spelling or sentence dictation.",
    notes: "The runtime registry dispatches these keys, but AdleSessionRunner currently renders one SpellingField per word rather than a free-writing surface.",
  }),
  activity({
    activityKey: "TRANSFORMATION", displayName: "Spelling transformation", interactionFamily: "transformation",
    pedagogicalPurpose: "Show or manipulate a governed spelling change while a word is built.",
    canonicalComponent: null, canonicalComponentPath: null,
    supportedModes: ["drop_e", "double_consonant", "y_to_i", "surface_to_source"], modeDescriptions: { drop_e: "Remove final e before a suffix.", double_consonant: "Double a final consonant.", y_to_i: "Change y to i.", surface_to_source: "Restore the semantic base after splitting." },
    requiredInputs: ["source", "surface", "transformation rule"], optionalInputs: ["animation description"], supportsPointer: true,
    usedByRoutes: [BASE_ROUTE, AFFIX_ROUTE], usedByMicroSkills: [...BASE_SKILLS, ...AFFIX_SKILLS], status: "REQUIRES_ARCHITECTURE_DECISION",
    whenToUse: "When the spelling change itself must be noticed or rehearsed.", whenNotToUse: "For a simple unchanged join.",
    notes: "TransformationAnimation and TransformationView exist only in development previews; final-y restoration is embedded in BaseWordCleaver.",
  }),
  activity({
    activityKey: "PHONEME_GRAPHEME_MAP", displayName: "Phoneme–grapheme mapping", interactionFamily: "sound_symbol_mapping",
    pedagogicalPurpose: "Map heard phonemes to grapheme choices.", canonicalComponent: null, canonicalComponentPath: null,
    supportedModes: ["sound_notice", "grapheme_map"], modeDescriptions: { sound_notice: "Notice the target sound.", grapheme_map: "Map phonemes to graphemes." },
    requiredInputs: ["phonemes", "graphemes", "audio"], optionalInputs: ["word segmentation"], supportsAudio: true,
    usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["D4 phoneme-grapheme families"], templateKeys: [], status: "REQUIRES_ARCHITECTURE_DECISION",
    whenToUse: "When sound-to-symbol mapping is the core learning action.", whenNotToUse: "For a generic written prompt with no mapping interaction.",
    notes: "PG_SOUND_NOTICE and PG_GRAPHEME_MAP currently map to GUIDED_PROMPT_FALLBACK, so this is a genuine activity gap.",
  }),
  activity({
    activityKey: "SYLLABLE_SPLIT_REBUILD", displayName: "Syllable split and rebuild", interactionFamily: "syllable_structure",
    pedagogicalPurpose: "Split a word into syllables and rebuild it from those syllables.", canonicalComponent: null, canonicalComponentPath: null,
    supportedModes: ["split", "rebuild"], modeDescriptions: { split: "Mark syllable boundaries.", rebuild: "Order syllable chunks into the word." },
    requiredInputs: ["syllable sequence", "audio"], optionalInputs: ["stress"], supportsPointer: true, supportsAudio: true,
    usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["D4_SYL micro-skills"], status: "REQUIRES_ARCHITECTURE_DECISION",
    whenToUse: "When syllable structure, rather than morphology, is the learning objective.", whenNotToUse: "For morpheme boundaries; use CLEAVER.",
    notes: "SYL_SPLIT and SYL_REBUILD currently map to GUIDED_PROMPT_FALLBACK, so this is a genuine activity gap.",
  }),
  activity({
    activityKey: "GUIDED_PROMPT_FALLBACK", displayName: "Guided prompt fallback", interactionFamily: "typed_prompt",
    pedagogicalPurpose: "Keep a generic lesson usable when no structured rich renderer exists.",
    canonicalComponent: "GuidedActivity", canonicalComponentPath: "components/adle/activities/guided-activity.tsx",
    supportedModes: ["warm_prompt"], modeDescriptions: { warm_prompt: "Shows authored copy, optional target/audio, and a free-response input." },
    requiredInputs: ["childFacingCopy"], optionalInputs: ["target word", "purpose", "audio"], capturesAttempt: true, evidenceBearing: true, supportsAudio: true,
    usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["generic PG, HOM, INF, IRRE, PAT, SYL, SCHWA and morphology micro-skills"],
    templateKeys: ["PG_SOUND_NOTICE", "PG_GRAPHEME_MAP", "HOM_SENTENCE_CHOICE", "HOM_CORRECTION", "INF_CONTEXT_CHOICE", "INF_RULE_CHOICE", "INF_TRANSFORM", "IRRE_TRICKY_PART", "PAT_PATTERN_SPOT", "PAT_RULE_APPLY", "SYL_SPLIT", "SYL_REBUILD", "SCHWA_STRESS_MARK", "SCHWA_VOWEL_REVEAL", "SCHWA_ANCHOR"],
    status: "COMPATIBILITY_ONLY", whenToUse: "Only as the registered safe fallback for existing generic templates.",
    whenNotToUse: "As justification that a rich pedagogical interaction already exists, or for new bespoke UI.",
  }),
] as const;

function auditRow(
  implementationName: string,
  filePath: string,
  activityConcept: string,
  classification: ActivityArchitecturalStatus,
  canonicalCandidate: string | null,
  input: Partial<Omit<ActivityImplementationAuditRow,
    "implementationName" | "filePath" | "activityConcept" | "classification" | "canonicalCandidate">> = {},
): ActivityImplementationAuditRow {
  const routes = input.currentRouteUsages ?? [];
  const inferredSkills = [
    ...(routes.includes(GENERIC_ROUTE) ? ["runtime-selected generic micro-skills"] : []),
    ...(routes.some((route) => PREFIX_ROUTES.includes(route as typeof PREFIX_ROUTES[number])) ? PREFIX_SKILLS : []),
    ...(routes.includes(AFFIX_ROUTE) ? AFFIX_SKILLS : []),
    ...(routes.includes(BASE_ROUTE) ? BASE_SKILLS : []),
    ...(routes.some((route) => COMPOUND_ROUTES.includes(route as typeof COMPOUND_ROUTES[number])) ? COMPOUND_SKILLS : []),
    ...(routes.some((route) => route.startsWith("/dev/") || route.includes("development") || route.includes("non-production")) ? ["none (development/staging reference only)"] : []),
  ];
  return {
    implementationName, filePath, activityConcept, classification, canonicalCandidate,
    interactionFamily: activityConcept.toLocaleLowerCase("en-GB"), currentRouteUsages: routes,
    currentMicroSkillUsages: [...new Set(inferredSkills)], registryTemplateKeys: [], propsConfigDifferences: "See component props and route adapter.",
    visualDifferences: "Uses its owning shell styling.", behaviouralDifferences: "Local interaction state only.",
    persistenceEvidenceDifferences: "Renderer does not write directly; owning session submits completion.",
    recommendedAction: classification === "CANONICAL" || classification === "CANONICAL_MODE" ? "Retain and route new work through the catalogue." : "Do not add new usage before the backlog action is complete.",
    migrationRisk: "medium", historicalReplayDependency: false,
    evidence: "Repository import and route-dispatch trace at the audited base SHA.", notes: "", ...input,
  };
}

const GENERIC = [GENERIC_ROUTE];
const PREFIX_AFFIX = [...PREFIX_ROUTES, AFFIX_ROUTE];
const SPECIALIST = [...ALL_SPECIALIST_ROUTES];

export const ADLE_ACTIVITY_IMPLEMENTATION_AUDIT: readonly ActivityImplementationAuditRow[] = [
  auditRow("IntroActivity", "components/adle/activities/intro-activity.tsx", "INTRODUCTION", "CANONICAL", "IntroActivity", { currentRouteUsages: GENERIC, registryTemplateKeys: ["MICRO_READ_ONLY_INTRO", "LESSON_WORDS_INTRO"], migrationRisk: "low" }),
  auditRow("GuidedActivity", "components/adle/activities/guided-activity.tsx", "GUIDED_PROMPT_FALLBACK / MEMORY_CUE", "CANONICAL", "GuidedActivity", { currentRouteUsages: GENERIC, registryTemplateKeys: ["HIDE_WRITE", "MEMORY_CUE", "PG_*", "HOM_*", "INF_*", "IRRE_*", "MOR_*", "PAT_*", "SYL_*", "SCHWA_*"], notes: "Canonical only as the generic safe fallback and current memory-cue surface; it is not proof that every mapped rich interaction exists." }),
  auditRow("QuickSortActivity", "components/adle/activities/quick-sort-activity.tsx", "REVIEW_SORT", "CANONICAL", "QuickSortActivity", { currentRouteUsages: GENERIC, registryTemplateKeys: ["REVIEW_QUICK_SORT"], migrationRisk: "low" }),
  auditRow("ReflectionActivity", "components/adle/activities/reflection-activity.tsx", "ERROR_REPAIR", "CANONICAL", "ReflectionActivity", { currentRouteUsages: GENERIC, registryTemplateKeys: ["ERROR_REFLECTION_CUE"], behaviouralDifferences: "Enforces reveal then Hide Word before retry.", migrationRisk: "high" }),

  auditRow("SplitHandle", "components/adle/activities/shared/split-handle.tsx", "CLEAVER", "CANONICAL", "SplitHandle", { currentRouteUsages: PREFIX_AFFIX, registryTemplateKeys: ["MOR_STRIP_BUILD"], propsConfigDifferences: "Multiple split points, supplied components, feedback/scaffold/copy policy.", behaviouralDifferences: "Tracks multiple boundaries and exposes one completion callback.", migrationRisk: "high" }),
  auditRow("BaseWordCleaver", "components/adle/activities/shared/base-word-cleaver.tsx", "CLEAVER", "DUPLICATE_TO_MIGRATE", "SplitHandle", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Segments, baseIndex, selected cuts, final-y restoration, typed remaining-base confirmation.", visualDifferences: "Near-identical cleaver SVG at 64px instead of SplitHandle's 80px; custom base-highlight and aside animation.", behaviouralDifferences: "Only accepts cuts adjacent to the base, then asks the child to type the remaining base and can restore final y.", migrationRisk: "high", recommendedAction: "Add isolate_base and optional final_y_restoration modes to SplitHandle, prove parity, then migrate Base Word.", evidence: "Both files duplicate STRIKE_MS, CleaverIcon SVG, boundary buttons, sound, focus and two-miss scaffolding." }),
  auditRow("DraggableTile", "components/adle/activities/shared/draggable-tile.tsx", "TILE_PRIMITIVE", "CANONICAL", "DraggableTile", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "low" }),
  auditRow("OrderedBuildEngine", "components/adle/activities/shared/ordered-build-engine.ts", "BUILD_MECHANICS", "CANONICAL", "OrderedBuildEngine", { currentRouteUsages: [...PREFIX_AFFIX, BASE_ROUTE, ...COMPOUND_ROUTES], behaviouralDifferences: "Headless placement, reordering, validation and restoration state shared by rail and Jigsaw presentations.", migrationRisk: "high" }),
  auditRow("SnapRail", "components/adle/activities/shared/snap-rail.tsx", "WORD_ASSEMBLY", "CANONICAL_MODE", "DefinitionWordBuilder", { currentRouteUsages: [...PREFIX_AFFIX, BASE_ROUTE], registryTemplateKeys: ["MOR_BUILD_WORD"], behaviouralDifferences: "One-row tile and pointer presentation over OrderedBuildEngine.", migrationRisk: "high" }),
  auditRow("DefinitionWordBuilder", "components/adle/activities/shared/definition-word-builder.tsx", "WORD_ASSEMBLY", "CANONICAL", "DefinitionWordBuilder", { currentRouteUsages: [...PREFIX_AFFIX, BASE_ROUTE], registryTemplateKeys: ["MOR_BUILD_WORD"], propsConfigDifferences: "Prefix, suffix and Base Word routes supply governed parts, definitions, word sums and feedback without route-local build state.", migrationRisk: "high" }),
  auditRow("BinSort", "components/adle/activities/shared/bin-sort.tsx", "MEANING_SORT", "CANONICAL", "BinSort", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "medium" }),
  auditRow("FlipToggle", "components/adle/activities/shared/flip-toggle.tsx", "MEANING_DISCOVERY", "DEAD_OR_UNREFERENCED", "Discovery", { evidence: "Exported by shared/index.tsx but no learner route or preview imports it.", migrationRisk: "low", recommendedAction: "Keep until convergence decision; do not select for new work." }),
  auditRow("CoverShutter", "components/adle/activities/shared/cover-shutter.tsx", "COVER_CHECK", "CANONICAL", "CoverShutter", { currentRouteUsages: SPECIALIST, behaviouralDifferences: "Owns look/cover/write/check and the single word DiffReveal.", migrationRisk: "high" }),
  auditRow("SpellingField", "components/adle/activities/shared/spelling-field.tsx", "CONTROLLED_SPELLING / DICTATION", "CANONICAL", "SpellingField", { currentRouteUsages: GENERIC, registryTemplateKeys: ["CONTROLLED_SPELLING", "DICTATION_*", "REVIEW_DICTATION", "MUST_USE_*"], migrationRisk: "high" }),
  auditRow("HearWordButton", "components/adle/activities/shared/spelling-field.tsx", "AUDIO_SUPPORT", "CANONICAL_MODE", "SpellingField", { currentRouteUsages: [GENERIC_ROUTE, ...SPECIALIST], migrationRisk: "low" }),
  auditRow("GrownUpReveal", "components/adle/activities/shared/spelling-field.tsx", "AUDIO_SUPPORT", "CANONICAL_MODE", "SpellingField", { currentRouteUsages: GENERIC, migrationRisk: "low" }),
  auditRow("DiffReveal", "components/adle/activities/shared/diff-reveal.tsx", "POST_ATTEMPT_COMPARISON", "CANONICAL_MODE", "COVER_CHECK / DICTATION", { currentRouteUsages: SPECIALIST, propsConfigDifferences: "Word and sentence modes; optional split points.", migrationRisk: "high" }),
  auditRow("TransformationAnimation", "components/adle/activities/shared/transformation-animation.tsx", "TRANSFORMATION", "DEAD_OR_UNREFERENCED", null, { currentRouteUsages: ["/dev/adle/morphology-primitives only"], evidence: "No learner route imports it.", migrationRisk: "low" }),

  auditRow("MorphemeTile", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_PART_TILE", "DEAD_OR_UNREFERENCED", "DraggableTile", { currentRouteUsages: ["/dev/adle/morphology-primitives only"], evidence: "Used only by development preview compositions." }),
  auditRow("MorphemeSequence", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_PART_DISPLAY", "DEAD_OR_UNREFERENCED", null, { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("MorphemeRail", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_ASSEMBLY", "DUPLICATE_TO_MIGRATE", "SnapRail", { currentRouteUsages: ["/dev/adle/morphology-primitives only"], behaviouralDifferences: "Tap-only placement without correctness or completion contract.", migrationRisk: "low" }),
  auditRow("WordSplitView", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_PART_DISPLAY", "DEAD_OR_UNREFERENCED", null, { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("MeaningFlip", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "MEANING_DISCOVERY", "DUPLICATE_TO_MIGRATE", "Discovery", { currentRouteUsages: ["/dev/adle/morphology-primitives only"], migrationRisk: "low" }),
  auditRow("TransformationView", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "TRANSFORMATION", "DEAD_OR_UNREFERENCED", null, { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("MorphologyDiff", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "POST_ATTEMPT_COMPARISON", "DUPLICATE_TO_MIGRATE", "DiffReveal", { currentRouteUsages: ["/dev/adle/morphology-primitives only"], migrationRisk: "low" }),
  auditRow("MorphemeGlossCard", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "MORPHOLOGY_REFERENCE", "DEAD_OR_UNREFERENCED", null, { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("RootArtifactCard", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "MORPHOLOGY_REFERENCE", "DEAD_OR_UNREFERENCED", null, { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("WordFamilyView", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_FAMILY_REVEAL", "DUPLICATE_TO_MIGRATE", "FamilyReveal", { currentRouteUsages: ["/dev/adle/morphology-primitives only"], migrationRisk: "low" }),

  auditRow("ActivityFrame", "components/adle/experience/activity-frame.tsx", "ACTIVITY_SHELL", "DEAD_OR_UNREFERENCED", "future shared lesson shell", { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("ActivityHeader", "components/adle/experience/activity-frame.tsx", "ACTIVITY_SHELL", "DEAD_OR_UNREFERENCED", "future shared lesson shell", { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("InstructionPanel", "components/adle/experience/activity-frame.tsx", "GUIDED_PROMPT_SHELL", "DEAD_OR_UNREFERENCED", "future shared lesson shell", { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("FeedbackPanel", "components/adle/experience/activity-frame.tsx", "FEEDBACK_SHELL", "DEAD_OR_UNREFERENCED", "future shared lesson shell", { currentRouteUsages: ["/dev/adle/morphology-primitives only"] }),
  auditRow("SafeFallbackCard", "components/adle/experience/activity-frame.tsx", "FALLBACK_SHELL", "DEAD_OR_UNREFERENCED", "GuidedActivity", { evidence: "No import found outside its declaration." }),
  auditRow("SelectableItem", "components/adle/interactions/selectable-item.tsx", "SELECTION_PRIMITIVE", "DEAD_OR_UNREFERENCED", "DraggableTile", { currentRouteUsages: ["development morphology primitives only"] }),
  auditRow("AssemblySlot", "components/adle/interactions/selectable-item.tsx", "WORD_ASSEMBLY", "DUPLICATE_TO_MIGRATE", "SnapRail", { currentRouteUsages: ["development morphology primitives only"], migrationRisk: "low" }),
  auditRow("ChoiceCard", "components/adle/interactions/selectable-item.tsx", "CHOICE_PRIMITIVE", "DEAD_OR_UNREFERENCED", null, { evidence: "No import found outside its declaration." }),

  auditRow("LearnIntroduction", "components/adle/morphology/morphology-guided-lesson.tsx", "INTRODUCTION", "DUPLICATE_TO_MIGRATE", "IntroActivity / future reading shell", { currentRouteUsages: PREFIX_AFFIX, visualDifferences: "Dark Word Lab multi-screen model/cards layout.", migrationRisk: "high" }),
  auditRow("Discovery", "components/adle/morphology/morphology-guided-lesson.tsx", "MEANING_DISCOVERY", "CANONICAL", "Discovery", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "high" }),
  auditRow("SplitBuild", "components/adle/morphology/morphology-guided-lesson.tsx", "CLEAVER", "CANONICAL_MODE", "SplitHandle", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Adapts prefix/suffix semantics and feedback policy into SplitHandle.", migrationRisk: "high" }),
  auditRow("MeaningCards", "components/adle/morphology/morphology-guided-lesson.tsx", "MEANING_SORT_RECAP", "CANONICAL_MODE", "BinSort", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "medium" }),
  auditRow("MeaningOverview", "components/adle/morphology/morphology-guided-lesson.tsx", "MEANING_SORT_RECAP", "CANONICAL_MODE", "BinSort", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "medium" }),
  auditRow("Controlled (Morphology)", "components/adle/morphology/morphology-guided-lesson.tsx", "COVER_CHECK", "CANONICAL_MODE", "CoverShutter", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "high" }),
  auditRow("Dictation (Morphology)", "components/adle/morphology/morphology-guided-lesson.tsx", "DICTATION", "DUPLICATE_TO_MIGRATE", "shared sentence-dictation mode", { currentRouteUsages: PREFIX_AFFIX, visualDifferences: "Dark shell textarea with sentence DiffReveal.", migrationRisk: "high" }),
  auditRow("MorphologyReflectionAdapter", "components/adle/morphology/morphology-guided-lesson.tsx", "LESSON_REFLECTION adapter", "CANONICAL_MODE", "LessonReflection", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Derives normalized target misses, governed Prefix/Suffix prompt, teaching recaps and Prefix context-slip recap.", persistenceEvidenceDifferences: "Retains completeAdleLessonPartAction, completion trace, assignment binding and specialist attempt envelopes outside LessonReflection.", migrationRisk: "high" }),
  auditRow("PrefixTeachingCards", "components/adle/morphology/prefix-teaching-cards.tsx", "INTRODUCTION / LESSON_REFLECTION_RECAP", "CANONICAL_MODE", "INTRODUCTION / LessonReflection specialist recap", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Full and compact display modes.", persistenceEvidenceDifferences: "Read-only specialist recap content; never writes evidence.", migrationRisk: "medium" }),
  auditRow("SelectedPrefixFeedback", "components/adle/morphology/prefix-teaching-cards.tsx", "MEANING_SORT_FEEDBACK", "CANONICAL_MODE", "BinSort", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Renders selected-form meaning/rule/example feedback inside BinSort and SnapRail adapters.", persistenceEvidenceDifferences: "Feedback only.", migrationRisk: "medium" }),
  auditRow("DynamicPrefixStagingLab", "components/adle/morphology/dynamic-prefix-staging-lab.tsx", "STAGING_PROOF_LESSON", "COMPATIBILITY_ONLY", "MorphologyGuidedLesson", { currentRouteUsages: ["/learn/week/adle/dynamic-prefix in non-production"], propsConfigDifferences: "Standalone four-word cards, local dictation textarea, and local reflection.", persistenceEvidenceDifferences: "Session-storage proof state only; explicitly writes no learner evidence.", recommendedAction: "Retain only as a staging proof surface until its runbook is retired; never use it as a micro-skill renderer.", migrationRisk: "low" }),

  auditRow("Intro (Base Word)", "components/adle/morphology/base-word-family-guided-lesson.tsx", "INTRODUCTION", "DUPLICATE_TO_MIGRATE", "IntroActivity / future reading shell", { currentRouteUsages: [BASE_ROUTE], migrationRisk: "high" }),
  auditRow("FamilyReveal", "components/adle/morphology/base-word-family-guided-lesson.tsx", "WORD_FAMILY_REVEAL", "CANONICAL", "FamilyReveal", { currentRouteUsages: [BASE_ROUTE], registryTemplateKeys: ["MOR_BASE_FAMILY_REVEAL (route-specific binding)"], migrationRisk: "high" }),
  auditRow("Cleave (Base Word adapter)", "components/adle/morphology/base-word-family-guided-lesson.tsx", "CLEAVER", "CANONICAL_MODE", "future SplitHandle isolate_base mode", { currentRouteUsages: [BASE_ROUTE], migrationRisk: "high" }),
  auditRow("Controlled (Base Word)", "components/adle/morphology/base-word-family-guided-lesson.tsx", "COVER_CHECK", "CANONICAL_MODE", "CoverShutter", { currentRouteUsages: [BASE_ROUTE], migrationRisk: "high" }),
  auditRow("Dictation (Base Word)", "components/adle/morphology/base-word-family-guided-lesson.tsx", "DICTATION", "DUPLICATE_TO_MIGRATE", "shared sentence-dictation mode", { currentRouteUsages: [BASE_ROUTE], migrationRisk: "high" }),
  auditRow("Base Word reflection adapter", "components/adle/morphology/base-word-family-guided-lesson.tsx", "LESSON_REFLECTION adapter", "CANONICAL_MODE", "LessonReflection", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Extracts the governed target token from each dictated sentence and derives the base-word prompt.", persistenceEvidenceDifferences: "Returns controlled attempts, sentence attempts and reflection to BaseWordFamilyPart; atomic completion remains external.", migrationRisk: "high" }),

  auditRow("CompoundReadingPage", "components/adle/morphology/closed-compound-guided-lesson.tsx", "READING_PAGE", "REQUIRES_ARCHITECTURE_DECISION", "future ReadingPage", { currentRouteUsages: ["compound_word_lab:v2"], migrationRisk: "high" }),
  auditRow("CompoundJigsawActivity", "components/adle/morphology/compound-jigsaw-activity.tsx", "COMPOUND_JIGSAW", "CANONICAL", "CompoundJigsawActivity", { currentRouteUsages: [...COMPOUND_ROUTES], registryTemplateKeys: ["MOR_COMPOUND_JIGSAW"], migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("MeaningConnectionActivity", "components/adle/morphology/meaning-connection-activity.tsx", "MEANING_MATCH", "CANONICAL", "MeaningConnectionActivity", { currentRouteUsages: [...COMPOUND_ROUTES], registryTemplateKeys: ["MOR_COMPOUND_MEANING_CONNECTION"], migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("Controlled (Compound inline)", "components/adle/morphology/closed-compound-guided-lesson.tsx", "COVER_CHECK", "CANONICAL_MODE", "CoverShutter", { currentRouteUsages: [...COMPOUND_ROUTES], migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("Dictation (Compound inline)", "components/adle/morphology/closed-compound-guided-lesson.tsx", "DICTATION", "DUPLICATE_TO_MIGRATE", "shared sentence-dictation mode", { currentRouteUsages: [...COMPOUND_ROUTES], migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("CompoundLessonReflectionAdapter", "components/adle/morphology/closed-compound-guided-lesson.tsx", "LESSON_REFLECTION adapter", "CANONICAL_MODE", "LessonReflection", { currentRouteUsages: [...COMPOUND_ROUTES], propsConfigDifferences: "Derives exact-governed-form misses and retains existing sentence comparisons plus closed-v1 no-miss copy.", persistenceEvidenceDifferences: "Retains completeAdleLessonPartAction and all hidden guided/production envelopes outside LessonReflection.", migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("LessonReflection", "components/adle/activities/lesson-reflection.tsx", "LESSON_REFLECTION", "CANONICAL", "LessonReflection", { currentRouteUsages: [...ALL_SPECIALIST_ROUTES], propsConfigDifferences: "One neutral normalized mistake, context recap, specialist recap, governed prompt and controlled response contract.", persistenceEvidenceDifferences: "Emits response/completion UI only; performs no correctness, assignment, persistence or evidence work.", migrationRisk: "high" }),

  auditRow("FixtureActivity", "components/adle/word-lab/activity-registry.tsx", "COMMON_WORD_LAB_PLACEHOLDER", "COMPATIBILITY_ONLY", "real per-kind Word Lab plugins", { currentRouteUsages: ["/dev/adle/common-word-lab only"], propsConfigDifferences: "One textarea implementation stands in for strategy_notice, guided_map, cover_check, dictation, and reflection.", recommendedAction: "Keep the dark fixture runnable, but do not treat its five registrations as production activity implementations.", migrationRisk: "low" }),
  auditRow("WordLabActivityHost", "components/adle/word-lab/activity-registry.tsx", "RUNTIME_DISPATCH", "CANONICAL_MODE", "WordLabActivityHost", { currentRouteUsages: ["/dev/adle/common-word-lab only"], migrationRisk: "medium" }),
  auditRow("CommonWordLabShell", "components/adle/word-lab/common-word-lab-shell.tsx", "LESSON_SHELL", "REQUIRES_ARCHITECTURE_DECISION", "future first-impression shell", { currentRouteUsages: ["/dev/adle/common-word-lab only"], behaviouralDifferences: "Snapshot/plugin/resume/completion shell is dark foundation, not a live route.", migrationRisk: "high" }),
  auditRow("WordLabScene", "components/adle/morphology/word-lab-scene.tsx", "LESSON_SHELL", "CANONICAL", "WordLabScene", { currentRouteUsages: SPECIALIST, migrationRisk: "high" }),
  auditRow("LessonGuide", "components/adle/morphology/lesson-guide.tsx", "GUIDED_PROMPT_SHELL", "CANONICAL_MODE", "WordLabScene", { currentRouteUsages: SPECIALIST, migrationRisk: "medium" }),
  auditRow("AdleSessionCelebration", "components/adle/adle-session-celebration.tsx", "SESSION_COMPLETION_SHELL", "CANONICAL_MODE", "AdleSessionRunner", { currentRouteUsages: ["/learn/week/adle completed state"], persistenceEvidenceDifferences: "Read-only rendering from the server-derived reward model.", migrationRisk: "medium" }),
  auditRow("AdleSessionRunner", "components/adle-session-runner.tsx", "RUNTIME_DISPATCH", "CANONICAL", "AdleSessionRunner", { currentRouteUsages: ["/learn/week/adle"], behaviouralDifferences: "Dispatches generic renderer kinds and explicit specialist route runtimes.", migrationRisk: "high" }),
  auditRow("MorphologyGuidedLesson", "components/adle/morphology/morphology-guided-lesson.tsx", "SPECIALIST_LESSON_SHELL", "DUPLICATE_TO_MIGRATE", "future first-impression shell", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("BaseWordFamilyGuidedLesson", "components/adle/morphology/base-word-family-guided-lesson.tsx", "SPECIALIST_LESSON_SHELL", "DUPLICATE_TO_MIGRATE", "future first-impression shell", { currentRouteUsages: [BASE_ROUTE], migrationRisk: "high" }),
  auditRow("CompoundWordLessonRuntime", "components/adle/morphology/closed-compound-guided-lesson.tsx", "SPECIALIST_LESSON_SHELL", "DUPLICATE_TO_MIGRATE", "future first-impression shell", { currentRouteUsages: [...COMPOUND_ROUTES], migrationRisk: "high", historicalReplayDependency: true }),
] as const;

export const ADLE_ACTIVITY_CONVERGENCE_BACKLOG: readonly ActivityConvergenceBacklogItem[] = [
  {
    priority: "P0", title: "Converge the Cleaver family",
    currentImplementations: ["SplitHandle", "BaseWordCleaver", "SplitBuild", "Base Word Cleave adapter"],
    targetCanonicalImplementation: "SplitHandle",
    intendedModes: ["find_boundaries", "identify_components", "isolate_base", "final_y_restoration"],
    routesAffected: [...PREFIX_ROUTES, AFFIX_ROUTE, BASE_ROUTE],
    regressionRequirements: ["SVG/size/copy snapshot", "pointer and keyboard boundary selection", "focus after two misses", "multiple boundaries", "final-y restoration", "resume parity", "no evidence change"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: false,
    consolidationOpportunity: "Retire one 108-line duplicate implementation after route parity; adapter code may remain as configuration mapping.",
  },
  {
    priority: "P0", title: "Extract the standard first-impression shell",
    currentImplementations: ["MorphologyGuidedLesson", "BaseWordFamilyGuidedLesson", "CompoundWordLessonRuntime", "CommonWordLabShell"],
    targetCanonicalImplementation: "future shared first-impression shell using Activity Catalogue sequences",
    intendedModes: ["reading_pages", "meet_words", "configured_activities", "production", "lesson_reflection"], routesAffected: [...ALL_SPECIALIST_ROUTES],
    regressionRequirements: ["route snapshot replay", "resume keys", "activity ordering", "completion envelope", "all evidence/persistence parity", "historical route fixtures"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: true,
    consolidationOpportunity: "High structural consolidation across three live specialist shells and one dark shell; no credible line count before the shared contract exists.",
  },
  {
    priority: "P1", title: "Extract shared sentence Dictation",
    currentImplementations: ["Morphology Dictation", "Base Word Dictation", "Compound inline Dictation", "generic SpellingField dictation"],
    targetCanonicalImplementation: "SpellingField-backed Dictation component with word and sentence modes",
    intendedModes: ["word", "whole_sentence", "sentence_context", "diagnostic_probe", "review"], routesAffected: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES],
    regressionRequirements: ["authored audio", "target-token semantics", "sentence DiffReveal", "context-slip analysis", "attempt-key parity"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: false,
    consolidationOpportunity: "Remove three route-local textarea/check/reveal implementations after parity.",
  },
  {
    priority: "P1", title: "Wire rich components through registry modes",
    currentImplementations: ["GuidedActivity fallback", "specialist direct SplitHandle/SnapRail/BinSort/MeaningConnectionActivity"],
    targetCanonicalImplementation: "Activity Catalogue mapping feeding versioned renderer registration",
    intendedModes: ["cleaver", "word_assembly", "meaning_match", "meaning_sort"], routesAffected: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES],
    regressionRequirements: ["template-to-catalogue total mapping", "payload validation", "safe fallback", "lazy renderer", "no dispatch change until separately approved"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: true,
    consolidationOpportunity: "Stops new generic/specialist divergence; source deletion depends on the later runtime refactor.",
  },
  {
    priority: "P1", title: "Implement genuine missing activity surfaces",
    currentImplementations: ["PG/SYL/INF/PAT/SCHWA GuidedActivity fallbacks", "MUST_USE_* SpellingField rendering", "development-only transformation primitives"],
    targetCanonicalImplementation: "new catalogue-governed components only after NEW_INTERACTION_REQUIRED approval",
    intendedModes: ["phoneme_grapheme_map", "syllable_split_rebuild", "authentic_free_writing", "spelling_transformation"], routesAffected: [GENERIC_ROUTE],
    regressionRequirements: ["pedagogical contract", "keyboard/pointer/audio", "answer visibility", "evidence binding", "fallback safety"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: true,
    consolidationOpportunity: "Capability addition, not a deletion opportunity.",
  },
  {
    priority: "P2", title: "Retire preview-only/dead primitives after decisions",
    currentImplementations: ["FlipToggle", "MorphemeRail", "WordSplitView", "MeaningFlip", "TransformationView", "MorphologyDiff", "ActivityFrame family"],
    targetCanonicalImplementation: "catalogue-selected shared primitives or explicit deletion",
    intendedModes: ["development_reference"], routesAffected: ["/dev/adle/morphology-primitives"],
    regressionRequirements: ["confirm no historical import", "retain screenshots or replacement gallery fixture where valuable"],
    learnerRuntimeRisk: "low", modelCReleaseChangeRequired: false,
    consolidationOpportunity: "Potential cleanup only; measure after architecture decisions because some primitives may seed genuine gap implementations.",
  },
  {
    priority: "P2", title: "Retain historical route compatibility until replay retirement",
    currentImplementations: ["fixed_un_prefix_word_lab:v1", "closed_compound_word_lab:v1 payload/runtime adapter"],
    targetCanonicalImplementation: "current shared renderers behind explicit compatibility adapters",
    intendedModes: ["historical_replay"], routesAffected: ["fixed_un_prefix_word_lab:v1", "closed_compound_word_lab:v1"],
    regressionRequirements: ["persisted payload replay", "resume", "completion", "separator policy", "no new assignment generation"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: false,
    consolidationOpportunity: "The closed-v1 learner UI is retired; retain only payload decoding, route resolution, resume and completion compatibility until persisted replay is retired.",
  },
] as const;

export const ADLE_ACTIVITY_AUDIT_CONCLUSIONS = {
  authoritativeBaseSha: "1306632d6ba643c103bf8d670706b085c88258e1",
  startingState: {
    auditWorktree: "Clean Group 2 worktree on codex/adle-group2-lesson-reflection at current origin/main; only the verified three-file Reflection preview precursor was carried forward before implementation.",
    protectedOccupiedCheckout: "The Group 1 checkout remained on codex/adle-group1-build-convergence with its authorized three-file Group 2 precursor patch intact; the patch was also preserved as a named stash object before transfer.",
    runtimeRegistries: [
      "lib/adle/activity-template-registry.ts — 37 generic template keys and renderer-kind dispatch",
      "components/adle/activities/registry.ts — React compatibility wrapper over the generic runtime registry",
      "lib/adle/composable-lesson/generic-snapshot-registry.ts — versioned generic snapshot semantics for the same 37 keys",
      "lib/adle/composable-lesson/activity-requirements.ts — 15 pedagogical activity fact contracts",
      "lib/adle/curriculum-readiness/route-registry.ts — seven generic/specialist route declarations",
      "components/adle/word-lab/activity-registry.tsx — five dark Common Word Lab fixture plugin registrations",
    ],
    architectureDocuments: [
      "docs/architecture/adle-activity-platform-architecture.md",
      "docs/contracts/adle-instructional-activity-registry-contract.md",
      "docs/generated/adle-composable-lesson/route-and-activity-reference.md",
      "docs/implementation/adle-composable-lesson-migration-tracker.md",
      "docs/architecture/adle-compound-word-lesson-v2.md",
      "docs/implementation/adle-base-word-family-lesson-plan.md",
    ],
  },
  authorityRelationship: "Activity Catalogue is the architectural chooser and capability inventory. activity-template-registry.ts remains the generic runtime dispatch authority; curriculum route registry plus specialist adapters remain the rich-route runtime authority. The catalogue regression maps every generic template key exactly once and validates every component path, so these authorities cannot silently drift while runtime refactoring is frozen.",
  buildBoundary: "BUILD is one shared ordered-placement interaction family with two learner experiences. DefinitionWordBuilder presents one definition-led target and is configured by all 19 Prefix, Suffix/Affix and Base Word microskills. CompoundJigsawActivity presents anonymous puzzle rows above one deterministic mixed bank using Jigsaw-shaped component, SPACE and hyphen pieces; checked row content identifies and locks the governed word. Both use OrderedBuildEngine for candidate order, placement, rearrangement, validation, completion and restoration. Historical closed-compound v1 payloads are translated at the route boundary to generalized two-piece/no-join targets; no historical Jigsaw UI remains.",
  cleaverBoundary: "Keep SplitHandle as the canonical interaction engine. Add isolate_base as configuration describing base segment/index and required adjacent cuts; add an optional post-split confirmation step; model final-y restoration as a post-split transformation hook; preserve SplitHandle's multi-boundary state, supplied components, copy policy, two-miss scaffold, focus movement, keyboard/pointer controls, sounds, reduced motion, success state and continuation. Migrate BaseWordCleaver only after pixel/interaction/resume parity. Do not merge word assembly or syllable splitting into Cleaver.",
  reflectionBoundary: "ERROR_REPAIR remains ReflectionActivity and keeps reveal-hide-retry evidence. MEMORY_CUE remains child mnemonic authoring. LessonReflection is the canonical end-of-first-impression LESSON_REFLECTION: it receives normalized attempted-versus-correct spelling summaries, a governed lesson-specific prompt, optional specialist/context recap, and one controlled response. Prefix context slips remain recap data rather than target assessment evidence. Route correctness, persistence, assignment and completion adapters remain outside the component; stored historical prompt keys/text remain assignment-owned.",
  newActivityRule: [
    "Search the canonical Activity Catalogue.",
    "Reuse an existing activity as-is if it meets the pedagogical requirement.",
    "Otherwise configure an existing supported mode.",
    "Otherwise extend the shared abstraction with a governed mode.",
    "Only then declare NEW_INTERACTION_REQUIRED with the pedagogical requirement, why no catalogue activity works, why configuration is insufficient, and why extending an abstraction is inappropriate.",
  ],
  firstImpressionImplications: {
    targetSequence: ["Reading Page 1", "Reading Page 2", "optional Reading Page 3", "Meet the Words", "configured Activity Catalogue sequence", "Production/Recall", "Lesson Reflection"],
    approximatingRoutes: [
      "compound_word_lab:v2 already has ordered reading pages, lesson words, configured rich work, controlled recall, dictation and reflection",
      "base_word_lab:v2 has introduction, Meet the Words/family reveal, configured rich work, controlled recall, dictation and reflection",
      "dynamic_prefix_word_lab:v2 and dynamic_affix_word_lab:v3 have multi-screen Learn, Discover, configured rich work, controlled recall, dictation and reflection",
    ],
    bespokePieces: ["reading-page data shape outside Compound", "Meet the Words implementations", "shell navigation/resume", "sentence Dictation wrappers", "route completion adapters"],
  },
  reviewImplications: {
    eligible: ["REVIEW_SORT", "CONTROLLED_SPELLING.audio_recall", "DICTATION.review", "FREE_WRITING.review_transfer once implemented"],
    notEligible: ["INTRODUCTION", "READING_PAGE", "MEANING_DISCOVERY", "WORD_FAMILY_REVEAL", "LESSON_REFLECTION"],
    distinctions: ["ERROR_REPAIR is conditional same-session repair, not scheduled review.", "LESSON_REFLECTION is end-of-first-impression metacognition, not review.", "Review evidence remains independent retrieval; Cover Check is only review-eligible when its reveal policy does not contaminate the scored attempt."],
  },
  genuineGaps: ["canonical Reading Page outside Compound", "authentic Free Writing surface", "phoneme–grapheme mapping", "syllable split/rebuild", "production-ready spelling transformation interaction"],
} as const;

export function activityAuditCounts() {
  const byStatus = Object.fromEntries(
    (["CANONICAL", "CANONICAL_MODE", "COMPATIBILITY_ONLY", "DUPLICATE_TO_MIGRATE", "DEAD_OR_UNREFERENCED", "REQUIRES_ARCHITECTURE_DECISION"] as const)
      .map((status) => [status, ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.filter((row) => row.classification === status).length]),
  ) as Record<ActivityArchitecturalStatus, number>;
  return {
    totalImplementations: ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.length,
    governedActivityConcepts: ADLE_ACTIVITY_CATALOGUE.length,
    canonicalActivityConcepts: ADLE_ACTIVITY_CATALOGUE.filter((entry) => entry.status === "CANONICAL").length,
    unresolvedActivityConcepts: ADLE_ACTIVITY_CATALOGUE.filter((entry) => entry.status === "REQUIRES_ARCHITECTURE_DECISION").length,
    configuredModes: ADLE_ACTIVITY_CATALOGUE.reduce((total, entry) => total + entry.supportedModes.length, 0),
    ...byStatus,
  };
}
