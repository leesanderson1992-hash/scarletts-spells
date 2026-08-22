/**
 * Canonical architectural inventory of child-facing ADLE activities.
 *
 * This is deliberately descriptive. Runtime dispatch is owned by canonical
 * activity contracts, the host registry, and registered specialist adapters.
 * Nothing in this module writes learner state or changes route activation.
 */

export type ActivityArchitecturalStatus =
  | "CANONICAL"
  | "CANONICAL_MODE"
  | "THIN_ADAPTER"
  | "DEVELOPMENT_REFERENCE"
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
  releaseBoundary: string;
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
    canonicalComponent: "TeachingPages", canonicalComponentPath: "components/adle/first-impression/teaching-pages.tsx",
    supportedModes: ["teaching_page", "meet_words", "historical_generic_read_only"], modeDescriptions: {
      teaching_page: "Shows one to three ordered authored teaching pages.",
      meet_words: "Required final page using the accepted word-card presentation without audio or evidence.",
      historical_generic_read_only: "Replays immutable generic intro copy through the explicit IntroActivity compatibility adapter.",
    }, requiredInputs: ["one to three authored teaching pages", "governed lesson words"], optionalInputs: ["callout", "model", "examples", "sections", "provenance"],
    usedByRoutes: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES], usedByMicroSkills: ["generic composer catalogue", ...MORPHOLOGY_SKILLS],
    templateKeys: ["MICRO_READ_ONLY_INTRO", "LESSON_WORDS_INTRO"], status: "CANONICAL",
    whenToUse: "At the start of every First Impression lesson for authored teaching followed by required Meet the Words.",
    whenNotToUse: "For interactive family exploration; use WORD_FAMILY_REVEAL as a configured middle activity.",
    compatibilityImplementations: ["IntroActivity for immutable generic assignments"],
    notes: "Introduction and Reading Page remain pedagogical content concepts but normalize to TeachingPages. Meet the Words is always the final TeachingPages page and captures no attempt.",
  }),
  activity({
    activityKey: "READING_PAGE", displayName: "Reading page", interactionFamily: "teaching_read",
    pedagogicalPurpose: "Teach a concept through two or three ordered, child-readable pages.",
    canonicalComponent: "TeachingPages", canonicalComponentPath: "components/adle/first-impression/teaching-pages.tsx",
    supportedModes: ["teaching_page"], modeDescriptions: { teaching_page: "Compound reading content is normalized into the same ordered teaching-page presentation." },
    requiredInputs: ["ordered reading pages"], optionalInputs: ["examples", "sections"],
    usedByRoutes: ["compound_word_lab:v2"], usedByMicroSkills: [...COMPOUND_SKILLS], status: "CANONICAL",
    whenToUse: "When the child needs substantial authored explanation before interaction.",
    whenNotToUse: "To create another navigation engine; short and long teaching both use TeachingPages.",
    notes: "READING_PAGE is retained as a curriculum concept only. It no longer selects a separate stateful learner renderer.",
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
    supportedModes: ["find_boundaries", "identify_components", "isolate_component"], modeDescriptions: {
      find_boundaries: "Strike all governed split points, with optional two-miss scaffold.",
      identify_components: "After success, display supplied component strings and tailored explanation.",
      isolate_component: "Strike only the governed adjacent boundaries, restore selected cuts, and highlight the isolated component.",
    }, requiredInputs: ["word", "splitPoints"], optionalInputs: ["components", "selected boundaries", "isolated component index", "feedback copy", "scaffold policy"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...PREFIX_ROUTES, AFFIX_ROUTE, BASE_ROUTE], usedByMicroSkills: [...PREFIX_SKILLS, ...AFFIX_SKILLS, ...BASE_SKILLS],
    templateKeys: ["MOR_STRIP_BUILD"], status: "CANONICAL", whenToUse: "To locate meaningful morpheme or word-part boundaries.",
    whenNotToUse: "To reorder parts into a word; use WORD_ASSEMBLY.",
    notes: "Group 4 converged Prefix, Affix and Base Word on one stateful SplitHandle. Spelling transformations are composed after Split completes.",
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
    supportedModes: ["word_to_definition", "component_clues", "historical_free_response"], modeDescriptions: { word_to_definition: "Select a word then its definition.", component_clues: "Shows component meanings as clues.", historical_free_response: "Preserves a definition-less persisted typed-response contract without claiming a rich meaning interaction." },
    requiredInputs: ["words", "definitions"], optionalInputs: ["component meanings", "component-to-whole explanation"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...COMPOUND_ROUTES, ...PREFIX_ROUTES, AFFIX_ROUTE, GENERIC_ROUTE], usedByMicroSkills: [...COMPOUND_SKILLS, ...PREFIX_SKILLS, ...AFFIX_SKILLS, "generic homophone/morphology skills"],
    templateKeys: ["HOM_MEANING_MATCH", "MOR_MEANING_MATCH", "MOR_COMPOUND_MEANING_CONNECTION"], status: "CANONICAL",
    whenToUse: "When each word must be paired with a distinct definition.", whenNotToUse: "When words belong in reusable semantic groups; use MEANING_SORT.",
    notes: "Compound routes use the rich interaction directly. Generic HOM/MOR keys select the same canonical renderer when their payload contains governed definitions; definition-less immutable historical payloads normalize to a compatibility-only GuidedActivity at the dispatch boundary.",
  }),
  activity({
    activityKey: "MEANING_SORT", displayName: "Meaning sort", interactionFamily: "sorting",
    pedagogicalPurpose: "Sort words into reusable meaning or affix-form groups.",
    canonicalComponent: "BinSort", canonicalComponentPath: "components/adle/activities/shared/bin-sort.tsx",
    supportedModes: ["meaning", "prefix_form", "immediate_feedback", "success_sparkle", "completion_overview"], modeDescriptions: {
      meaning: "Sort by semantic group.", prefix_form: "Sort base words by the prefix form they take.", immediate_feedback: "Respond after each choice.", success_sparkle: "Brief presentation-only correct-placement celebration before automatic advance.", completion_overview: "Read-only grouping of every governed word after the final correct placement.",
    }, requiredInputs: ["items with destinations", "bins"], optionalInputs: ["feedback policy", "specialist teaching cards"],
    supportsPointer: true, supportsAudio: true, usedByRoutes: [...PREFIX_ROUTES, AFFIX_ROUTE], usedByMicroSkills: [...PREFIX_SKILLS, ...AFFIX_SKILLS],
    status: "CANONICAL", whenToUse: "When several words share meaningful categories.", whenNotToUse: "For word-to-definition pairing; use MEANING_MATCH. The completion overview is a state of this activity, not another activity.",
  }),
  activity({
    activityKey: "REVIEW_SORT", displayName: "Historical review-sort key", interactionFamily: "compatibility_key",
    pedagogicalPurpose: "Decode immutable historical REVIEW_QUICK_SORT assignment and snapshot payloads without preserving a learner renderer.",
    canonicalComponent: null, canonicalComponentPath: null,
    supportedModes: ["compatibility_noop"], modeDescriptions: { compatibility_noop: "Accept and ignore the historical non-evidence item while review proceeds to retrieval." },
    requiredInputs: [], optionalInputs: ["historical review words", "historical sortBins"],
    usedByRoutes: ["historical generic assignments only"], usedByMicroSkills: ["historical review payloads only"], templateKeys: ["REVIEW_QUICK_SORT"],
    status: "COMPATIBILITY_ONLY", firstImpressionEligible: false, reviewEligible: false,
    whenToUse: "Only while decoding immutable historical assignments or generic snapshot v2 payloads.", whenNotToUse: "For forward curriculum generation or any learner-facing categorisation.",
    notes: "The current registry maps the key to compatibility_noop. Generic snapshot v2 retains its immutable quick_sort discriminator solely for historical decoding.",
  }),
  activity({
    activityKey: "COVER_CHECK", displayName: "Cover Check", interactionFamily: "cover_recall",
    pedagogicalPurpose: "Study a visible word, hide it, recall it, and compare the attempt.",
    canonicalComponent: "CoverShutter", canonicalComponentPath: "components/adle/activities/shared/cover-shutter.tsx",
    supportedModes: ["whole_word", "component_marked", "ratio_close_policy"], modeDescriptions: { whole_word: "Show and cover a whole word.", component_marked: "Show governed components separated visually.", ratio_close_policy: "Require a configured proportion of the shutter track." },
    requiredInputs: ["word", "splitPoints"], optionalInputs: ["components", "closePolicy", "resume state", "progress label", "continue callback"],
    capturesAttempt: true, evidenceBearing: true, supportsPointer: true, supportsAudio: true,
    usedByRoutes: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES], usedByMicroSkills: ["historical generic compatibility", ...MORPHOLOGY_SKILLS], status: "CANONICAL", reviewEligible: false,
    whenToUse: "For supported study-cover-recall practice where a teaching view is intentional.", whenNotToUse: "For cold dictation or diagnostic retrieval.",
    notes: "Prefix, Suffix/Affix, Base Word and Compound routes directly configure this one learner renderer. Historical CONTROLLED_SPELLING assignment keys remain payload/evidence compatibility metadata, not a second specialist presentation.",
  }),
  activity({
    activityKey: "CONTROLLED_SPELLING", displayName: "Controlled spelling", interactionFamily: "typed_recall",
    pedagogicalPurpose: "Historical catalogue concept for controlled study/spelling payloads.",
    canonicalComponent: "CoverShutter", canonicalComponentPath: "components/adle/activities/shared/cover-shutter.tsx",
    supportedModes: ["compatibility_to_cover_check"], modeDescriptions: { compatibility_to_cover_check: "Accepted CONTROLLED_SPELLING and HIDE_WRITE keys configure canonical Cover Check." },
    requiredInputs: ["governed target word"], optionalInputs: ["split points", "resume state"],
    capturesAttempt: true, evidenceBearing: true, supportsPointer: true, usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["historical generic compatibility only"],
    templateKeys: ["HIDE_WRITE", "CONTROLLED_SPELLING"], status: "COMPATIBILITY_ONLY", firstImpressionEligible: false, reviewEligible: false,
    whenToUse: "Only to decode accepted historical template keys into Cover Check.", whenNotToUse: "For new curriculum or as a learner-facing activity choice.",
    notes: "Visible-copy and simplified HIDE_WRITE learner UI are retired. New first-impression study/spelling uses COVER_CHECK directly.",
  }),
  activity({
    activityKey: "DICTATION", displayName: "Dictation", interactionFamily: "typed_recall",
    pedagogicalPurpose: "Transcribe a governed authored sentence from audio, then lock and compare.",
    canonicalComponent: "SentenceDictation", canonicalComponentPath: "components/adle/activities/shared/sentence-dictation.tsx",
    supportedModes: ["whole_sentence", "target_token", "target_span"], modeDescriptions: {
      whole_sentence: "Transcribe and compare the whole authored sentence.", target_token: "Route adapter extracts one governed token for correctness/evidence.", target_span: "Route adapter extracts an exact governed multi-token span.",
    }, requiredInputs: ["authored sentence", "audio text", "target binding"], optionalInputs: ["target token index", "target span", "resume state"],
    capturesAttempt: true, evidenceBearing: true, supportsAudio: true, usedByRoutes: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES], usedByMicroSkills: ["future generic curriculum with authored sentence contract", ...MORPHOLOGY_SKILLS],
    templateKeys: ["DICTATION_NO_IMAGE", "DICTATION_SENTENCE_CONTEXT"],
    status: "CANONICAL", reviewEligible: false, whenToUse: "For every first-impression Dictation activity with governed authored sentence content.", whenNotToUse: "For single-word review/diagnostic recall or visible study practice.",
    compatibilityImplementations: ["legacy template-key normalization"],
    notes: "The historical first-impression keys configure SentenceDictation. The section-overloaded DICTATION_SENTENCE_CONTEXT key configures ColdWordRecall when replayed in scheduled review. No single-word or sentence-context textbox renderer remains; missing historical lesson sentence content fails closed instead of exposing an inferior mode.",
  }),
  activity({
    activityKey: "COLD_WORD_RECALL", displayName: "Cold Word Recall", interactionFamily: "cold_typed_recall",
    pedagogicalPurpose: "Collect one answer-safe spoken-word response before any correct spelling is revealed.",
    canonicalComponent: "ColdWordRecall", canonicalComponentPath: "components/adle/activities/shared/cold-word-recall.tsx",
    supportedModes: ["scheduled_review", "diagnostic_probe"], modeDescriptions: { scheduled_review: "Locks scheduled-review evidence before feedback.", diagnostic_probe: "Locks a non-punitive diagnostic response before feedback." },
    requiredInputs: ["authored audio target", "governed target word", "evidence mode"], optionalInputs: ["resume input before lock", "muted fixture mode"],
    capturesAttempt: true, evidenceBearing: true, supportsAudio: true, usedByRoutes: [GENERIC_ROUTE], usedByMicroSkills: ["all review-eligible and diagnostic generic micro-skills"],
    templateKeys: ["REVIEW_DICTATION", "DIAGNOSTIC_DICTATION_PROBE"], status: "CANONICAL", firstImpressionEligible: false, reviewEligible: true,
    whenToUse: "For scheduled review or diagnostic scouting where seeing the answer first would contaminate evidence.", whenNotToUse: "For first-impression teaching or authored whole-sentence Dictation.",
    notes: "The component owns audio, cold input, irreversible local lock and post-lock comparison only. Scheduler, rewards, due metadata, probe intake and persistence remain adapter-owned.",
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
    notes: "These composer/meta writing tokens remain outside Group 3. The generic runner uses its guided writing fallback; they are not Cover/Dictation learner modes.",
  }),
  activity({
    activityKey: "TRANSFORMATION", displayName: "Spelling transformation", interactionFamily: "transformation",
    pedagogicalPurpose: "Show a governed source form after the child has identified the visible word-part boundary.",
    canonicalComponent: "SpellingTransformationReveal", canonicalComponentPath: "components/adle/activities/shared/spelling-transformation-reveal.tsx",
    supportedModes: ["surface_to_source"], modeDescriptions: { surface_to_source: "Reveal a governed source form after Split completes; the live Base Word case restores final y from visible i." },
    requiredInputs: ["source text", "surface text", "explanation"], optionalInputs: ["action copy", "continuation copy"], supportsPointer: true, supportsAudio: true,
    usedByRoutes: [BASE_ROUTE], usedByMicroSkills: [...BASE_SKILLS], status: "CANONICAL_MODE",
    whenToUse: "When the spelling change itself must be noticed or rehearsed.", whenNotToUse: "For a simple unchanged join.",
    notes: "This is a presentation-only post-Split mode. Drop-e, consonant doubling and other transformation interactions remain deferred.",
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
  const recommendedAction = classification === "CANONICAL" || classification === "CANONICAL_MODE"
    ? "Retain and route new work through the catalogue."
    : classification === "THIN_ADAPTER"
      ? "Retain as state-free curriculum translation into the canonical component."
      : classification === "DEVELOPMENT_REFERENCE"
        ? "Retain for governed development inspection only; do not route learner interaction through it."
        : "Do not add new usage before the backlog action is complete.";
  return {
    implementationName, filePath, activityConcept, classification, canonicalCandidate,
    interactionFamily: activityConcept.toLocaleLowerCase("en-GB"), currentRouteUsages: routes,
    currentMicroSkillUsages: [...new Set(inferredSkills)], registryTemplateKeys: [], propsConfigDifferences: "See component props and route adapter.",
    visualDifferences: "Uses its owning shell styling.", behaviouralDifferences: "Local interaction state only.",
    persistenceEvidenceDifferences: "Renderer does not write directly; owning session submits completion.",
    recommendedAction,
    migrationRisk: "medium", historicalReplayDependency: false,
    evidence: "Repository import and route-dispatch trace at the audited base SHA.", notes: "", ...input,
  };
}

const GENERIC = [GENERIC_ROUTE];
const PREFIX_AFFIX = [...PREFIX_ROUTES, AFFIX_ROUTE];
const SPECIALIST = [...ALL_SPECIALIST_ROUTES];

export const ADLE_ACTIVITY_IMPLEMENTATION_AUDIT: readonly ActivityImplementationAuditRow[] = [
  auditRow("TeachingPages", "components/adle/first-impression/teaching-pages.tsx", "INTRODUCTION / READING_PAGE / MEET_WORDS", "CANONICAL", "TeachingPages", { currentRouteUsages: SPECIALIST, behaviouralDifferences: "Owns one to three authored pages, the required final Meet the Words page, Back/Next, focus and page position.", persistenceEvidenceDifferences: "Page position only; no attempt, correctness or evidence.", migrationRisk: "high" }),
  auditRow("MeetWords presentation", "components/adle/first-impression/teaching-pages.tsx", "MEET_WORDS", "CANONICAL_MODE", "TeachingPages", { currentRouteUsages: SPECIALIST, behaviouralDifferences: "Required final page with the accepted white word-card treatment; deliberately has no audio or interaction evidence.", migrationRisk: "medium" }),
  auditRow("IntroActivity compatibility renderer", "components/adle/activities/intro-activity.tsx", "INTRODUCTION", "COMPATIBILITY_ONLY", "TeachingPages", { currentRouteUsages: GENERIC, registryTemplateKeys: ["MICRO_READ_ONLY_INTRO", "LESSON_WORDS_INTRO"], migrationRisk: "low", historicalReplayDependency: true, recommendedAction: "Retain only for immutable generic composer assignments until their compatibility renderer is normalized at the boundary." }),
  auditRow("GuidedActivity", "components/adle/activities/guided-activity.tsx", "MEMORY_CUE / HISTORICAL_FREE_RESPONSE", "COMPATIBILITY_ONLY", "GuidedActivity", { currentRouteUsages: GENERIC, registryTemplateKeys: ["MEMORY_CUE", "definition-less historical meaning keys", "MUST_USE_FREEWRITING", "REVIEW_MUST_USE_WRITING"], historicalReplayDependency: true, notes: "The canonical host supplies an explicit memory_cue or historical_free_response variant. Unknown and missing rich PG/HOM/INF/IRRE/MOR/PAT/SYL/SCHWA interactions fail closed and can no longer select this renderer." }),
  auditRow("REVIEW_QUICK_SORT compatibility mapping", "lib/adle/generic-activity-compatibility.ts", "REVIEW_SORT", "COMPATIBILITY_ONLY", null, { currentRouteUsages: ["historical generic assignments only"], registryTemplateKeys: ["REVIEW_QUICK_SORT"], persistenceEvidenceDifferences: "The historical item never carried production evidence and normalizes to the registered compatibility no-op before review retrieval.", historicalReplayDependency: true, migrationRisk: "low" }),
  auditRow("ReflectionActivity", "components/adle/activities/reflection-activity.tsx", "ERROR_REPAIR", "CANONICAL", "ReflectionActivity", { currentRouteUsages: GENERIC, registryTemplateKeys: ["ERROR_REFLECTION_CUE"], behaviouralDifferences: "Enforces reveal then Hide Word before retry.", migrationRisk: "high" }),

  auditRow("SplitHandle", "components/adle/activities/shared/split-handle.tsx", "CLEAVER", "CANONICAL", "SplitHandle", { currentRouteUsages: [...PREFIX_AFFIX, BASE_ROUTE], registryTemplateKeys: ["MOR_STRIP_BUILD"], propsConfigDifferences: "Multiple governed split points, controlled/restored selected boundaries, isolated component index, feedback/scaffold/copy policy.", behaviouralDifferences: "Owns all boundary selection, checking, focus, sound, motion and completion mechanics.", migrationRisk: "high" }),
  auditRow("SpellingTransformationReveal", "components/adle/activities/shared/spelling-transformation-reveal.tsx", "TRANSFORMATION.surface_to_source", "CANONICAL_MODE", "SpellingTransformationReveal", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Receives governed source/surface text and explanation after Split completion.", behaviouralDifferences: "Presentation-only reveal state cannot alter selected boundaries or evidence.", migrationRisk: "medium" }),
  auditRow("DraggableTile", "components/adle/activities/shared/draggable-tile.tsx", "TILE_PRIMITIVE", "CANONICAL", "DraggableTile", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "low" }),
  auditRow("OrderedBuildEngine", "components/adle/activities/shared/ordered-build-engine.ts", "BUILD_MECHANICS", "CANONICAL", "OrderedBuildEngine", { currentRouteUsages: [...PREFIX_AFFIX, BASE_ROUTE, ...COMPOUND_ROUTES], behaviouralDifferences: "Headless placement, reordering, validation and restoration state shared by rail and Jigsaw presentations.", migrationRisk: "high" }),
  auditRow("SnapRail", "components/adle/activities/shared/snap-rail.tsx", "WORD_ASSEMBLY", "CANONICAL_MODE", "DefinitionWordBuilder", { currentRouteUsages: [...PREFIX_AFFIX, BASE_ROUTE], registryTemplateKeys: ["MOR_BUILD_WORD"], behaviouralDifferences: "One-row tile and pointer presentation over OrderedBuildEngine.", migrationRisk: "high" }),
  auditRow("DefinitionWordBuilder", "components/adle/activities/shared/definition-word-builder.tsx", "WORD_ASSEMBLY", "CANONICAL", "DefinitionWordBuilder", { currentRouteUsages: [...PREFIX_AFFIX, BASE_ROUTE], registryTemplateKeys: ["MOR_BUILD_WORD"], propsConfigDifferences: "Prefix, suffix and Base Word routes supply governed parts, definitions, word sums and feedback without route-local build state.", migrationRisk: "high" }),
  auditRow("BinSort", "components/adle/activities/shared/bin-sort.tsx", "MEANING_SORT", "CANONICAL", "BinSort", { currentRouteUsages: PREFIX_AFFIX, behaviouralDifferences: "One state machine owns current item, correctness, brief success phase, automatic advance and completion.", persistenceEvidenceDifferences: "Glitter and Overview are presentation-only; onComplete retains the existing guided completion boundary.", migrationRisk: "medium" }),
  auditRow("BinSortOverview", "components/adle/activities/shared/bin-sort.tsx", "MEANING_SORT completion view", "CANONICAL_MODE", "BinSort", { currentRouteUsages: PREFIX_AFFIX, behaviouralDifferences: "Stateless semantic grouping derived from BinSort items, bins and correct placements.", persistenceEvidenceDifferences: "Creates no attempt, evidence or persistence event.", migrationRisk: "low" }),
  auditRow("CoverShutter", "components/adle/activities/shared/cover-shutter.tsx", "COVER_CHECK", "CANONICAL", "CoverShutter", { currentRouteUsages: [GENERIC_ROUTE, ...SPECIALIST], registryTemplateKeys: ["CONTROLLED_SPELLING", "HIDE_WRITE"], behaviouralDifferences: "Owns look/cover/write/check and the single word DiffReveal.", persistenceEvidenceDifferences: "Historical keys are retained by dispatch/evidence adapters, not learner UI.", migrationRisk: "high" }),
  auditRow("SentenceDictation", "components/adle/activities/shared/sentence-dictation.tsx", "DICTATION.whole_sentence", "CANONICAL", "SentenceDictation", { currentRouteUsages: [GENERIC_ROUTE, ...SPECIALIST], registryTemplateKeys: ["DICTATION_NO_IMAGE", "DICTATION_SENTENCE_CONTEXT"], propsConfigDifferences: "Authored audio and correct sentence are separate inputs; routes control value, checked state and continuation.", behaviouralDifferences: "Owns textarea, manual check, locked post-check DiffReveal and focus/accessibility behavior.", persistenceEvidenceDifferences: "Emits callbacks only and contains no assignment, correctness or persistence policy.", migrationRisk: "high" }),
  auditRow("ColdWordRecall", "components/adle/activities/shared/cold-word-recall.tsx", "REVIEW_DICTATION / DIAGNOSTIC_DICTATION_PROBE", "CANONICAL", "ColdWordRecall", { currentRouteUsages: GENERIC, registryTemplateKeys: ["REVIEW_DICTATION", "DIAGNOSTIC_DICTATION_PROBE"], propsConfigDifferences: "scheduled_review and diagnostic_probe modes change copy only; route adapters retain evidence policy.", behaviouralDifferences: "Correct spelling is absent until the controlled response is locked; locked input is read-only and has no back/edit path.", persistenceEvidenceDifferences: "Existing review scheduler and diagnostic intake consume the unchanged owning attempt maps.", migrationRisk: "high" }),
  auditRow("HearWordButton", "components/adle/activities/shared/authored-audio.tsx", "AUDIO_SUPPORT", "CANONICAL_MODE", "CoverShutter / SentenceDictation / ColdWordRecall", { currentRouteUsages: [GENERIC_ROUTE, ...SPECIALIST], migrationRisk: "low" }),
  auditRow("DiffReveal", "components/adle/activities/shared/diff-reveal.tsx", "POST_ATTEMPT_COMPARISON", "CANONICAL_MODE", "COVER_CHECK / DICTATION", { currentRouteUsages: SPECIALIST, propsConfigDifferences: "Word and sentence modes; optional split points.", migrationRisk: "high" }),
  auditRow("MorphemeTile", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_PART_TILE", "DEAD_OR_UNREFERENCED", "DraggableTile", { currentRouteUsages: ["/dev/adle/morphology-primitives only"], evidence: "Used only by development preview compositions." }),
  auditRow("MorphemeSequence", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_PART_DISPLAY", "DEVELOPMENT_REFERENCE", null, { currentRouteUsages: ["/dev/adle/morphology-primitives only"], recommendedAction: "Retain only as a read-only governed morphology-data inspection surface; do not route learner interaction through it." }),
  auditRow("MorphemeRail", "components/adle/activities/morphology/shared/morphology-primitives.tsx", "WORD_ASSEMBLY", "DUPLICATE_TO_MIGRATE", "SnapRail", { currentRouteUsages: ["/dev/adle/morphology-primitives only"], behaviouralDifferences: "Tap-only placement without correctness or completion contract.", migrationRisk: "low" }),
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

  auditRow("Discovery", "components/adle/morphology/morphology-guided-lesson.tsx", "MEANING_DISCOVERY", "CANONICAL", "Discovery", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "One stateful engine receives prefix/suffix position, label, governed transformation cards, distractors and audio through the morphology payload.", migrationRisk: "high" }),
  auditRow("SplitBuild", "components/adle/morphology/morphology-guided-lesson.tsx", "CLEAVER", "THIN_ADAPTER", "SplitHandle", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Translates prefix/suffix semantics and feedback policy into SplitHandle without owning learner state.", migrationRisk: "high" }),
  auditRow("Morphology Cover Check adapter", "components/adle/morphology/morphology-guided-lesson.tsx", "COVER_CHECK adapter", "CANONICAL_MODE", "CoverShutter", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Supplies governed word parts, ratio close policy, restored attempt/check state and route callbacks without learner UI.", migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("Morphology Sentence Dictation adapter", "components/adle/morphology/morphology-guided-lesson.tsx", "DICTATION.whole_sentence adapter", "CANONICAL_MODE", "SentenceDictation", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Supplies authored sentence/audio, restored response/check state and continuation copy.", persistenceEvidenceDifferences: "Target-token and context-slip analysis remain route-owned.", migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("MorphologyReflectionAdapter", "components/adle/morphology/morphology-guided-lesson.tsx", "LESSON_REFLECTION adapter", "CANONICAL_MODE", "LessonReflection", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Derives normalized target misses, governed Prefix/Suffix prompt, teaching recaps and Prefix context-slip recap.", persistenceEvidenceDifferences: "Retains completeAdleLessonPartAction, completion trace, assignment binding and specialist attempt envelopes outside LessonReflection.", migrationRisk: "high" }),
  auditRow("PrefixTeachingCards", "components/adle/morphology/prefix-teaching-cards.tsx", "INTRODUCTION / LESSON_REFLECTION_RECAP", "CANONICAL_MODE", "INTRODUCTION / LessonReflection specialist recap", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Full and compact display modes.", persistenceEvidenceDifferences: "Read-only specialist recap content; never writes evidence.", migrationRisk: "medium" }),
  auditRow("SelectedPrefixFeedback", "components/adle/morphology/prefix-teaching-cards.tsx", "MEANING_SORT_FEEDBACK", "CANONICAL_MODE", "BinSort", { currentRouteUsages: PREFIX_AFFIX, propsConfigDifferences: "Renders selected-form meaning/rule/example feedback inside BinSort and SnapRail adapters.", persistenceEvidenceDifferences: "Feedback only.", migrationRisk: "medium" }),

  auditRow("Base Word teaching adapter", "components/adle/morphology/base-word-family-guided-lesson.tsx", "INTRODUCTION / MEET_WORDS", "THIN_ADAPTER", "TeachingPages", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Maps the base-word strategy and governed independent words into TeachingPages without another navigation state machine.", migrationRisk: "medium" }),
  auditRow("FamilyReveal", "components/adle/morphology/base-word-family-guided-lesson.tsx", "WORD_FAMILY_REVEAL", "CANONICAL", "FamilyReveal", { currentRouteUsages: [BASE_ROUTE], registryTemplateKeys: ["MOR_BASE_FAMILY_REVEAL (route-specific binding)"], migrationRisk: "high" }),
  auditRow("Cleave (Base Word adapter)", "components/adle/morphology/base-word-family-guided-lesson.tsx", "CLEAVER / TRANSFORMATION.surface_to_source", "THIN_ADAPTER", "SplitHandle", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Derives adjacent governed boundaries, controlled cuts, isolated component and optional post-Split source-form reveal without owning boundary state.", migrationRisk: "high" }),
  auditRow("Base Word Cover Check adapter", "components/adle/morphology/base-word-family-guided-lesson.tsx", "COVER_CHECK adapter", "CANONICAL_MODE", "CoverShutter", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Supplies the independent word and restored attempt/check state without learner UI.", migrationRisk: "high" }),
  auditRow("Base Word Sentence Dictation adapter", "components/adle/morphology/base-word-family-guided-lesson.tsx", "DICTATION.whole_sentence adapter", "CANONICAL_MODE", "SentenceDictation", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Supplies authored audio/sentence and restored response/check state.", persistenceEvidenceDifferences: "Authored target-token extraction remains route-owned.", migrationRisk: "high" }),
  auditRow("Base Word reflection adapter", "components/adle/morphology/base-word-family-guided-lesson.tsx", "LESSON_REFLECTION adapter", "CANONICAL_MODE", "LessonReflection", { currentRouteUsages: [BASE_ROUTE], propsConfigDifferences: "Extracts the governed target token from each dictated sentence and derives the base-word prompt.", persistenceEvidenceDifferences: "Returns controlled attempts, sentence attempts and reflection to BaseWordFamilyPart; atomic completion remains external.", migrationRisk: "high" }),

  auditRow("Compound teaching adapter", "components/adle/morphology/closed-compound-guided-lesson.tsx", "READING_PAGE / MEET_WORDS", "THIN_ADAPTER", "TeachingPages", { currentRouteUsages: ["compound_word_lab:v2", "closed_compound_word_lab:v1"], propsConfigDifferences: "Maps governed reading sections, examples and compound word structure into TeachingPages.", migrationRisk: "medium", historicalReplayDependency: true }),
  auditRow("CompoundJigsawActivity", "components/adle/morphology/compound-jigsaw-activity.tsx", "COMPOUND_JIGSAW", "CANONICAL", "CompoundJigsawActivity", { currentRouteUsages: [...COMPOUND_ROUTES], registryTemplateKeys: ["MOR_COMPOUND_JIGSAW"], migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("MeaningConnectionActivity", "components/adle/morphology/meaning-connection-activity.tsx", "MEANING_MATCH", "CANONICAL", "MeaningConnectionActivity", { currentRouteUsages: [...COMPOUND_ROUTES, GENERIC_ROUTE], registryTemplateKeys: ["HOM_MEANING_MATCH", "MOR_MEANING_MATCH", "MOR_COMPOUND_MEANING_CONNECTION"], propsConfigDifferences: "Governed definitions are required; optional component clues and audio do not create another mode state machine.", migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("Compound Cover Check adapter", "components/adle/morphology/closed-compound-guided-lesson.tsx", "COVER_CHECK adapter", "CANONICAL_MODE", "CoverShutter", { currentRouteUsages: [...COMPOUND_ROUTES], propsConfigDifferences: "Supplies governed components, split points and restored checked attempt through the shared v1/v2 runtime adapter.", migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("Compound Sentence Dictation adapter", "components/adle/morphology/closed-compound-guided-lesson.tsx", "DICTATION.whole_sentence adapter", "CANONICAL_MODE", "SentenceDictation", { currentRouteUsages: [...COMPOUND_ROUTES], propsConfigDifferences: "Supplies authored audio/sentence and restored response/check state through the shared v1/v2 runtime adapter.", persistenceEvidenceDifferences: "Governed span extraction and separator-significant correctness remain route-owned.", migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("CompoundLessonReflectionAdapter", "components/adle/morphology/closed-compound-guided-lesson.tsx", "LESSON_REFLECTION adapter", "CANONICAL_MODE", "LessonReflection", { currentRouteUsages: [...COMPOUND_ROUTES], propsConfigDifferences: "Derives exact-governed-form misses and retains existing sentence comparisons plus closed-v1 no-miss copy.", persistenceEvidenceDifferences: "Retains completeAdleLessonPartAction and all hidden guided/production envelopes outside LessonReflection.", migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("LessonReflection", "components/adle/activities/lesson-reflection.tsx", "LESSON_REFLECTION", "CANONICAL", "LessonReflection", { currentRouteUsages: [...ALL_SPECIALIST_ROUTES], propsConfigDifferences: "One neutral normalized mistake, context recap, specialist recap, governed prompt and controlled response contract.", persistenceEvidenceDifferences: "Emits response/completion UI only; performs no correctness, assignment, persistence or evidence work.", migrationRisk: "high" }),

  auditRow("FixtureActivity", "components/adle/word-lab/activity-registry.tsx", "COMMON_WORD_LAB_PLACEHOLDER", "COMPATIBILITY_ONLY", "real per-kind Word Lab plugins", { currentRouteUsages: ["/dev/adle/common-word-lab only"], propsConfigDifferences: "One textarea implementation stands in for strategy_notice, guided_map, cover_check, dictation, and reflection.", recommendedAction: "Keep the dark fixture runnable, but do not treat its five registrations as production activity implementations.", migrationRisk: "low" }),
  auditRow("WordLabActivityHost", "components/adle/word-lab/activity-registry.tsx", "RUNTIME_DISPATCH", "CANONICAL_MODE", "WordLabActivityHost", { currentRouteUsages: ["/dev/adle/common-word-lab only"], migrationRisk: "medium" }),
  auditRow("CommonWordLabShell", "components/adle/word-lab/common-word-lab-shell.tsx", "LESSON_SHELL", "DEVELOPMENT_REFERENCE", "FirstImpressionLesson", { currentRouteUsages: ["/dev/adle/common-word-lab only"], behaviouralDifferences: "Generic snapshot/plugin laboratory only; it is not a forward First Impression learner shell.", migrationRisk: "low" }),
  auditRow("CanonicalActivityRenderer registry", "components/adle/activities/canonical-renderer-registry.tsx", "RUNTIME_DISPATCH", "CANONICAL", "CanonicalActivityRenderer registry", { currentRouteUsages: SPECIALIST, propsConfigDifferences: "Nineteen versioned concept/mode contracts lazily load the existing canonical Group 1–7 learner components and validate route-adapted props before mount.", behaviouralDifferences: "Unknown contracts and invalid payloads fail closed with a learner-safe blocker; no generic prompt fallback is selected.", persistenceEvidenceDifferences: "The registry owns no resume, correctness, evidence, assignment or completion policy; those remain in the shell and route adapters.", migrationRisk: "high" }),
  auditRow("FirstImpressionLesson", "components/adle/first-impression/first-impression-lesson.tsx", "LESSON_SHELL", "CANONICAL", "FirstImpressionLesson", { currentRouteUsages: SPECIALIST, behaviouralDifferences: "Owns deterministic TeachingPages → configured activities → Cover → Dictation → Reflection order plus safe reread navigation.", persistenceEvidenceDifferences: "Owns stage progression only; activities and route adapters retain local state, evidence and completion envelopes.", migrationRisk: "high" }),
  auditRow("WordLabScene", "components/adle/morphology/word-lab-scene.tsx", "LESSON_SCENE", "CANONICAL_MODE", "FirstImpressionLesson", { currentRouteUsages: SPECIALIST, migrationRisk: "medium" }),
  auditRow("LessonGuide", "components/adle/morphology/lesson-guide.tsx", "GUIDED_PROMPT_SHELL", "CANONICAL_MODE", "WordLabScene", { currentRouteUsages: SPECIALIST, migrationRisk: "medium" }),
  auditRow("AdleSessionCelebration", "components/adle/adle-session-celebration.tsx", "SESSION_COMPLETION_SHELL", "CANONICAL_MODE", "AdleSessionRunner", { currentRouteUsages: ["/learn/week/adle completed state"], persistenceEvidenceDifferences: "Read-only rendering from the server-derived reward model.", migrationRisk: "medium" }),
  auditRow("AdleSessionRunner", "components/adle-session-runner.tsx", "RUNTIME_DISPATCH", "CANONICAL", "AdleSessionRunner", { currentRouteUsages: ["/learn/week/adle"], behaviouralDifferences: "Dispatches generic renderer kinds and explicit specialist route runtimes.", migrationRisk: "high" }),
  auditRow("MorphologyGuidedLesson adapter", "components/adle/morphology/morphology-guided-lesson.tsx", "LESSON_RUNTIME_ADAPTER", "THIN_ADAPTER", "FirstImpressionLesson", { currentRouteUsages: PREFIX_AFFIX, migrationRisk: "high", historicalReplayDependency: true, persistenceEvidenceDifferences: "Retains the stable resume envelope, guided bindings and completion form while configuring the shared shell." }),
  auditRow("BaseWordFamilyGuidedLesson adapter", "components/adle/morphology/base-word-family-guided-lesson.tsx", "LESSON_RUNTIME_ADAPTER", "THIN_ADAPTER", "FirstImpressionLesson", { currentRouteUsages: [BASE_ROUTE], migrationRisk: "high", historicalReplayDependency: true }),
  auditRow("CompoundWordLessonRuntime adapter", "components/adle/morphology/closed-compound-guided-lesson.tsx", "LESSON_RUNTIME_ADAPTER", "THIN_ADAPTER", "FirstImpressionLesson", { currentRouteUsages: [...COMPOUND_ROUTES], migrationRisk: "high", historicalReplayDependency: true }),
] as const;

export const ADLE_ACTIVITY_CONVERGENCE_BACKLOG: readonly ActivityConvergenceBacklogItem[] = [
  {
    priority: "P1", title: "Wire rich components through registry modes",
    currentImplementations: ["canonical renderer registry for specialist routes", "generic activity-template renderer-kind dispatch", "generic snapshot registry/compiler"],
    targetCanonicalImplementation: "Activity Catalogue capability mapping feeding one versioned canonical renderer registry",
    intendedModes: ["existing canonical activity contracts", "behaviour-identical specialist routing", "explicit historical normalization"], routesAffected: [GENERIC_ROUTE, ...ALL_SPECIALIST_ROUTES],
    regressionRequirements: ["catalogue-to-registration totality", "payload validation", "lazy renderer loading", "route replay", "resume/completion/evidence parity", "fail-closed unknown contracts"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: false,
    releaseBoundary: "Versioned registration groundwork and behaviour-identical routing of existing specialist payloads are internal refactors. Stop and require a separate Model C decision before any specialist payload, curriculum meaning, dependency fingerprint, route activation or learner semantics change. Generic snapshot v3 and new-generation output are a separate owner-gated release phase.",
    consolidationOpportunity: "Phases A and B have removed specialist component selection from route render closures. Later owner-gated phases can normalize compatibility keys, move generic forward generation, and retire the remaining generic dispatch authority while route lifecycle boundaries stay explicit.",
  },
  {
    priority: "P1", title: "Implement genuine missing activity surfaces",
    currentImplementations: ["blocked PG/SYL/INF/PAT/SCHWA generic compatibility inputs awaiting governed interactions", "explicit historical MUST_USE_* free-response compatibility", "development-only transformation primitives"],
    targetCanonicalImplementation: "new catalogue-governed components only after NEW_INTERACTION_REQUIRED approval",
    intendedModes: ["phoneme_grapheme_map", "syllable_split_rebuild", "authentic_free_writing", "spelling_transformation"], routesAffected: [GENERIC_ROUTE],
    regressionRequirements: ["pedagogical contract", "keyboard/pointer/audio", "answer visibility", "evidence binding", "fallback safety"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: false,
    releaseBoundary: "These are generic curriculum capability additions rather than Model C specialist releases. Every new interaction still requires a separate pedagogical contract, owner approval and an independently authorized generic-generation release.",
    consolidationOpportunity: "Capability addition, not a deletion opportunity.",
  },
  {
    priority: "P2", title: "Retire preview-only/dead primitives after decisions",
    currentImplementations: ["MorphemeRail", "MorphologyDiff", "ActivityFrame family"],
    targetCanonicalImplementation: "catalogue-selected shared primitives or explicit deletion",
    intendedModes: ["development_reference"], routesAffected: ["/dev/adle/morphology-primitives"],
    regressionRequirements: ["confirm no historical import", "retain screenshots or replacement gallery fixture where valuable"],
    learnerRuntimeRisk: "low", modelCReleaseChangeRequired: false,
    releaseBoundary: "Development-reference cleanup has no release implication after reachability and historical-import checks pass.",
    consolidationOpportunity: "Potential cleanup only; measure after architecture decisions because some primitives may seed genuine gap implementations.",
  },
  {
    priority: "P2", title: "Retain historical route compatibility until replay retirement",
    currentImplementations: ["fixed_un_prefix_word_lab:v1", "closed_compound_word_lab:v1 payload/runtime adapter"],
    targetCanonicalImplementation: "current shared renderers behind explicit compatibility adapters",
    intendedModes: ["historical_replay"], routesAffected: ["fixed_un_prefix_word_lab:v1", "closed_compound_word_lab:v1"],
    regressionRequirements: ["persisted payload replay", "resume", "completion", "separator policy", "no new assignment generation"],
    learnerRuntimeRisk: "high", modelCReleaseChangeRequired: false,
    releaseBoundary: "Compatibility-only retention does not change a released contract. Retirement requires persisted replay inventory and owner confirmation of the retention obligation.",
    consolidationOpportunity: "The closed-v1 learner UI is retired; retain only payload decoding, route resolution, resume and completion compatibility until persisted replay is retired.",
  },
] as const;

export const ADLE_ACTIVITY_AUDIT_CONCLUSIONS = {
  authoritativeBaseSha: "d59506c9f3175a73b3f4614a1077470f3ab0e4a2",
  startingState: {
    auditWorktree: "Fresh isolated worktree scarletts-spells-p1-registry-planning on codex/adle-p1-registry-wiring-plan at fetched origin/main d59506c9f3175a73b3f4614a1077470f3ab0e4a2.",
    protectedOccupiedCheckout: "The dirty primary checkout and occupied earlier convergence worktrees were inspected read-only and left unmodified.",
    runtimeRegistries: [
      "components/adle/activities/canonical-renderer-registry.tsx — versioned canonical concept/mode contracts for specialist and generic/historical runtime rendering",
      "lib/adle/generic-activity-compatibility.ts — deterministic in-memory normalization of supported generic/historical inputs",
      "lib/adle/activity-template-registry.ts — legacy 34-key renderer-kind vocabulary retained outside runtime pending Snapshot v2 retirement evidence",
      "lib/adle/composable-lesson/generic-snapshot-registry.ts — versioned generic snapshot semantics for the same 34 keys",
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
  authorityRelationship: "Activity Catalogue is the architectural chooser and capability inventory. CanonicalActivityHost and its versioned renderer registry are the sole React renderer-selection authority for specialist and supported generic/historical activities. The pure generic compatibility normalizer interprets historical keys into CanonicalActivitySpec contracts but cannot select React components. Thin specialist and generic lifecycle adapters retain curriculum transformation, resume, evidence and completion. Generic Snapshot v2 and forward composer output remain untouched; the old activity-template registry is no longer imported by learner runtime and is retained only as an explicit later-deletion candidate.",
  buildBoundary: "BUILD is one shared ordered-placement interaction family with two learner experiences. DefinitionWordBuilder presents one definition-led target and is configured by all 19 Prefix, Suffix/Affix and Base Word microskills. CompoundJigsawActivity presents anonymous puzzle rows above one deterministic mixed bank using Jigsaw-shaped component, SPACE and hyphen pieces; checked row content identifies and locks the governed word. Both use OrderedBuildEngine for candidate order, placement, rearrangement, validation, completion and restoration. Historical closed-compound v1 payloads are translated at the route boundary to generalized two-piece/no-join targets; no historical Jigsaw UI remains.",
  cleaverBoundary: "SplitHandle is the one stateful Split engine across Prefix, Affix and Base Word. Required boundaries, restored selected cuts and an isolated governed component are neutral configuration; SplitBuild and Base Word Cleave are thin curriculum adapters. Final-y source-form restoration is a separate post-Split SpellingTransformationReveal, and the redundant typed base confirmation is retired. Word assembly and syllable split/rebuild remain separate learner actions.",
  meaningCategorisationBoundary: "Meaning has exactly three canonical learner actions. Discovery is one prefix/suffix-configured transformation-and-choice engine. MeaningConnectionActivity is one rich word-to-definition connection engine for Compound and governed generic payloads; definition-less immutable payloads use an explicit compatibility fallback. BinSort is one categorisation state machine and owns immediate feedback, a brief reduced-motion-safe success celebration, automatic advance, and its stateless final BinSortOverview. QuickSort UI and forward generation are retired; REVIEW_QUICK_SORT remains only a compatibility key and immutable generic snapshot v2 discriminator.",
  reflectionBoundary: "ERROR_REPAIR remains ReflectionActivity and keeps reveal-hide-retry evidence. MEMORY_CUE remains child mnemonic authoring. LessonReflection is the canonical end-of-first-impression LESSON_REFLECTION: it receives normalized attempted-versus-correct spelling summaries, a governed lesson-specific prompt, optional specialist/context recap, and one controlled response. Prefix context slips remain recap data rather than target assessment evidence. Route correctness, persistence, assignment and completion adapters remain outside the component; stored historical prompt keys/text remain assignment-owned.",
  spellRecallBoundary: "First-impression spelling has exactly two learner experiences: CoverShutter for study-cover-spell-compare and SentenceDictation for authored whole-sentence audio recall. Scheduled review and diagnostics share ColdWordRecall, which never reveals the governed spelling until the response is irreversibly locked. Historical CONTROLLED_SPELLING, HIDE_WRITE, DICTATION_NO_IMAGE, DICTATION_SENTENCE_CONTEXT, REVIEW_DICTATION and DIAGNOSTIC_DICTATION_PROBE keys remain accepted semantic/configuration inputs only. Route adapters retain resume, correctness, evidence, scheduling, probe intake, assignment and persistence. SpellingField and GrownUpReveal are retired.",
  group3Closeout: {
    status: "COMPLETE_MERGED_AND_DEPLOYED",
    ownerAcceptedOn: "2026-08-20",
    summary: "Owner manual acceptance passed for Prefix, Suffix/Affix, Base Word and Compound Cover Check, Sentence Dictation and cross-route Lesson Reflection feedback.",
    acceptanceFixes: [
      "Enter submits valid Cover Check, Sentence Dictation and ColdWordRecall responses through their existing guarded Check/Lock actions; Shift+Enter remains a Sentence Dictation newline and plain Enter remains a Lesson Reflection newline.",
      "Lesson Reflection now separates governed spelling mistakes from feedback-only whole-sentence capitalization and punctuation comparisons across Prefix, Suffix/Affix, Base Word and Compound routes.",
    ],
    invariants: "No evidence classification, correctness policy, attempt identity, assignment binding, scheduler outcome, diagnostic intake, persistence schema, curriculum release or Production state changed.",
    nextStep: "Closed. Preserve the canonical CoverShutter, SentenceDictation, ColdWordRecall and LessonReflection boundaries while later convergence groups proceed from authoritative origin/main.",
  },
  group4Closeout: {
    status: "COMPLETE_MERGED_AND_DEPLOYED",
    ownerAcceptedOn: "2026-08-20",
    summary: "Group 4 — Split / Cleaver Convergence is complete, merged to origin/main and deployed. One stateful SplitHandle serves Prefix, Affix and Base Word through thin curriculum adapters; the independent BaseWordCleaver and preview-only Split/transformation duplicates are retired. Final-y source-form restoration remains the separate post-Split SpellingTransformationReveal, and historical route compatibility remains at route/payload boundaries rather than as duplicate learner UI.",
    invariants: "No attempt identity, assignment binding, evidence classification, completion call, resume key/schema, release state, curriculum activation or Production data changed.",
    nextStep: "Closed. Group 5 began from the merged Group 4 architecture; do not reintroduce independent Split/Cleaver state machines.",
  },
  group5Closeout: {
    status: "COMPLETE_MERGED_AND_DEPLOYED",
    ownerAcceptedOn: "2026-08-21",
    mergedAndDeployedOn: "2026-08-21",
    summary: "Group 5 — Meaning & Categorisation Convergence is complete, merged to origin/main and deployed. The canonical learner architecture is Discovery, MeaningConnectionActivity and BinSort. BinSort owns immediate correctness feedback, its brief reduced-motion-safe success celebration and its stateless final BinSortOverview as one learner activity. QuickSort UI and forward generation are retired; duplicate, fallback and prototype Meaning/Sort UI is retained only as required configuration or compatibility code, or is retired.",
    invariants: "No attempt identity, correctness policy, assignment identity, evidence classification, completion envelope, resume schema, scheduler outcome, curriculum activation, release state or Production data changed.",
    nextStep: "Closed. Preserve the three canonical Meaning learner actions and the REVIEW_QUICK_SORT compatibility boundary without restoring a standalone QuickSort learner renderer.",
  },
  formerGroup6: {
    status: "ABSORBED_INTO_GROUP_5",
    summary: "Former proposed Group 6 — Meaning was absorbed into Group 5 — Meaning & Categorisation Convergence. Sort and Meaning were intentionally implemented as one workstream; there is no separate Group 6 implementation, merge or outstanding dependency.",
  },
  group7Closeout: {
    status: "COMPLETE_MERGED_AND_DEPLOYED",
    ownerAcceptedOn: "2026-08-21",
    deployedOn: "2026-08-21",
    summary: "Group 7 — First Impression Shell Convergence is accepted, merged into origin/main and deployed to Production. The authoritative d59506c main tree contains implementation commit 93ec640. TeachingPages is the one shared ordered teaching and Meet the Words experience; FirstImpressionLesson is the canonical staged shell for Prefix, Suffix/Affix, Base Word and Closed Compound lessons.",
    invariants: "No answer correctness, evidence classification, assignment binding, completion envelope, persistence schema, curriculum activation or learner data changed.",
    nextStep: "Closed. Retain TeachingPages and FirstImpressionLesson as the canonical boundaries; do not restore route-local teaching-page navigation or duplicate Meet the Words screens.",
  },
  nextConvergenceGroup: {
    status: "P1_REGISTRY_WIRING_PHASE_C_COMPLETE_REVIEW_REQUIRED",
    summary: "Phases A–C are complete for review: supported generic/historical inputs normalize in memory to CanonicalActivitySpec and render through CanonicalActivityHost; unknown, malformed and unavailable rich interactions fail closed. Stop before Phase D or Phase E. Generic Snapshot v2, forward composer output, Model C releases, payload versions and lifecycle/evidence boundaries remain unchanged.",
  },
  newActivityRule: [
    "Search the canonical Activity Catalogue.",
    "Reuse an existing activity as-is if it meets the pedagogical requirement.",
    "Otherwise configure an existing supported mode.",
    "Otherwise extend the shared abstraction with a governed mode.",
    "Only then declare NEW_INTERACTION_REQUIRED with the pedagogical requirement, why no catalogue activity works, why configuration is insufficient, and why extending an abstraction is inappropriate.",
  ],
  firstImpressionImplications: {
    targetSequence: ["Teaching Page 1", "optional Teaching Page 2", "optional Teaching Page 3", "required Meet the Words", "configured Activity Catalogue sequence", "CoverShutter", "SentenceDictation", "LessonReflection", "Celebration"],
    canonicalRoutes: [
      "compound_word_lab:v2 and closed_compound_word_lab:v1 use TeachingPages and FirstImpressionLesson through the shared Compound runtime adapter",
      "base_word_lab:v2 uses TeachingPages and FirstImpressionLesson through the Base Word runtime adapter",
      "dynamic_prefix_word_lab:v2, fixed_un_prefix_word_lab:v1 and dynamic_affix_word_lab:v3 use TeachingPages and FirstImpressionLesson through the shared morphology runtime adapter",
    ],
    bespokePieces: ["thin curriculum adapters", "historical resume normalization", "route evidence/completion envelopes"],
  },
  reviewImplications: {
    eligible: ["COLD_WORD_RECALL.scheduled_review", "FREE_WRITING.review_transfer once implemented"],
    notEligible: ["INTRODUCTION", "READING_PAGE", "MEANING_DISCOVERY", "WORD_FAMILY_REVEAL", "LESSON_REFLECTION"],
    distinctions: ["ERROR_REPAIR is conditional same-session repair, not scheduled review.", "LESSON_REFLECTION is end-of-first-impression metacognition, not review.", "Review evidence remains independent retrieval; Cover Check is only review-eligible when its reveal policy does not contaminate the scored attempt."],
  },
  genuineGaps: ["authentic Free Writing surface", "phoneme–grapheme and schwa/stress mapping", "syllable split/rebuild", "drop-e/doubling, inflectional and other interactive spelling transformations", "homophone sentence-context choice and correction", "pattern discovery/application where TeachingPages and existing practice are insufficient"],
} as const;

export function activityAuditCounts() {
  const byStatus = Object.fromEntries(
    (["CANONICAL", "CANONICAL_MODE", "THIN_ADAPTER", "DEVELOPMENT_REFERENCE", "COMPATIBILITY_ONLY", "DUPLICATE_TO_MIGRATE", "DEAD_OR_UNREFERENCED", "REQUIRES_ARCHITECTURE_DECISION"] as const)
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
