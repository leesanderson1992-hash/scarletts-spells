import type { WordDraftPayload, RouteContentDraft } from "./contracts";
import type { WeakVowelRouteFactsV1 } from "./weak-vowel-authoring";
import { WEAK_VOWEL_MICRO_SKILLS } from "@/lib/adle/word-lab/weak-vowel-dinner";
import { isDeviceSpeechSource } from "@/lib/adle/weak-vowel/audio-source";
import type { WeakVowelFamilyPrefill } from "./weak-vowel-family-prefill";

type Clip = { src: string; sha256: string };
export type ReviewedWeakVowelSource = {
  microSkillKey: string;
  contentVersionId?: string;
  facts: Partial<WeakVowelRouteFactsV1>;
};

/** Prefill reusable evidence only. A new skill still needs its own target,
 * activity decisions, editorial source and reviewed publication. */
export function prefillWeakVowelDrafts(input: {
  payload: WordDraftPayload;
  dictionaryFingerprint: string | null;
  approvedWord: string | null;
  approvedDefinition?: string | null;
  approvedSentence: string | null;
  wordClip: Clip | null;
  sentenceClip: Clip | null;
  sources: readonly ReviewedWeakVowelSource[];
  family?: WeakVowelFamilyPrefill;
  sourceReference?: string;
}): WordDraftPayload {
  const { payload } = input;
  const exactWord = Boolean(input.approvedWord && payload.displayWord === input.approvedWord);
  const exactDefinition = Boolean(input.approvedDefinition && payload.definition === input.approvedDefinition);
  const exactSentence = Boolean(input.approvedSentence && payload.dictationSentence === input.approvedSentence);
  if (!exactWord) return payload;
  const supported = new Set<string>(WEAK_VOWEL_MICRO_SKILLS);
  const routes = [...payload.routeContents];
  let changed = false;
  for (const key of payload.skillKeys) {
    if (!supported.has(key)) continue;
    const at = routes.findIndex(route => route.microSkillKey === key && route.routeId === "weak_vowel_word_lab");
    const route: RouteContentDraft = at >= 0 ? routes[at] : {
      routeId: "weak_vowel_word_lab", routeVersion: "v1", microSkillKey: key,
      wordMeaning: "", wordSum: "", content: {},
    };
    const original = route.content.weakVowel && typeof route.content.weakVowel === "object" && !Array.isArray(route.content.weakVowel)
      ? route.content.weakVowel as Partial<WeakVowelRouteFactsV1> : {};
    const candidates = input.sources.filter(row => row.microSkillKey !== key && row.facts.wordRecording?.src &&
      row.facts.wordRecording.sha256 && row.facts.pronunciationId);
    const sharedIdentity = (row: ReviewedWeakVowelSource) => JSON.stringify({
      wordSense: row.facts.wordSense, pronunciationId: row.facts.pronunciationId,
      wordRecording: row.facts.wordRecording, spokenSyllableCount: row.facts.spokenSyllableCount,
      acceptedCutSets: row.facts.acceptedCutSets, sentenceRecording: row.facts.sentenceRecording,
      sentenceTarget: row.facts.sentenceTarget,
    });
    const source = candidates.length && candidates.every(row => sharedIdentity(row) === sharedIdentity(candidates[0]))
      ? candidates[0] : undefined;
    const sourceAudio = source?.facts.wordRecording;
    const wordRecording = original.wordRecording ??
      (input.wordClip?.src.startsWith("/audio/") ? input.wordClip : null) ?? sourceAudio ?? input.wordClip ?? undefined;
    const sameRecording = Boolean(sourceAudio && wordRecording && sourceAudio.src === wordRecording.src &&
      sourceAudio.sha256 === wordRecording.sha256);
    const sentenceRecording = exactSentence
      ? original.sentenceRecording ??
        (input.sentenceClip?.src.startsWith("/audio/") ? input.sentenceClip : null) ??
        source?.facts.sentenceRecording ?? input.sentenceClip ?? undefined
      : original.sentenceRecording;
    const sentenceStart = exactSentence
      ? payload.dictationSentence.toLocaleLowerCase("en-GB").indexOf(payload.displayWord.toLocaleLowerCase("en-GB")) : -1;
    const uniqueSentenceTarget = sentenceStart >= 0 &&
      payload.dictationSentence.toLocaleLowerCase("en-GB").lastIndexOf(payload.displayWord.toLocaleLowerCase("en-GB")) === sentenceStart &&
      (sentenceStart === 0 || !/[\p{L}\p{N}]/u.test(payload.dictationSentence[sentenceStart - 1])) &&
      (sentenceStart + payload.displayWord.length === payload.dictationSentence.length ||
        !/[\p{L}\p{N}]/u.test(payload.dictationSentence[sentenceStart + payload.displayWord.length]))
      ? { start: sentenceStart, end: sentenceStart + payload.displayWord.length } : undefined;
    const next: Partial<WeakVowelRouteFactsV1> = {
      ...original,
      schemaVersion: "weak_vowel_route_facts_v1",
      sourceFingerprint: original.sourceFingerprint || input.dictionaryFingerprint || "",
      wordSense: original.wordSense === undefined ? source?.facts.wordSense : original.wordSense,
      pronunciationId: original.pronunciationId || (sameRecording ? source?.facts.pronunciationId : undefined) ||
        (wordRecording?.sha256 && wordRecording.src.startsWith("/audio/") ? `approved-dictionary:${wordRecording.sha256}` :
          isDeviceSpeechSource(wordRecording?.src) ? `device-voice:${payload.displayWord.toLocaleLowerCase("en-GB")}` : ""),
      wordRecording,
      spokenSyllableCount: original.spokenSyllableCount || (sameRecording ? source?.facts.spokenSyllableCount : undefined),
      acceptedCutSets: original.acceptedCutSets?.length ? original.acceptedCutSets
        : sameRecording ? source?.facts.acceptedCutSets : undefined,
      sentenceRecording,
      sentenceTarget: original.sentenceTarget ?? (exactSentence ? source?.facts.sentenceTarget ?? uniqueSentenceTarget : undefined),
      familyDecision: original.familyDecision ?? (input.family?.status === "ready" ? "approve" : "skip"),
      familyAuthorityId: original.familyAuthorityId === undefined
        ? input.family?.status === "ready" ? input.family.authorityId : null : original.familyAuthorityId,
      reviewSourceReference: original.reviewSourceReference || [input.sourceReference,
        source?.contentVersionId ? `Reviewed ${source.microSkillKey} content ${source.contentVersionId}` : "",
      ].filter(Boolean).join("; "),
    };
    const ready = (condition: boolean, reason: string) => condition
      ? { status: "ready" as const, reason: null }
      : { status: "blocked" as const, reason };
    const targetReady = Boolean(next.target && next.selectionTarget && next.detectiveVowelIndex === next.selectionTarget.start);
    const wordAudioReady = Boolean(next.wordRecording?.src && next.wordRecording?.sha256);
    const sentenceReady = Boolean(next.sentenceRecording?.src && next.sentenceRecording?.sha256 && next.sentenceTarget);
    const cutsReady = Boolean(next.spokenSyllableCount && next.acceptedCutSets?.length);
    next.activityEligibility = {
      dinner: original.activityEligibility?.dinner?.status === "blocked" && original.activityEligibility.dinner.reason !== "Awaiting reviewed word target and spoken cuts"
        ? original.activityEligibility.dinner : ready(targetReady && wordAudioReady && cutsReady, "Awaiting reviewed word target and spoken cuts"),
      detective: original.activityEligibility?.detective?.status === "blocked" && original.activityEligibility.detective.reason !== "Awaiting reviewed written vowel"
        ? original.activityEligibility.detective : ready(targetReady && wordAudioReady, "Awaiting reviewed written vowel"),
      memoryLock: original.activityEligibility?.memoryLock?.status === "blocked" && original.activityEligibility.memoryLock.reason !== "Awaiting approved word recording"
        ? original.activityEligibility.memoryLock : ready(wordAudioReady, "Awaiting approved word recording"),
      dictation: original.activityEligibility?.dictation?.status === "blocked" && original.activityEligibility.dictation.reason !== "Awaiting approved sentence and recording"
        ? original.activityEligibility.dictation : ready(sentenceReady, "Awaiting approved sentence and recording"),
      family: next.familyDecision === "approve" && next.familyAuthorityId
        ? { status: "ready", reason: null } : { status: "not_applicable", reason: null },
    };
    // Do not seed a draft just because a word is assigned. Require an exact
    // current dictionary fingerprint or reusable approved evidence.
    if (!input.dictionaryFingerprint && !source && !input.wordClip && !input.sentenceClip) continue;
    if (JSON.stringify(next) === JSON.stringify(original) && at >= 0 &&
      (route.wordMeaning || !exactDefinition)) continue;
    const updated = { ...route, wordMeaning: route.wordMeaning || (exactDefinition ? input.approvedDefinition! : ""),
      content: { ...route.content, weakVowel: next } };
    if (at >= 0) routes[at] = updated;
    else routes.push(updated);
    changed = true;
  }
  return changed ? { ...payload, routeContents: routes } : payload;
}
