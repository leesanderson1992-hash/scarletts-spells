"use client";

import { useState } from "react";
import { HearWordButton } from "@/components/adle/activities/shared/authored-audio";
import type { BritishRecording } from "@/lib/teaching-dictionary-manager/british-recordings";
import { approveDictionaryBritishRecording } from "./recording-actions";

const audioPath = /^\/audio\/[a-z0-9/_-]+\.(?:mp3|m4a|wav)$/i;

function RecordingRow(props: { wordId: string; kind: "word" | "sentence"; text: string; clip: BritishRecording | null }) {
  const [candidate, setCandidate] = useState("");
  return <div className="rounded-xl border border-[var(--border)] p-4">
    <h3 className="font-semibold">{props.kind === "word" ? "Word pronunciation" : "Dictation sentence"}</h3>
    <p className="mt-1 text-sm">{props.text}</p>
    <p className="mt-2 text-sm font-semibold text-amber-900">{props.clip
      ? `Reviewed British recording · ${props.clip.source === "dictionary" ? "dictionary" : "Schwa route"}`
      : "Device voice · British recording improvement needed"}</p>
    <div className="mt-2 flex flex-wrap items-center gap-3">
      {props.clip ? <audio controls preload="none" src={props.clip.src} aria-label={`Play reviewed British ${props.kind} recording`} />
        : <HearWordButton word={props.text} kind={props.kind === "sentence" ? "dictation" : "word"} label="Hear device voice" />}
    </div>
    <form action={approveDictionaryBritishRecording} className="mt-4 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="word_id" value={props.wordId} />
      <input type="hidden" name="kind" value={props.kind} />
      <label className="text-sm">Published British recording path
        <input className="mt-1 w-full rounded-lg border p-2" name="recording_src" value={candidate}
          onChange={event => setCandidate(event.target.value)} placeholder="/audio/…/word.mp3" required />
      </label>
      <label className="text-sm">Recording source and review reference
        <input className="mt-1 w-full rounded-lg border p-2" name="source_reference"
          placeholder="Voice, recording batch, and review notes" required maxLength={1000} />
      </label>
      {audioPath.test(candidate) && <audio className="sm:col-span-2" controls preload="none" src={candidate}
        aria-label={`Preview candidate British ${props.kind} recording`} />}
      <button className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white sm:col-span-2"
        type="submit">Approve this British recording</button>
    </form>
  </div>;
}

export function BritishRecordingPanel(props: {
  wordId: string; word: string; sentence: string | null;
  wordClip: BritishRecording | null; sentenceClip: BritishRecording | null;
}) {
  return <section className="rounded-2xl border border-[var(--border)] bg-white p-5" aria-labelledby="dictionary-audio-heading">
    <h2 id="dictionary-audio-heading" className="text-lg font-semibold">British recordings</h2>
    <p className="mt-1 text-sm">Reviewed British clips take priority. Device voice is the backup while a clip is awaiting review. Approvals are bound to this exact word or approved sentence; older recordings remain in the audit history.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <RecordingRow wordId={props.wordId} kind="word" text={props.word} clip={props.wordClip} />
      {props.sentence ? <RecordingRow wordId={props.wordId} kind="sentence" text={props.sentence} clip={props.sentenceClip} />
        : <p className="rounded-xl border border-[var(--border)] p-4 text-sm">Approve a dictation sentence before adding its British recording.</p>}
    </div>
  </section>;
}
