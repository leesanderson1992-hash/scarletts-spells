"use client";

import { britishPronunciationSample, wordClipMatchesPronunciation } from "@/lib/teaching-dictionary-manager/pronunciation-playback";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { DictationListen } from "./dictation-listen";

export function PronunciationListen(props: {
  word: string; ipa: string; sentence?: string;
  approvedWord: string | null; approvedSenseSet: DictionarySenseSet | null;
  wordRecordingSrc?: string;
}) {
  const reviewedSrc = wordClipMatchesPronunciation(props) ? props.wordRecordingSrc : undefined;
  const sample = reviewedSrc ? null : britishPronunciationSample(props.word, props.ipa);
  const src = reviewedSrc ?? sample?.src;
  // Browser speech cannot consume IPA. Sentence context is safer than asking it
  // to guess a heteronym from its spelling; make that fallback explicit.
  const text = src ? props.word : props.sentence?.trim() || props.word;
  return <div className="mt-2 space-y-1">
    <DictationListen key={`${props.word}:${props.ipa}:${text}:${src ?? "device"}`} sentence={text} kind="word"
      recordingSrc={src} label="Listen to word"
      recordingDescription="✓ British recording available"
      fallbackDescription={props.sentence?.trim() ? "British recording missing · Device voice uses sentence context" : "British recording missing · Device voice may guess pronunciation"} />
  </div>;
}
