"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { completeAdleLessonPartAction } from "@/app/learn/week/adle/actions";
import {
  BinSort,
  CoverShutter,
  DiffReveal,
  HearWordButton,
  SnapRail,
  SplitHandle,
} from "@/components/adle/activities/shared";
import { playInteractionSound } from "@/components/adle/activities/shared/sound";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import {
  morphologyResumeKey,
  normaliseMorphologyLessonResume,
  readMorphologyResume,
  writeMorphologyResume,
  type MorphologyLessonResumeState,
  type MorphologyLessonStage,
} from "@/lib/adle/morphology/resume";
import type {
  MorphologyLessonPayloadV1,
  MorphologyWordSnapshot,
} from "@/lib/adle/morphology/payload";
import { normaliseSessionWord } from "@/lib/adle/session-correctness";
import { WordLabScene } from "./word-lab-scene";

type Stage = MorphologyLessonStage;
type LessonState = MorphologyLessonResumeState;
const INITIAL: LessonState = {
  stage: "learn",
  introIndex: 0,
  discoverIndex: 0,
  discoverAddedPrefix: false,
  splitMisses: 0,
  splitCorrect: false,
  splitIndex: 0,
  matchComplete: false,
  buildIndex: 0,
  controlledIndex: 0,
  dictationIndex: 0,
  controlledAttempts: {},
  controlledChecked: {},
  sentenceAttempts: {},
  checkedSentence: false,
  guidedBindings: [],
  muted: false,
  helpLevel: 0,
  reflectionText: "",
};

function attemptsJson(entries: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(entries).map(([key, attemptText]) => ({ key, attemptText })),
  );
}
function bindingItem(
  items: readonly AdleSessionItem[],
  binding: string,
): AdleSessionItem | undefined {
  return items.find(
    (item) =>
      item.promptData.pilotActivityId === binding ||
      item.promptData.dynamicPrefixActivityId === binding,
  );
}

export function MorphologyGuidedLesson(props: {
  childId: string;
  assignmentId: string;
  items: AdleSessionItem[];
  payload: MorphologyLessonPayloadV1;
  onPreviewComplete?: (reflectionText: string) => void;
}) {
  const [state, setState] = useState<LessonState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const key = morphologyResumeKey(
    props.assignmentId,
    props.payload.contentVersion,
  );
  const guidedBindings = useMemo(
    () =>
      props.payload.activities.flatMap((activity) =>
        activity.evidenceMode === "guided_completion"
          ? activity.assignmentBindings
          : [],
      ),
    [props.payload.activities],
  );
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const restored = readMorphologyResume<unknown>(
        key,
        props.payload.contentVersion,
      );
      const normalised = normaliseMorphologyLessonResume(
        restored,
        props.payload.words.lesson.map((word) => word.canonicalWordId),
        guidedBindings,
      );
      if (normalised) setState(normalised);
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    guidedBindings,
    key,
    props.payload.contentVersion,
    props.payload.words.lesson,
  ]);
  useEffect(() => {
    if (hydrated)
      writeMorphologyResume(key, props.payload.contentVersion, state);
  }, [hydrated, key, props.payload.contentVersion, state]);
  const beat = useMemo(() => {
    if (state.stage === "learn")
      return (
        props.payload.guide.beats.filter(
          (candidate) => candidate.activityId === "introduction",
        )[state.introIndex] ?? props.payload.guide.beats[0]
      );
    if (state.stage === "discover")
      return (
        props.payload.guide.beats.filter(
          (candidate) => candidate.activityId === "discover",
        )[state.discoverIndex] ?? props.payload.guide.beats[0]
      );
    return (
      props.payload.guide.beats.find(
        (candidate) => candidate.activityId === activityId(state.stage),
      ) ?? props.payload.guide.beats[0]
    );
  }, [
    props.payload.guide.beats,
    state.discoverIndex,
    state.introIndex,
    state.stage,
  ]);
  const hasMeaningSort = props.payload.activities.some(
    (activity) => activity.type === "meaning_sort",
  );
  const phase =
    state.stage === "learn"
      ? 0
      : state.stage === "discover"
        ? 1
        : state.stage === "split"
          ? 2
          : state.stage === "match"
            ? 3
            : state.stage === "build"
              ? hasMeaningSort ? 4 : 3
              : hasMeaningSort ? 5 : 4;
  const update = (patch: Partial<LessonState>) =>
    setState((current) => ({ ...current, ...patch }));
  const completeBinding = (binding: string) =>
    update({
      guidedBindings: [...new Set([...state.guidedBindings, binding])],
    });
  const help =
    state.stage === "split" && state.splitMisses >= 2
      ? beat.onRepeatedMisconception
      : state.helpLevel === 0
        ? undefined
        : state.helpLevel === 1
          ? (beat.onHelpRequest ?? beat.onMisconception ?? beat.onSlip)
          : (beat.onRepeatedMisconception ??
            beat.onMisconception ??
            beat.onHelpRequest);
  if (!hydrated)
    return (
      <div className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">
        Preparing the Word Lab…
      </div>
    );
  return (
    <WordLabScene
      beat={beat}
      phase={phase}
      muted={state.muted}
      onMutedChange={(muted) => update({ muted })}
      silent={state.stage === "dictation" || state.stage === "controlled"}
      help={help}
      onHelp={() => update({ helpLevel: Math.min(2, state.helpLevel + 1) })}
      phases={hasMeaningSort ? undefined : ["Learn", "Discover", "Split", "Build", "Remember"]}
      phaseCues={hasMeaningSort ? undefined : ["Learn the idea", "Explore the meaning", "Find the word parts", "Build a word", "Remember and reflect"]}
    >
      {state.stage === "learn" ? (
        <LearnIntroduction
          payload={props.payload}
          index={state.introIndex}
          onNext={() =>
            state.introIndex < 2
              ? update({ introIndex: state.introIndex + 1, helpLevel: 0 })
              : update({ stage: "discover", helpLevel: 0 })
          }
        />
      ) : null}
      {state.stage === "discover" ? (
        <Discovery
          key={state.discoverIndex}
          payload={props.payload}
          index={state.discoverIndex}
          muted={state.muted}
          addedPrefix={state.discoverAddedPrefix}
          onAddPrefix={() => update({ discoverAddedPrefix: true })}
          onNext={() =>
            state.discoverIndex <
            (props.payload.activities.find(
              (candidate) => candidate.type === "discovery",
            )?.discoveryCards?.length ?? 1) -
              1
              ? update({
                  discoverIndex: state.discoverIndex + 1,
                  discoverAddedPrefix: false,
                  helpLevel: 0,
                })
              : update({
                  stage: "split",
                  discoverAddedPrefix: false,
                  helpLevel: 0,
                })
          }
        />
      ) : null}
      {state.stage === "split" ? (
        <SplitBuild
          key={state.splitIndex}
          word={props.payload.words.lesson.find((word) => word.canonicalWordId === (props.payload.activities.find((activity) => activity.type === "strip_build")?.wordIds?.[state.splitIndex] ?? props.payload.words.anchor.canonicalWordId)) ?? props.payload.words.anchor}
          misses={state.splitMisses}
          correct={state.splitCorrect}
          muted={state.muted}
          missMessage={beat.onSlip}
          repeatedMissMessage={beat.onRepeatedMisconception}
          onMiss={(splitMisses) => update({ splitMisses })}
          onCorrect={() => update({ splitCorrect: true })}
          onComplete={() => {
            completeBinding(
              props.payload.activities.find(
                (activity) => activity.type === "strip_build",
              )?.assignmentBindings[state.splitIndex] ?? "",
            );
            const splitCount = props.payload.activities.find((activity) => activity.type === "strip_build")?.assignmentBindings.length ?? 1;
            if (state.splitIndex + 1 < splitCount) {
              update({ splitIndex: state.splitIndex + 1, splitMisses: 0, splitCorrect: false, helpLevel: 0 });
            } else {
              const hasMeaningSort = props.payload.activities.some((activity) => activity.type === "meaning_sort");
              update({ stage: hasMeaningSort ? "match" : "build", helpLevel: 0 });
            }
          }}
        />
      ) : null}
      {state.stage === "match" ? (
        state.matchComplete ? (
          <MeaningOverview
            payload={props.payload}
            onNext={() => update({ stage: "build", helpLevel: 0 })}
          />
        ) : (
          <BinSort
            items={props.payload.words.lesson.map((word) => ({
              id: word.displayWord,
              text: word.displayWord,
              destination: word.effect,
            }))}
            bins={meaningBins(props.payload)}
            instruction="Read the word. Think about what the prefix means. Then choose the meaning label that fits."
            muted={state.muted}
            incorrectMessage={beat.onMisconception}
            repeatedIncorrectMessage={beat.onRepeatedMisconception}
            onComplete={() =>
              update({
                guidedBindings: [
                  ...new Set([
                    ...state.guidedBindings,
                    ...props.payload.words.lesson.map(
                      (word) => `guided-meaning-${word.canonicalWordId}`,
                    ),
                  ]),
                ],
                matchComplete: true,
                helpLevel: 0,
              })
            }
          />
        )
      ) : null}
      {state.stage === "build" ? (
        <PrefixBuild
          key={state.buildIndex}
          buildIndex={state.buildIndex}
          totalBuilds={props.payload.activities.find((activity) => activity.type === "prefix_choice")?.assignmentBindings.length ?? 1}
          activity={props.payload.activities.find((activity) => activity.type === "prefix_choice")!}
          beat={beat}
          muted={state.muted}
          onComplete={() => {
            completeBinding(
              props.payload.activities.find(
                (activity) => activity.type === "prefix_choice",
              )?.assignmentBindings[state.buildIndex] ?? "",
            );
            const buildCount = props.payload.activities.find((activity) => activity.type === "prefix_choice")?.assignmentBindings.length ?? 1;
            state.buildIndex + 1 < buildCount
              ? update({ buildIndex: state.buildIndex + 1, helpLevel: 0 })
              : update({ stage: "controlled", helpLevel: 0 });
          }}
        />
      ) : null}
      {state.stage === "controlled" ? (
        <Controlled
          index={state.controlledIndex}
          total={props.payload.words.lesson.length}
          word={props.payload.words.lesson[state.controlledIndex]}
          attempt={
            state.controlledAttempts[
              props.payload.words.lesson[state.controlledIndex].canonicalWordId
            ] ?? ""
          }
          checked={
            state.controlledChecked[
              props.payload.words.lesson[state.controlledIndex].canonicalWordId
            ] === true
          }
          muted={state.muted}
          onAttempt={(attempt) =>
            update({
              controlledAttempts: {
                ...state.controlledAttempts,
                [props.payload.words.lesson[state.controlledIndex]
                  .canonicalWordId]: attempt,
              },
            })
          }
          onChecked={() =>
            update({
              controlledChecked: {
                ...state.controlledChecked,
                [props.payload.words.lesson[state.controlledIndex]
                  .canonicalWordId]: true,
              },
            })
          }
          onNext={() =>
            state.controlledIndex < props.payload.words.lesson.length - 1
              ? update({
                  controlledIndex: state.controlledIndex + 1,
                  helpLevel: 0,
                })
              : update({ stage: "dictation", helpLevel: 0 })
          }
        />
      ) : null}
      {state.stage === "dictation" ? (
        <Dictation
          payload={props.payload}
          index={state.dictationIndex}
          value={
            state.sentenceAttempts[
              props.payload.words.lesson[state.dictationIndex].canonicalWordId
            ] ?? ""
          }
          checked={state.checkedSentence}
          muted={state.muted}
          onValue={(value) =>
            update({
              sentenceAttempts: {
                ...state.sentenceAttempts,
                [props.payload.words.lesson[state.dictationIndex]
                  .canonicalWordId]: value,
              },
            })
          }
          onCheck={() => update({ checkedSentence: true })}
          onNext={() =>
            state.dictationIndex < 3
              ? update({
                  dictationIndex: state.dictationIndex + 1,
                  checkedSentence: false,
                })
              : update({ stage: "reflect" })
          }
        />
      ) : null}
      {state.stage === "reflect" ? (
        <ReflectionForm
          state={state}
          payload={props.payload}
          childId={props.childId}
          assignmentId={props.assignmentId}
          items={props.items}
          onReflectionText={(reflectionText) => update({ reflectionText })}
          onPreviewComplete={props.onPreviewComplete}
        />
      ) : null}
    </WordLabScene>
  );
}

function activityId(stage: Stage): string {
  return stage === "learn"
    ? "introduction"
    : stage === "split"
      ? "strip-build"
      : stage === "match"
        ? "meaning-match"
        : stage === "build"
          ? "build-word"
          : stage === "controlled"
            ? "controlled-spelling"
            : stage === "reflect"
              ? "reflection"
              : stage;
}
function LearnIntroduction(props: {
  payload: MorphologyLessonPayloadV1;
  index: number;
  onNext: () => void;
}) {
  const activity = props.payload.activities.find(
    (candidate) => candidate.type === "introduction",
  )!;
  const screen = activity.introScreens![props.index];
  return (
    <section
      className="grid gap-5 text-center"
      aria-labelledby={`intro-${screen.id}`}
    >
      <div>
        <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">
          Learn {props.index + 1} of 3
        </p>
        <h1
          id={`intro-${screen.id}`}
          className="mt-2 text-3xl font-black text-white"
        >
          {screen.title}
        </h1>
      </div>
      <div className="mx-auto grid max-w-3xl gap-3">
        {screen.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-lg leading-8 text-cyan-50">
            {paragraph}
          </p>
        ))}
      </div>
      {screen.model ? (
        <div
          className="mx-auto flex flex-wrap items-center justify-center gap-3 rounded-3xl border border-cyan-300/20 bg-slate-950/45 p-5"
          aria-label={`${screen.model.prefix} plus ${screen.model.base} makes ${screen.model.result}`}
        >
          <span className="rounded-2xl bg-cyan-100 px-4 py-3 text-xl font-black text-cyan-950">
            {screen.model.prefix}
          </span>
          <span aria-hidden="true" className="text-2xl text-cyan-200">
            +
          </span>
          <span className="rounded-2xl bg-amber-100 px-4 py-3 text-xl font-black text-amber-950">
            {screen.model.base}
          </span>
          <span aria-hidden="true" className="text-2xl text-cyan-200">
            →
          </span>
          <span className="rounded-2xl bg-emerald-100 px-4 py-3 text-xl font-black text-emerald-950">
            {screen.model.result}
          </span>
        </div>
      ) : null}
      {screen.wordCards ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {screen.wordCards.map((card) => (
            <article
              key={`${card.base}-${card.derived}`}
              className="rounded-2xl bg-white p-4 text-left text-slate-950"
            >
              <p className="text-xl font-black">
                <span className="text-amber-700">{card.base}</span>
                <span aria-hidden="true" className="mx-2 text-slate-400">
                  →
                </span>
                <span className="text-cyan-800">{card.derived}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {card.meaning}
              </p>
            </article>
          ))}
        </div>
      ) : null}
      {screen.examples ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {screen.examples.map((example) => (
            <article key={example.word} className="rounded-2xl bg-white p-4 text-left text-slate-950">
              <p className="text-lg font-black"><span className="text-cyan-700">{example.prefix}</span> + <span className="text-amber-700">{example.base}</span></p>
              {example.prefixMeaning ? <p className="mt-2 text-sm font-black text-cyan-800">{example.prefix} means {example.prefixMeaning}</p> : null}
              <p className="mt-1 text-xl font-black text-cyan-900">{example.word}</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">{example.meaning}</p>
            </article>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={props.onNext}
        className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950"
      >
        {screen.ctaLabel}
      </button>
    </section>
  );
}
function Discovery(props: {
  payload: MorphologyLessonPayloadV1;
  index: number;
  muted: boolean;
  addedPrefix: boolean;
  onAddPrefix: () => void;
  onNext: () => void;
}) {
  const activity = props.payload.activities.find(
    (candidate) => candidate.type === "discovery",
  )!;
  const cards = activity.discoveryCards!;
  const card = cards[props.index];
  const prefix = card.prefixLabel ?? activity.prefixLabel ?? "un-";
  const legacy = !activity.prefixLabel && !card.prefixLabel;
  const [selected, setSelected] = useState<string | null>(null);
  const correct = selected === card.derivedMeaning;
  return (
    <div className="grid gap-5 text-center">
      <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-200">
        Watch the meaning change
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl border border-amber-200/40 bg-amber-50 p-5 text-amber-950">
          <p className="text-xs font-black uppercase tracking-[.18em]">
            {legacy ? "Before un-" : "Base or root word"}
          </p>
          <p className="mt-3 text-3xl font-black">{card.baseWord}</p>
          <p className="mt-2 text-lg font-bold">Base/root word meaning: {card.baseMeaning}</p>
        </section>
        <section className="rounded-3xl border border-cyan-200/40 bg-cyan-50 p-5 text-cyan-950">
          <p className="text-xs font-black uppercase tracking-[.18em]">
            {legacy ? "After un-" : "New word"}
          </p>
          <p className="mt-3 text-3xl font-black">
            {props.addedPrefix ? card.word : "?"}
          </p>
          <p className="mt-2 text-lg font-bold">
            {props.addedPrefix
              ? "New word meaning: choose the best match"
              : "Add the prefix to find out"}
          </p>
        </section>
      </div>
      {!props.addedPrefix ? (
        <button
          type="button"
          onClick={() => {
            playInteractionSound("select", props.muted);
            props.onAddPrefix();
          }}
          className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950"
        >
          {legacy ? "Add un-" : `Add ${prefix}`}
        </button>
      ) : (
        <div className="grid gap-3">
          <p className="font-black text-white">What does {card.word} mean?</p>
          <div
            role="group"
            aria-label={`Choose the meaning of ${card.word}`}
            className="grid gap-3 sm:grid-cols-2"
          >
            {(props.index % 2 === 0
              ? [card.derivedMeaning, card.distractorMeaning]
              : [card.distractorMeaning, card.derivedMeaning]
            ).map((meaning) => (
              <button
                type="button"
                key={meaning}
                aria-pressed={selected === meaning}
                onClick={() => {
                  playInteractionSound(
                    meaning === card.derivedMeaning ? "snap" : "resist",
                    props.muted,
                  );
                  setSelected(meaning);
                }}
                className={`min-h-20 rounded-2xl border p-4 text-lg font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40 ${selected === meaning ? (meaning === card.derivedMeaning ? "border-emerald-300 bg-emerald-100 text-emerald-950" : "border-red-300 bg-red-100 text-red-950") : "border-cyan-300/40 bg-white/10 text-white"}`}
              >
                {meaning}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="min-h-6 font-semibold text-cyan-50">
            {selected === null
              ? `Choose the meaning that ${prefix} makes.`
              : correct
                ? `Yes — ${card.word} means ${card.derivedMeaning}.`
                : `Try again. Think about what ${prefix} changes.`}
          </p>
          {correct ? (
            <button
              type="button"
              onClick={() => {
                playInteractionSound("select", props.muted);
                props.onNext();
              }}
              className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950"
            >
              {props.index < cards.length - 1
                ? "Try another word"
                : "Find the word parts"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
function SplitBuild(props: {
  word: MorphologyWordSnapshot;
  misses: number;
  correct: boolean;
  muted: boolean;
  missMessage?: string;
  repeatedMissMessage?: string;
  onMiss: (misses: number) => void;
  onCorrect: () => void;
  onComplete: () => void;
}) {
  const prefix = props.word.parts.find((part) => part.role === "prefix")?.text;
  const baseOrRoot = props.word.parts.filter((part) => part.role !== "prefix").map((part) => part.text).join("");
  return (
    <SplitHandle
      word={props.word.displayWord}
      splitPoints={props.word.splitPoints}
      misses={props.misses}
      correct={props.correct}
      muted={props.muted}
      missMessage={props.missMessage}
      repeatedMissMessage={props.repeatedMissMessage}
      correctHeading={prefix ? `Yes — ${prefix}- is at the front of the word.` : undefined}
      correctExplanation={prefix && baseOrRoot ? `${prefix} + ${baseOrRoot} makes ${props.word.displayWord}.` : undefined}
      onMiss={props.onMiss}
      onCorrect={props.onCorrect}
      onContinue={props.onComplete}
    />
  );
}
function meaningBins(payload: MorphologyLessonPayloadV1) {
  return (
    payload.activities.find((activity) => activity.type === "meaning_sort")
      ?.meaningBins ?? [
      {
        id: "not",
        label: "NOT",
        description: "un- changes the meaning to not",
      },
      {
        id: "reverse",
        label: "REVERSE",
        description: "un- reverses an action",
      },
    ]
  );
}
function MeaningCards(props: { payload: MorphologyLessonPayloadV1 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {meaningBins(props.payload).map((bin, index) => (
        <div
          key={bin.id}
          className={`rounded-2xl p-4 text-center ${index % 2 ? "bg-amber-100 text-amber-950" : "bg-cyan-100 text-cyan-950"}`}
        >
          <p className="font-black">{bin.label}</p>
          <p>
            {props.payload.words.lesson
              .filter((word) => word.effect === bin.id)
              .map((word) => word.displayWord)
              .join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}
function MeaningOverview(props: {
  payload: MorphologyLessonPayloadV1;
  onNext: () => void;
}) {
  const activity = props.payload.activities.find(
    (candidate) => candidate.type === "meaning_sort",
  );
  const prefix = activity?.prefixLabel ?? "un-";
  return (
    <section
      className="grid gap-5 text-center"
      aria-labelledby="meaning-overview-heading"
    >
      <div>
        <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">
          What {prefix} can do
        </p>
        <h2
          id="meaning-overview-heading"
          className="mt-1 text-3xl font-black text-white"
        >
          {activity?.prefixLabel
            ? "Meaning patterns, four words"
            : "Two jobs, four words"}
        </h2>
      </div>
      <MeaningCards payload={props.payload} />
      <button
        type="button"
        onClick={props.onNext}
        className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950"
      >
        Build a word
      </button>
    </section>
  );
}
function PrefixBuild(props: {
  activity: NonNullable<MorphologyLessonPayloadV1["activities"][number]>;
  buildIndex: number;
  totalBuilds: number;
  beat: MorphologyLessonPayloadV1["guide"]["beats"][number];
  muted: boolean;
  onComplete: () => void;
}) {
  const build = props.activity.builds?.[props.buildIndex];
  const [message, setMessage] = useState("");
  const [misses, setMisses] = useState(0);
  const choices = build?.prefixChoices ?? props.activity.prefixChoices ?? [];
  const target = choices.find((choice) => choice.status === "target");
  const baseWord = build?.baseWord ?? props.activity.baseWord ?? "base word";
  const targetMeaning = build?.targetMeaning ?? props.activity.targetMeaning;
  return (
    <div className="grid gap-4">
      {props.totalBuilds > 1 ? (
        <p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">
          Build a word {props.buildIndex + 1} of {props.totalBuilds}
        </p>
      ) : null}
      {targetMeaning ? (
        <h2 className="text-center text-3xl font-black text-white">
          Build the word that means “{targetMeaning}”
        </h2>
      ) : null}
      <SnapRail
        tiles={choices.map((choice) => ({
          id: choice.text,
          text: choice.label,
          role: "prefix" as const,
          gloss: choice.meaning ?? undefined,
        }))}
        expectedIds={target ? [target.text] : []}
        fixedTiles={[{ id: baseWord, text: baseWord, role: "base" }]}
        fixedTilesPosition="after"
        label={targetMeaning ? `Build the word meaning ${targetMeaning}` : `Choose a prefix for ${baseWord}`}
        muted={props.muted}
        onComplete={props.onComplete}
        onInvalid={(ids) => {
          const choice = choices.find((candidate) => candidate.text === ids[0]);
          const nextMisses = misses + 1;
          setMisses(nextMisses);
          setMessage(
            choice?.status === "valid_alternative"
              ? `${choice.outcome ?? choice.label} means ${choice.meaning}. ${props.beat.onPartial ?? "Choose the prefix that makes this word."}`
              : nextMisses > 1
                ? (props.beat.onRepeatedMisconception ??
                  `Choose ${target?.label ?? "the right prefix"} to make the word.`)
                : (props.beat.onMisconception ??
                  `That prefix does not make the word we need with ${baseWord}.`),
          );
        }}
      />
      <p
        aria-live="polite"
        className="min-h-6 text-center font-semibold text-cyan-100"
      >
        {message}
      </p>
    </div>
  );
}
function Controlled(props: {
  index: number;
  total: number;
  word: MorphologyWordSnapshot;
  attempt: string;
  checked: boolean;
  muted: boolean;
  onAttempt: (attempt: string) => void;
  onChecked: () => void;
  onNext: () => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">
        Word to remember {props.index + 1} of {props.total}
      </p>
      <CoverShutter
        key={props.word.canonicalWordId}
        word={props.word.displayWord}
        splitPoints={props.word.splitPoints}
        initialAttempt={props.attempt}
        initialState={
          props.checked ? "check" : props.attempt ? "write" : "look"
        }
        muted={props.muted}
        onStateChange={(_, attempt) => attempt && props.onAttempt(attempt)}
        onComplete={(attempt) => {
          props.onAttempt(attempt);
          props.onChecked();
        }}
      />
      {props.checked ? (
        <button
          type="button"
          onClick={props.onNext}
          className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950"
        >
          Continue
        </button>
      ) : null}
    </div>
  );
}
function Dictation(props: {
  payload: MorphologyLessonPayloadV1;
  index: number;
  value: string;
  checked: boolean;
  muted: boolean;
  onValue: (value: string) => void;
  onCheck: () => void;
  onNext: () => void;
}) {
  const activity = props.payload.activities.find(
    (candidate) => candidate.type === "sentence_dictation",
  )!;
  const sentence = activity.sentences![props.index];
  return (
    <div className="grid gap-4">
      <p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">
        Sentence {props.index + 1} of 4
      </p>
      <div className="flex justify-center">
        <HearWordButton
          word={sentence.sentence}
          label="Play sentence"
          muted={props.muted}
          kind="dictation"
        />
      </div>
      <label className="text-sm font-semibold text-cyan-50">
        Write the whole sentence
        <textarea
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="sentences"
          value={props.value}
          onChange={(event) => props.onValue(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-2xl bg-white p-4 text-lg text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
        />
      </label>
      {!props.checked ? (
        <button
          type="button"
          disabled={!props.value.trim()}
          onClick={props.onCheck}
          className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40"
        >
          Check sentence
        </button>
      ) : (
        <>
          <DiffReveal
            attempt={props.value}
            expected={sentence.sentence}
            mode="sentence"
          />
          <button
            type="button"
            onClick={props.onNext}
            className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950"
          >
            {props.index < 3 ? "Next sentence" : "See what you discovered"}
          </button>
        </>
      )}
    </div>
  );
}

function ReflectionForm(props: {
  state: LessonState;
  payload: MorphologyLessonPayloadV1;
  childId: string;
  assignmentId: string;
  items: AdleSessionItem[];
  onReflectionText: (value: string) => void;
  onPreviewComplete?: (reflectionText: string) => void;
}) {
  const [finishing, setFinishing] = useState(false);
  const [completionTraceId] = useState(() => crypto.randomUUID());
  const reflection = props.payload.activities.find(
    (activity) => activity.type === "reflection",
  )!;
  const dictation = props.payload.activities.find(
    (activity) => activity.type === "sentence_dictation",
  )!;
  const controlledMisses = props.payload.words.lesson
    .filter(
      (word) =>
        normaliseSessionWord(
          props.state.controlledAttempts[word.canonicalWordId] ?? "",
        ) !== normaliseSessionWord(word.displayWord),
    )
    .map((word) => ({
      label: word.displayWord,
      detail: `You wrote “${props.state.controlledAttempts[word.canonicalWordId] || "nothing"}”.`,
    }));
  const sentenceMisses = (dictation.sentences ?? [])
    .filter(
      (sentence) =>
        (
          props.state.sentenceAttempts[sentence.canonicalWordId] ?? ""
        ).trim() !== sentence.sentence,
    )
    .map((sentence) => ({
      label: sentence.targetWord,
      detail: `Compare “${props.state.sentenceAttempts[sentence.canonicalWordId] || "nothing"}” with “${sentence.sentence}”.`,
    }));
  const misses = [...controlledMisses, ...sentenceMisses];
  const ready = props.state.reflectionText.trim().length > 0;
  return (
    <form
      action={
        props.onPreviewComplete ? undefined : completeAdleLessonPartAction
      }
      onSubmit={(event) => {
        if (props.onPreviewComplete) {
          event.preventDefault();
          props.onPreviewComplete?.(props.state.reflectionText);
        } else {
          const startedAt = performance.now();
          try {
            sessionStorage.setItem(
              `adle:word-lab:completion:${completionTraceId}`,
              String(Date.now()),
            );
          } catch {
            /* Timing storage must never block completion. */
          }
          setFinishing(true);
          requestAnimationFrame(() =>
            console.info(
              JSON.stringify({
                event: "adle_word_lab_browser_timing",
                traceId: completionTraceId,
                stage: "immediate_feedback",
                durationMs:
                  Math.round((performance.now() - startedAt) * 10) / 10,
              }),
            ),
          );
        }
      }}
      className="relative grid w-full gap-5"
    >
      {finishing && !props.onPreviewComplete ? (
        <section
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 grid content-center gap-4 rounded-3xl bg-slate-950 p-8 text-center"
        >
          <p className="text-4xl" aria-hidden="true">
            🎉
          </p>
          <h2 className="text-2xl font-black text-white">
            Your Word Lab is complete!
          </h2>
          <p className="text-cyan-50">Saving your work now…</p>
        </section>
      ) : null}
      <input type="hidden" name="mode" value="child" />
      <input type="hidden" name="childId" value={props.childId} />
      <input type="hidden" name="assignmentId" value={props.assignmentId} />
      <input type="hidden" name="completionTraceId" value={completionTraceId} />
      <input
        type="hidden"
        name="attempts"
        value={attemptsJson(props.state.controlledAttempts)}
      />
      <input
        type="hidden"
        name="dictationSentenceAttempts"
        value={attemptsJson(props.state.sentenceAttempts)}
      />
      <input type="hidden" name="dictationAttempts" value="[]" />
      <input type="hidden" name="probeAttempts" value="[]" />
      <input
        type="hidden"
        name="guidedAttempts"
        value={attemptsJson(
          Object.fromEntries(
            props.state.guidedBindings.map((binding) => [
              bindingItem(props.items, binding)?.id ?? binding,
              "",
            ]),
          ),
        )}
      />
      <section
        className="rounded-3xl border border-white/15 bg-white/[.07] p-4 text-left"
        aria-labelledby="remember-recap-heading"
      >
        <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">
          Remember recap
        </p>
        <h2
          id="remember-recap-heading"
          className="mt-1 text-xl font-black text-white"
        >
          {misses.length
            ? "A few things to look at again"
            : "You remembered the targets"}
        </h2>
        {misses.length ? (
          <ul className="mt-3 grid gap-2">
            {misses.map((miss, index) => (
              <li
                key={`${miss.label}-${index}`}
                className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-950"
              >
                <span className="font-black">{miss.label}:</span> {miss.detail}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-cyan-50">
            Use your reflection to explain the pattern you noticed.
          </p>
        )}
      </section>
      <label className="text-left text-base font-black text-white">
        {reflection.promptText}
        <textarea
          name="learningReflection"
          required
          maxLength={2000}
          autoFocus
          value={props.state.reflectionText}
          onChange={(event) => props.onReflectionText(event.target.value)}
          className="mt-2 min-h-32 w-full rounded-2xl bg-white p-4 text-lg font-normal text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
        />
      </label>
      {ready ? (
        <>
          <MeaningCards payload={props.payload} />
          <FinishWordLabButton />
        </>
      ) : (
        <p className="text-center text-sm font-semibold text-cyan-100">
          Write one thing you noticed to finish the Word Lab.
        </p>
      )}
    </form>
  );
}

function FinishWordLabButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-live="polite"
      className="min-h-14 rounded-full bg-cyan-300 px-8 text-lg font-black text-slate-950 disabled:cursor-wait disabled:opacity-80"
    >
      {pending ? "Finishing your Word Lab…" : "Finish the Word Lab"}
    </button>
  );
}
