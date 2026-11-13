"use client";

import {
  activityTransformationText,
  lessonActivityQuestion,
} from "@/lib/teaching-dictionary-manager/activity-question";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hydrateWorkspaceFacts } from "@/lib/teaching-dictionary-manager/workspace-hydration";
import { loadWordFamilyReview } from "./family-review-loader";
import { activityVariantsForRoute } from "@/lib/adle/composable-lesson/activity-variants";
import { ACTIVITY_LABELS } from "@/lib/teaching-dictionary-manager/activity-matrix";
import {
  DICTIONARY_BANDS,
  publicationBlockers,
  routeContentsForSelectedSkills,
  routeForSkill,
  routeWithSharedFacts,
  sharedRouteContentKeys,
  type WordDraftPayload,
  type RouteContentDraft,
} from "@/lib/teaching-dictionary-manager/contracts";
import { workspaceErrorMessage } from "@/lib/teaching-dictionary-manager/workspace-errors";
import { partOfSpeechOptions } from "@/lib/teaching-dictionary-manager/part-of-speech-options";
import { reviewedWordCanLaunch } from "@/lib/teaching-dictionary-manager/editorial-review";
import { publicationBlockerTarget } from "@/lib/teaching-dictionary-manager/readiness";
import {
  routeRequirements,
  requirementActivities,
} from "@/lib/teaching-dictionary-manager/workspace-requirements";
import {
  withDerivedMorphologyMetadata,
  dictationVariants,
  generatedWordSum,
  targetOccurrences,
  type ReviewedTransformation,
} from "@/lib/teaching-dictionary-manager/authoring";
import type { LessonReadinessRow } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import type { WordRouteStatus } from "@/lib/teaching-dictionary-manager/word-route-status";
import { approveTeachingDictionaryPartOfSpeech, saveWordWorkspace } from "./actions";

type FamilySearchResult = { kind: "lexical"; id: string; name: string; meaning: string; baseLemma: string; baseKind: "free_base" | "bound_root" };
import { launchReviewedAdleLesson } from "../adle-lesson-readiness/actions";
import { CompoundPartsEditor } from "./compound-parts-editor";
import {
  PairedDictationEditor,
  type PassageSet,
} from "./paired-dictation-editor";
import { PartSequenceEditor } from "./part-sequence-editor";
import { RouteFactsEditor } from "./route-facts-editor";
import { auditCanonicalMorphology } from "@/lib/teaching-dictionary-manager/canonical-morphology";
import { morphologyReviewGuidance } from "@/lib/teaching-dictionary-manager/morphology-review-guidance";
import { ActionSubmitButton } from "./action-submit-button";
import { FormatHint } from "./format-hint";
import { WeakVowelRouteEditor } from "./weak-vowel-route-editor";
import { SenseEditor } from "./sense-editor";
import { DictationListen } from "./dictation-listen";
import { SenseMorphologyReview } from "./sense-morphology-review";
import { MultiSenseCsvPanel } from "./multi-sense-csv-panel";
import { legacySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { evaluateLessonCandidate, hasCandidateRule,
  type CandidateMorphology, type CandidateFamilyLink } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { weakVowelBlockerCode, weakVowelBlockerTarget, weakVowelRouteBlockers, type WeakVowelRouteFactsV1 } from "@/lib/teaching-dictionary-manager/weak-vowel-authoring";
import type { BritishRecording } from "@/lib/teaching-dictionary-manager/british-recordings";
import { prefillWeakVowelDrafts, type ReviewedWeakVowelSource, type ReviewedWeakVowelWrittenFact } from "@/lib/teaching-dictionary-manager/weak-vowel-prefill";
import type { WeakVowelFamilyPrefill } from "@/lib/teaching-dictionary-manager/weak-vowel-family-prefill";

const button =
  "rounded-lg bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const input =
  "w-full min-w-0 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm";
const section = "min-w-0 rounded-xl border border-[var(--border)] bg-white";
const actions = "mt-3 flex flex-wrap justify-end gap-2";
type Skill = {
  micro_skill_key: string;
  display_name: string;
  skill_family_key: string;
  skill_cluster_key: string;
};
type Family = { name: string; meaning?: string; pronunciation?: string; words: { id: string; word: string }[] };
type Field = {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
};

function Pencil({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Edit ${label}`}
      className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded text-[color:var(--scarlett)]"
    >
      ✎
    </button>
  );
}
function Prompt({ text }: { text: string }) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  function place(target: HTMLElement) {
    const bounds = target.getBoundingClientRect();
    // CSS viewport math also keeps an already-open tooltip in bounds on resize.
    setPosition({ width: "min(288px, calc(100vw - 32px))",
      left: `clamp(16px, ${bounds.left}px, calc(100vw - min(288px, calc(100vw - 32px)) - 16px))`,
      top: `clamp(16px, ${bounds.bottom + 6}px, calc(100vh - 200px))` });
  }
  return (
    <span className="group relative inline-flex" onMouseEnter={event => place(event.currentTarget)} onFocus={event => place(event.currentTarget)}>
      <button
        type="button"
        aria-label="Show learner question"
        className="ml-2 inline-flex size-5 items-center justify-center rounded-full border border-[var(--border)] text-xs"
      >
        ?
      </button>
      <span
        role="tooltip"
        style={position ?? { visibility: "hidden" }}
        className="fixed z-50 hidden max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-3 text-sm font-normal shadow-lg group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}
function CompiledLessonPreview({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  return <details className="mt-3 text-sm" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer">Compiled lesson preview</summary>
    {open && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--paper)] p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>}
  </details>;
}

function InlineBritishRecording({ clip, label }: { clip: BritishRecording; label: string }) {
  const player = useRef<HTMLAudioElement>(null);
  return <span className="inline-flex shrink-0 items-center">
    <button type="button" className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--scarlett)] hover:border-[color:var(--scarlett)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--scarlett)]"
      aria-label={`Play reviewed British ${label} recording`} title={`Play British ${label} recording`}
      onClick={() => { void player.current?.play(); }}>▶</button>
    <audio ref={player} preload="none" src={clip.src} />
  </span>;
}

function Editable({
  label,
  value,
  id,
  onChange,
  options,
  hideLabel,
}: {
  hideLabel?: boolean;
  label: string;
  value: string;
  id: string;
  onChange: (value: string) => void;
  options?: Field["options"];
}) {
  const [editing, setEditing] = useState(false);
  const help: Record<string, { format: string; example: string }> = {
    "Display word": { format: "Enter the spelling exactly as learners should see it.", example: "scrolling" },
    Definition: { format: "Enter one reviewed dictionary meaning reusable across lessons.", example: "Moving content up or down a screen." },
    "Spoken syllables": { format: "Enter the number of syllables heard. Written syllable divisions use middle dots in their own field.", example: "2" },
    Phonemes: { format: "Enter the reviewed British pronunciation or phoneme hint.", example: "/ˈskrəʊ.lɪŋ/" },
    "Part of speech": { format: "Choose the grammatical role of this word.", example: "verb" },
    Schwa: { format: "Choose whether this pronunciation contains a schwa.", example: "No" },
    "Stress pattern": { format: "Name the stressed spoken syllable.", example: "first syllable" },
    "Legacy morphemes": { format: "Compatibility text; build approved parts in the visual word-parts editor.", example: "scroll + ing" },
    "Morphology notes": { format: "Explain any exceptional spelling change in plain language.", example: "The final consonant doubles before -ing." },
    "Age band": { format: "Choose the dictionary learner age band.", example: "middle_primary" },
    "Frequency band": { format: "Choose the reviewed frequency band.", example: "medium" },
    "Complexity band": { format: "Choose the reviewed teaching complexity band.", example: "medium" },
    "Source category": { format: "Choose the provenance category for this fact.", example: "internal_authored" },
    "Source name": { format: "Name the source used for review.", example: "Teaching Dictionary editorial review" },
    "Source URL": { format: "Enter a full source URL when one applies.", example: "https://example.org/entry" },
    "Source licence": { format: "Name the licence when the source is licensed.", example: "CC BY 4.0" },
    "Source use note": { format: "Explain how the source was used for this entry.", example: "Internally authored and reviewed" },
    Confidence: { format: "Choose the evidence confidence level.", example: "high" },
  };
  const guidance = help[label] ?? { format: `Enter the reviewed ${label.toLocaleLowerCase("en-GB")} in plain language.`, example: "A short reviewed phrase" };
  return (
    <div id={id} className="min-w-0 scroll-mt-6">
      <label
        htmlFor={`${id}-input`}
        className="inline-flex items-center gap-1 text-xs text-[color:var(--mid)]"
      >
        <span className={hideLabel ? "sr-only" : undefined}>{label}</span> <span className="group relative inline-flex" tabIndex={0} aria-label={`How to fill ${label}. Format: ${guidance.format} Example: ${guidance.example}`}>
          <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full border text-xs">i</span>
          <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 hidden w-64 rounded bg-white p-2 text-xs text-[color:var(--ink)] shadow group-hover:block group-focus:block"><strong>Format:</strong> {guidance.format}<br /><strong>Example:</strong> {guidance.example}</span>
        </span>
      </label>
      <div className="flex min-h-9 items-start justify-between gap-1">
        {editing ? (
          options ? (
            <select
              autoFocus
              id={`${id}-input`}
              className={input}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            >
              <option value="">Select</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              id={`${id}-input`}
              className={input}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          )
        ) : (
          <span className="break-words py-1 text-sm">
            {(options?.find((option) => option.value === value)?.label ??
              value) || <span className="text-amber-900">Missing</span>}
          </span>
        )}
        <Pencil label={label} onClick={() => setEditing(!editing)} />
      </div>
    </div>
  );
}

export function WordWorkspace(props: {
  wordId: string | null;
  currentMorphologyId: string | null;
  currentMorphologyLinkedToFamily: boolean;
  currentApprovedPartOfSpeech: string;
  draftId: string | null;
  normalisedWord: string;
  initial: WordDraftPayload;
  approvedSenseSet: DictionarySenseSet | null;
  initialSenseId?: string;
  meaningImportRequests: { sense_id: string; micro_skill_key: string }[];
  approvedCandidateMorphology: CandidateMorphology | null;
  approvedMorphologyTransformations: unknown[];
  approvedCandidateFamilyLinks: CandidateFamilyLink[];
  approvedCandidateSenseFacts: Record<string, { morphology: CandidateMorphology | null;
    familyLinks: CandidateFamilyLink[] }>;
  senseAnalyses: { id: string; sense_id: string; morphology_parts: unknown[];
    morphology_joins: unknown[]; morphology_transformations: unknown[]; word_sum: string }[];
  senseFamilyMemberships: { id: string; sense_id: string; sense_morphology_id: string;
    family_key: string; component_part_id: string; relationship_kind: string }[];
  senseFamilyOptions: { family_key: string; base_lemma: string; base_kind: string;
    base_meaning: string; canonical_base_word_id: string | null }[];
  staleLessonSenseKeys: string[];
  approvedLessonSenseKeys: string[];
  approvedSkillSenseIds: Record<string, string>;
  weakPublicationState: { microSkillKey: string; contentVersionId: string; sourceCurrent: boolean }[];
  approvedWord: string | null;
  approvedDefinition: string | null;
  approvedSentence: string | null;
  wordClip: BritishRecording | null;
  sentenceClip: BritishRecording | null;
  dictationRecordingSources: readonly [string, string][];
  deviceWordClip: { src: string; sha256: string } | null;
  deviceSentenceClip: { src: string; sha256: string } | null;
  approvedWeakSources: ReviewedWeakVowelSource[];
  approvedWrittenFacts: ReviewedWeakVowelWrittenFact[];
  weakFamilyPrefill: WeakVowelFamilyPrefill;
  approvedSourceReference: string;
  initialAssignedSkillKeys: string[] | null;
  dictionaryFingerprint: string | null;
  sourceReference: string;
  skills: Skill[];
  affixMeanings: Record<string, string[]>;
  partSuggestions: {
    label: string;
    parts: unknown[];
    joins: unknown[];
    transformations: ReviewedTransformation[];
  }[];
  profileOptions: {
    microSkillKey: string;
    meaningBins: { id: string; label: string }[];
    choices: string[];
  }[];
  baseFamilies: Family[];
  familyReviewContext: { error?: string };
  advanced: ReactNode;
  saved?: boolean;
  error?: string;
  overviewReviewed: boolean;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<WordDraftPayload>(() => prefillWeakVowelDrafts({
    payload: {
      ...props.initial,
      dictationVariants: dictationVariants(props.initial),
      writtenSyllableBreakdown: props.initial.writtenSyllableBreakdown ?? "",
      senseSet: props.initial.senseSet ?? legacySenseSet({ wordId: props.wordId,
        definition: props.initial.definition, partOfSpeech: props.initial.canonicalMorphology.rawPartOfSpeech,
        ipa: props.initial.metadata.phoneme_hint, spokenSyllables: props.initial.metadata.syllables,
        stressPattern: props.initial.metadata.stress_pattern,
        dictationSentence: props.initial.dictationSentence,
        dictationTargetTokenIndex: props.initial.dictationTargetTokenIndex }),
      skillSenseIds: props.initial.skillSenseIds ?? {},
    },
    dictionaryFingerprint: props.dictionaryFingerprint,
    approvedWord: props.approvedWord,
    approvedDefinition: props.approvedDefinition,
    approvedSentence: props.approvedSentence,
    wordClip: props.wordClip ?? props.deviceWordClip,
    sentenceClip: props.sentenceClip ?? props.deviceSentenceClip,
    sources: props.approvedWeakSources,
    writtenFacts: props.approvedWrittenFacts,
    family: props.weakFamilyPrefill,
    sourceReference: props.approvedSourceReference,
  }));
  const [activeSenseId, setActiveSenseId] = useState(() =>
    payload.senseSet?.senses.find(sense => sense.id === props.initialSenseId)?.id ?? payload.senseSet?.senses[0]?.id ?? "");
  const activeSense = props.approvedSenseSet?.senses.find(sense => sense.id === activeSenseId);
  const selectedMeaning = payload.senseSet?.senses.find(sense => sense.id === activeSenseId);
  const dictationRecordingSources = new Map(props.dictationRecordingSources);
  const activeSenseFamilyKeys = new Set((props.approvedCandidateSenseFacts[activeSenseId]?.familyLinks ?? [])
    .map(link => link.family_key));
  const activeSenseFamilies = props.approvedSenseSet && props.approvedSenseSet.senses.length > 1
    ? props.baseFamilies.filter(family => activeSenseFamilyKeys.has(family.name)) : props.baseFamilies;
  const [dirty, setDirty] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const [checksLoadedMs, setChecksLoadedMs] = useState<number | null>(null);
  const [lastSaveMs, setLastSaveMs] = useState<number | null>(null);
  useEffect(() => { workspace.current?.setAttribute("data-overview-hydrated-ms", String(Math.round(performance.now()))); }, []);
  const editRevision = useRef(0);
  const [editVersion, setEditVersion] = useState(0);
  useEffect(() => { editRevision.current = editVersion; }, [editVersion]);
  const [draftId, setDraftId] = useState(props.draftId);
  const [overviewReviewed, setOverviewReviewed] = useState(props.overviewReviewed);
  const [preflights, setPreflights] = useState<LessonReadinessRow[]>([]);
  const [wordRouteStatuses, setWordRouteStatuses] = useState<WordRouteStatus[]>([]);
  const [assignedSkillKeys, setAssignedSkillKeys] = useState<string[] | null>(props.initialAssignedSkillKeys);
  const [checksState, setChecksState] = useState<"loading" | "ready" | "error">(props.wordId ? "loading" : "ready");
  const [checkVersion, setCheckVersion] = useState(0);
  const checksGeneration = useRef(0);
  const initialChecksApplied = useRef(false);
  const [saveMessage, setSaveMessage] = useState(props.saved ? "Saved." : "");
  const [actionError, setActionError] = useState(props.error);
  const [saveState, saveAction, saving] = useActionState(
    async (_previous: null, form: FormData) => {
      const saveStarted = performance.now();
      const revision = editRevision.current;
      const continueToFamily = form.get("review_section") === "overview-family";
      if (continueToFamily) form.set("review_section", "overview");
      if (!form.has("review_section")) form.set("review_section", "draft");
      setActionError(undefined);
      setSaveMessage("");
      let result: Awaited<ReturnType<typeof saveWordWorkspace>>;
      try {
        result = await saveWordWorkspace(form);
      } catch {
        setActionError("The page changed while it was open. Reload this page and try saving again.");
        return null;
      }
      setLastSaveMs(Math.round(performance.now() - saveStarted));
      const destination = new URL(result.destination, window.location.origin);
      const error = result.error ?? destination.searchParams.get("publish_error") ?? undefined;
      setActionError(error);
      setDraftId(destination.searchParams.get("draft"));
      if (result.error === "TEACHING_OVERVIEW_REVIEW_REQUIRED") {
        // The save created a new draft. Show that draft's required Overview
        // review instead of leaving the editor on the apparently reviewed live word.
        destination.searchParams.set("error", result.error);
        router.replace(`${destination.pathname}${destination.search}#td-overview`);
        return null;
      }
      if (!props.wordId && destination.pathname !== "/admin/teaching-dictionary/new" && !result.error) {
        router.push(result.destination);
        return null;
      }
      if (continueToFamily && !error && result.overviewApproved) {
        destination.searchParams.set("sense", String(form.get("selected_sense_id") ?? ""));
        router.replace(`${destination.pathname}${destination.search}#td-sense-morphology`);
        return null;
      }
      window.history.replaceState(null, "", `${destination.pathname}${destination.search}${window.location.hash}`);
      if (props.wordId) {
        checksGeneration.current += 1;
        setChecksState("loading");
        setCheckVersion(version => version + 1);
      }
      if (!result.error) {
        if (String(form.get("review_section") ?? "").startsWith("lesson:")) splitDialog.current?.close();
        if (editRevision.current === revision) {
          setDirty(false);
          setOverviewReviewed(result.overviewApproved);
        }
        setSaveMessage("Saved. Updating lesson checks…");
        if (String(form.get("review_section") ?? "").startsWith("lesson:")) router.refresh();
      }
      return null;
    }, null,
  );
  void saveState;
  useEffect(() => {
    if (!props.wordId) return;
    const controller = new AbortController();
    const generation = checksGeneration.current;
    fetch(`/api/admin/teaching-dictionary/${props.wordId}/lesson-readiness`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("TEACHING_READINESS_LOAD_FAILED");
      return response.json() as Promise<{ preflights: LessonReadinessRow[]; routeContents: RouteContentDraft[]; skillKeys: string[]; assignedSkillKeys: string[]; wordRouteStatuses: WordRouteStatus[] }>;
    }).then(result => {
      if (controller.signal.aborted || generation !== checksGeneration.current) return;
      setChecksLoadedMs(Math.round(performance.now()));
      setPreflights(result.preflights);
      setWordRouteStatuses(result.wordRouteStatuses);
      setAssignedSkillKeys(result.assignedSkillKeys);
      if (!initialChecksApplied.current) {
        // Late native facts fill gaps only; edits and an explicitly selected draft win.
        setPayload(current => prefillWeakVowelDrafts({
          payload: hydrateWorkspaceFacts({ current, initial: props.initial, draftId: props.draftId,
            edited: editRevision.current > 0, skillKeys: result.assignedSkillKeys,
            routeContents: result.routeContents.filter(route => current.skillKeys.includes(route.microSkillKey) ||
              result.assignedSkillKeys.includes(route.microSkillKey)),
            activeSkillKeys: new Set(props.skills.map(skill => skill.micro_skill_key)) }),
          dictionaryFingerprint: props.dictionaryFingerprint,
          approvedWord: props.approvedWord,
          approvedDefinition: props.approvedDefinition,
          approvedSentence: props.approvedSentence,
          wordClip: props.wordClip ?? props.deviceWordClip,
          sentenceClip: props.sentenceClip ?? props.deviceSentenceClip,
          sources: props.approvedWeakSources,
          writtenFacts: props.approvedWrittenFacts,
          family: props.weakFamilyPrefill,
          sourceReference: props.approvedSourceReference,
        }));
        initialChecksApplied.current = true;
      }
      setChecksState("ready");
      setSaveMessage(message => message ? "Saved. Lesson checks updated." : "");
    }).catch(() => {
      if (!controller.signal.aborted && generation === checksGeneration.current) setChecksState("error");
    });
    return () => controller.abort();
  }, [props.wordId, props.draftId, props.initial, props.dictionaryFingerprint,
    props.approvedWord, props.approvedDefinition, props.approvedSentence, props.wordClip, props.sentenceClip,
    props.deviceWordClip, props.deviceSentenceClip,
    props.approvedWeakSources, props.approvedWrittenFacts, props.weakFamilyPrefill, props.approvedSourceReference,
    props.skills, checkVersion]);
  const [joined, setJoined] = useState("");
  const [splitSkill, setSplitSkill] = useState<string | null>(null);
  const splitDialog = useRef<HTMLDialogElement>(null);
  const builder = useRef<HTMLDialogElement>(null);
  const family = useRef<HTMLDialogElement>(null);
  const [familyReview, setFamilyReview] = useState<ReactNode>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyQuery, setFamilyQuery] = useState("");
  const [familyMatches, setFamilyMatches] = useState<FamilySearchResult[]>([]);
  const [familySearchBusy, setFamilySearchBusy] = useState(false);
  const [familySearchError, setFamilySearchError] = useState(false);
  const [familySearchLimited, setFamilySearchLimited] = useState(false);
  const [selectedFamilyLabel, setSelectedFamilyLabel] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<FamilySearchResult | null>(null);
  const familyLoadVersion = useRef(0);
  useEffect(() => {
    const query = familyQuery.trim();
    if (!familyOpen || query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setFamilySearchBusy(true);
      setFamilySearchError(false);
      try {
        const response = await fetch(`/api/admin/teaching-dictionary/family-search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("FAMILY_SEARCH_FAILED");
        const payload = await response.json() as { results: FamilySearchResult[]; limited: boolean };
        if (!controller.signal.aborted) {
          setFamilyMatches(payload.results);
          setFamilySearchLimited(payload.limited);
        }
      } catch {
        if (!controller.signal.aborted) setFamilySearchError(true);
      } finally {
        if (!controller.signal.aborted) setFamilySearchBusy(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [familyOpen, familyQuery]);
  async function showFamilyReview(lexicalFamilyKey?: string, error?: string) {
    if (!props.wordId) return;
    const version = ++familyLoadVersion.current;
    setFamilyLoading(true);
    try {
      const review = await loadWordFamilyReview(props.wordId, error, lexicalFamilyKey);
      if (version === familyLoadVersion.current) setFamilyReview(review);
    } catch {
      if (version === familyLoadVersion.current) setFamilyReview(<p role="alert">Family suggestions could not load. Close this window and reopen the page to try again.</p>);
    } finally {
      if (version === familyLoadVersion.current) setFamilyLoading(false);
    }
  }
  async function openFamily() {
    family.current?.showModal();
    setFamilyOpen(true);
    if (!familyReview && !familyLoading) await showFamilyReview(undefined, props.familyReviewContext.error);
  }
  function useSelectedFamilyInOverview() {
    if (!selectedFamily) return;
    const selected = selectedFamily;
    const kind = selected.baseKind === "bound_root" ? "root" : "base";
    const current = Array.isArray(payload.canonicalMorphology.parts)
      ? payload.canonicalMorphology.parts.filter((part): part is Record<string, unknown> =>
        Boolean(part) && typeof part === "object" && !Array.isArray(part)) : [];
    const exactIndex = current.findIndex((part) =>
      String(part.sourceText ?? part.text ?? "").toLocaleLowerCase("en-GB") === selected.baseLemma);
    const replaceIndex = exactIndex >= 0 ? exactIndex : current.findIndex((part) =>
      ["base", "root", "free_base", "bound_base"].includes(String(part.kind ?? part.type ?? part.partType)));
    const familyPart = { id: replaceIndex >= 0 ? String(current[replaceIndex]?.id ?? crypto.randomUUID()) : crypto.randomUUID(),
      kind, sourceText: selected.baseLemma,
      surfaceText: exactIndex >= 0 ? String(current[exactIndex]?.surfaceText ?? current[exactIndex]?.text ?? "")
        : payload.displayWord.toLocaleLowerCase("en-GB").startsWith(selected.baseLemma) ?
          payload.displayWord.slice(0, selected.baseLemma.length) : "",
      gloss: selected.meaning };
    const parts = replaceIndex >= 0 ? current.map((part, index) => index === replaceIndex ? { ...part, ...familyPart } : part)
      : [familyPart, ...current];
    change({ canonicalMorphology: { ...payload.canonicalMorphology, parts, analysisStatus: "in_review",
      wordSum: generatedWordSum(parts, payload.displayWord) } });
    family.current?.close();
    setFamilyOpen(false);
    builder.current?.showModal();
  }
  const formId = "word-workspace-save";
  function change(update: Partial<WordDraftPayload>) {
    setEditVersion(version => version + 1);
    setPayload((old) => {
      const next = { ...old, ...update };
      const set = next.senseSet;
      if (set?.senses[0]) {
        if (update.senseSet) {
          const first = set.senses[0];
          const previous = old.senseSet?.senses[0];
          next.definition = first.definition;
          if (first.dictationSentence !== previous?.dictationSentence ||
              first.dictationTargetTokenIndex !== previous?.dictationTargetTokenIndex) {
            next.dictationSentence = first.dictationSentence ?? "";
            next.dictationTargetTokenIndex = first.dictationTargetTokenIndex ?? -1;
            const [primary, ...alternates] = dictationVariants(old);
            const sentenceChanged = next.dictationSentence !== primary.sentence;
            next.dictationVariants = [{ ...primary, sentence: next.dictationSentence,
              audioText: sentenceChanged ? next.dictationSentence : primary.audioText,
              targetTokenIndex: next.dictationTargetTokenIndex }, ...alternates];
          }
          next.canonicalMorphology = { ...next.canonicalMorphology,
            rawPartOfSpeech: set.senses[0].partOfSpeech };
          const pronunciation = set.pronunciations.find(row => row.id === set.senses[0].pronunciationId);
          if (pronunciation) next.metadata = { ...next.metadata,
            phoneme_hint: pronunciation.ipa, syllables: String(pronunciation.spokenSyllableCount ?? ""),
            stress_pattern: pronunciation.stressPattern };
        } else if (update.definition !== undefined || update.dictationSentence !== undefined ||
          update.dictationTargetTokenIndex !== undefined || update.canonicalMorphology?.rawPartOfSpeech !== undefined ||
          update.metadata?.phoneme_hint !== undefined || update.metadata?.syllables !== undefined ||
          update.metadata?.stress_pattern !== undefined) {
          const first = set.senses[0];
          next.senseSet = { ...set, senses: [{ ...first,
            definition: update.definition ?? first.definition,
            dictationSentence: update.dictationSentence ?? first.dictationSentence,
            dictationTargetTokenIndex: update.dictationTargetTokenIndex ?? first.dictationTargetTokenIndex,
            partOfSpeech: update.canonicalMorphology?.rawPartOfSpeech ?? first.partOfSpeech }, ...set.senses.slice(1)],
            pronunciations: set.pronunciations.map(row => row.id === first.pronunciationId ? {
              ...row, ipa: update.metadata?.phoneme_hint ?? row.ipa,
              spokenSyllableCount: update.metadata?.syllables !== undefined
                ? (/^[1-9][0-9]*$/.test(update.metadata.syllables) ? Number(update.metadata.syllables) : null)
                : row.spokenSyllableCount,
              stressPattern: update.metadata?.stress_pattern ?? row.stressPattern,
            } : row) };
        }
      }
      return withDerivedMorphologyMetadata(prefillWeakVowelDrafts({
      payload: next,
      dictionaryFingerprint: props.dictionaryFingerprint,
      approvedWord: props.approvedWord,
      approvedDefinition: props.approvedDefinition,
      approvedSentence: props.approvedSentence,
      wordClip: props.wordClip ?? props.deviceWordClip,
      sentenceClip: props.sentenceClip ?? props.deviceSentenceClip,
      sources: props.approvedWeakSources,
      writtenFacts: props.approvedWrittenFacts,
      family: props.weakFamilyPrefill,
      sourceReference: props.approvedSourceReference,
    }));
    });
    setDirty(true);
  }
  function addMeaning() {
    const set = payload.senseSet;
    if (!set) return;
    const id = crypto.randomUUID();
    change({ senseSet: { ...set, senses: [...set.senses, { id, definition: "", partOfSpeech: "",
      pronunciationId: selectedMeaning?.pronunciationId ?? set.pronunciations[0]?.id ?? null }] } });
    setActiveSenseId(id);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#td-definition input")?.focus());
  }
  function metadata(
    key: keyof WordDraftPayload["metadata"],
    value: string | boolean | null,
  ) {
    change({ metadata: { ...payload.metadata, [key]: value } });
  }
  function routeContent(key: string): RouteContentDraft | undefined {
    return routeContentsForSelectedSkills(meaningPayload(key)).find(
      (route) => route.microSkillKey === key,
    );
  }
  function meaningPayload(key: string): WordDraftPayload {
    if (!activeSenseId || !props.approvedSenseSet || props.approvedSenseSet.senses.length < 2)
      return payload;
    const facts = props.approvedCandidateSenseFacts[activeSenseId]?.morphology;
    const analysis = props.senseAnalyses.find(row => row.sense_id === activeSenseId);
    return {
      ...payload,
      skillSenseIds: { ...payload.skillSenseIds, [key]: activeSenseId },
      canonicalMorphology: facts && analysis ? {
        ...payload.canonicalMorphology,
        parts: Array.isArray(facts.parts) ? facts.parts : [],
        joins: Array.isArray(facts.joins) ? facts.joins : [],
        transformations: analysis.morphology_transformations as WordDraftPayload["canonicalMorphology"]["transformations"],
        wordSum: facts.wordSum ?? "",
        analysisStatus: "approved",
        reviewNotes: "Approved analysis for the selected meaning",
      } : { ...payload.canonicalMorphology, parts: [], joins: [], transformations: [],
        wordSum: "", analysisStatus: "in_review" },
    };
  }
  function updateRoute(key: string, values: Record<string, unknown>) {
    const current = routeContent(key);
    if (!current) return;
    const suffix = Array.isArray(values.teachingSplitParts)
      ? values.teachingSplitParts.find((part) => part && typeof part === "object" && (part as { kind?: string }).kind === "suffix") as { surfaceText?: string } | undefined
      : undefined;
    const ionSum = key === "D4_MOR_SUFFIXES_TION" && suffix?.surfaceText === "ion"
      ? `${(values.teachingSplitParts as { sourceText?: string; surfaceText?: string }[])
          .map((part) => part.sourceText || part.surfaceText || "").join(" + ")} → ${payload.displayWord}`
      : null;
    change({
      routeContents: [
        ...payload.routeContents.filter((route) => route.microSkillKey !== key),
        { ...current, ...(ionSum ? { wordSum: ionSum } : {}), content: { ...current.content, ...values,
          ...(current.routeId === "dynamic_affix_word_lab" && suffix?.surfaceText
            ? { suffixVariant: suffix.surfaceText } : {}) } },
      ],
    });
  }
  function replaceRouteContent(key: string, content: Record<string, unknown>) {
    const current = routeContent(key);
    if (!current) return;
    change({ routeContents: [...payload.routeContents.filter((route) => route.microSkillKey !== key),
      { ...current, content }] });
  }
  useEffect(() => {
    function reveal() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      if (
        [
          "td-canonical-parts",
          "td-canonical-word-sum",
          "td-written-syllables",
        ].includes(id) &&
        !builder.current?.open
      )
        builder.current?.showModal();
      const splitMatch =
        /^td-route-(.+)-(teachingSplitParts|teachingSplitJoins|trueMorphologyParts|trueMorphologyJoins)$/.exec(
          id,
        );
      if (splitMatch) {
        setSplitSkill(splitMatch[1]);
        if (!splitDialog.current?.open) splitDialog.current?.showModal();
      }
      const target = document.getElementById(id);
      let parent = target?.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target?.scrollIntoView({ block: "center" });
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement) target.focus({ preventScroll: true });
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [checksState]);
  const selectedRoutes = payload.skillKeys.flatMap((key) => {
    const route = routeForSkill(key);
    return route?.newAssignmentCapable && route.routeId !== "weak_vowel_word_lab" ? [{ key, route }] : [];
  });
  const weakRows = payload.skillKeys.flatMap(key => {
    const route = routeForSkill(key);
    return route?.routeId === "weak_vowel_word_lab" ? [{ key, content: routeContent(key)! }] : [];
  });
  const name = (key: string) =>
    props.skills.find((skill) => skill.micro_skill_key === key)?.display_name ??
    key;
  const checks = selectedRoutes.map(({ key, route }) => {
    const content = routeContent(key)!;
    const preflight = preflights.find(
      (row) => row.routeId === route.routeId && row.microSkillKey === key,
    );
    const requirements = [
      ...routeRequirements(content, meaningPayload(key)),
      ...publicationBlockers(
        payload,
        props.normalisedWord || payload.displayWord.toLowerCase(),
      ).map((label) => ({
        label,
        status: "missing" as const,
        editTarget: publicationBlockerTarget(label),
      })),
    ];
    const word = preflight?.words.find((word) => word.id === props.wordId);
    return {
      key,
      route,
      content,
      preflight,
      requirements,
      word,
      ready:
        !dirty && checksState === "ready" &&
        Boolean(
          preflight?.compilerReady &&
          reviewedWordCanLaunch(
            word,
            draftId,
            preflight.compilerWitnesses,
          ),
        ),
    };
  });
  const columns = [
    ...new Set(
      checks.flatMap((row) =>
        activityVariantsForRoute(row.route.routeId, row.key)
          .filter((item) => item.enabled)
          .map((item) => item.kind),
      ),
    ),
  ];
  const overview = [
    {
      key: "dictionary",
      label: "Dictionary word",
      value:
        props.normalisedWord || payload.displayWord.toLocaleLowerCase("en-GB"),
      change: (v: string) => change({ displayWord: v }),
      readOnly: Boolean(props.wordId),
    },
    {
      key: "display",
      label: "Display word",
      value: payload.displayWord,
      change: (v: string) => change({ displayWord: v }),
    },
    {
      key: "has-schwa",
      label: "Schwa",
      value:
        payload.metadata.has_schwa === null
          ? ""
          : String(payload.metadata.has_schwa),
      change: (v: string) =>
        metadata("has_schwa", v === "" ? null : v === "true"),
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
  ];
  function saveButton(review: string, label = "Save and approve") {
    return (
      <ActionSubmitButton
        pending={saving}
        disabled={review !== "draft" && checksState !== "ready"}
        form={formId}
        name="review_section"
        value={review}
        pendingLabel="Saving…"
        className={button}
      >
        {label}
      </ActionSubmitButton>
    );
  }
  function sharedField(label: string, value: string, target: string) {
    return (
      <div className="min-w-0 rounded-md bg-[var(--paper)] p-2">
        <p className="text-xs text-[color:var(--mid)]">{label}</p>
        <div className="flex items-start justify-between">
          <span className="break-words text-sm">{value || "Missing"}</span>
          <a
            className="px-2 text-[color:var(--scarlett)]"
            href={`#${target}`}
            aria-label={`Edit ${label}`}
          >
            ✎
          </a>
        </div>
      </div>
    );
  }
  function fields(key: string, kind: string): Field[] {
    const route = routeForSkill(key);
    const profile = props.profileOptions.find(
      (profile) => profile.microSkillKey === key,
    );
    const meaning = {
      key: "meaningBinKey",
      label: "Meaning group",
      options: profile?.meaningBins.map((bin) => ({
        value: bin.id,
        label: bin.label,
      })),
    };
    if (kind === "meaning_sort") return profile ? [meaning] : [];
    if (kind === "discovery" || kind === "meaning_match")
      return [
        { key: "baseMeaning", label: "Base meaning" },
        ...(profile &&
        !activityVariantsForRoute(route?.routeId ?? "", key).some(
          (v) => v.kind === "meaning_sort" && v.enabled,
        )
          ? [meaning]
          : []),
        ...(route?.routeId === "dynamic_affix_word_lab"
          ? [
              { key: "semanticBaseText", label: "Semantic base / root" },
              {
                key: "semanticBaseKind",
                label: "Base or root",
                options: [
                  { value: "base", label: "Whole base" },
                  { value: "root", label: "Bound root" },
                ],
              },
            ]
          : []),
      ];
    if (kind === "cleaver")
      return route?.routeId === "dynamic_prefix_word_lab"
        ? [{ key: "baseWord", label: "Base word" }]
        : [];
    if (kind === "word_build")
      return route?.routeId === "dynamic_prefix_word_lab"
        ? [
            {
              key: "prefixVariant",
              label: "Prefix",
              options: profile?.choices.map((value) => ({
                value,
                label: `${value}-`,
              })),
            },
          ]
        : route?.routeId === "dynamic_affix_word_lab"
          ? [
              {
                key: "suffixVariant",
                label: "Suffix",
                options: [...new Set([...(profile?.choices ?? []), ...(key === "D4_MOR_SUFFIXES_TION" ? ["ion"] : [])])].map((value) => ({
                  value,
                  label: `-${value}`,
                })),
              },
            ]
          : route?.routeId === "ing_endings_word_lab"
            ? [
                { key: "base", label: "Unchanged base" },
                ...(key.endsWith("DOUBLE_FINAL_CONSONANT")
                  ? [
                      {
                        key: "doublingPattern",
                        label: "Doubling pattern",
                        options: [
                          { value: "short_cvc", label: "Short CVC" },
                          {
                            value: "stressed_final_syllable",
                            label: "Stressed final syllable",
                          },
                        ],
                      },
                    ]
                  : []),
              ]
            : [];
    if (kind === "family_reveal")
      return [
        { key: "familyKey", label: "Family" },
        { key: "baseWord", label: "Base word" },
        { key: "baseMeaning", label: "Base meaning" },
      ];
    if (kind === "compound_jigsaw")
      return [
        { key: "componentToWholeRelationship", label: "Combined meaning" },
      ];
    return [];
  }
  const morphologyFormatAudit = auditCanonicalMorphology({
    parts: payload.canonicalMorphology.parts, joins: payload.canonicalMorphology.joins,
    displayWord: payload.displayWord, linkedToFamily: props.currentMorphologyLinkedToFamily,
  });
  const morphologyReviewItems = payload.canonicalMorphology.parts.length > 0
    ? morphologyReviewGuidance(payload.canonicalMorphology, payload.displayWord,
      props.affixMeanings, props.currentMorphologyLinkedToFamily)
    : [];
  return (
    <div className="td-word-workspace grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3" ref={workspace} data-checks-ready-ms={checksLoadedMs} data-last-save-ms={lastSaveMs}>
      <form id={formId} action={saveAction}>
        <input type="hidden" name="selected_sense_id" value={activeSenseId} />
        <input type="hidden" name="word_id" value={props.wordId ?? ""} />
        <input
          type="hidden"
          name="normalised_word"
          value={
            props.normalisedWord ||
            payload.displayWord.toLocaleLowerCase("en-GB")
          }
        />
        <input
          type="hidden"
          name="source_reference"
          value={props.sourceReference}
        />
        <input
          type="hidden"
          name="payload_json"
          value={JSON.stringify(payload)}
        />
      </form>
      {saveMessage && <p role="status" className="text-sm text-emerald-800">{saveMessage}{dirty ? " Unsaved edits need approval." : ""}</p>}
      {actionError && <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-950">{workspaceErrorMessage(actionError)}</p>}
      <details id="td-overview" className={section} open>
        <summary className="cursor-pointer p-4 font-semibold">
          1 · Overview{" "}
          <span className="ml-2 text-xs font-normal text-[color:var(--mid)]">
            {dirty
              ? "Edited · needs approval"
              : overviewReviewed
                ? draftId ? "Reviewed" : "Dictionary approved"
                : weakRows.length ? "General dictionary review required" : "Review required"}
          </span>
        </summary>
        <div className="px-4 pb-4">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(0,3fr)]">
          {payload.senseSet && <aside aria-label="Word meanings" className="grid gap-2 rounded-xl border border-[var(--border)] border-t-2 border-t-[var(--scarlett)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Meanings</h3>
              <button type="button" className={button} onClick={addMeaning}>Add meaning</button>
            </div>
            {payload.senseSet.senses.map(sense => {
              const approved = props.approvedSenseSet?.senses.find(row => row.id === sense.id);
              const familyLinked = Boolean(props.approvedCandidateSenseFacts[sense.id]?.familyLinks.length);
              return <button key={sense.id} type="button" aria-pressed={sense.id === activeSenseId}
                onClick={() => setActiveSenseId(sense.id)}
                className="break-words rounded-lg border border-[var(--border)] p-2 text-left text-sm aria-pressed:border-[var(--scarlett)] aria-pressed:bg-[var(--mist)]">
                <span className="block font-medium">{sense.definition || "New meaning"}</span>
                <span className="block text-xs text-[color:var(--mid)]">
                  {[sense.partOfSpeech, !approved ? "Needs approval" : familyLinked ? "Family linked" : "Family needed"].filter(Boolean).join(" · ")}
                </span>
              </button>;
            })}
          </aside>}
          <div className="min-w-0 space-y-4 rounded-xl border border-[var(--border)] p-4">
          {payload.senseSet && <SenseEditor value={payload.senseSet} word={payload.displayWord} recordingSources={dictationRecordingSources}
            onChange={senseSet => change({ senseSet })}
            selectedSenseId={activeSenseId} onSelectSense={setActiveSenseId} />}
          {props.wordId && !activeSense && activeSenseId && <div id="td-sense-morphology" className="mt-3 flex flex-wrap items-center gap-3">
            <ActionSubmitButton form={formId} name="review_section" value="overview-family" pending={saving}
              pendingLabel="Approving meaning…" className={button}>
              Approve meaning and continue to family
            </ActionSubmitButton>
            <p className="text-sm">The meaning needs approval before you can assign its family.</p>
          </div>}
          {props.wordId && activeSense && props.approvedSenseSet ? <SenseMorphologyReview
            wordId={props.wordId} displayWord={props.approvedWord ?? payload.displayWord}
            selectedSenseId={activeSenseId}
            senses={props.approvedSenseSet.senses} analyses={props.senseAnalyses}
            links={props.senseFamilyMemberships} families={props.senseFamilyOptions}
            shared={{ parts: props.approvedCandidateMorphology?.parts as unknown[] ?? [],
              joins: props.approvedCandidateMorphology?.joins as unknown[] ?? [],
              transformations: props.approvedMorphologyTransformations }}
            affixMeanings={props.affixMeanings} /> : null}
          {(dirty || !overviewReviewed) && (activeSense || !props.wordId) && <div className={actions}>
            {dirty && saveButton("draft", "Save draft")}
            {saveButton("overview")}
          </div>}
          </div>
          </div>
          {props.wordId && props.approvedSenseSet?.senses.length ? <details className="my-3">
            <summary className="cursor-pointer text-sm font-medium">Import or export meanings</summary>
            <MultiSenseCsvPanel wordId={props.wordId} requests={props.meaningImportRequests}
              senses={props.approvedSenseSet.senses} />
          </details> : null}
          <details className="mt-4 rounded-lg border border-[var(--border)] p-3" open={!props.wordId}>
          <summary className="cursor-pointer font-semibold">Shared word details</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="td-overview-table w-full table-fixed text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs text-[color:var(--mid)]">
                <tr>
                  {overview.map((field) => (
                    <th key={field.key} className="p-2 font-medium">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {overview.map((field) => (
                    <td key={field.key} data-label={field.label} className="p-2 align-top">
                      {field.readOnly ? (
                        <span className="block py-1">{field.value}</span>
                      ) : (
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 flex-1"><Editable
                            hideLabel
                            id={`td-${field.key}`}
                            label={field.label}
                            value={field.value}
                            onChange={field.change}
                            options={field.options}
                          /></div>
                          {field.key === "display" && props.wordClip && payload.displayWord === props.approvedWord &&
                            <InlineBritishRecording clip={props.wordClip} label="word" />}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {props.wordId && props.currentMorphologyId &&
            payload.canonicalMorphology.rawPartOfSpeech.toLowerCase() !== props.currentApprovedPartOfSpeech.toLowerCase() &&
            partOfSpeechOptions("").some(option => option.value === payload.canonicalMorphology.rawPartOfSpeech.toLowerCase()) && (
            <form action={approveTeachingDictionaryPartOfSpeech} className="mt-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm">
              <input type="hidden" name="word_id" value={props.wordId} />
              <input type="hidden" name="expected_morphology_id" value={props.currentMorphologyId} />
              <input type="hidden" name="part_of_speech" value={payload.canonicalMorphology.rawPartOfSpeech} />
              <p>Approve <strong>{payload.canonicalMorphology.rawPartOfSpeech}</strong> as the live part of speech. This publishes only that dictionary fact; lesson content still needs its own review.</p>
              {dirty && <p className="mt-1 text-amber-900">Other edits on this page will not be published by this action. Save them as a draft first if needed.</p>}
              <label className="mt-2 block" htmlFor="td-pos-review-note">Reason for correction
                <FormatHint label="reason for part-of-speech correction" format="Briefly state the evidence for changing the approved grammatical role." example="Used as a verb in the reviewed dictionary example." />
              </label>
              <input id="td-pos-review-note" name="review_note" className={input} required maxLength={1000} placeholder="Why is this classification correct?" />
              <ActionSubmitButton className={`${button} mt-2`} pendingLabel="Approving…">Approve part of speech</ActionSubmitButton>
            </form>
          )}
          <div className="mt-3 overflow-x-auto border-t border-[var(--border)] pt-3">
            <table className="td-reflow-table w-full text-left text-sm">
              <thead className="text-xs text-[color:var(--mid)]">
                <tr>
                  <th className="p-2 font-medium">Parts &amp; meanings</th>
                  <th className="p-2 font-medium">Canonical word sum</th>
                  <th className="p-2 font-medium">Written syllables</th>
                  <th className="p-2 font-medium">Transformations</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Parts & meanings" className="p-2">
                    {payload.canonicalMorphology.parts.map((raw, i) => {
                      const part = raw as Record<string, unknown>;
                      return (
                        <span
                          key={i}
                          className="mr-1 inline-block rounded bg-[var(--paper)] px-2 py-1"
                        >
                          {String(
                            part.sourceText ||
                              part.surfaceText ||
                              part.text ||
                              "",
                          )}{" "}
                          · {String(part.gloss || "meaning missing")}
                        </span>
                      );
                    })}
                  </td>
                  <td data-label="Canonical word sum" className="p-2">
                    {payload.canonicalMorphology.wordSum || "Missing"}
                  </td>
                  <td data-label="Written syllables" className="p-2">
                    {payload.writtenSyllableBreakdown || "Missing"}
                  </td>
                  <td data-label="Transformations" className="p-2">
                    {payload.canonicalMorphology.transformations
                      ?.map(
                        (item) =>
                          item.explanation ||
                          `${item.sourceText} → ${item.surfaceText}`,
                      )
                      .join("; ") || "None recorded"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={actions}>
            <button
              type="button"
              className={button}
              onClick={() => builder.current?.showModal()}
            >
              Edit word parts
            </button>
          </div>
          <h3 className="mt-4 font-semibold">
            Alternate dictation sentences
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="td-reflow-table td-dictation-table w-full text-left text-sm">
              <thead className="text-xs text-[color:var(--mid)]">
                <tr>
                  <th className="p-2 font-medium">Sentence
                    <FormatHint label="dictation sentence" format="Write a complete sentence containing the dictionary word exactly as spelled." example="We are scrolling down the page." />
                  </th>
                  <th className="p-2 font-medium">Target occurrence</th>
                  <th className="p-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {dictationVariants(payload).map((variant, index) => index === 0 ? null : (
                  <tr
                    key={variant.id}
                    className="border-t border-[var(--border)]"
                  >
                    <td data-label="Sentence" className="p-2">
                      <div className="flex min-w-0 items-center gap-2"><input
                        aria-label={`Dictation sentence ${index + 1}`}
                        className={input}
                        value={variant.sentence}
                        onChange={(event) => {
                          const variants = dictationVariants(payload).map(
                            (old, at) =>
                              at === index
                                ? {
                                    ...old,
                                    sentence: event.target.value,
                                    audioText: event.target.value,
                                  }
                                : old,
                          );
                          change({ dictationVariants: variants });
                        }}
                      />
                      </div>
                      <DictationListen key={variant.sentence} sentence={variant.sentence}
                        recordingSrc={dictationRecordingSources.get(variant.sentence)} />
                    </td>
                    <td data-label="Target occurrence" className="p-2">
                      <select
                        aria-label={`Target in sentence ${index + 1}`}
                        className={input}
                        value={variant.targetTokenIndex}
                        onChange={(event) => {
                          const variants = dictationVariants(payload).map(
                            (old, at) =>
                              at === index
                                ? {
                                    ...old,
                                    targetTokenIndex: Number(
                                      event.target.value,
                                    ),
                                  }
                                : old,
                          );
                          change({ dictationVariants: variants });
                        }}
                      >
                        <option value={-1}>Choose target</option>
                        {targetOccurrences(
                          variant.sentence,
                          payload.displayWord,
                        ).map((token, at) => (
                          <option key={token} value={token}>
                            {payload.displayWord} · occurrence {at + 1}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Action" className="p-2">
                      {index > 0 && (
                        <button
                          type="button"
                          className="text-[color:var(--scarlett)] underline"
                          onClick={() =>
                            change({
                              dictationVariants: dictationVariants(
                                payload,
                              ).filter((_, at) => at !== index),
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={actions}>
            <button
              type="button"
              className={button}
              onClick={() =>
                change({
                  dictationVariants: [
                    ...dictationVariants(payload),
                    {
                      id: crypto.randomUUID(),
                      sentence: "",
                      targetTokenIndex: -1,
                      audioText: "",
                    },
                  ],
                })
              }
            >
              Add sentence
            </button>
          </div>
          </details>
          <details id="td-base-family" className="mt-4 border-t border-[var(--border)] pt-3" open={!activeSenseFamilies.length}>
            <summary className="cursor-pointer font-semibold">Family for {activeSense?.definition ?? "this word"} · {activeSenseFamilies.length ? "linked" : "none joined"}</summary>
            <div className="mt-2">
            {activeSenseFamilies.length > 0 && <p className="text-xs text-[color:var(--mid)]">These approved families apply to the selected meaning.</p>}
            {activeSenseFamilies.length ? (
              activeSenseFamilies.map((item) => (
                <div
                  key={item.name}
                  className="mt-2 flex flex-wrap items-center gap-2 text-sm"
                >
                  <strong>Base Family: {item.name}</strong>
                  {item.meaning ? <span className="text-[color:var(--mid)]">{item.meaning}</span> : null}
                  {item.pronunciation ? <span className="text-[color:var(--mid)]">{item.pronunciation}</span> : null}
                  {item.words.map((word) => (
                    <Link
                      key={word.id}
                      href={`/admin/teaching-dictionary/${word.id}`}
                      className="rounded-full bg-[var(--paper)] px-3 py-1 hover:underline"
                    >
                      {word.word}
                    </Link>
                  ))}
                </div>
              ))
            ) : (
              <p className="mt-2 text-sm text-[color:var(--mid)]">
                No reviewed family is linked to this meaning.
              </p>
            )}
            {props.familyReviewContext.error && <p role="alert" className="mt-2 rounded bg-rose-50 p-2 text-sm text-rose-900">
              Family review needs attention: {props.familyReviewContext.error.replaceAll("_", " ")}.
              Open the family editor to check the details.
            </p>}
            <div className={actions}>
              <button
                type="button"
                className={button}
                onClick={() => {
                  if (props.approvedSenseSet && props.approvedSenseSet.senses.length > 1) {
                    document.getElementById("td-sense-morphology")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  } else void openFamily();
                }}
              >
                {activeSenseFamilies.length ? "Review or change family" : "Review family suggestions"}
              </button>
            </div>
            </div>
          </details>
        </div>
      </details>
      <section id="td-skills" className={`${section} scroll-mt-6`}>
        <h2 className="p-4 font-semibold">
          2 · Micro-skill lessons for {activeSense?.definition ?? "this word"}{" "}
          <span className="ml-2 text-xs font-normal">
            {payload.skillKeys.length} joined
          </span>
        </h2>
        <div className="px-4 pb-4">
          <div className="grid gap-2">
              {payload.skillKeys.map((key) => {
                const route = routeForSkill(key);
                const candidate = props.wordId && hasCandidateRule(key) ? evaluateLessonCandidate({
                  wordId: props.wordId, displayWord: props.approvedWord ?? payload.displayWord,
                  skillKey: key, senseId: activeSenseId || payload.skillSenseIds?.[key],
                  senseSet: props.approvedSenseSet,
                  morphology: props.approvedCandidateSenseFacts[activeSenseId || payload.skillSenseIds?.[key] || ""]?.morphology
                    ?? (props.approvedSenseSet?.senses.length === 1 ? props.approvedCandidateMorphology : null),
                  familyLinks: props.approvedCandidateSenseFacts[activeSenseId || payload.skillSenseIds?.[key] || ""]?.familyLinks
                    ?? props.approvedCandidateFamilyLinks,
                }) : null;
                const preflight = preflights.find(
                  (row) => row.microSkillKey === key,
                );
                const lessonUsesActiveSense = !activeSenseId || payload.skillSenseIds?.[key] === activeSenseId;
                const statuses = checksState === "ready" && lessonUsesActiveSense
                  ? wordRouteStatuses.filter((row) => row.microSkillKey === key)
                  : [];
                const published = props.weakPublicationState.find(row => row.microSkillKey === key);
                const wordApproved = Boolean(assignedSkillKeys?.includes(key)
                  && props.approvedLessonSenseKeys.includes(key)
                  && lessonUsesActiveSense
                  && payload.skillSenseIds?.[key] === props.approvedSkillSenseIds[key]
                  && !props.staleLessonSenseKeys.includes(key));
                const complete = lessonUsesActiveSense && !dirty && assignedSkillKeys?.includes(key) &&
                  (route?.routeId === "weak_vowel_word_lab" ? published?.sourceCurrent :
                    checks.find(row => row.key === key)?.ready);
                return (
                  <details key={key} className="rounded-lg border border-[var(--border)] p-3">
                    <summary className="cursor-pointer font-semibold">{name(key)} <span className="ml-2 text-xs font-normal text-[color:var(--mid)]">{complete ? "Word content complete" : !payload.skillSenseIds?.[key] ? "Choose the meaning taught" : !lessonUsesActiveSense ? "Another meaning selected for this lesson" : dirty ? "Save the selected meaning" : candidate?.status === "ready" && !wordApproved ? "Ready to approve this meaning" : wordApproved && !route?.newAssignmentCapable ? "Word approved · awaiting lesson route" : checksState === "loading" ? "Checking…" : "Needs lesson content"}</span></summary>
                    <div className="mt-2 text-sm">
                      {!lessonUsesActiveSense && <p className="mb-2 rounded bg-amber-50 p-2 text-amber-950">
                        This lesson currently uses {payload.senseSet?.senses.find(sense => sense.id === payload.skillSenseIds?.[key])?.definition ?? "another meaning"}. The requirements below are for <strong>{activeSense?.definition}</strong>.
                        <button type="button" className="ml-2 underline" onClick={() =>
                          change({ skillSenseIds: { ...payload.skillSenseIds, [key]: activeSenseId } })}>
                          Use this meaning in the lesson (then save)
                        </button>
                      </p>}
                      {candidate && <div className="mb-3 rounded border border-[var(--border)] p-2">
                        <p className="font-medium">{!lessonUsesActiveSense ? "Selected meaning candidate" : "Lesson requirements"}: {candidate.status === "ready"
                          ? lessonUsesActiveSense ? "Ready; save and validate micro-skills to approve this meaning" : "Ready to choose; select and save this meaning for the lesson"
                          : candidate.status === "not_match" ? "This meaning does not match the lesson rule"
                          : "Needs reviewed facts"}</p>
                        {candidate.issues.length > 0 && <details className="mt-1" open>
                          <summary className="cursor-pointer">{candidate.issues.length} requirement{candidate.issues.length === 1 ? "" : "s"} to review</summary>
                          <ul className="mt-1 list-disc pl-5">{candidate.issues.map(issue =>
                            <li key={issue.code}><a className="underline" href={issue.href}>{issue.message}</a></li>)}</ul>
                        </details>}
                        <button type="button" className="mt-1 underline" onClick={() => router.refresh()}>Recheck requirements</button>
                      </div>}
                      {props.staleLessonSenseKeys.includes(key) && <p className="text-amber-900">The reviewed meaning or pronunciation changed. Review this lesson again before release.</p>}
                      {checksState !== "ready"
                        ? checksState === "loading" ? "Checking route status…" : "Route status unavailable · retry checks below"
                        : !route?.newAssignmentCapable
                        ? wordApproved ? "This meaning is approved for the micro-skill. A lesson route is not available yet." : "No lesson route available yet"
                        : preflight?.activationEnabled
                          ? "Active"
                          : "Built · inactive"}
                      {statuses.map((status) => <div key={status.routeId} className="mt-1 text-xs">
                        {status.routeId.replaceAll("_", " ")}: {status.administrativeCandidate ? "Ready for child selection checks" : status.blockers[0] ?? "Needs review"}
                        <div>Route facts: {status.technicalFacts === "complete" ? "complete" : status.technicalFacts === "not_proven" ? "not yet proven complete" : "not evaluated"} · Editorial review: {status.editorialApproved ? "approved" : "pending"}</div>
                        {status.blockers.length > 1 && <details><summary>All {status.blockers.length} blockers</summary><ul className="list-disc pl-4">{status.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></details>}
                      </div>)}
                      {published && !published.sourceCurrent && <p className="mt-1 text-amber-900">Approved dictionary facts changed; re-review this lesson content.</p>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <label className="min-w-64 flex-1">Meaning taught in this lesson <FormatHint label="lesson meaning" format="Choose the reviewed Overview meaning that this micro-skill lesson teaches." example="live — performed in real time" />
                        <select className={input} value={payload.skillSenseIds?.[key] ?? ""}
                          onChange={event => change({ skillSenseIds: { ...payload.skillSenseIds, [key]: event.target.value } })}>
                          <option value="">Choose meaning</option>
                          {payload.senseSet?.senses.map(sense => <option key={sense.id} value={sense.id}>{sense.definition || "Meaning needs review"} · {sense.partOfSpeech || "part of speech needed"}</option>)}
                        </select>
                      </label>
                      {route?.newAssignmentCapable && <a href={`#td-route-${key}`} className="text-[color:var(--scarlett)] underline"
                        onClick={() => { const panel = document.getElementById(`td-route-${key}`); if (panel instanceof HTMLDetailsElement) panel.open = true; }}>Open pre-populated lesson fields</a>}
                      <button
                        type="button"
                        className="text-[color:var(--scarlett)] underline"
                        onClick={() =>
                          change({
                            skillKeys: payload.skillKeys.filter(
                              (skill) => skill !== key,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </details>
                );
              })}
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <select
              aria-label="Micro-skill to join"
              className={`${input} max-w-sm`}
              value={joined}
              onChange={(event) => setJoined(event.target.value)}
            >
              <option value="">Choose micro-skill</option>
              {props.skills
                .filter(
                  (skill) => !payload.skillKeys.includes(skill.micro_skill_key),
                )
                .map((skill) => (
                  <option
                    key={skill.micro_skill_key}
                    value={skill.micro_skill_key}
                  >
                    {skill.display_name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className={button}
              disabled={!joined}
              onClick={() => {
                change({ skillKeys: [...payload.skillKeys, joined],
                  skillSenseIds: activeSenseId ? { ...payload.skillSenseIds, [joined]: activeSenseId }
                    : payload.skillSenseIds });
                setJoined("");
              }}
            >
              Find other micro-skill
            </button>
            {(assignedSkillKeys === null ? payload.skillKeys.length > 0 :
              payload.skillKeys.length !== assignedSkillKeys.length ||
              payload.skillKeys.some(key => !assignedSkillKeys.includes(key))) ||
              payload.skillKeys.some(key => payload.skillSenseIds?.[key] !== props.approvedSkillSenseIds[key]) ?
              saveButton("skills", "Save and validate micro-skills") : null}
          </div>
        </div>
      </section>
      {weakRows.map(({ key, content }) => {
        const facts = content.content.weakVowel as Partial<WeakVowelRouteFactsV1> | undefined;
        const blockers = weakVowelRouteBlockers(facts ?? { schemaVersion: "weak_vowel_route_facts_v1" }, {
          displayWord: payload.displayWord,
          dictationSentence: payload.dictationSentence,
          definition: content.wordMeaning || payload.definition,
          microSkillKey: key,
        });
        const published = props.weakPublicationState.find(row => row.microSkillKey === key);
        const complete = !dirty && assignedSkillKeys?.includes(key) && published?.sourceCurrent;
        return <details id={`td-route-${key}`} key={key} className={`${section} scroll-mt-6`}>
          <summary className="cursor-pointer p-4 font-semibold">{name(key)} · weak-vowel lesson <span className="ml-2 text-xs font-normal text-[color:var(--mid)]">{complete ? "Word content complete" : "Needs attention"}</span></summary>
          <div className="px-4 pb-4">
          <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm">
            <summary className="cursor-pointer font-medium">Publication details</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <p className="sm:col-span-2"><strong>Route validation:</strong> {assignedSkillKeys === null ? "Checking assignment authority…" : assignedSkillKeys.includes(key) && published?.sourceCurrent ? "Ready to be selected when a child needs this word" : "Not yet eligible for a new lesson"}</p>
            <p><strong>Word–skill assignment:</strong> {assignedSkillKeys === null ? "Checking authority…" : assignedSkillKeys.includes(key) ? "Assigned" : "Not assigned (cannot enter new lessons)"}</p>
            <p><strong>Published lesson content:</strong> {published ? published.sourceCurrent ? "Current for future assignments" : "Shared dictionary facts changed; re-review needed" : "Not published"}</p>
            <p><strong>Editor content:</strong> {blockers.length ? `${blockers.length} requirement(s) outstanding` : "Fields valid; editorial review and publication still required for changes"}</p>
            {published && <p className="break-all text-xs sm:col-span-2">Published version: {published.contentVersionId}</p>}
            </div>
          </details>
          {props.weakFamilyPrefill.status === "ambiguous" && <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            Approved family records disagree about their meaning or eligible members. Review the family choice below; the other lesson activities can still be completed.
          </p>}
          {blockers.length > 0 && <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" open>
            <summary className="cursor-pointer font-medium">{blockers.length} items to finish</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{blockers.map(blocker => <li key={blocker}>
              <a className="underline" href={`#${weakVowelBlockerTarget(blocker, key)}`}>
                <code className="mr-1 text-xs">{weakVowelBlockerCode(blocker, key)}</code>{blocker}
              </a>
            </li>)}</ul>
          </details>}
          <details className="mt-3" open={!published || !published.sourceCurrent}>
            <summary className="cursor-pointer font-semibold">Required fields and activity decisions</summary>
            <div className="mt-3">
              <p className="mb-3 text-sm">The shared <a className="underline" href="#td-definition">definition</a> and <a className="underline" href="#td-dictation">complete dictation sentence</a> are edited above. All fields below belong to this word in this micro-skill.</p>
              <WeakVowelRouteEditor skillKey={key} word={payload.displayWord} sentence={payload.dictationSentence} facts={facts}
                dictionaryFingerprint={props.dictionaryFingerprint} dictionarySyllables={payload.metadata.syllables}
                blockers={blockers} onChange={next => updateRoute(key, { weakVowel: next })} />
            </div>
          </details>
          <div className={actions}>
            {dirty && <ActionSubmitButton pending={saving} form={formId} name="review_section" value="draft" pendingLabel="Saving…" className={button}>Save draft</ActionSubmitButton>}
            {!complete && <ActionSubmitButton pending={saving} disabled={blockers.length > 0} form={formId} name="review_section" value={`lesson:${key}`} pendingLabel="Staging…" className={button}>Save and stage reviewed version</ActionSubmitButton>}
          </div>
          </div>
        </details>;
      })}
      {(selectedRoutes.length > 0 || payload.skillKeys.some(key => !routeForSkill(key)?.newAssignmentCapable)) && <details id="td-lesson-checks" className={`${section} p-4`}>
        <summary className="cursor-pointer font-semibold">Lesson checks</summary>
        {weakRows.length > 0 && <p className="mt-1 text-sm">Weak-vowel publication status and its required fields are shown above. This table covers the other lesson routes.</p>}
        {checksState !== "ready" && <p role="status" className="mt-2 text-sm text-[color:var(--mid)]">
          {checksState === "loading" ? "Checking complete lesson groups… You can edit Overview while checks run." : "Lesson checks could not load. Approval and Launch are unavailable."}
          {checksState === "error" && <button type="button" className="ml-2 text-[color:var(--scarlett)] underline" onClick={() => { setChecksState("loading"); setCheckVersion(version => version + 1); }}>Retry checks</button>}
        </p>}
        <div className="mt-3 min-w-0">
          <table className="td-checks w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="w-[24%] p-2">Micro-skill</th>
                {columns.map((kind) => (
                  <th key={kind} className="p-2 text-center text-xs">
                    <span className="hidden sm:inline">{ACTIVITY_LABELS[kind]}</span>
                    <abbr title={ACTIVITY_LABELS[kind]} className="no-underline sm:hidden">{({ introduction: "Int", family_reveal: "Fam", cleaver: "Cut", word_build: "Bld", cover_check: "Chk", dictation: "Dict", reflection: "Refl", discovery: "Find", meaning_sort: "Sort", meaning_match: "Match", compound_jigsaw: "Join" } as Record<string, string>)[kind] ?? ACTIVITY_LABELS[kind].slice(0, 3)}</abbr>
                  </th>
                ))}
                <th className="w-[12%] p-2">Release</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <th className="p-2 text-left font-medium">{name(row.key)}</th>
                  {columns.map((kind) => {
                    const variant = activityVariantsForRoute(
                      row.route.routeId,
                      row.key,
                    ).find((item) => item.kind === kind && item.enabled);
                    const missing = row.requirements.filter(
                      (requirement) =>
                        requirement.status !== "present" &&
                        requirementActivities(
                          requirement,
                          row.route.routeId,
                        ).includes(kind),
                    );
                    return (
                      <td key={kind} className="p-2 text-center">
                        {!variant ? (
                          <span className="text-[color:var(--mid)]">—</span>
                        ) : missing.length ? (
                          <a
                            title={missing[0].label}
                            href={`#${missing[0].editTarget}`}
                            className="text-xs text-amber-900 underline"
                          >
                            <span aria-hidden="true">⚠</span><span className="sr-only">{missing[0].label}</span>
                          </a>
                        ) : row.ready ? (
                          <span
                            aria-label={`${ACTIVITY_LABELS[kind]} passed`}
                            className="text-emerald-700"
                          >
                            ✓
                          </span>
                        ) : (
                          <a
                            href={`#td-route-${row.key}`}
                            className="text-xs text-amber-900 underline"
                          >
                            Review
                          </a>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 text-xs">
                    {row.preflight?.status.replaceAll("_", " ") ??
                      "Needs review"}
                  </td>
                </tr>
              ))}
              {payload.skillKeys
                .filter((key) => !routeForSkill(key)?.newAssignmentCapable)
                .map((key) => (
                  <tr key={key}>
                    <th className="p-2 text-left font-medium">{name(key)}</th>
                    <td
                      colSpan={columns.length + 1}
                      className="p-2 text-[color:var(--mid)]"
                    >
                      No Route Available
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {checks.some(row => row.requirements.some(requirement => requirement.status !== "present")) && <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">Missing information</summary>
          {checks.map(row => <div key={row.key} className="mt-2"><p className="font-medium">{name(row.key)}</p><ul className="mt-1 grid gap-1">
            {[...new Map(row.requirements.filter(requirement => requirement.status !== "present").map(requirement => [requirement.editTarget, requirement])).values()].map(requirement => <li key={requirement.editTarget}><a className="text-amber-900 underline" href={`#${requirement.editTarget}`}>{requirement.label}</a></li>)}
          </ul></div>)}
        </details>}
      </details>}
      {checks.map((row, index) => {
        const route = routeWithSharedFacts(row.content, meaningPayload(row.key));
        const overviewFields = new Set(sharedRouteContentKeys(route.routeId, payload));
        const profile = props.profileOptions.find(
          (profile) => profile.microSkillKey === row.key,
        );
        return (
          <details
            id={`td-route-${row.key}`}
            key={row.key}
            className={`${section} scroll-mt-6`}
          >
            <summary className="cursor-pointer p-4 font-semibold">
              {index + 4} · {name(row.key)} lesson{" "}
              <span className="ml-2 text-xs font-normal">
                {checksState !== "ready" ? "Checking…" : row.preflight?.activationEnabled ? "Active" : "Inactive"} ·{" "}
                {row.preflight?.status.replaceAll("_", " ") ?? "Needs review"}
              </span>
            </summary>
            <div className="px-4 pb-4">
              {activityVariantsForRoute(row.route.routeId, row.key)
                .filter((variant) => variant.enabled)
                .map((variant) => (
                  <details
                    key={variant.kind}
                    className="border-t border-[var(--border)] py-3"
                  >
                    <summary className="mb-2 cursor-pointer font-semibold">
                      {ACTIVITY_LABELS[variant.kind]}
                      <Prompt
                        text={lessonActivityQuestion({
                          kind: variant.kind,
                          route,
                          word: payload.displayWord,
                          wordId: props.wordId,
                          compiled: row.preflight?.compiledPreview,
                          sources: row.preflight?.releaseContentPreview ?? [],
                        })}
                      />
                    </summary>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {variant.wordScope !== "no_word" &&
                        sharedField(
                          "Target word",
                          payload.displayWord,
                          "td-display",
                        )}
                      {[
                        "discovery",
                        "meaning_match",
                        "meaning_sort",
                        "word_build",
                      ].includes(variant.kind) && (
                        sharedField("Word meaning", route.wordMeaning, "td-definition")
                      )}
                      {["cleaver", "word_build"].includes(variant.kind) && (
                        <>
                          {sharedField(
                            variant.kind === "cleaver"
                              ? "Learner cut"
                              : "Parts and word sum",
                            (Array.isArray(route.content.teachingSplitParts)
                              ? route.content.teachingSplitParts
                              : payload.canonicalMorphology.parts
                            )
                              .map((raw) => {
                                const part = raw as Record<string, unknown>;
                                return String(
                                  part.surfaceText || part.text || "",
                                );
                              })
                              .join(" | "),
                            "td-canonical-parts",
                          )}
                          {activityTransformationText(
                            route,
                            variant.kind,
                            payload.displayWord,
                          ).length > 0 &&
                            sharedField(
                              "Transformations shown",
                              activityTransformationText(
                                route,
                                variant.kind,
                                payload.displayWord,
                              ).join("; "),
                              "td-canonical-parts",
                            )}
                        </>
                      )}
                      {variant.kind === "dictation" &&
                        sharedField(
                          "Approved sentences",
                          String(dictationVariants(payload).length),
                          "td-dictation",
                        )}
                      {fields(row.key, variant.kind).map((field) => (
                        <div
                          key={field.key}
                          className="rounded-md bg-[var(--paper)] p-2"
                        >
                          {overviewFields.has(field.key) ? sharedField(field.label,
                            String(route.content[field.key] ?? ""), "td-canonical-parts") : <Editable
                            id={`td-route-${row.key}-${field.key}`}
                            label={field.label}
                            value={String(route.content[field.key] ?? "")}
                            options={field.options}
                            onChange={(value) =>
                              updateRoute(row.key, { [field.key]: value })
                            }
                          />}
                        </div>
                      ))}
                    </div>
                    {variant.kind === "compound_jigsaw" && (
                      <div id={`td-route-${row.key}-components`}>
                        <CompoundPartsEditor
                          components={
                            (route.content.components ?? []) as Parameters<
                              typeof CompoundPartsEditor
                            >[0]["components"]
                          }
                          joins={(route.content.joins ?? []) as string[]}
                          onChange={(components, joins) =>
                            updateRoute(row.key, {
                              components,
                              joins,
                              morphologyProvenance: route.content
                                .morphologyProvenance ?? {
                                source: "Teaching Dictionary admin review",
                              },
                            })
                          }
                        />
                      </div>
                    )}
                    {variant.kind === "dictation" &&
                      [
                        "homophone_word_lab",
                        "comparative_superlative_word_lab",
                      ].includes(row.route.routeId) &&
                      (() => {
                        const preview = row.preflight?.releaseContentPreview as
                          | {
                              authorityType?: string;
                              content?: Record<string, unknown>;
                            }[]
                          | undefined;
                        const source = preview?.find(
                          (item) =>
                            item.authorityType ===
                            (row.route.routeId === "homophone_word_lab"
                              ? "homophone_lesson_content"
                              : "adjective_degree_families"),
                        )?.content;
                        if (row.route.routeId === "homophone_word_lab") {
                          const lesson = source?.lesson as
                            | { dictationPassages?: PassageSet["passages"] }
                            | undefined;
                          const sets = (route.content
                            .dictationPassageVariants ??
                            source?.dictationPassageVariants ??
                            (lesson?.dictationPassages
                              ? [
                                  {
                                    id: "primary",
                                    passages: lesson.dictationPassages,
                                  },
                                ]
                              : [])) as PassageSet[];
                          return sets.length ? (
                            <PairedDictationEditor
                              sets={sets}
                              onChange={(sets) =>
                                updateRoute(row.key, {
                                  dictationPassageVariants: sets,
                                })
                              }
                            />
                          ) : (
                            <p className="mt-2 text-sm text-amber-900">
                              The reviewed paired passage group is missing.
                            </p>
                          );
                        }
                        const families = source?.families as
                          | {
                              familyKey: string;
                              words: { canonicalWordId: string }[];
                              content: {
                                pairedSentence: PassageSet["passages"][number];
                                pairedSentenceVariants?: PassageSet["passages"];
                              };
                            }[]
                          | undefined;
                        const family = families?.find((f) =>
                          f.words.some(
                            (word) => word.canonicalWordId === props.wordId,
                          ),
                        );
                        const passages = (route.content
                          .pairedSentenceVariants ??
                          family?.content.pairedSentenceVariants ??
                          (family
                            ? [family.content.pairedSentence]
                            : [])) as PassageSet["passages"];
                        return passages.length ? (
                          <PairedDictationEditor
                            sets={passages.map((p) => ({
                              id: p.id,
                              passages: [p],
                            }))}
                            onChange={(sets) =>
                              updateRoute(row.key, {
                                pairedSentenceVariants: sets.flatMap(
                                  (set) => set.passages,
                                ),
                              })
                            }
                          />
                        ) : (
                          <p className="mt-2 text-sm text-amber-900">
                            A reviewed adjective family and paired passage are
                            required.
                          </p>
                        );
                      })()}
                    {variant.kind === "cleaver" &&
                      [
                        "dynamic_prefix_word_lab",
                        "dynamic_affix_word_lab",
                      ].includes(row.route.routeId) && (
                        <>
                          <p className="mt-2 text-xs text-[color:var(--mid)]">
                            Canonical morphology:{" "}
                            {payload.canonicalMorphology.wordSum || "Missing"}
                          </p>
                          {JSON.stringify(route.content.teachingSplitParts) !==
                            JSON.stringify(
                              payload.canonicalMorphology.parts,
                            ) && (
                            <p className="mt-1 text-xs text-amber-900">
                              The learner cut differs from the shared parts.
                              Review this activity analysis.
                            </p>
                          )}
                          <div className={actions}>
                            <button
                              type="button"
                              className={button}
                              onClick={() => {
                                setSplitSkill(row.key);
                                splitDialog.current?.showModal();
                              }}
                            >
                              Edit activity cut
                            </button>
                          </div>
                        </>
                      )}
                    {variant.kind === "word_build" &&
                      row.route.routeId === "dynamic_prefix_word_lab" && (
                        <fieldset
                          id={`td-route-${row.key}-choiceAudit`}
                          className="mt-2"
                        >
                          <legend className="text-xs">
                            Review the correct prefix choice
                          </legend>
                          <div className="mt-1 flex flex-wrap gap-3">
                            {profile?.choices.map((choice) => {
                              const audit = route.content.choiceAudit as
                                | { choiceVerdicts?: Record<string, boolean> }
                                | undefined;
                              return (
                                <label key={choice} className="text-sm">
                                  <input
                                    type="radio"
                                    name={`choice-${row.key}`}
                                    checked={
                                      audit?.choiceVerdicts?.[choice] === true
                                    }
                                    onChange={() =>
                                      updateRoute(row.key, {
                                        choiceAudit: {
                                          word: payload.displayWord,
                                          choiceVerdicts: Object.fromEntries(
                                            profile.choices.map((form) => [
                                              form,
                                              form === choice,
                                            ]),
                                          ),
                                        },
                                      })
                                    }
                                  />{" "}
                                  {choice}-
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                    {variant.kind === "cleaver" &&
                      row.route.routeId === "dynamic_affix_word_lab" && (
                        <label
                          id={`td-route-${row.key}-trueMorphologyProvenance`}
                          className="mt-2 flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={
                              (
                                route.content.trueMorphologyProvenance as
                                  { status?: string } | undefined
                              )?.status === "reviewed"
                            }
                            onChange={(event) =>
                              updateRoute(row.key, {
                                trueMorphologyProvenance: {
                                  status: event.target.checked
                                    ? "reviewed"
                                    : "draft_requires_editorial_review",
                                  source:
                                    "Teaching Dictionary editorial review",
                                  reviewNote:
                                    payload.canonicalMorphology.reviewNotes ||
                                    "Reviewed canonical parts and activity split",
                                },
                              })
                            }
                          />
                          I have checked the true morphology and the learner
                          cut.
                        </label>
                      )}
                  </details>
                ))}
              {row.preflight && (
                <div className="mt-2 space-y-1 text-sm">
                  {row.preflight.issues
                    .filter(
                      (issue) =>
                        issue.wordId === props.wordId ||
                        issue.category !== "word",
                    )
                    .map((issue, at) => (
                      <p key={at} className="text-amber-900">
                        <a className="underline" href={issue.editHref}>
                          {issue.message}
                        </a>
                      </p>
                    ))}
                </div>
              )}
              <CompiledLessonPreview value={row.preflight?.compiledPreview ?? row.preflight?.releaseContentPreview ?? {}} />
              {(!row.ready || dirty) && <div className={actions}>
                {saveButton(
                  `lesson:${row.key}`,
                  "Save and approve lesson details",
                )}
              </div>}
              <form action={launchReviewedAdleLesson} className={actions}>
                <input
                  type="hidden"
                  name="draft_id"
                  value={draftId ?? ""}
                />
                <input
                  type="hidden"
                  name="word_id"
                  value={props.wordId ?? ""}
                />
                <input
                  type="hidden"
                  name="route_id"
                  value={row.route.routeId}
                />
                <input type="hidden" name="micro_skill_key" value={row.key} />
                <input
                  type="hidden"
                  name="preflight_fingerprint"
                  value={row.preflight?.preflightFingerprint ?? ""}
                />
                <ActionSubmitButton
                  pendingLabel="Launching…"
                  disabled={
                    checksState !== "ready" || saving || !row.ready ||
                    row.preflight?.status !== "ready_to_launch"
                  }
                  className={button}
                >
                  Launch lesson
                </ActionSubmitButton>
              </form>
            </div>
          </details>
        );
      })}
      <details className={section}>
        <summary className="cursor-pointer p-4 font-semibold">Advanced</summary>
        <div className="grid gap-4 px-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["ageBand", "Age band"],
                ["frequencyBand", "Frequency band"],
                ["complexityBand", "Complexity band"],
              ] as const
            ).map(([key, label]) => (
              <Editable
                key={key}
                id={`td-${key.replace("Band", "-band")}`}
                label={label}
                value={payload[key]}
                options={[
                  ...(!(DICTIONARY_BANDS[key] as readonly string[]).includes(payload[key]) && payload[key]
                    ? [{ value: payload[key], label: `${payload[key]} · needs review` }] : []),
                  ...DICTIONARY_BANDS[key].map((band) => ({ value: band,
                    label: band.replaceAll("_", " ") })),
                ]}
                onChange={(value) => change({ [key]: value })}
              />
            ))}
            <Editable
              id="td-stress_pattern"
              label="Stress pattern"
              value={payload.metadata.stress_pattern}
              onChange={(value) => metadata("stress_pattern", value)}
            />
            <Editable
              id="td-morphemes"
              label="Legacy morphemes"
              value={payload.metadata.morphemes}
              onChange={(value) => metadata("morphemes", value)}
            />
            <Editable
              id="td-morphology_notes"
              label="Morphology notes"
              value={payload.metadata.morphology_notes}
              onChange={(value) => metadata("morphology_notes", value)}
            />
          </div>
          {payload.routeContents.map((route) => {
            const profile = props.profileOptions.find((item) => item.microSkillKey === route.microSkillKey);
            const lessonSenseId = payload.skillSenseIds?.[route.microSkillKey] || activeSenseId;
            const lessonFamilyKeys = new Set((props.approvedCandidateSenseFacts[lessonSenseId]?.familyLinks ?? [])
              .map(link => link.family_key));
            const lessonFamilies = props.approvedSenseSet && props.approvedSenseSet.senses.length > 1
              ? props.baseFamilies.filter((family) => lessonFamilyKeys.has(family.name))
              : props.baseFamilies.filter((family) => family.words.some(member => member.id === props.wordId));
            const selectedFamily = String(route.content.familyKey ?? "");
            return <div key={route.microSkillKey}
              id={`td-route-${route.microSkillKey}-advanced`} className="text-sm">
              {route.routeId === "base_word_lab" && <label className="mb-2 grid gap-1 text-sm">
                <span className="inline-flex items-center gap-1">Teaching family
                  <FormatHint label="teaching family" format="Choose the approved family this lesson teaches. A word can keep other valid family memberships for different components or senses." example="understand_verb_base_family" />
                </span>
                <select id={`td-route-${route.microSkillKey}-familyKey`} className={input}
                  value={selectedFamily} onChange={(event) => updateRoute(route.microSkillKey,
                    { familyKey: event.target.value })}>
                  <option value="">Choose this lesson’s family</option>
                  {selectedFamily && !lessonFamilies.some((family) => family.name === selectedFamily)
                    && <option value={selectedFamily} disabled>{selectedFamily} · review this old selection</option>}
                  {lessonFamilies.map((family) => <option key={family.name} value={family.name}>
                    {family.name}{family.meaning ? ` · ${family.meaning}` : ""}
                  </option>)}
                </select>
              </label>}
              <RouteFactsEditor name={name(route.microSkillKey)} content={routeWithSharedFacts(route, meaningPayload(route.microSkillKey)).content}
                sharedKeys={[...sharedRouteContentKeys(route.routeId, meaningPayload(route.microSkillKey)),
                  ...(route.routeId === "base_word_lab" ? ["familyKey"] : [])]}
                choices={{ prefixVariant: profile?.choices ?? [], suffixVariant: profile?.choices ?? [],
                  meaningBinKey: profile?.meaningBins.map((bin) => bin.id) ?? [],
                  semanticBaseKind: ["base", "root"],
                  doublingPattern: ["short_cvc", "stressed_final_syllable"] }}
                onChange={(content) => replaceRouteContent(route.microSkillKey, content)} />
            </div>;
          })}
          <div id="td-source" className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["sourceCategory", "Source category"],
                ["sourceName", "Source name"],
                ["sourceUrl", "Source URL"],
                ["sourceLicence", "Source licence"],
                ["sourceUseNote", "Source use note"],
                ["confidence", "Confidence"],
              ] as const
            ).map(([key, label]) => (
              <Editable
                key={key}
                id={`td-source-${key}`}
                label={label}
                value={payload.provenance[key]}
                options={
                  key === "sourceCategory"
                    ? [
                        "internal_authored",
                        "internal_reviewed_seed",
                        "public_domain",
                        "open_licensed",
                        "licensed_vendor",
                        "reference_only",
                        "ai_assisted_draft",
                      ].map((value) => ({
                        value,
                        label: value.replaceAll("_", " "),
                      }))
                    : key === "confidence"
                      ? ["low", "medium", "high"].map((value) => ({
                          value,
                          label: value,
                        }))
                      : undefined
                }
                onChange={(value) =>
                  change({
                    provenance: { ...payload.provenance, [key]: value },
                  })
                }
              />
            ))}
          </div>
          {props.advanced}
          <div className={actions}>{saveButton("overview")}</div>
        </div>
      </details>
      <dialog
        ref={builder}
        className="w-[min(900px,95vw)] max-h-[85vh] overflow-auto rounded-xl border border-[var(--border)] bg-white p-5 text-[color:var(--ink)] backdrop:bg-black/40"
      >
        <h2 className="mb-3 text-lg font-semibold">Word parts and meanings</h2>
        {props.partSuggestions.length > 0 && (
          <details className="mb-3 rounded border p-3 text-sm">
            <summary className="cursor-pointer">
              Existing analyses to review
            </summary>
            {props.partSuggestions.map((suggestion, index) => (
              <div
                key={index}
                className="mt-2 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p>{suggestion.label}</p>
                  <p className="text-xs">
                    {generatedWordSum(suggestion.parts, payload.displayWord)}
                  </p>
                  {JSON.stringify(suggestion.parts) !==
                    JSON.stringify(payload.canonicalMorphology.parts) && (
                    <p className="text-xs text-amber-900">
                      Different from the current shared analysis
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        parts: structuredClone(suggestion.parts),
                        joins: structuredClone(suggestion.joins),
                        transformations: structuredClone(
                          suggestion.transformations,
                        ),
                        wordSum: generatedWordSum(
                          suggestion.parts,
                          payload.displayWord,
                        ),
                        analysisStatus: "in_review",
                        reviewNotes: `Selected and reviewed: ${suggestion.label}`,
                      },
                    })
                  }
                >
                  Use for review
                </button>
              </div>
            ))}
          </details>
        )}
        <PartSequenceEditor
          id="td-canonical-parts"
          label="Morphology parts and cuts"
          word={payload.displayWord}
          parts={payload.canonicalMorphology.parts}
          joins={payload.canonicalMorphology.joins}
          affixMeanings={props.affixMeanings}
          familyBase={selectedFamily ? { lemma: selectedFamily.baseLemma,
            kind: selectedFamily.baseKind === "bound_root" ? "root" : "base", meaning: selectedFamily.meaning } : undefined}
          onChange={(parts, joins) =>
            change({
              canonicalMorphology: {
                ...payload.canonicalMorphology,
                parts,
                joins,
                wordSum: generatedWordSum(parts, payload.displayWord),
                analysisStatus: "approved",
              },
            })
          }
        />
        {morphologyReviewItems.length > 0 &&
          <div role="alert" className="rounded bg-amber-50 p-2 text-sm text-amber-900">
            <p>Review these word parts before approving Overview or joining a family:</p>
            <ul className="mt-1 list-disc pl-5">{morphologyReviewItems.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>}
        {!props.draftId && props.currentMorphologyId && morphologyFormatAudit.status === "safe_range_conversion" &&
          <button type="button" className="mt-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            onClick={() => change({ canonicalMorphology: { ...payload.canonicalMorphology,
              parts: morphologyFormatAudit.convertedParts ?? payload.canonicalMorphology.parts,
              wordSum: generatedWordSum(morphologyFormatAudit.convertedParts ?? payload.canonicalMorphology.parts,
                payload.displayWord) } })}>
            Fill exact display positions for review
          </button>}
        <div id="td-canonical-word-sum" className="mt-2 text-sm">
          {payload.canonicalMorphology.wordSum}
        </div>
        <label id="td-written-syllables" className="mt-3 block text-sm">
          Written syllable breakdown
          <FormatHint label="written syllable breakdown" format="Separate written syllables with a middle dot; the letters must reproduce the word." example="scroll·ing" />
          <input
            className={`${input} mt-1`}
            value={payload.writtenSyllableBreakdown ?? ""}
            onChange={(event) =>
              change({ writtenSyllableBreakdown: event.target.value })
            }
          />
        </label>
        <h3 className="mt-4 font-semibold">Transformations</h3>
        {(payload.canonicalMorphology.transformations ?? []).map(
          (item, index) => (
            <div
              key={index}
              className="mt-2 grid gap-2 rounded bg-[var(--paper)] p-2 sm:grid-cols-3"
            >
              <label className="text-xs">
                Transformation
                <select
                  className={input}
                  value={item.type}
                  onChange={(event) =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.map(
                            (old, at) =>
                              at === index
                                ? { ...old, type: event.target.value }
                                : old,
                          ),
                      },
                    })
                  }
                >
                  {[
                    "change_final_y_to_i",
                    "drop_final_e",
                    "remove_letter",
                    "replace_final",
                    "base_spelling_change",
                  ].map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Word part
                <select
                  className={input}
                  value={item.sourcePartId}
                  onChange={(event) => {
                    const part = payload.canonicalMorphology.parts.find(
                      (raw) =>
                        (raw as { id: string }).id === event.target.value,
                    ) as Record<string, unknown> | undefined;
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.map(
                            (old, at) =>
                              at === index
                                ? {
                                    ...old,
                                    sourcePartId: event.target.value,
                                    sourceText: String(part?.sourceText ?? ""),
                                    surfaceText: String(
                                      part?.surfaceText ?? part?.text ?? "",
                                    ),
                                  }
                                : old,
                          ),
                      },
                    });
                  }}
                >
                  <option value="">Select part</option>
                  {payload.canonicalMorphology.parts.map((raw) => {
                    const part = raw as Record<string, unknown>;
                    return (
                      <option key={String(part.id)} value={String(part.id)}>
                        {String(part.sourceText ?? part.text)} →{" "}
                        {String(part.surfaceText ?? part.text)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-xs">
                Explanation
                <FormatHint label="transformation explanation" format="Explain the spelling change in a short learner-facing sentence." example="Double the final l before adding -ing." />
                <input
                  className={input}
                  value={item.explanation}
                  onChange={(event) =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.map(
                            (old, at) =>
                              at === index
                                ? { ...old, explanation: event.target.value }
                                : old,
                          ),
                      },
                    })
                  }
                />
              </label>
              {(
                [
                  ["sourceText", "Starting form"],
                  ["surfaceText", "Resulting form"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="text-xs">
                  {label}
                  <FormatHint label={label.toLowerCase()} format={field === "sourceText" ? "Enter the letters before this spelling change." : "Enter the letters after this spelling change."} example={field === "sourceText" ? "hop" : "hopp"} />
                  <input
                    className={input}
                    value={item[field]}
                    onChange={(event) =>
                      change({
                        canonicalMorphology: {
                          ...payload.canonicalMorphology,
                          transformations:
                            payload.canonicalMorphology.transformations?.map(
                              (old, at) =>
                                at === index
                                  ? { ...old, [field]: event.target.value }
                                  : old,
                            ),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <div className="flex justify-end gap-3 sm:col-span-3">
                {index > 0 && (
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => {
                      const transformations = [
                        ...(payload.canonicalMorphology.transformations ?? []),
                      ];
                      [transformations[index - 1], transformations[index]] = [
                        transformations[index],
                        transformations[index - 1],
                      ];
                      change({
                        canonicalMorphology: {
                          ...payload.canonicalMorphology,
                          transformations,
                        },
                      });
                    }}
                  >
                    Move up
                  </button>
                )}
                <button
                  type="button"
                  className="text-sm text-[color:var(--scarlett)] underline"
                  onClick={() =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.filter(
                            (_, at) => at !== index,
                          ),
                      },
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ),
        )}
        <div className={actions}>
          <button
            type="button"
            className={button}
            onClick={() =>
              change({
                canonicalMorphology: {
                  ...payload.canonicalMorphology,
                  transformations: [
                    ...(payload.canonicalMorphology.transformations ?? []),
                    {
                      type: "base_spelling_change",
                      sourcePartId: "",
                      sourceText: "",
                      surfaceText: "",
                      explanation: "",
                    },
                  ],
                },
              })
            }
          >
            Add transformation
          </button>
        </div>
        <label className="mt-3 block text-sm">
          Morphology source / review note
          <FormatHint label="morphology source or review note" format="Name the evidence or editorial decision used to review these word parts." example="Reviewed against the approved scroll family and suffix meaning." />
          <input
            className={`${input} mt-1`}
            value={payload.canonicalMorphology.reviewNotes}
            onChange={(event) =>
              change({
                canonicalMorphology: {
                  ...payload.canonicalMorphology,
                  reviewNotes: event.target.value,
                },
              })
            }
          />
        </label>
        <div className={actions}>
          <button
            type="button"
            className={button}
            onClick={() => builder.current?.close()}
          >
            Done
          </button>
          {saveButton("overview")}
        </div>
      </dialog>
      <dialog
        ref={splitDialog}
        className="w-[min(900px,95vw)] max-h-[85vh] overflow-auto rounded-xl border border-[var(--border)] bg-white p-5 text-[color:var(--ink)] backdrop:bg-black/40"
      >
        {splitSkill && (
          <>
            <h2 className="mb-3 text-lg font-semibold">
              {name(splitSkill)} · learner cut
            </h2>
            <PartSequenceEditor
              id={`td-route-${splitSkill}-teachingSplitParts`}
              label="Activity parts and boundary"
              word={payload.displayWord}
              parts={
                routeContent(splitSkill)?.content.teachingSplitParts ??
                payload.canonicalMorphology.parts
              }
              joins={
                routeContent(splitSkill)?.content.teachingSplitJoins ??
                payload.canonicalMorphology.joins
              }
              affixMeanings={props.affixMeanings}
              onChange={(parts, joins) =>
                updateRoute(splitSkill, {
                  teachingSplitParts: parts,
                  teachingSplitJoins: joins,
                })
              }
            />
            <p className="mt-2 text-xs">
              Reviewed true morphology comes from Overview. This lesson cut is
              a separate teaching presentation.
            </p>
            <div className={actions}>
              <button
                type="button"
                className={button}
                onClick={() => splitDialog.current?.close()}
              >
                Return to lesson (not saved)
              </button>
              {saveButton(
                `lesson:${splitSkill}`,
                "Save and approve lesson details",
              )}
            </div>
          </>
        )}
      </dialog>
      <dialog
        ref={family}
        onClose={() => setFamilyOpen(false)}
        onSubmitCapture={event => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          if (submitter instanceof HTMLButtonElement && submitter.dataset.pendingLabel) {
            submitter.textContent = submitter.dataset.pendingLabel;
            submitter.setAttribute("aria-busy", "true");
          }
        }}
        className="w-[min(850px,95vw)] max-h-[85vh] overflow-auto rounded-xl border border-[var(--border)] bg-white p-5 text-[color:var(--ink)] backdrop:bg-black/40"
      >
        <div className="mb-4 grid gap-2 rounded border border-[var(--border)] p-3">
          <label className="grid gap-1 text-sm font-semibold" htmlFor="family-search">
            <span className="inline-flex items-center gap-1">Find an existing word family
              <FormatHint label="family search" format="Search by the approved free base or bound root spelling." example="scroll" />
            </span>
            <input id="family-search" type="search" autoComplete="off" value={familyQuery}
              onChange={event => {
                const value = event.target.value;
                setFamilyQuery(value);
                setFamilyMatches([]);
                setFamilySearchLimited(false);
                setFamilySearchError(false);
                setFamilySearchBusy(value.trim().length >= 2);
              }}
              placeholder="Type a base word or family name, e.g. ingredient"
              className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 font-normal" />
          </label>
          <p className="text-xs text-[color:var(--mid)]">Searches approved dictionary base and root families. Type at least two letters; only matching results are loaded.</p>
          {selectedFamilyLabel && <p className="text-sm">Selected: <strong>{selectedFamilyLabel}</strong></p>}
          {familyQuery.trim().length >= 2 && <div role="status" className="text-sm">
            {familySearchBusy ? "Searching families…" : familySearchError ? "Family search could not load. Try again."
              : familyMatches.length === 0 ? "No matching approved families." : `${familyMatches.length} matching families`}
          </div>}
          {familyQuery.trim().length >= 2 && !familySearchBusy && familyMatches.length > 0 &&
            <ul className="max-h-48 overflow-auto rounded border border-[var(--border)]">
              {familyMatches.map((match) => <li key={`${match.kind}:${match.id}`}>
                <button type="button" className="w-full border-b border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-rose-50"
                  onClick={() => {
                    setSelectedFamilyLabel(`${match.name} · ${match.baseKind === "bound_root" ? "root" : "base"} family`);
                    setSelectedFamily(match);
                    setFamilyQuery("");
                    setFamilyMatches([]);
                    setFamilySearchBusy(false);
                    setFamilySearchLimited(false);
                    void showFamilyReview(match.id);
                  }}>
                  <strong>{match.name}</strong> · {match.baseKind === "bound_root" ? "root family" : "base family"}
                  {match.meaning ? ` · ${match.meaning}` : ""}
                </button>
              </li>)}
            </ul>}
          {familyQuery.trim().length >= 2 && familySearchLimited && <p className="text-xs">Refine the search to see further families.</p>}
          {selectedFamily && <button type="button" className="w-fit rounded border border-[var(--border)] px-3 py-2 text-sm font-semibold"
            onClick={useSelectedFamilyInOverview}>Use this {selectedFamily.baseKind === "bound_root" ? "root" : "base"} in Overview word parts</button>}
        </div>
        {familyLoading ? <p role="status">Loading family suggestions…</p> : familyReview}
        <div className={actions}>
          <button
            type="button"
            className={button}
            onClick={() => family.current?.close()}
          >
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
