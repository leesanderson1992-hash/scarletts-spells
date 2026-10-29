import { deviceSpeechSource, isDeviceSpeechSource, isWeakVowelAudioSource } from "../adle/weak-vowel/audio-source";

/** Lesson-specific weak-vowel facts. Shared spelling, meaning and dictionary
 * metadata stay on the canonical word; review/publication stays in the existing
 * governed route-content workflow. */
export interface WeakVowelRouteFactsV1 {
  schemaVersion: "weak_vowel_route_facts_v1";
  sourceFingerprint: string;
  activityEligibility: Record<"dinner" | "detective" | "memoryLock" | "dictation" | "family", {
    status: "ready" | "blocked" | "not_applicable";
    reason: string | null;
  }>;
  wordSense: string | null;
  pronunciationId: string;
  wordRecording: { src: string; sha256: string };
  spokenSyllableCount: number;
  acceptedCutSets: number[][];
  target: { text: string; start: number; end: number; syllableIndex: number;
    soundType: "schwa" | "other_unstressed" | "" };
  selectionTarget: { text: string; start: number; end: number };
  detectiveVowelIndex: number;
  familyDecision: "approve" | "skip";
  familyAuthorityId: string | null;
  sentenceRecording: { src: string; sha256: string };
  sentenceTarget: { start: number; end: number };
  reviewSourceReference: string;
}

const SHA = /^[a-f0-9]{64}$/;
const VOWEL = /^[aeiouy]$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isInteger(value);
const clip = (value: unknown): value is { src: string; sha256: string } =>
  object(value) && isWeakVowelAudioSource(value.src) &&
  typeof value.sha256 === "string" && SHA.test(value.sha256);

/** Used by the editor and the release compiler; it never guesses a vowel from
 * a schwa flag or silently replaces an invalid cut with a suggestion. */
export function weakVowelRouteBlockers(
  value: unknown,
  input: { displayWord: string; dictationSentence: string; definition: string; microSkillKey: string },
): string[] {
  const blockers: string[] = [];
  if (!object(value) || value.schemaVersion !== "weak_vowel_route_facts_v1") {
    return ["Add versioned weak-vowel lesson facts."];
  }
  const word = input.displayWord;
  if (typeof value.sourceFingerprint !== "string" || !SHA.test(value.sourceFingerprint))
    blockers.push("Bind these annotations to the current source fingerprint.");
  const eligibility = object(value.activityEligibility) ? value.activityEligibility : null;
  for (const activity of ["dinner", "detective", "memoryLock", "dictation", "family"] as const) {
    const state = eligibility && object(eligibility[activity]) ? eligibility[activity] : null;
    const required = activity !== "family";
    if (!state || !(state.status === "ready" || state.status === "blocked" ||
      activity === "family" && state.status === "not_applicable")) {
      blockers.push(`Review ${activity} activity eligibility.`);
    } else if (required && state.status !== "ready") {
      blockers.push(`${activity} is blocked: ${typeof state.reason === "string" && state.reason.trim() ? state.reason : "record a specific reason"}.`);
    } else if (state.status === "blocked" && !(typeof state.reason === "string" && state.reason.trim())) {
      blockers.push(`Explain why ${activity} is blocked.`);
    }
  }
  if (!(value.wordSense === null || typeof value.wordSense === "string" && value.wordSense.trim()))
    blockers.push("Choose the word sense or explicitly mark it unambiguous.");
  if (typeof value.pronunciationId !== "string" || !value.pronunciationId.trim() ||
    value.pronunciationId.startsWith("candidate-"))
    blockers.push("Bind the reviewed pronunciation facts or a device-voice source.");
  if (!clip(value.wordRecording)) blockers.push("Bind reviewed word audio or an approved device-voice source and SHA-256.");
  else if (isDeviceSpeechSource(value.wordRecording.src) && value.wordRecording.src !== deviceSpeechSource(word))
    blockers.push("Device word voice must say the exact canonical spelling.");
  if (!integer(value.spokenSyllableCount) || value.spokenSyllableCount < 1)
    blockers.push("Review the spoken syllable count.");
  const target = object(value.target) ? value.target : null;
  if (!target || typeof target.text !== "string" || !integer(target.start) || !integer(target.end) ||
    target.start < 0 || target.end <= target.start || word.slice(target.start, target.end) !== target.text)
    blockers.push("Review the exact written target span.");
  if (!target || !integer(target.syllableIndex) || target.syllableIndex < 1 ||
    target.syllableIndex > (integer(value.spokenSyllableCount) ? value.spokenSyllableCount : 0))
    blockers.push("Review the target spoken syllable number.");
  if (!target || !["schwa", "other_unstressed"].includes(String(target.soundType)))
    blockers.push("Review the target weak-vowel sound type.");
  const selected = object(value.selectionTarget) ? value.selectionTarget : null;
  if (!selected || typeof selected.text !== "string" || !integer(selected.start) || !integer(selected.end) ||
    selected.end !== selected.start + 1 || word.slice(selected.start, selected.end) !== selected.text ||
    !VOWEL.test(selected.text) || !target || !integer(target.start) || !integer(target.end) ||
    selected.start < target.start || selected.end > target.end) {
    blockers.push("Select the exact written vowel letter inside the reviewed target.");
  }
  const finalEnding = {
    D4_SCHWA_FINAL_AR_FINAL: ["ar", "a"],
    D4_SCHWA_FINAL_ER_FINAL: ["er", "e"],
    D4_SCHWA_FINAL_OR_FINAL: ["or", "o"],
  }[input.microSkillKey];
  if (finalEnding && (!target || target.text !== finalEnding[0] || target.end !== word.length ||
    target.start !== word.length - 2 || !selected || selected.text !== finalEnding[1] ||
    selected.start !== word.length - 2)) {
    blockers.push(`The ${finalEnding[0]} lesson needs its full ending annotated and only its vowel selected in Dinner.`);
  }
  if (input.microSkillKey === "D4_SCHWA_FINAL_ET" && (!target || target.text !== "et" || target.end !== word.length ||
    !selected || selected.text !== "e" || selected.start !== word.length - 2)) {
    blockers.push("The final -et lesson targets the written e in the complete -et ending.");
  }
  if (input.microSkillKey === "D4_SCHWA_FINAL_A_FINAL" && (!target || typeof target.text !== "string" ||
    target.text.toLowerCase() !== "a" ||
    target.end !== word.length || !selected || selected.start !== word.length - 1))
    blockers.push("The final -a lesson targets the written final a.");
  if (input.microSkillKey === "D4_SCHWA_INITIAL_E_INITIAL" && (!target || typeof target.text !== "string" ||
    target.text.toLowerCase() !== "e" ||
    target.start !== 0 || !selected || selected.start !== 0))
    blockers.push("The initial e- lesson targets the written first e.");
  if (input.microSkillKey === "D4_SCHWA_INITIAL_A_INITIAL" && (!target || typeof target.text !== "string" ||
    target.text.toLowerCase() !== "a" ||
    target.start !== 0 || target.end !== 1 || !selected || selected.start !== 0 || selected.text !== "a"))
    blockers.push("The initial a- lesson targets the written first a.");
  if (input.microSkillKey === "D4_SCHWA_INITIAL_O_INITIAL" && (!target || typeof target.text !== "string" ||
    target.text.toLowerCase() !== "o" ||
    target.start !== 0 || !selected || selected.start !== 0))
    blockers.push("The initial o- lesson targets the written first o.");
  if (input.microSkillKey === "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS" && (!selected ||
    !integer(selected.start) || !integer(selected.end) || selected.start < 1 || selected.end >= word.length))
    blockers.push("The medial weak-vowel lesson needs a written vowel inside the word.");
  if (input.microSkillKey === "D4_SCHWA_FINAL_AL") {
    const finalAl = word.toLocaleLowerCase("en-GB").lastIndexOf("al");
    if (finalAl < 0 || finalAl < word.length - 5 || !target || target.text !== word.slice(finalAl, finalAl + 1) ||
      target.start !== finalAl || target.end !== finalAl + 1 || !selected ||
      selected.text !== word.slice(finalAl, finalAl + 1) || selected.start !== finalAl) {
      blockers.push("The final -al lesson targets the written a in -al, including -ally forms.");
    }
  }
  if (!integer(value.detectiveVowelIndex) || !selected ||
    value.detectiveVowelIndex !== selected.start) {
    blockers.push("Bind Vowel Detective to the reviewed missing-vowel occurrence.");
  }
  if (!Array.isArray(value.acceptedCutSets) || !value.acceptedCutSets.length) {
    blockers.push("Add at least one reviewed Dinner syllable cut.");
  } else {
    for (const cuts of value.acceptedCutSets) {
      if (!Array.isArray(cuts) || cuts.length !== (integer(value.spokenSyllableCount) ? value.spokenSyllableCount - 1 : -1) ||
        cuts.some((cut) => !integer(cut) || cut <= 0 || cut >= word.length) ||
        cuts.some((cut, index) => index > 0 && cut <= cuts[index - 1])) {
        blockers.push("Dinner cuts must yield the reviewed spoken syllable count.");
        break;
      }
      if (target && integer(target.start) && integer(target.end) && integer(target.syllableIndex)) {
        const start = target.start;
        const end = target.end;
        const syllableIndex = target.syllableIndex;
        const bounds = [0, ...cuts, word.length];
        if (!(bounds[syllableIndex - 1] <= start && end <= bounds[syllableIndex])) {
          blockers.push("The target span crosses a Dinner cut; review the phonological cut separately from morphology.");
          break;
        }
      }
    }
  }
  if (value.familyDecision !== "approve" && value.familyDecision !== "skip")
    blockers.push("Choose whether approved family exploration is available.");
  const familyEligibility = eligibility && object(eligibility.family) ? eligibility.family : null;
  const familyAuthorityReady = typeof value.familyAuthorityId === "string" && Boolean(value.familyAuthorityId.trim());
  if (value.familyDecision === "approve" && familyEligibility?.status === "ready" && !familyAuthorityReady)
    blockers.push("Family cannot be marked ready without its approved authority ID.");
  if (value.familyDecision === "approve" && familyEligibility?.status === "not_applicable" ||
    value.familyDecision === "skip" && familyEligibility?.status !== "not_applicable")
    blockers.push("Family eligibility must match the approved exploration decision.");
  if (!clip(value.sentenceRecording)) blockers.push("Bind reviewed sentence audio or an approved device-voice source and SHA-256.");
  else if (isDeviceSpeechSource(value.sentenceRecording.src) &&
    value.sentenceRecording.src !== deviceSpeechSource(input.dictationSentence))
    blockers.push("Device dictation voice must say the exact approved sentence.");
  const sentenceTarget = object(value.sentenceTarget) ? value.sentenceTarget : null;
  if (!sentenceTarget || !integer(sentenceTarget.start) || !integer(sentenceTarget.end) ||
    sentenceTarget.start < 0 || sentenceTarget.end <= sentenceTarget.start ||
    input.dictationSentence.slice(sentenceTarget.start, sentenceTarget.end).toLocaleLowerCase("en-GB") !==
      word.toLocaleLowerCase("en-GB") ||
    (sentenceTarget.start > 0 && /[\p{L}\p{N}]/u.test(input.dictationSentence[sentenceTarget.start - 1])) ||
    (sentenceTarget.end < input.dictationSentence.length && /[\p{L}\p{N}]/u.test(input.dictationSentence[sentenceTarget.end]))) {
    blockers.push("Bind the target word to its exact span in the complete dictation sentence.");
  }
  if (!input.definition.trim()) blockers.push("Add the shared child-friendly definition.");
  if (typeof value.reviewSourceReference !== "string" || !value.reviewSourceReference.trim())
    blockers.push("Record the editorial source for these lesson annotations.");
  return [...new Set(blockers)];
}

/** Exact editor control for each learner-content blocker. */
export function weakVowelBlockerTarget(message: string, skillKey: string): string {
  const prefix = `td-route-${skillKey}-weak-`;
  if (message.includes("source fingerprint")) return `${prefix}sourceFingerprint`;
  if (message.includes("editorial source")) return `${prefix}reviewSourceReference`;
  if (message.includes("word sense")) return `${prefix}wordSense`;
  if (message.includes("pronunciation facts")) return `${prefix}pronunciationId`;
  if (message.includes("word audio") || message.includes("word voice")) return `${prefix}wordAudio`;
  if (message.includes("spoken syllable count")) return `${prefix}syllableCount`;
  if (message.includes("syllable cut") || message.includes("Dinner cut") || message.includes("target span crosses")) return `${prefix}cuts`;
  if (message.includes("target spoken syllable")) return `${prefix}targetSyllable`;
  if (message.includes("weak-vowel sound type")) return `${prefix}soundType`;
  if (message.includes("target span") || message.includes("full ending") || message.includes("final -") || message.includes("initial ") || message.includes("medial weak")) return `${prefix}targetStart`;
  if (message.includes("written vowel letter")) return `${prefix}selectedVowel`;
  if (message.includes("Vowel Detective")) return `${prefix}selectedVowel`;
  if (message.includes("authority ID")) return `${prefix}familyAuthorityId`;
  if (message.includes("Family") || message.includes("family")) return `${prefix}familyDecision`;
  if (message.includes("sentence audio") || message.includes("sentence voice")) return `${prefix}sentenceAudio`;
  if (message.includes("target word to its exact span")) return `${prefix}sentenceStart`;
  if (message.includes("complete dictation sentence")) return "td-dictation";
  if (message.includes("definition")) return "td-definition";
  const activity = /Review (dinner|detective|memoryLock|dictation|family) activity|^(dinner|detective|memoryLock|dictation|family) is blocked/.exec(message);
  if (activity) return `td-route-${skillKey}-weak-activity-${activity[1] ?? activity[2]}`;
  return `td-route-${skillKey}-weak`;
}

/** Stable admin identifier paired with the exact editor control above. */
export function weakVowelBlockerCode(message: string, skillKey: string): string {
  const target = weakVowelBlockerTarget(message, skillKey);
  const field = target.replace(`td-route-${skillKey}-weak-`, "");
  if (field.startsWith("activity-")) return `weak_vowel_${field.replaceAll("-", "_")}`;
  const code: Record<string, string> = {
    sourceFingerprint: "weak_vowel_source_stale",
    reviewSourceReference: "weak_vowel_source_review_missing",
    wordSense: "weak_vowel_word_sense_unreviewed",
    pronunciationId: "weak_vowel_pronunciation_unreviewed",
    wordAudio: "weak_vowel_word_audio_missing",
    syllableCount: "weak_vowel_syllable_count_unreviewed",
    cuts: "weak_vowel_spoken_cuts_unreviewed",
    targetStart: "weak_vowel_target_unreviewed",
    targetSyllable: "weak_vowel_target_syllable_unreviewed",
    soundType: "weak_vowel_sound_type_unreviewed",
    selectedVowel: "weak_vowel_selected_vowel_unreviewed",
    familyAuthorityId: "weak_vowel_family_authority_missing",
    familyDecision: "weak_vowel_family_choice_unreviewed",
    sentenceAudio: "weak_vowel_sentence_audio_missing",
    sentenceStart: "weak_vowel_sentence_target_unreviewed",
  };
  if (target === "td-definition") return "weak_vowel_definition_missing";
  if (target === "td-dictation") return "weak_vowel_sentence_missing";
  return code[field] ?? "weak_vowel_route_facts_incomplete";
}
