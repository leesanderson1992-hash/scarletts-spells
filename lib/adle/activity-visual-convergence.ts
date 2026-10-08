/**
 * Read-only visual-audit metadata beneath the pedagogical Activity Catalogue.
 * This does not select runtime renderers or alter activity concepts.
 */

export type VisualConvergenceClassification =
  | "SAME_ENGINE"
  | "SAME_ENGINE_DIFFERENT_MODE"
  | "SAME_ENGINE_DIFFERENT_SKIN"
  | "GENUINELY_DIFFERENT_INTERACTION"
  | "RETIRE"
  | "OWNER_REVIEW_REQUIRED";

export type VisualFixtureState =
  | "initial"
  | "active"
  | "incorrect"
  | "scaffold"
  | "success"
  | "completed"
  | "restored";

export interface VisualConvergenceCandidate {
  id: string;
  name: string;
  provenance: string;
  componentPath: string;
  mount: "direct" | "thin_preview_adapter" | "documented_only";
  supportedStates: readonly VisualFixtureState[];
  classification: VisualConvergenceClassification;
  note: string;
}

export interface VisualConvergenceGroup {
  id: "build" | "reflection" | "spell" | "split" | "sort" | "meaning" | "teaching";
  number: number;
  title: string;
  question: string;
  pedagogicalConcepts: readonly string[];
  interactionFamily: string;
  behaviouralDifferences: readonly string[];
  visualOnlyDifferences: readonly string[];
  persistenceEvidenceDifferences: readonly string[];
  historicalReplayRequirements: readonly string[];
  candidates: readonly VisualConvergenceCandidate[];
}

const owner = "OWNER_REVIEW_REQUIRED" as const;
const direct = "direct" as const;
const adapter = "thin_preview_adapter" as const;

export const ADLE_VISUAL_CONVERGENCE_GROUPS: readonly VisualConvergenceGroup[] = [
  {
    id: "build", number: 1, title: "Build / Assembly",
    question: "Are word assembly and compound jigsaw one build engine with different placement rules and skins?",
    pedagogicalConcepts: ["WORD_ASSEMBLY", "COMPOUND_JIGSAW"], interactionFamily: "ordered part selection, placement and joining",
    behaviouralDifferences: ["free slot placement versus governed adjacent-piece connection", "automatic versus manual checking", "single target versus multi-target completion", "separator and fixed-tile policies"],
    visualOnlyDifferences: ["rectangular tiles versus puzzle-piece artwork", "rail slots versus free jigsaw board", "route-specific colour and copy"],
    persistenceEvidenceDifferences: ["shared engines emit local completion values", "specialist adapters translate completion into route-local guided state", "development primitives emit no evidence"],
    historicalReplayRequirements: ["closed_v1 Compound copy and two-piece behavior must remain replayable", "persisted specialist payload component order and join policy must remain stable"],
    candidates: [
      { id: "snap-rail", name: "SnapRail", provenance: "shared canonical primitive", componentPath: "components/adle/activities/shared/snap-rail.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success"], classification: owner, note: "Direct mount; internal state is intentionally changed only through real controls." },
      { id: "compound-generalized", name: "CompoundJigsawActivity · generalized", provenance: "compound_word_lab:v2", componentPath: "components/adle/morphology/compound-jigsaw-activity.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Direct mount with governed space join and optional restored progress." },
      { id: "prefix-build", name: "PrefixBuild adapter/output", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success"], classification: owner, note: "Real route-local adapter exported for preview; callbacks remain local." },
      { id: "base-word-builder", name: "Base Word WordBuilder adapter/output", provenance: "base_word_lab:v2", componentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success"], classification: owner, note: "Real route-local adapter exported for preview; callbacks remain local." },
      { id: "morpheme-rail", name: "MorphemeRail", provenance: "development morphology primitives", componentPath: "components/adle/activities/morphology/shared/morphology-primitives.tsx", mount: direct, supportedStates: ["initial", "active"], classification: "RETIRE", note: "Existing audit establishes it as a development-only duplicate-to-migrate with no correctness or completion contract." },
      { id: "assembly-slot", name: "AssemblySlot", provenance: "development interaction primitive", componentPath: "components/adle/interactions/selectable-item.tsx", mount: direct, supportedStates: ["initial", "active"], classification: "RETIRE", note: "A low-level preview primitive, not an independently governed learner activity." },
      { id: "compound-closed-v1", name: "CompoundJigsawActivity · closed_v1", provenance: "closed_compound_word_lab:v1 compatibility", componentPath: "components/adle/morphology/compound-jigsaw-activity.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Same real component with historical copy mode; retain until replay retirement is authorised." },
    ],
  },
  {
    id: "reflection", number: 2, title: "Lesson Reflection",
    question: "Which recap, prompt and completion-shell differences belong in one Lesson Reflection surface?",
    pedagogicalConcepts: ["LESSON_REFLECTION"], interactionFamily: "attempt recap followed by learner-authored rule",
    behaviouralDifferences: ["generic versus prefix-specific recap", "word-security recap versus compound comparison cards", "single prompt and completion-label variants"],
    visualOnlyDifferences: ["card hierarchy", "dark specialist shell versus light Common Word Lab fixture", "textarea borders and heading copy"],
    persistenceEvidenceDifferences: ["all live routes ultimately persist one learningReflection value", "route forms also package different attempt envelopes", "Common Word Lab fixture is non-production and local"],
    historicalReplayRequirements: ["existing prompt text and completion payloads must replay", "closed-v1 form shape cannot be removed before route retirement"],
    candidates: [
      { id: "morphology-reflection", name: "ReflectionForm", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "completed", "restored"], classification: owner, note: "Real component uses its existing preview-complete path, so no server action runs." },
      { id: "base-reflection", name: "Base Word Reflection", provenance: "base_word_lab:v2", componentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "completed", "restored"], classification: owner, note: "Real embedded component with local callbacks only." },
      { id: "compound-reflection", name: "ClosedCompoundReflection", provenance: "compound_word_lab:v2 and closed_compound_word_lab:v1", componentPath: "components/adle/morphology/closed-compound-guided-lesson.tsx", mount: "documented_only", supportedStates: [], classification: owner, note: "Cannot mount independently without retaining its production server-action form and route completion envelope. The exact source is documented rather than copied or made artificially safe." },
      { id: "common-reflection", name: "Common Word Lab fixture reflection", provenance: "dark common-word fixture registry", componentPath: "components/adle/word-lab/activity-registry.tsx", mount: direct, supportedStates: ["initial", "active", "completed", "restored"], classification: owner, note: "The audit identifies this as a compatibility-only placeholder shared by five dark fixture plugins; retirement still requires owner judgement." },
    ],
  },
  {
    id: "spell", number: 3, title: "Spell / Recall",
    question: "Can typed production share one response engine while reveal, audio and evidence policies remain distinct?",
    pedagogicalConcepts: ["COVER_CHECK", "CONTROLLED_SPELLING", "DICTATION", "ERROR_REPAIR"], interactionFamily: "typed response under governed answer-visibility policy",
    behaviouralDifferences: ["study-cover-write sequence", "visible copying versus recall-neutral entry", "word versus sentence audio", "post-attempt reveal-hide-retry"],
    visualOnlyDifferences: ["shutter theatre versus compact field", "single-line versus textarea", "specialist dark-shell copy"],
    persistenceEvidenceDifferences: ["generic fields are collected by the owning form", "specialist routes store attempts in route-local resume state", "ERROR_REPAIR is separate retry evidence"],
    historicalReplayRequirements: ["template keys retain distinct answer-visibility and evidence semantics", "sentence target-token policies must remain route-compatible"],
    candidates: [
      { id: "cover-check", name: "CoverShutter / Cover Check", provenance: "shared specialist primitive", componentPath: "components/adle/activities/shared/cover-shutter.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Direct mount with supported initialState and initialAttempt." },
      { id: "generic-controlled", name: "Generic CONTROLLED_SPELLING", provenance: "generic session runner", componentPath: "components/adle/activities/shared/spelling-field.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Thin local-state adapter mounts the exact SpellingField used by the session runner." },
      { id: "specialist-controlled", name: "Specialist Controlled spelling", provenance: "morphology specialist route", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Real route-local Controlled component with local callbacks." },
      { id: "generic-dictation", name: "Generic DICTATION", provenance: "generic session runner", componentPath: "components/adle/activities/shared/spelling-field.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Exact SpellingField engine under the generic recall-neutral policy." },
      { id: "morphology-dictation", name: "Morphology Dictation", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Real route-local sentence Dictation component with local callbacks." },
      { id: "base-dictation", name: "Base Word Dictation", provenance: "base_word_lab:v2", componentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Real route-local sentence Dictation component with local callbacks." },
      { id: "compound-dictation", name: "Compound Dictation", provenance: "compound_word_lab:v2 and closed_compound_word_lab:v1", componentPath: "components/adle/morphology/closed-compound-guided-lesson.tsx", mount: "documented_only", supportedStates: [], classification: owner, note: "Cannot mount independently: JSX is an inline runtime branch coupled to route resume state. The adjacent real primitives and exact source provenance are shown without copying it." },
      { id: "error-repair", name: "ReflectionActivity / ERROR_REPAIR", provenance: "generic review repair", componentPath: "components/adle/activities/reflection-activity.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "restored"], classification: "GENUINELY_DIFFERENT_INTERACTION", note: "Shown separately because reveal-hide-retry is pedagogically and evidentially distinct from ordinary typed response." },
    ],
  },
  {
    id: "split", number: 4, title: "Split / Cleave",
    question: "Are the route wrappers one boundary-selection engine with base-isolation configuration?",
    pedagogicalConcepts: ["CLEAVER"], interactionFamily: "select one or more meaningful boundaries in a word",
    behaviouralDifferences: ["all reviewed boundaries versus cuts adjacent to one base", "optional remaining-base confirmation", "optional final-y restoration"],
    visualOnlyDifferences: ["cleaver SVG dimensions", "heading and feedback copy", "base highlighting after cuts"],
    persistenceEvidenceDifferences: ["guided state only", "route adapters store misses/cuts in different resume envelopes", "no independent spelling evidence"],
    historicalReplayRequirements: ["prefix/affix split state and Base Word cut arrays must both restore", "two-miss scaffold/focus behavior must remain exact"],
    candidates: [
      { id: "split-handle", name: "SplitHandle", provenance: "shared prefix/affix primitive", componentPath: "components/adle/activities/shared/split-handle.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "Direct canonical candidate." },
      { id: "base-word-cleaver", name: "BaseWordCleaver", provenance: "base_word_lab:v2", componentPath: "components/adle/activities/shared/base-word-cleaver.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "Direct mount with controlled cuts and misses." },
      { id: "split-build", name: "SplitBuild adapter", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "Real adapter configures SplitHandle copy and scaffold policy." },
      { id: "base-cleave", name: "Base Word Cleave adapter", provenance: "base_word_lab:v2", componentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "Real adapter derives base segment and restoration configuration for BaseWordCleaver." },
    ],
  },
  {
    id: "sort", number: 5, title: "Sort",
    question: "Do guided meaning sorting and review activation need separate engines or only policy/skin modes?",
    pedagogicalConcepts: ["MEANING_SORT", "REVIEW_SORT"], interactionFamily: "assign each item to a category",
    behaviouralDifferences: ["one-at-a-time enforced destination versus per-row revisable choices", "immediate misconception feedback versus warm-up encouragement", "round completion callback versus no evidence"],
    visualOnlyDifferences: ["dark full-width bins versus compact light pills", "route-specific labels and copy"],
    persistenceEvidenceDifferences: ["BinSort returns local placement map", "QuickSort is deliberately non-evidence-bearing", "specialist adapter may record guided completion"],
    historicalReplayRequirements: ["generic REVIEW_QUICK_SORT payload shape", "specialist meaning-bin identifiers and feedback copy"],
    candidates: [
      { id: "bin-sort", name: "BinSort", provenance: "shared specialist primitive", componentPath: "components/adle/activities/shared/bin-sort.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "completed"], classification: owner, note: "Direct mount." },
      { id: "quick-sort", name: "QuickSortActivity", provenance: "generic review activation", componentPath: "components/adle/activities/quick-sort-activity.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "completed"], classification: owner, note: "Direct mount with deterministic AdleSessionItem." },
      { id: "prefix-form-sort", name: "Prefix-form sort adapter/output", provenance: "dynamic_prefix_word_lab:v2", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "completed"], classification: owner, note: "Thin adapter supplies reviewed-style prefix bins to the real BinSort engine." },
    ],
  },
  {
    id: "meaning", number: 6, title: "Meaning",
    question: "Which meaning experiences share a selection/reveal engine, and which require matching or sorting mechanics?",
    pedagogicalConcepts: ["MEANING_DISCOVERY", "MEANING_MATCH", "MEANING_SORT"], interactionFamily: "inspect, choose, connect or categorise meaning",
    behaviouralDifferences: ["single before/after choice", "multi-item connection", "categorisation", "read-only reveal/recap"],
    visualOnlyDifferences: ["paired cards", "arrow board", "bins", "static before/after panel"],
    persistenceEvidenceDifferences: ["all are guided/no independent spelling evidence", "specialist routes retain progress/miss counts", "development MeaningFlip emits nothing"],
    historicalReplayRequirements: ["compound connection progress arrays", "specialist discovery index and added-affix state"],
    candidates: [
      { id: "discovery", name: "Discovery", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Real embedded component exported for preview." },
      { id: "meaning-connection", name: "MeaningConnectionActivity", provenance: "compound_word_lab:v2", componentPath: "components/adle/morphology/meaning-connection-activity.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: owner, note: "Direct mount with supported restored progress." },
      { id: "meaning-bin-sort", name: "BinSort · meaning mode", provenance: "prefix/affix specialist routes", componentPath: "components/adle/activities/shared/bin-sort.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "completed"], classification: owner, note: "Direct shared engine configured with meaning groups." },
      { id: "meaning-flip", name: "MeaningFlip", provenance: "development morphology primitives", componentPath: "components/adle/activities/morphology/shared/morphology-primitives.tsx", mount: direct, supportedStates: ["initial"], classification: "RETIRE", note: "Existing audit establishes this as a development-only duplicate-to-migrate; it is read-only rather than a full interaction." },
      { id: "meaning-overview", name: "MeaningOverview recap", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["completed", "restored"], classification: owner, note: "Real read-only route recap exported for preview." },
    ],
  },
  {
    id: "teaching", number: 7, title: "Teaching / Reading",
    question: "Which teaching surfaces are shared layout modes, and which are genuinely different navigation/reveal interactions?",
    pedagogicalConcepts: ["INTRODUCTION", "READING_PAGE", "WORD_FAMILY_REVEAL"], interactionFamily: "read, inspect and reveal authored teaching content",
    behaviouralDifferences: ["single compact intro", "multi-screen next flow", "ordered reading-page navigation", "interactive family reveal", "embedded Meet-the-Words list"],
    visualOnlyDifferences: ["light generic card versus dark specialist scene", "model equation and word-card treatments", "page and provenance labels"],
    persistenceEvidenceDifferences: ["teaching surfaces capture no attempt evidence", "owning shells may persist only navigation/resume position"],
    historicalReplayRequirements: ["existing specialist intro payload snapshots", "compound reading-page keys/order", "base-family reveal order"],
    candidates: [
      { id: "intro-activity", name: "IntroActivity", provenance: "generic_composer:v1", componentPath: "components/adle/activities/intro-activity.tsx", mount: direct, supportedStates: ["initial", "completed"], classification: owner, note: "Direct mount." },
      { id: "learn-introduction", name: "LearnIntroduction", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "completed", "restored"], classification: owner, note: "Real embedded screen component exported for preview." },
      { id: "base-intro", name: "Base Word Intro", provenance: "base_word_lab:v2", componentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "completed"], classification: owner, note: "Real embedded component exported for preview." },
      { id: "compound-reading", name: "CompoundReadingPage", provenance: "compound_word_lab:v2", componentPath: "components/adle/morphology/closed-compound-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "completed", "restored"], classification: owner, note: "Real page surface exported for preview; route navigation remains outside it." },
      { id: "family-reveal", name: "Base Word FamilyReveal / Meet the Words", provenance: "base_word_lab:v2", componentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "completed", "restored"], classification: owner, note: "Real reveal component exported for preview." },
    ],
  },
] as const;

export function visualConvergenceCandidateCount(): number {
  return ADLE_VISUAL_CONVERGENCE_GROUPS.reduce((total, group) => total + group.candidates.length, 0);
}
