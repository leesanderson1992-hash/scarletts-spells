"use client";

import { britishPronunciationSample, wordClipMatchesPronunciation } from "@/lib/teaching-dictionary-manager/pronunciation-playback";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { DictationListen } from "./dictation-listen";

export function PronunciationListen(props: {
  word: string; ipa: string;
  approvedWord: string | null; approvedSenseSet: DictionarySenseSet | null;
  wordRecordingSrc?: string;
}) {
  const reviewedSrc = wordClipMatchesPronunciation(props) ? props.wordRecordingSrc : undefined;
  const sample = reviewedSrc ? null : britishPronunciationSample(props.word, props.ipa);
  const src = reviewedSrc ?? sample?.src;
  // This control always speaks the isolated word. A missing pronunciation clip
  // must never turn it into the separate dictation-sentence control.
  const text = props.word;
  return <div className="mt-2 space-y-1">
    <DictationListen key={`${props.word}:${props.ipa}:${text}:${src ?? "device"}`} sentence={text} kind="word"
      recordingSrc={src} label="Listen to word"
      recordingDescription="✓ British recording available"
      fallbackDescription="British word recording missing · Device voice may guess pronunciation" />
  </div>;
}
