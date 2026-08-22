"use client";

import {
  createElement,
  type ComponentType,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";

import type {
  CanonicalActivityNormalizationBlocker,
  CanonicalActivitySpec,
} from "@/lib/adle/canonical-activity-spec";

export interface CanonicalActivityNavigation {
  complete: () => void;
  rereadTeaching: () => void;
}

export interface CanonicalActivityIdentity {
  concept: string;
  mode: string;
  contractVersion: 1;
}

export interface CanonicalActivityBinding extends CanonicalActivityIdentity {
  id: string;
  label: string;
  renderKey?: string;
  createProps: (navigation: CanonicalActivityNavigation) => unknown;
  wrap?: (activity: ReactNode) => ReactNode;
}

export interface CanonicalActivityValidationFailure {
  code:
    | "ADLE_ACTIVITY_UNKNOWN_CONTRACT"
    | "ADLE_ACTIVITY_INVALID_PAYLOAD"
    | "ADLE_ACTIVITY_PROPS_FACTORY_FAILED";
  activityId: string;
  contractKey: string;
  detail: string;
}

type RendererModule = { default: ComponentType<Record<string, unknown>> };
type RendererRegistration = CanonicalActivityIdentity & {
  catalogueComponent: string | null;
  runtimeAdapter?: string;
  load: () => Promise<RendererModule>;
  validate: (props: unknown) => boolean;
};

const noOpNavigation: CanonicalActivityNavigation = {
  complete: () => undefined,
  rereadTeaching: () => undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function functionValue(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function numberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry));
}

function validateTeachingPages(props: unknown): boolean {
  if (!isRecord(props) || !isRecord(props.config) || !Array.isArray(props.config.pages) || !isRecord(props.config.meetWords)) return false;
  const pages = props.config.pages;
  const words = props.config.meetWords.words;
  return pages.length >= 1
    && pages.length <= 3
    && pages.every((page) => isRecord(page) && page.type === "teaching" && nonEmptyString(page.id) && nonEmptyString(page.title))
    && Array.isArray(words)
    && words.length > 0
    && words.every((word) => isRecord(word) && nonEmptyString(word.id) && nonEmptyString(word.word))
    && functionValue(props.onComplete);
}

function validateDiscovery(props: unknown): boolean {
  if (!isRecord(props) || !isRecord(props.payload) || !Array.isArray(props.payload.activities)) return false;
  const activity = props.payload.activities.find((candidate) => isRecord(candidate) && candidate.type === "discovery");
  const cards = isRecord(activity) ? activity.discoveryCards : undefined;
  return Number.isInteger(props.index)
    && typeof props.muted === "boolean"
    && typeof props.addedPrefix === "boolean"
    && Array.isArray(cards)
    && isRecord(cards[props.index as number])
    && functionValue(props.onAddPrefix)
    && functionValue(props.onNext);
}

function validateFamilyReveal(props: unknown): boolean {
  return isRecord(props)
    && isRecord(props.section)
    && isRecord(props.section.baseWord)
    && nonEmptyString(props.section.baseWord.canonicalWordId)
    && Array.isArray(props.section.guidedWords)
    && props.section.guidedWords.length > 0
    && Number.isInteger(props.number)
    && Number.isInteger(props.total)
    && functionValue(props.onNext);
}

function validateSplitHandle(props: unknown): boolean {
  return isRecord(props)
    && nonEmptyString(props.word)
    && numberArray(props.splitPoints)
    && typeof props.misses === "number"
    && typeof props.correct === "boolean"
    && functionValue(props.onMiss)
    && functionValue(props.onCorrect)
    && functionValue(props.onContinue);
}

function validateBaseCleaveAdapter(props: unknown): boolean {
  return isRecord(props)
    && (props.word === undefined || isRecord(props.word))
    && isRecord(props.cuts)
    && isRecord(props.misses)
    && functionValue(props.onCutsChange)
    && functionValue(props.onMiss)
    && functionValue(props.onNext);
}

function validateDefinitionBuilder(props: unknown): boolean {
  return isRecord(props)
    && nonEmptyString(props.targetId)
    && nonEmptyString(props.definition)
    && Array.isArray(props.tiles)
    && props.tiles.length > 0
    && stringArray(props.expectedIds)
    && props.expectedIds.length > 0
    && nonEmptyString(props.label)
    && nonEmptyString(props.wordSum)
    && nonEmptyString(props.resultingMeaning)
    && nonEmptyString(props.continueLabel)
    && functionValue(props.onContinue);
}

function validateCompoundJigsaw(props: unknown): boolean {
  return isRecord(props)
    && Array.isArray(props.targets)
    && props.targets.length > 0
    && props.targets.every((target) => isRecord(target)
      && nonEmptyString(target.canonicalWordId)
      && nonEmptyString(target.word)
      && stringArray(target.components)
      && target.components.length >= 2
      && Array.isArray(target.joins)
      && target.joins.length === target.components.length - 1)
    && functionValue(props.onComplete);
}

function validateMeaningConnection(props: unknown): boolean {
  return isRecord(props)
    && Array.isArray(props.targets)
    && props.targets.length > 0
    && props.targets.every((target) => isRecord(target)
      && nonEmptyString(target.canonicalWordId)
      && nonEmptyString(target.word)
      && nonEmptyString(target.definition))
    && functionValue(props.onComplete);
}

function validateBinSort(props: unknown): boolean {
  return isRecord(props)
    && Array.isArray(props.items)
    && props.items.length > 0
    && props.items.every((item) => isRecord(item) && nonEmptyString(item.id) && nonEmptyString(item.text) && nonEmptyString(item.destination))
    && Array.isArray(props.bins)
    && props.bins.length > 0
    && props.bins.every((bin) => isRecord(bin) && nonEmptyString(bin.id) && nonEmptyString(bin.label));
}

function validateCoverShutter(props: unknown): boolean {
  return isRecord(props)
    && nonEmptyString(props.word)
    && numberArray(props.splitPoints)
    && functionValue(props.onContinue);
}

function validateSentenceDictation(props: unknown): boolean {
  return isRecord(props)
    && nonEmptyString(props.audioText)
    && nonEmptyString(props.correctSentence)
    && typeof props.value === "string"
    && typeof props.checked === "boolean"
    && nonEmptyString(props.stepLabel)
    && functionValue(props.onValueChange)
    && functionValue(props.onCheck)
    && functionValue(props.onContinue);
}

function validateLessonReflection(props: unknown): boolean {
  return isRecord(props)
    && Array.isArray(props.mistakes)
    && nonEmptyString(props.prompt)
    && typeof props.response === "string"
    && functionValue(props.onResponseChange)
    && (props.completionType === "submit" || functionValue(props.onComplete));
}

function validateTransformation(props: unknown): boolean {
  return isRecord(props)
    && nonEmptyString(props.surfaceText)
    && nonEmptyString(props.sourceText)
    && nonEmptyString(props.explanation)
    && functionValue(props.onContinue);
}

function validateHistoricalIntro(props: unknown): boolean {
  return isRecord(props) && isRecord(props.item);
}

function validateColdWordRecall(props: unknown): boolean {
  return isRecord(props)
    && (props.mode === "scheduled_review" || props.mode === "diagnostic_probe")
    && nonEmptyString(props.targetWord)
    && typeof props.value === "string"
    && typeof props.locked === "boolean"
    && nonEmptyString(props.label)
    && functionValue(props.onValueChange)
    && functionValue(props.onLock);
}

function validateErrorRepair(props: unknown): boolean {
  return isRecord(props)
    && isRecord(props.item)
    && typeof props.priorAttempt === "string"
    && typeof props.value === "string"
    && functionValue(props.onChange);
}

function validateGuidedCompatibility(props: unknown): boolean {
  return isRecord(props)
    && isRecord(props.item)
    && (props.variant === "memory_cue" || props.variant === "historical_free_response")
    && typeof props.value === "string"
    && functionValue(props.onChange);
}

function validateCompatibilityNoop(props: unknown): boolean {
  return isRecord(props);
}

function moduleLoader(
  load: () => Promise<Record<string, unknown>>,
  exportName: string,
): () => Promise<RendererModule> {
  return async () => {
    const imported = await load();
    const component = imported[exportName];
    if (typeof component !== "function") throw new Error(`Missing canonical renderer export ${exportName}`);
    return { default: component as ComponentType<Record<string, unknown>> };
  };
}

const teachingPagesLoader = moduleLoader(() => import("@/components/adle/first-impression/teaching-pages"), "TeachingPages");
const discoveryLoader = moduleLoader(() => import("@/components/adle/morphology/morphology-guided-lesson"), "Discovery");
const familyRevealLoader = moduleLoader(() => import("@/components/adle/morphology/base-word-family-guided-lesson"), "FamilyReveal");
const baseCleaveLoader = moduleLoader(() => import("@/components/adle/morphology/base-word-family-guided-lesson"), "Cleave");
const splitHandleLoader = moduleLoader(() => import("@/components/adle/activities/shared/split-handle"), "SplitHandle");
const definitionBuilderLoader = moduleLoader(() => import("@/components/adle/activities/shared/definition-word-builder"), "DefinitionWordBuilder");
const compoundJigsawLoader = moduleLoader(() => import("@/components/adle/morphology/compound-jigsaw-activity"), "CompoundJigsawActivity");
const meaningConnectionLoader = moduleLoader(() => import("@/components/adle/morphology/meaning-connection-activity"), "MeaningConnectionActivity");
const binSortLoader = moduleLoader(() => import("@/components/adle/activities/shared/bin-sort"), "BinSort");
const coverShutterLoader = moduleLoader(() => import("@/components/adle/activities/shared/cover-shutter"), "CoverShutter");
const sentenceDictationLoader = moduleLoader(() => import("@/components/adle/activities/shared/sentence-dictation"), "SentenceDictation");
const lessonReflectionLoader = moduleLoader(() => import("@/components/adle/activities/lesson-reflection"), "LessonReflection");
const transformationLoader = moduleLoader(() => import("@/components/adle/activities/shared/spelling-transformation-reveal"), "SpellingTransformationReveal");
const historicalIntroLoader = moduleLoader(() => import("@/components/adle/activities/intro-activity"), "IntroActivity");
const coldWordRecallLoader = moduleLoader(() => import("@/components/adle/activities/shared/cold-word-recall"), "ColdWordRecall");
const errorRepairLoader = moduleLoader(() => import("@/components/adle/activities/reflection-activity"), "ReflectionActivity");
const guidedCompatibilityLoader = moduleLoader(() => import("@/components/adle/activities/guided-activity"), "GuidedActivity");
const compatibilityNoopLoader = moduleLoader(() => import("@/components/adle/activities/compatibility-noop"), "CompatibilityNoop");

function registration(
  concept: string,
  mode: string,
  catalogueComponent: string | null,
  load: () => Promise<RendererModule>,
  validate: (props: unknown) => boolean,
  runtimeAdapter?: string,
): RendererRegistration {
  return { concept, mode, contractVersion: 1, catalogueComponent, runtimeAdapter, load, validate };
}

export function canonicalActivityContractKey(identity: CanonicalActivityIdentity): string {
  return `${identity.concept}.${identity.mode}@${identity.contractVersion}`;
}

const registrations = [
  registration("INTRODUCTION", "teaching_page", "TeachingPages", teachingPagesLoader, validateTeachingPages),
  registration("MEANING_DISCOVERY", "prefix", "Discovery", discoveryLoader, validateDiscovery),
  registration("MEANING_DISCOVERY", "suffix", "Discovery", discoveryLoader, validateDiscovery),
  registration("WORD_FAMILY_REVEAL", "base_led_family", "FamilyReveal", familyRevealLoader, validateFamilyReveal),
  registration("CLEAVER", "find_boundaries", "SplitHandle", splitHandleLoader, validateSplitHandle),
  registration("CLEAVER", "isolate_component", "SplitHandle", baseCleaveLoader, validateBaseCleaveAdapter, "Cleave"),
  registration("WORD_ASSEMBLY", "definition_word_builder", "DefinitionWordBuilder", definitionBuilderLoader, validateDefinitionBuilder),
  registration("COMPOUND_JIGSAW", "jigsaw_multi_target", "CompoundJigsawActivity", compoundJigsawLoader, validateCompoundJigsaw),
  registration("MEANING_MATCH", "component_clues", "MeaningConnectionActivity", meaningConnectionLoader, validateMeaningConnection),
  registration("MEANING_SORT", "meaning", "BinSort", binSortLoader, validateBinSort),
  registration("MEANING_SORT", "prefix_form", "BinSort", binSortLoader, validateBinSort),
  registration("COVER_CHECK", "whole_word", "CoverShutter", coverShutterLoader, validateCoverShutter),
  registration("COVER_CHECK", "component_marked", "CoverShutter", coverShutterLoader, validateCoverShutter),
  registration("COVER_CHECK", "ratio_close_policy", "CoverShutter", coverShutterLoader, validateCoverShutter),
  registration("DICTATION", "whole_sentence", "SentenceDictation", sentenceDictationLoader, validateSentenceDictation),
  registration("DICTATION", "target_token", "SentenceDictation", sentenceDictationLoader, validateSentenceDictation),
  registration("DICTATION", "target_span", "SentenceDictation", sentenceDictationLoader, validateSentenceDictation),
  registration("LESSON_REFLECTION", "standard_lesson_reflection", "LessonReflection", lessonReflectionLoader, validateLessonReflection),
  registration("TRANSFORMATION", "surface_to_source", "SpellingTransformationReveal", transformationLoader, validateTransformation),
  registration("INTRODUCTION", "historical_generic_read_only", "TeachingPages", historicalIntroLoader, validateHistoricalIntro, "IntroActivity"),
  registration("COLD_WORD_RECALL", "scheduled_review", "ColdWordRecall", coldWordRecallLoader, validateColdWordRecall),
  registration("COLD_WORD_RECALL", "diagnostic_probe", "ColdWordRecall", coldWordRecallLoader, validateColdWordRecall),
  registration("ERROR_REPAIR", "reveal_hide_retry", "ReflectionActivity", errorRepairLoader, validateErrorRepair),
  registration("MEMORY_CUE", "child_authored_cue", "GuidedActivity", guidedCompatibilityLoader, validateGuidedCompatibility),
  registration("MEANING_MATCH", "historical_free_response", "MeaningConnectionActivity", guidedCompatibilityLoader, validateGuidedCompatibility, "GuidedActivity"),
  registration("FREE_WRITING", "first_impression_transfer", null, guidedCompatibilityLoader, validateGuidedCompatibility, "GuidedActivity"),
  registration("FREE_WRITING", "review_transfer", null, guidedCompatibilityLoader, validateGuidedCompatibility, "GuidedActivity"),
  registration("REVIEW_SORT", "compatibility_noop", null, compatibilityNoopLoader, validateCompatibilityNoop, "CompatibilityNoop"),
] as const;

const registry = new Map(registrations.map((entry) => [canonicalActivityContractKey(entry), entry]));

function CanonicalActivityLoadingState() {
  return <div role="status" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the activity…</div>;
}

// next/dynamic needs stable, module-level component identities so Next can
// preload the corresponding chunks and React can preserve hydration state.
const dynamicRenderers = new Map<string, ComponentType<Record<string, unknown>>>(
  registrations.map((entry) => [
    canonicalActivityContractKey(entry),
    dynamic(entry.load, { loading: CanonicalActivityLoadingState }),
  ]),
);

export function listCanonicalActivityRendererRegistrations(): readonly RendererRegistration[] {
  return registrations;
}

export function createCanonicalActivityBinding(input: CanonicalActivityBinding): CanonicalActivityBinding {
  return input;
}

export function validateCanonicalActivityBinding(binding: CanonicalActivityBinding): CanonicalActivityValidationFailure | null {
  const contractKey = canonicalActivityContractKey(binding);
  const registered = registry.get(contractKey);
  if (!registered) return { code: "ADLE_ACTIVITY_UNKNOWN_CONTRACT", activityId: binding.id, contractKey, detail: "No canonical renderer is registered for this concept, mode, and contract version." };
  let props: unknown;
  try {
    props = binding.createProps(noOpNavigation);
  } catch (error) {
    return { code: "ADLE_ACTIVITY_PROPS_FACTORY_FAILED", activityId: binding.id, contractKey, detail: error instanceof Error ? error.message : "The runtime props factory failed." };
  }
  return registered.validate(props)
    ? null
    : { code: "ADLE_ACTIVITY_INVALID_PAYLOAD", activityId: binding.id, contractKey, detail: `Payload does not satisfy the ${registered.catalogueComponent} v${registered.contractVersion} contract.` };
}

export function validateCanonicalActivitySequence(bindings: readonly CanonicalActivityBinding[]): CanonicalActivityValidationFailure[] {
  return bindings.flatMap((binding) => {
    const failure = validateCanonicalActivityBinding(binding);
    return failure ? [failure] : [];
  });
}

export async function loadCanonicalActivityRenderer(identity: CanonicalActivityIdentity): Promise<ComponentType<Record<string, unknown>>> {
  const contractKey = canonicalActivityContractKey(identity);
  const registered = registry.get(contractKey);
  if (!registered) throw new Error(`Unknown canonical activity contract: ${contractKey}`);
  return (await registered.load()).default;
}

function LazyCanonicalActivity(props: { binding: CanonicalActivityBinding; navigation: CanonicalActivityNavigation }) {
  const contractKey = canonicalActivityContractKey(props.binding);
  const registered = registry.get(contractKey);
  if (!registered) return <CanonicalActivityBlockedState failure={{ code: "ADLE_ACTIVITY_UNKNOWN_CONTRACT", activityId: props.binding.id, contractKey, detail: "No canonical renderer is registered for this activity." }} />;
  const failure = validateCanonicalActivityBinding(props.binding);
  if (failure) return <CanonicalActivityBlockedState failure={failure} />;
  const Renderer = dynamicRenderers.get(contractKey);
  if (!Renderer) return <CanonicalActivityBlockedState failure={{ code: "ADLE_ACTIVITY_UNKNOWN_CONTRACT", activityId: props.binding.id, contractKey, detail: "No canonical renderer is available for this activity." }} />;
  const activity = createElement(Renderer, {
    ...(props.binding.createProps(props.navigation) as Record<string, unknown>),
    key: props.binding.renderKey,
  });
  return props.binding.wrap ? props.binding.wrap(activity) : activity;
}

export function CanonicalActivityRenderer(props: { binding: CanonicalActivityBinding; navigation: CanonicalActivityNavigation }) {
  return <LazyCanonicalActivity {...props} />;
}

export function CanonicalActivityHost(props: {
  spec: CanonicalActivitySpec;
  runtimeProps?: Readonly<Record<string, unknown>>;
  navigation?: CanonicalActivityNavigation;
  wrap?: (activity: ReactNode) => ReactNode;
}) {
  const binding = createCanonicalActivityBinding({
    id: props.spec.id,
    label: props.spec.label,
    concept: props.spec.concept,
    mode: props.spec.mode,
    contractVersion: props.spec.contractVersion,
    renderKey: props.spec.id,
    createProps: () => ({ ...props.spec.payload, ...props.runtimeProps }),
    wrap: props.wrap,
  });
  return <CanonicalActivityRenderer binding={binding} navigation={props.navigation ?? noOpNavigation} />;
}

export function CanonicalActivityBlockedState(props: { failure: CanonicalActivityValidationFailure }) {
  return (
    <section role="alert" data-adle-activity-blocker={props.failure.code} className="brand-card grid gap-3 rounded-3xl p-8 text-center">
      <h2 className="text-xl font-black text-[color:var(--ink)]">This activity is not ready yet</h2>
      <p className="text-sm text-[color:var(--mid)]">Ask your grown-up to try this lesson again later. No answer has been saved.</p>
      {process.env.NODE_ENV !== "production" ? <code className="text-xs text-[color:var(--mid)]">{props.failure.code}: {props.failure.contractKey} — {props.failure.detail}</code> : null}
    </section>
  );
}

export function CanonicalActivityNormalizationBlockedState(props: { blocker: CanonicalActivityNormalizationBlocker }) {
  return (
    <section role="alert" data-adle-activity-blocker={props.blocker.code} className="brand-card grid gap-3 rounded-3xl p-8 text-center">
      <h2 className="text-xl font-black text-[color:var(--ink)]">This activity is not ready yet</h2>
      <p className="text-sm text-[color:var(--mid)]">Ask your grown-up to try this lesson again later. No answer has been saved.</p>
      {process.env.NODE_ENV !== "production" ? <code className="text-xs text-[color:var(--mid)]">{props.blocker.code}: {props.blocker.templateKey || "metadata-free"} — {props.blocker.detail}</code> : null}
    </section>
  );
}
