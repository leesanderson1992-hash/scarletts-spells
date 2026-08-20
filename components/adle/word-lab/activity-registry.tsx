"use client";

import { useState, type ReactNode } from "react";

import { CoverShutter } from "@/components/adle/activities/shared/cover-shutter";
import { SentenceDictation } from "@/components/adle/activities/shared/sentence-dictation";

import type {
  CompiledWordLabSnapshotV1,
  WordLabActivityResultV1,
} from "@/lib/adle/word-lab/contracts";
import { wordLabActivityContractKey } from "@/lib/adle/word-lab/contracts";

export interface WordLabActivityPluginProps {
  activity: CompiledWordLabSnapshotV1["activities"][number];
  words: readonly CompiledWordLabSnapshotV1["words"][number][];
  initialState: unknown;
  muted: boolean;
  reducedMotion: boolean;
  onStateChange: (state: unknown) => void;
  onReflectionChange: (reflection: string) => void;
  onComplete: (result: WordLabActivityResultV1) => void;
}

export type WordLabActivityPluginRenderer = (props: WordLabActivityPluginProps) => ReactNode;

export function shouldShowWordLabAnswer(
  visibility: CompiledWordLabSnapshotV1["activities"][number]["answerVisibility"],
  submitted: boolean,
): boolean {
  return visibility === "teaching_visible" || (visibility === "post_submit_only" && submitted);
}

function FixtureActivity(props: WordLabActivityPluginProps) {
  const [response, setResponse] = useState(
    typeof props.initialState === "object" && props.initialState !== null &&
    typeof (props.initialState as Record<string, unknown>).response === "string"
      ? (props.initialState as Record<string, unknown>).response as string
      : "",
  );
  const isReflection = props.activity.kind === "reflection";
  const teachingVisible = shouldShowWordLabAnswer(props.activity.answerVisibility, false);
  const title = typeof props.activity.config.title === "string"
    ? props.activity.config.title
    : props.activity.kind.replaceAll("_", " ");
  const prompt = typeof props.activity.config.prompt === "string"
    ? props.activity.config.prompt
    : isReflection
      ? "What will help you remember this spelling?"
      : "Try this activity, then continue when you are ready.";

  function update(value: string) {
    setResponse(value);
    props.onStateChange({ response: value });
    if (isReflection) props.onReflectionChange(value);
  }

  return (
    <section className="grid gap-5" aria-labelledby={`${props.activity.activityId}-title`}>
      <div className="grid gap-2 text-center">
        <p className="brand-eyebrow">Word Lab activity</p>
        <h2 id={`${props.activity.activityId}-title`} className="text-3xl font-black capitalize text-[color:var(--ink)]">
          {title}
        </h2>
        <p className="text-[color:var(--mid)]">{prompt}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3" aria-label="Lesson words">
        {props.words.map((word) => (
          <span key={word.slotId} className="rounded-2xl bg-cyan-50 px-4 py-3 font-black text-cyan-950">
            {teachingVisible ? word.displayWord : "••••"}
          </span>
        ))}
      </div>

      <label className="grid gap-2 font-bold text-[color:var(--ink)]">
        {isReflection ? "My remembering idea" : "My response"}
        <textarea
          className="min-h-28 rounded-2xl border border-cyan-200 bg-white p-4 font-medium outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
          value={response}
          onChange={(event) => update(event.target.value)}
          placeholder={isReflection ? "I will remember…" : "Type or describe your answer…"}
        />
      </label>

      <p className="text-center text-xs text-[color:var(--mid)]">
        {props.reducedMotion ? "Reduced motion is on." : "Calm transitions are available."}
        {props.muted ? " Sound is muted." : " Sound is available."}
      </p>

      <button
        type="button"
        className="brand-primary-btn mx-auto"
        disabled={response.trim().length === 0 && !teachingVisible}
        onClick={() => props.onComplete({
          activityId: props.activity.activityId,
          contractVersion: props.activity.contractVersion,
          completed: true,
          response: { text: response },
        })}
      >
        {isReflection ? "Save my idea" : "Activity complete"}
      </button>
    </section>
  );
}

function CanonicalCoverCheckFixture(props: WordLabActivityPluginProps) {
  const [index, setIndex] = useState(0);
  const word = props.words[index];
  if (!word) return null;
  return (
    <CoverShutter
      key={word.slotId}
      word={word.displayWord}
      splitPoints={[]}
      stepLabel={`Cover check ${index + 1} of ${props.words.length}`}
      muted={props.muted}
      onStateChange={(state, attempt) => props.onStateChange({ index, state, attempt })}
      onComplete={() => undefined}
      continueLabel={index === props.words.length - 1 ? "Complete Cover Check" : "Next word"}
      onContinue={() => {
        if (index < props.words.length - 1) {
          setIndex((current) => current + 1);
          return;
        }
        props.onComplete({
          activityId: props.activity.activityId,
          contractVersion: props.activity.contractVersion,
          completed: true,
          response: { canonicalRenderer: "CoverShutter" },
        });
      }}
    />
  );
}

function CanonicalSentenceDictationFixture(props: WordLabActivityPluginProps) {
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const word = props.words[index];
  const sentences = props.activity.config.sentences;
  const sentence = word && sentences && typeof sentences === "object"
    ? (sentences as Record<string, unknown>)[word.displayWord]
    : null;
  if (!word || typeof sentence !== "string") return null;
  return (
    <SentenceDictation
      key={word.slotId}
      stepLabel={`Sentence ${index + 1} of ${props.words.length}`}
      audioText={sentence}
      correctSentence={sentence}
      value={value}
      checked={checked}
      muted={props.muted}
      onValueChange={(next) => {
        setValue(next);
        props.onStateChange({ index, value: next, checked: false });
      }}
      onCheck={() => {
        setChecked(true);
        props.onStateChange({ index, value, checked: true });
      }}
      continueLabel={index === props.words.length - 1 ? "Complete Sentence Dictation" : "Next sentence"}
      onContinue={() => {
        if (index < props.words.length - 1) {
          setIndex((current) => current + 1);
          setValue("");
          setChecked(false);
          return;
        }
        props.onComplete({
          activityId: props.activity.activityId,
          contractVersion: props.activity.contractVersion,
          completed: true,
          response: { canonicalRenderer: "SentenceDictation" },
        });
      }}
    />
  );
}

const pluginEntries = [
  ["strategy_notice", 1, (props: WordLabActivityPluginProps) => <FixtureActivity {...props} />],
  ["guided_map", 1, (props: WordLabActivityPluginProps) => <FixtureActivity {...props} />],
  ["cover_check", 1, (props: WordLabActivityPluginProps) => <CanonicalCoverCheckFixture {...props} />],
  ["dictation", 1, (props: WordLabActivityPluginProps) => <CanonicalSentenceDictationFixture {...props} />],
  ["reflection", 1, (props: WordLabActivityPluginProps) => <FixtureActivity {...props} />],
] as const;

const plugins = new Map<string, WordLabActivityPluginRenderer>(
  pluginEntries.map(([kind, version, plugin]) => [wordLabActivityContractKey(kind, version), plugin]),
);

export const COMMON_WORD_LAB_ACTIVITY_CONTRACTS: ReadonlySet<string> = new Set(plugins.keys());

export function resolveWordLabActivityPlugin(kind: string, contractVersion: number): WordLabActivityPluginRenderer | null {
  return plugins.get(wordLabActivityContractKey(kind, contractVersion)) ?? null;
}

export function WordLabActivityHost(props: WordLabActivityPluginProps) {
  const render = resolveWordLabActivityPlugin(props.activity.kind, props.activity.contractVersion);
  return render ? render(props) : null;
}
