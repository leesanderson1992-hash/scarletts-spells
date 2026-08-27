import type { CanonicalActivitySpec } from "../canonical-activity-spec";
import { resolveSentenceDictationContract } from "../sentence-dictation-contract";
import type {
  GenericSnapshotContentKindV2,
  GenericSnapshotEvidenceBindingV2,
  GenericSnapshotRewardRoleV2,
  GenericSnapshotScheduleRoleV2,
} from "./generic-snapshot-contracts";
import type {
  CanonicalActivitySnapshotV3,
  GenericSnapshotJsonValue,
  GenericSnapshotSectionKeyV3,
} from "./generic-snapshot-v3-contracts";

export const GENERIC_SNAPSHOT_V3_WRITER_ENABLED = true as const;

export type GenericCanonicalGenerationContextV3 =
  | "first_impression"
  | "scheduled_review"
  | "same_session_repair"
  | "diagnostic";

export interface GenericCanonicalGenerationContractV3 {
  concept: string;
  mode: string;
  contractVersion: 1;
  contexts: readonly GenericCanonicalGenerationContextV3[];
  requiredAuthoredPayload: readonly string[];
  readiness: string;
  writerStatus: "active_v3";
}

type PayloadIssue = {
  kind: "missing_authored_content" | "malformed_canonical_payload";
  detail: string;
};

interface GenericSnapshotV3ReaderContract extends GenericCanonicalGenerationContractV3 {
  lifecycle: {
    sectionKeys: readonly GenericSnapshotSectionKeyV3[];
    answerVisibility: "teaching" | "guided" | "recall_neutral" | "post_submit";
    evidence: GenericSnapshotEvidenceBindingV2;
    scheduleRole: GenericSnapshotScheduleRoleV2;
    rewardRole: GenericSnapshotRewardRoleV2;
    conditionKind: "always" | "on_misspelling";
  };
  requiredContentKinds: readonly GenericSnapshotContentKindV2[];
  validatePayload: (payload: Readonly<Record<string, GenericSnapshotJsonValue>>) => PayloadIssue | null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringField(payload: Readonly<Record<string, GenericSnapshotJsonValue>>, key: string): string | null {
  const value = payload[key];
  return nonEmptyString(value) ? value : null;
}

function requiredStrings(
  payload: Readonly<Record<string, GenericSnapshotJsonValue>>,
  keys: readonly string[],
): PayloadIssue | null {
  const missing = keys.filter((key) => !stringField(payload, key));
  return missing.length > 0
    ? { kind: "missing_authored_content", detail: `Missing required authored payload: ${missing.join(", ")}.` }
    : null;
}

function wordPayload(payload: Readonly<Record<string, GenericSnapshotJsonValue>>): PayloadIssue | null {
  return requiredStrings(payload, ["canonicalWordId", "targetWord", "audioText"]);
}

function recordValue(value: unknown): value is Readonly<Record<string, GenericSnapshotJsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function governedMeaningTargets(payload: Readonly<Record<string, GenericSnapshotJsonValue>>): PayloadIssue | null {
  if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
    return { kind: "missing_authored_content", detail: "At least one governed meaning target is required." };
  }
  return payload.targets.every((target) => recordValue(target)
    && nonEmptyString(target.canonicalWordId)
    && nonEmptyString(target.word)
    && nonEmptyString(target.definition))
    ? null
    : { kind: "missing_authored_content", detail: "Every meaning target requires canonicalWordId, word and authored definition." };
}

function governedTeachingPages(payload: Readonly<Record<string, GenericSnapshotJsonValue>>): PayloadIssue | null {
  const config = payload.config;
  const progression = payload.progression;
  if (!recordValue(config) || !Array.isArray(config.pages) || !recordValue(config.meetWords)) {
    return { kind: "missing_authored_content", detail: "TeachingPages requires authored pages and Meet the Words data." };
  }
  if (config.pages.length < 1 || config.pages.length > 3) {
    return { kind: "malformed_canonical_payload", detail: "TeachingPages requires one to three authored teaching pages." };
  }
  const pagesValid = config.pages.every((page) => {
    if (!recordValue(page) || page.type !== "teaching" || !nonEmptyString(page.id) || !nonEmptyString(page.title) || !Array.isArray(page.paragraphs)) return false;
    const paragraphs = page.paragraphs.every(nonEmptyString);
    const callout = page.callout === undefined || nonEmptyString(page.callout);
    const examples = page.examples === undefined || (Array.isArray(page.examples) && page.examples.every((example) => recordValue(example) && nonEmptyString(example.text)));
    const sections = page.sections === undefined || (Array.isArray(page.sections) && page.sections.every((section) => recordValue(section)
      && Array.isArray(section.paragraphs) && section.paragraphs.every(nonEmptyString)));
    const model = page.model === undefined || (recordValue(page.model)
      && nonEmptyString(page.model.first) && nonEmptyString(page.model.second) && nonEmptyString(page.model.result));
    const hasContent = page.paragraphs.length > 0 || nonEmptyString(page.callout) || (Array.isArray(page.examples) && page.examples.length > 0)
      || (Array.isArray(page.sections) && page.sections.length > 0) || recordValue(page.model);
    return paragraphs && callout && examples && sections && model && hasContent;
  });
  if (!pagesValid) return { kind: "missing_authored_content", detail: "Every teaching page requires governed display content." };
  const words = config.meetWords.words;
  if (!Array.isArray(words) || words.length === 0 || !words.every((word) => recordValue(word)
    && nonEmptyString(word.id) && nonEmptyString(word.word)
    && word.audio === undefined && word.audioText === undefined)) {
    return { kind: "missing_authored_content", detail: "Meet the Words requires governed word identities and contains no audio contract." };
  }
  if (!recordValue(progression)
    || progression.kind !== "first_impression_sequence"
    || progression.meetWordsPosition !== "final") {
    return { kind: "malformed_canonical_payload", detail: "TeachingPages must bind its required Meet the Words state as the final page in the First Impression sequence." };
  }
  return null;
}

function governedLessonReflection(payload: Readonly<Record<string, GenericSnapshotJsonValue>>): PayloadIssue | null {
  const promptSource = payload.promptSource;
  const mistakeSummary = payload.mistakeSummary;
  const sentenceComparison = payload.sentenceComparison;
  const responseBinding = payload.responseBinding;
  const resumeBinding = payload.resumeBinding;
  if (!nonEmptyString(payload.prompt) || !recordValue(promptSource)
    || promptSource.kind !== "teaching_content" || !nonEmptyString(promptSource.contentRefId)
    || !nonEmptyString(promptSource.contentVersion) || !nonEmptyString(promptSource.promptKey)) {
    return { kind: "missing_authored_content", detail: "LessonReflection requires a governed teaching-content prompt source, version and prompt key." };
  }
  if (!recordValue(mistakeSummary) || mistakeSummary.kind !== "normalized_lesson_attempts"
    || !Array.isArray(mistakeSummary.sections)
    || mistakeSummary.sections.length === 0
    || !mistakeSummary.sections.every((section) => section === "lesson_production" || section === "lesson_dictation")) {
    return { kind: "malformed_canonical_payload", detail: "LessonReflection requires the normalized spelling-attempt summary binding." };
  }
  if (!recordValue(sentenceComparison) || sentenceComparison.kind !== "feedback_only"
    || typeof sentenceComparison.enabled !== "boolean" || sentenceComparison.spellingEvidence !== false) {
    return { kind: "malformed_canonical_payload", detail: "Sentence comparison must be explicitly feedback-only and excluded from spelling evidence." };
  }
  if (!recordValue(responseBinding) || responseBinding.kind !== "learning_reflection" || responseBinding.field !== "learningReflection"
    || !recordValue(resumeBinding) || resumeBinding.kind !== "assignment_activity_session"
    || payload.completionBoundary !== "part_submission") {
    return { kind: "malformed_canonical_payload", detail: "LessonReflection response, resume and part-completion bindings are required." };
  }
  return null;
}

function registration(
  input: Omit<GenericSnapshotV3ReaderContract, "contractVersion" | "writerStatus">,
): GenericSnapshotV3ReaderContract {
  return { ...input, contractVersion: 1, writerStatus: "active_v3" };
}

const contracts = [
  registration({
    concept: "INTRODUCTION",
    mode: "teaching_page",
    contexts: ["first_impression"],
    requiredAuthoredPayload: ["config.pages[1..3]", "config.meetWords.words", "progression.meetWordsPosition=final"],
    readiness: "TeachingPages is Production-proven; v3 now governs one to three authored pages plus its required final Meet the Words state without separate page renderer identities.",
    lifecycle: {
      sectionKeys: ["lesson_intro"], answerVisibility: "teaching",
      evidence: { mode: "none", capture: "none", attemptKind: null, evidenceClass: null },
      scheduleRole: "none", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: governedTeachingPages,
  }),
  registration({
    concept: "COVER_CHECK",
    mode: "whole_word",
    contexts: ["first_impression"],
    requiredAuthoredPayload: ["canonicalWordId", "word", "splitPoints", "components?", "closePolicy?"],
    readiness: "CoverShutter has one learner action and evidence contract; component marking and ratio-close behavior are governed optional configuration of whole_word@1.",
    lifecycle: {
      sectionKeys: ["lesson_production"], answerVisibility: "recall_neutral",
      evidence: { mode: "independent_word", capture: "submitted_on_part_finish", attemptKind: "lesson_production", evidenceClass: "first_exposure_lesson_attempt" },
      scheduleRole: "lesson_final_if_no_dictation", rewardRole: "lesson_taught_word", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: (payload) => {
      const missing = requiredStrings(payload, ["canonicalWordId", "word"]);
      if (missing) return missing;
      if (!Array.isArray(payload.splitPoints) || !payload.splitPoints.every((value) => Number.isInteger(value) && Number(value) > 0)) {
        return { kind: "missing_authored_content", detail: "A governed splitPoints array is required, including [] when no component marking is shown." };
      }
      if (payload.components !== undefined && (!Array.isArray(payload.components) || payload.components.length < 2 || !payload.components.every(nonEmptyString))) {
        return { kind: "malformed_canonical_payload", detail: "Configured cover components require at least two governed non-empty components." };
      }
      if (payload.closePolicy !== undefined && (!recordValue(payload.closePolicy)
        || payload.closePolicy.kind !== "track_ratio"
        || typeof payload.closePolicy.threshold !== "number"
        || payload.closePolicy.threshold <= 0 || payload.closePolicy.threshold > 1)) {
        return { kind: "malformed_canonical_payload", detail: "Configured Cover Check closePolicy must be a governed track ratio in (0, 1]." };
      }
      return null;
    },
  }),
  registration({
    concept: "DICTATION",
    mode: "whole_sentence",
    contexts: ["first_impression"],
    requiredAuthoredPayload: ["canonicalWordId", "targetWord", "audioText", "correctSentence", "targetBinding"],
    readiness: "SentenceDictation has one whole-sentence learner experience; token/span differences are governed target-binding configuration while the existing adapter retains exact evidence extraction.",
    lifecycle: {
      sectionKeys: ["lesson_dictation"], answerVisibility: "recall_neutral",
      evidence: { mode: "independent_word", capture: "submitted_on_part_finish", attemptKind: "lesson_dictation", evidenceClass: "first_exposure_lesson_attempt" },
      scheduleRole: "lesson_final", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: (payload) => {
      const missing = requiredStrings(payload, ["canonicalWordId", "targetWord", "audioText", "correctSentence"]);
      if (missing) return missing;
      const binding = payload.targetBinding;
      if (!recordValue(binding) || (binding.kind !== "token" && binding.kind !== "span")) {
        return { kind: "missing_authored_content", detail: "A governed token or span targetBinding is required." };
      }
      const startTokenIndex = binding.kind === "token" ? binding.tokenIndex : binding.startTokenIndex;
      const endTokenIndexExclusive = binding.kind === "token" ? Number(startTokenIndex) + 1 : binding.endTokenIndexExclusive;
      if (!Number.isInteger(startTokenIndex) || Number(startTokenIndex) < 0
        || !Number.isInteger(endTokenIndexExclusive) || Number(endTokenIndexExclusive) <= Number(startTokenIndex)
        || (binding.kind === "span" && !nonEmptyString(binding.exactAnswer))) {
        return { kind: "malformed_canonical_payload", detail: "The governed dictation target binding is malformed." };
      }
      const contract = resolveSentenceDictationContract({
        sentence: payload.correctSentence,
        audioText: payload.audioText,
        targetTokenIndex: startTokenIndex,
      }, payload.targetWord as string);
      if (binding.kind === "token") return contract
        ? null
        : { kind: "malformed_canonical_payload", detail: "The authored sentence token does not resolve to the governed word." };
      const sentenceTokens = (payload.correctSentence as string).trim().split(/\s+/)
        .map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, ""))
        .filter(Boolean);
      const exact = sentenceTokens.slice(Number(startTokenIndex), Number(endTokenIndexExclusive)).join(" ");
      return exact === (binding.exactAnswer as string).trim().toLocaleLowerCase("en-GB")
        ? null
        : { kind: "malformed_canonical_payload", detail: "The authored sentence span does not resolve to its governed exact answer." };
    },
  }),
  registration({
    concept: "COLD_WORD_RECALL",
    mode: "scheduled_review",
    contexts: ["scheduled_review"],
    requiredAuthoredPayload: ["canonicalWordId", "targetWord", "audioText"],
    readiness: "ColdWordRecall is complete and the review adapter retains the existing due-bundle, scheduler and attempt identity.",
    lifecycle: {
      sectionKeys: ["review_production"], answerVisibility: "recall_neutral",
      evidence: { mode: "independent_word", capture: "submitted_on_part_finish", attemptKind: "review_production", evidenceClass: "scheduled_review_attempt" },
      scheduleRole: "review_outcome", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["schedule_policy"],
    validatePayload: wordPayload,
  }),
  registration({
    concept: "COLD_WORD_RECALL",
    mode: "diagnostic_probe",
    contexts: ["diagnostic"],
    requiredAuthoredPayload: ["canonicalWordId", "targetWord", "audioText"],
    readiness: "ColdWordRecall diagnostic mode is complete and the existing probe adapter retains non-punitive diagnostic intake semantics.",
    lifecycle: {
      sectionKeys: ["lesson_probe"], answerVisibility: "recall_neutral",
      evidence: { mode: "diagnostic", capture: "submitted_on_part_finish", attemptKind: "lesson_probe", evidenceClass: "diagnostic_probe_attempt" },
      scheduleRole: "diagnostic_probe", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: wordPayload,
  }),
  registration({
    concept: "ERROR_REPAIR",
    mode: "reveal_hide_retry",
    contexts: ["same_session_repair"],
    requiredAuthoredPayload: ["canonicalWordId", "targetWord"],
    readiness: "ReflectionActivity is complete; prior attempt and retry state remain runtime-owned and are not persisted in the snapshot.",
    lifecycle: {
      sectionKeys: ["review_reflection"], answerVisibility: "post_submit",
      evidence: { mode: "reflection", capture: "optional", attemptKind: "reflection_retry", evidenceClass: "reflection_attempt" },
      scheduleRole: "none", rewardRole: "none", conditionKind: "on_misspelling",
    },
    requiredContentKinds: ["schedule_policy"],
    validatePayload: (payload) => requiredStrings(payload, ["canonicalWordId", "targetWord"]),
  }),
  registration({
    concept: "MEMORY_CUE",
    mode: "child_authored_cue",
    contexts: ["first_impression"],
    requiredAuthoredPayload: ["canonicalWordId", "targetWord", "prompt"],
    readiness: "The intentional child-authored mnemonic interaction has an explicit canonical identity and no longer acts as a generic fallback.",
    lifecycle: {
      sectionKeys: ["guided_practice"], answerVisibility: "guided",
      evidence: { mode: "guided_completion", capture: "optional", attemptKind: "guided_practice", evidenceClass: "guided_practice_attempt" },
      scheduleRole: "none", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: (payload) => requiredStrings(payload, ["canonicalWordId", "targetWord", "prompt"]),
  }),
  registration({
    concept: "MEANING_MATCH",
    mode: "word_to_definition",
    contexts: ["first_impression"],
    requiredAuthoredPayload: ["targets[].canonicalWordId", "targets[].word", "targets[].definition"],
    readiness: "MeaningConnectionActivity already implements whole-word-to-definition matching; v3 registration is safe only when every governed definition is present.",
    lifecycle: {
      sectionKeys: ["guided_practice"], answerVisibility: "guided",
      evidence: { mode: "guided_completion", capture: "optional", attemptKind: "guided_practice", evidenceClass: "guided_practice_attempt" },
      scheduleRole: "none", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: governedMeaningTargets,
  }),
  registration({
    concept: "MEANING_MATCH",
    mode: "component_clues",
    contexts: ["first_impression"],
    requiredAuthoredPayload: ["targets[].canonicalWordId", "targets[].word", "targets[].definition"],
    readiness: "MeaningConnectionActivity is complete when every target has a governed whole-word definition.",
    lifecycle: {
      sectionKeys: ["guided_practice"], answerVisibility: "guided",
      evidence: { mode: "guided_completion", capture: "optional", attemptKind: "guided_practice", evidenceClass: "guided_practice_attempt" },
      scheduleRole: "none", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: governedMeaningTargets,
  }),
  registration({
    concept: "LESSON_REFLECTION",
    mode: "standard_lesson_reflection",
    contexts: ["first_impression"],
    requiredAuthoredPayload: ["prompt", "promptSource", "mistakeSummary", "sentenceComparison", "responseBinding", "resumeBinding", "completionBoundary"],
    readiness: "LessonReflection is Production-proven; v3 now governs its prompt source and route/session bindings while presentation remains component-owned.",
    lifecycle: {
      sectionKeys: ["lesson_reflection"], answerVisibility: "post_submit",
      evidence: { mode: "reflection", capture: "none", attemptKind: null, evidenceClass: null },
      scheduleRole: "none", rewardRole: "none", conditionKind: "always",
    },
    requiredContentKinds: ["teaching_content"],
    validatePayload: governedLessonReflection,
  }),
] as const satisfies readonly GenericSnapshotV3ReaderContract[];

function contractKey(identity: { concept: string; mode: string; contractVersion: number }): string {
  return `${identity.concept}.${identity.mode}@${identity.contractVersion}`;
}

const byContract = new Map(contracts.map((entry) => [contractKey(entry), entry]));

export const GENERIC_SNAPSHOT_V3_GENERATION_ALLOW_LIST:
  readonly GenericCanonicalGenerationContractV3[] = contracts;

export function getGenericSnapshotV3ReaderContract(identity: {
  concept: string;
  mode: string;
  contractVersion: number;
}): GenericSnapshotV3ReaderContract | null {
  return byContract.get(contractKey(identity)) ?? null;
}

export function canonicalActivitySpecFromSnapshotV3(
  activity: CanonicalActivitySnapshotV3,
  item: Record<string, unknown>,
): CanonicalActivitySpec {
  const canonicalWordId = stringField(activity.payload, "canonicalWordId") ?? null;
  const targetWord = stringField(activity.payload, "targetWord") ?? stringField(activity.payload, "word");
  let payload: Record<string, unknown> = { ...activity.payload };
  if (activity.canonical.concept === "ERROR_REPAIR") {
    payload = {
      item: {
        ...item,
        canonicalWordId,
        targetWord,
        promptData: {
          ...((item.promptData && typeof item.promptData === "object") ? item.promptData as Record<string, unknown> : {}),
          misconceptionHint: activity.payload.misconceptionHint,
        },
      },
      canonicalWordId,
    };
  } else if (activity.canonical.concept === "MEMORY_CUE") {
    payload = {
      item: {
        ...item,
        canonicalWordId,
        targetWord,
        promptData: {
          ...((item.promptData && typeof item.promptData === "object") ? item.promptData as Record<string, unknown> : {}),
          childFacingCopy: activity.payload.prompt,
        },
      },
      canonicalWordId,
      variant: "memory_cue",
    };
  }
  return {
    id: activity.activityId,
    label: activity.label,
    concept: activity.canonical.concept,
    mode: activity.canonical.mode,
    contractVersion: 1,
    payload,
    source: {
      templateKey: "",
      sectionKey: activity.sectionKey,
      compatibility: false,
    },
  };
}
