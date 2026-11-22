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
      recordingDescription={reviewedSrc ? "✓ British recording available" : "British pronunciation sample"}
      fallbackDescription={props.sentence?.trim() ? "British recording missing · Device voice uses sentence context" : "British recording missing · Device voice may guess pronunciation"} />
    {sample && <p className="text-xs text-[color:var(--mid)]">
      <a className="underline" href={sample.sourceUrl} target="_blank" rel="noreferrer">{sample.author}</a>
      {" · "}<a className="underline" href={sample.licenceUrl} target="_blank" rel="noreferrer">CC BY 3.0 US</a>{" · MP3 conversion"}
    </p>}
  </div>;
}
