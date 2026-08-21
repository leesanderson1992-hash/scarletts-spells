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
    question: "How do the two approved BUILD presentations compose above one ordered placement, validation and restoration foundation?",
    pedagogicalConcepts: ["WORD_ASSEMBLY", "COMPOUND_JIGSAW"], interactionFamily: "shared ordered-build state with definition-led and multi-target Jigsaw presentations",
    behaviouralDifferences: ["one definition-led target versus several simultaneous targets", "fixed governed parts versus all component and connector pieces in a mixed bank", "per-word continuation versus independently locking multi-target completion", "space and hyphen connectors derived from governed joins"],
    visualOnlyDifferences: ["rectangular tiles versus physically joined puzzle-piece artwork", "single rail versus anonymous responsive puzzle rows above the bank", "route-specific colour and copy"],
    persistenceEvidenceDifferences: ["the ordered-build foundation emits UI progress only", "specialist adapters retain their existing guided completion bindings", "Jigsaw partial placements now restore without changing evidence"],
    historicalReplayRequirements: ["closed-v1 payloads normalise to generalized two-piece/no-join targets at the compatibility boundary", "persisted specialist payload component order and join policy remain stable"],
    candidates: [
      { id: "snap-rail", name: "SnapRail presentation", provenance: "shared Definition Word Builder controller", componentPath: "components/adle/activities/shared/snap-rail.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success"], classification: "SAME_ENGINE", note: "The established one-row tile presentation now delegates placement, reordering, validation and restoration to OrderedBuildEngine." },
      { id: "compound-generalized", name: "Jigsaw Build", provenance: "compound_word_lab:v2 plus closed-v1 compatibility adapter", componentPath: "components/adle/morphology/compound-jigsaw-activity.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_SKIN", note: "Multi-target Jigsaw presentation over the same ordered-build foundation, with anonymous joined puzzle rows above one mixed bank and derived SPACE/hyphen pieces." },
      { id: "prefix-build", name: "DefinitionWordBuilder · Prefix/Affix config", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/activities/shared/definition-word-builder.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "The route supplies definition, candidate affix parts, governed fixed base, word sum, meaning and feedback policy to the shared renderer." },
      { id: "base-word-builder", name: "DefinitionWordBuilder · Base Word config", provenance: "base_word_lab:v2", componentPath: "components/adle/activities/shared/definition-word-builder.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Base Word supplies all governed parts and family distractors to the same shared renderer." },
      { id: "morpheme-rail", name: "MorphemeRail", provenance: "development morphology primitives", componentPath: "components/adle/activities/morphology/shared/morphology-primitives.tsx", mount: direct, supportedStates: ["initial", "active"], classification: "RETIRE", note: "Existing audit establishes it as a development-only duplicate-to-migrate with no correctness or completion contract." },
      { id: "assembly-slot", name: "AssemblySlot", provenance: "development interaction primitive", componentPath: "components/adle/interactions/selectable-item.tsx", mount: direct, supportedStates: ["initial", "active"], classification: "RETIRE", note: "A low-level preview primitive, not an independently governed learner activity." },
    ],
  },
  {
    id: "reflection", number: 2, title: "Lesson Reflection",
    question: "How does one canonical LessonReflection present route-normalized mistakes and governed prompts while completion stays adapter-owned?",
    pedagogicalConcepts: ["LESSON_REFLECTION"], interactionFamily: "normalized attempted-versus-correct recap followed by one learner response",
    behaviouralDifferences: ["route-owned normalized versus exact-governed correctness", "optional Prefix context recap and governed teaching cards", "route-owned submit versus local callback completion"],
    visualOnlyDifferences: ["one Closed-Compound-style hierarchy for all specialist routes", "route-specific prompt, recap and success copy only", "light Common Word Lab fixture remains compatibility-only"],
    persistenceEvidenceDifferences: ["all live specialist routes render LessonReflection and retain one existing reflection value", "route adapters still package their original attempt and assignment envelopes", "Common Word Lab fixture is non-production and local"],
    historicalReplayRequirements: ["stored prompt keys/text and immutable payloads remain assignment-owned", "closed-v1 payload replay is retained by the Compound adapter without a duplicate learner view"],
    candidates: [
      { id: "morphology-reflection", name: "LessonReflection · Prefix/Affix", provenance: "dynamic prefix/affix specialist adapters", componentPath: "components/adle/activities/lesson-reflection.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "completed", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Canonical component with normalized morphology misses, governed affix prompt and optional recap; the preview uses controlled local state only." },
      { id: "base-reflection", name: "LessonReflection · Base Word", provenance: "base_word_lab:v2 adapter", componentPath: "components/adle/activities/lesson-reflection.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "completed", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Canonical component with authored target-token outcomes and governed base-word prompt; atomic completion stays outside the lab." },
      { id: "compound-reflection", name: "LessonReflection · Compound", provenance: "compound_word_lab:v2 and closed-v1 compatibility adapter", componentPath: "components/adle/activities/lesson-reflection.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "completed", "restored"], classification: "SAME_ENGINE", note: "Canonical selected visual baseline with deterministic normalized misses and local callbacks; no server action or completion envelope enters the lab." },
      { id: "common-reflection", name: "Common Word Lab fixture reflection", provenance: "dark common-word fixture registry", componentPath: "components/adle/word-lab/activity-registry.tsx", mount: direct, supportedStates: ["initial", "active", "completed", "restored"], classification: owner, note: "The audit identifies this as a compatibility-only placeholder shared by five dark fixture plugins; retirement still requires owner judgement." },
    ],
  },
  {
    id: "spell", number: 3, title: "Spell / Recall",
    question: "How do the three approved renderers cover first-impression study, sentence Dictation and answer-safe non-lesson recall?",
    pedagogicalConcepts: ["COVER_CHECK", "CONTROLLED_SPELLING", "DICTATION", "COLD_WORD_RECALL", "ERROR_REPAIR"], interactionFamily: "three canonical experiences over shared authored audio and comparison primitives",
    behaviouralDifferences: ["Cover Check requires visible study then deliberate cover", "Sentence Dictation starts from authored audio with no answer text", "ColdWordRecall locks review/diagnostic evidence before reveal", "post-attempt reveal-hide-retry remains separate"],
    visualOnlyDifferences: ["CoverShutter theatre versus SentenceDictation textarea versus cold single-word input", "route-specific progress and continuation copy are configuration"],
    persistenceEvidenceDifferences: ["canonical components emit callbacks only", "route adapters retain their existing attempt maps and resume envelopes", "review scheduling and diagnostic intake remain in the generic runner", "ERROR_REPAIR is separate retry evidence"],
    historicalReplayRequirements: ["historical keys normalize to the canonical renderer kinds", "fixed Prefix and closed Compound payloads configure current canonical components", "sentence target-token policies remain route-owned"],
    candidates: [
      { id: "cover-check", name: "CoverShutter / Cover Check", provenance: "canonical specialist experience", componentPath: "components/adle/activities/shared/cover-shutter.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE", note: "Owns visible study, deliberate cover, word response, post-check comparison and optional continuation; routes supply data and callbacks." },
      { id: "generic-controlled", name: "Historical CONTROLLED_SPELLING → CoverShutter", provenance: "generic compatibility dispatch", componentPath: "components/adle/activities/shared/cover-shutter.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "The old key is accepted but its visible-copy learner UI is retired." },
      { id: "specialist-controlled", name: "CoverShutter · Prefix/Affix config", provenance: "dynamic Prefix/Affix and fixed Prefix compatibility routes", componentPath: "components/adle/activities/shared/cover-shutter.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "The route directly configures the canonical CoverShutter; no specialist Controlled presentation remains." },
      { id: "generic-dictation", name: "Historical first-impression Dictation → SentenceDictation", provenance: "generic compatibility dispatch", componentPath: "components/adle/activities/shared/sentence-dictation.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Old first-impression keys require a governed authored sentence and do not retain a word-only renderer." },
      { id: "review-cold-recall", name: "ColdWordRecall · scheduled review", provenance: "generic review adapter", componentPath: "components/adle/activities/shared/cold-word-recall.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Locks the scheduled-review response before comparison; due metadata and scheduler outcomes remain external." },
      { id: "diagnostic-cold-recall", name: "ColdWordRecall · diagnostic probe", provenance: "generic diagnostic adapter", componentPath: "components/adle/activities/shared/cold-word-recall.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Shares the answer-safe learner engine while probe intake and non-punitive semantics remain external." },
      { id: "morphology-dictation", name: "SentenceDictation · Prefix/Affix", provenance: "dynamic Prefix/Affix and fixed Prefix compatibility routes", componentPath: "components/adle/activities/shared/sentence-dictation.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE", note: "Canonical whole-sentence renderer; Prefix context-slip analysis remains in the route adapter." },
      { id: "base-dictation", name: "SentenceDictation · Base Word", provenance: "base_word_lab:v2", componentPath: "components/adle/activities/shared/sentence-dictation.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Canonical renderer with Base Word authored audio; target-token extraction remains route-owned." },
      { id: "compound-dictation", name: "SentenceDictation · Compound", provenance: "compound_word_lab:v2 and closed_compound_word_lab:v1", componentPath: "components/adle/activities/shared/sentence-dictation.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "success", "restored"], classification: "SAME_ENGINE_DIFFERENT_MODE", note: "Canonical renderer configured through the Compound compatibility/runtime adapter; governed span and separator correctness stay external." },
      { id: "error-repair", name: "ReflectionActivity / ERROR_REPAIR", provenance: "generic review repair", componentPath: "components/adle/activities/reflection-activity.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "restored"], classification: "GENUINELY_DIFFERENT_INTERACTION", note: "Shown separately because reveal-hide-retry is pedagogically and evidentially distinct from ordinary typed response." },
    ],
  },
  {
    id: "split", number: 4, title: "Split / Cleave",
    question: "Are the route wrappers one boundary-selection engine with base-isolation configuration?",
    pedagogicalConcepts: ["CLEAVER"], interactionFamily: "select one or more meaningful boundaries in a word",
    behaviouralDifferences: ["all reviewed boundaries versus cuts adjacent to one governed component", "optional post-split source-form reveal"],
    visualOnlyDifferences: ["heading and feedback copy", "governed component highlighting after cuts"],
    persistenceEvidenceDifferences: ["guided state only", "route adapters store misses/cuts in different resume envelopes", "no independent spelling evidence"],
    historicalReplayRequirements: ["prefix/affix split state and Base Word cut arrays must both restore", "two-miss scaffold/focus behavior must remain exact"],
    candidates: [
      { id: "split-handle", name: "SplitHandle", provenance: "shared prefix/affix primitive", componentPath: "components/adle/activities/shared/split-handle.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "Direct canonical candidate." },
      { id: "split-isolate", name: "SplitHandle · Isolate component", provenance: "canonical governed-component configuration", componentPath: "components/adle/activities/shared/split-handle.tsx", mount: direct, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "The canonical engine with controlled/restored cuts and isolated-component presentation." },
      { id: "split-build", name: "SplitBuild adapter", provenance: "dynamic prefix/affix specialist routes", componentPath: "components/adle/morphology/morphology-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "Real adapter configures SplitHandle copy and scaffold policy." },
      { id: "base-cleave", name: "Base Word Cleave adapter", provenance: "base_word_lab:v2", componentPath: "components/adle/morphology/base-word-family-guided-lesson.tsx", mount: adapter, supportedStates: ["initial", "active", "incorrect", "scaffold", "success", "restored"], classification: owner, note: "Thin adapter derives governed cuts and source/surface presentation for SplitHandle." },
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
