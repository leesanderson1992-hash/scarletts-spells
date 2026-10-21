"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { DraggableTile } from "@/components/adle/activities/shared/draggable-tile";
import {
  correctVowelTile, maskedDetectiveWord, missingVowelIndex, toggleDetectiveClue,
  type DetectiveActivityConfigV1, type DetectiveClue, type DetectiveFamilyMemberV1,
  type DetectiveRoundV1, type VowelTile,
} from "@/lib/adle/word-lab/family-tree-detective";

const TILES = ["A", "E", "I", "O", "U", "Y"] as const;
const CLUES: readonly { key: DetectiveClue; label: string }[] = [
  { key: "clearer_sound", label: "I hear the vowel more clearly" },
  { key: "meaningful_part", label: "A meaningful word part helps me" },
  { key: "same_spelling", label: "The family keeps this spelling" },
  { key: "no_helpful_clue", label: "No helpful clue here" },
];

interface DetectiveWordState {
  phase: "initial" | "explore" | "final" | "done";
  selectedTile: VowelTile | null;
  initialChoice: VowelTile | null;
  finalChoice: VowelTile | null;
  clues: Record<string, DetectiveClue[]>;
  heardWordIds: string[];
}
interface DetectiveState { index: number; words: Record<string, DetectiveWordState> }

const emptyWord = (): DetectiveWordState => ({
  phase: "initial", selectedTile: null, initialChoice: null, finalChoice: null, clues: {}, heardWordIds: [],
});
const tile = (value: unknown): value is VowelTile => TILES.some((item) => item === value);

function restore(value: unknown, config: DetectiveActivityConfigV1): DetectiveState {
  if (!value || typeof value !== "object") return { index: 0, words: {} };
  const saved = value as Partial<DetectiveState>;
  const words: Record<string, DetectiveWordState> = {};
  for (const round of config.rounds) {
    const candidate = saved.words?.[round.canonicalWordId];
    if (!candidate || !["initial", "explore", "final", "done"].includes(candidate.phase) ||
      !(candidate.initialChoice === null || tile(candidate.initialChoice)) ||
      !(candidate.finalChoice === null || tile(candidate.finalChoice)) ||
      (candidate.phase === "explore" && (!round.family || !candidate.initialChoice)) ||
      (candidate.phase === "final" && !candidate.initialChoice) ||
      (candidate.phase === "done" && (!candidate.initialChoice ||
        (round.family || candidate.initialChoice !== correctVowelTile(round)) && !candidate.finalChoice))) continue;
    const validIds = new Set(round.family?.members.map((member) => member.canonicalWordId) ?? [round.canonicalWordId]);
    const clues: Record<string, DetectiveClue[]> = {};
    for (const [id, values] of Object.entries(candidate.clues ?? {})) {
      if (!validIds.has(id) || !Array.isArray(values)) continue;
      const chosen = values.filter((clue): clue is DetectiveClue => CLUES.some((item) => item.key === clue));
      if (chosen.includes("no_helpful_clue")) clues[id] = ["no_helpful_clue"];
      else clues[id] = [...new Set(chosen)];
    }
    words[round.canonicalWordId] = {
      phase: candidate.phase,
      selectedTile: tile(candidate.selectedTile) ? candidate.selectedTile : null,
      initialChoice: candidate.initialChoice,
      finalChoice: candidate.finalChoice,
      clues,
      heardWordIds: Array.isArray(candidate.heardWordIds)
        ? [...new Set(candidate.heardWordIds.filter((id): id is string => typeof id === "string" && validIds.has(id)))] : [],
    };
  }
  const index = Number.isInteger(saved.index) && saved.index! >= 0 && saved.index! < config.rounds.length ? saved.index! : 0;
  return { index, words };
}

function SpellingWithHighlight(props: { spelling: string; start: number; end: number; preservedBaseEnd?: number }) {
  const boundaries = [...new Set([0, props.start, props.end, props.preservedBaseEnd ?? 0, props.spelling.length])]
    .filter((value) => value >= 0 && value <= props.spelling.length).sort((a, b) => a - b);
  return <span>{boundaries.slice(0, -1).map((from, index) => {
    const to = boundaries[index + 1];
    const text = props.spelling.slice(from, to);
    if (from >= props.start && to <= props.end) return <mark key={from} className="rounded bg-amber-200 px-0.5 text-amber-950">{text}</mark>;
    if (props.preservedBaseEnd && to <= props.preservedBaseEnd) return <mark key={from} className="rounded bg-cyan-100 px-0.5 text-cyan-950">{text}</mark>;
    return <span key={from}>{text}</span>;
  })}</span>;
}

function FamilyCard(props: {
  member: DetectiveFamilyMemberV1;
  round: DetectiveRoundV1;
  chosen: readonly DetectiveClue[];
  muted: boolean;
  onHear: () => void;
  onClue: (clue: DetectiveClue) => void;
}) {
  const isTarget = props.member.canonicalWordId === props.round.canonicalWordId;
  const span = isTarget
    ? { start: missingVowelIndex(props.round)!, end: missingVowelIndex(props.round)! + 1 }
    : props.member.alignedVowelSpan;
  const canHear = isTarget || props.member.recording !== null;
  return <article className={`rounded-3xl border-2 p-4 shadow-sm ${isTarget ? "border-amber-300 bg-amber-50" : "border-cyan-200 bg-white"}`}>
    <p className="brand-eyebrow">{isTarget ? "Your mystery word" : props.round.family?.relationKind === "base_to_derived" ? "Base word" : "Family member"}</p>
    <button type="button" className="mt-2 rounded-xl px-2 py-1 text-left text-3xl font-black text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300 disabled:cursor-default"
      disabled={props.muted || !canHear} aria-label={canHear ? `Hear ${props.member.spelling}` : `${props.member.spelling}: recording unavailable`}
      onClick={props.onHear}>{span
        ? <SpellingWithHighlight spelling={props.member.spelling} start={span.start} end={span.end}
          preservedBaseEnd={isTarget ? props.round.family?.preservedBaseSpan?.end : undefined} />
        : props.member.spelling}{canHear && <span aria-hidden="true" className="ml-2 text-lg text-cyan-700">▶</span>}</button>
    {!canHear && <p className="mt-1 text-sm font-semibold text-slate-500">Recording unavailable</p>}
    {!isTarget && <>
      {props.member.morphologyNote && <p className="mt-3 text-sm font-semibold text-slate-700">Word part: {props.member.morphologyNote}</p>}
      <fieldset className="mt-4 grid gap-2"><legend className="mb-2 text-sm font-black">My detective clues</legend>
        {CLUES.map((clue) => {
          const unavailable = clue.key === "clearer_sound" && !canHear ||
            clue.key === "meaningful_part" && !props.member.morphologyNote ||
            clue.key === "same_spelling" && !props.member.alignedVowelSpan;
          return <button key={clue.key} type="button" disabled={unavailable} aria-pressed={props.chosen.includes(clue.key)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300 ${props.chosen.includes(clue.key) ? "border-cyan-700 bg-cyan-100 text-cyan-950" : "border-slate-200 bg-slate-50 text-slate-700"} disabled:opacity-50`}
            onClick={() => props.onClue(clue.key)}>{clue.label}</button>;
        })}
      </fieldset>
    </>}
  </article>;
}

export function FamilyTreeDetectiveActivity(props: {
  config: DetectiveActivityConfigV1;
  initialState?: unknown;
  muted?: boolean;
  reducedMotion?: boolean;
  previewCandidate?: boolean;
  showInlineGuide?: boolean;
  lessonLayout?: boolean;
  onStateChange?: (state: DetectiveState) => void;
  onComplete?: (response: Record<string, unknown>) => void;
}) {
  const [state, setState] = useState(() => restore(props.initialState, props.config));
  const [audioError, setAudioError] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const gap = useRef<HTMLDivElement | null>(null);
  const completed = useRef(false);
  const round = props.config.rounds[state.index];
  const current = state.words[round.canonicalWordId] ?? emptyWord();
  const correct = correctVowelTile(round)!;
  const masked = maskedDetectiveWord(round)!;

  function change(nextWord: DetectiveWordState, nextIndex = state.index) {
    const next = { index: nextIndex, words: { ...state.words, [round.canonicalWordId]: nextWord } };
    setState(next);
    props.onStateChange?.(next);
  }

  async function playAudio(src: string): Promise<boolean> {
    if (props.muted || !audio.current) return false;
    setAudioError(false);
    try {
      audio.current.pause();
      audio.current.src = src;
      audio.current.currentTime = 0;
      await audio.current.play();
      return true;
    } catch { setAudioError(true); return false; }
  }

  async function hear(member: DetectiveFamilyMemberV1 | null = null) {
    const src = member && member.canonicalWordId !== round.canonicalWordId ? member.recording?.src : round.recording.src;
    if (!src) return;
    if (await playAudio(src)) {
      const id = member?.canonicalWordId ?? round.canonicalWordId;
      if (!current.heardWordIds.includes(id)) change({ ...current, heardWordIds: [...current.heardWordIds, id] });
    }
  }

  function choose(tileChoice: VowelTile) {
    if (current.phase !== "initial" && current.phase !== "final") return;
    change({ ...current, selectedTile: tileChoice });
  }

  function submitChoice() {
    if (!current.selectedTile) return;
    if (current.phase === "initial") {
      const firstCorrect = current.selectedTile === correct;
      change({ ...current, initialChoice: current.selectedTile, selectedTile: null,
        phase: round.family ? "explore" : firstCorrect ? "done" : "final" });
    } else if (current.phase === "final") {
      const firstRetry = current.finalChoice ?? current.selectedTile;
      change({ ...current, finalChoice: firstRetry, selectedTile: null,
        phase: current.selectedTile === correct ? "done" : "final" });
    }
  }

  function toggleClue(memberId: string, clue: DetectiveClue) {
    if (current.phase !== "explore") return;
    const existing = current.clues[memberId] ?? [];
    const next = toggleDetectiveClue(existing, clue);
    change({ ...current, clues: { ...current.clues, [memberId]: next } });
  }

  function next() {
    if (current.phase !== "done") return;
    audio.current?.pause();
    setAudioError(false);
    if (state.index + 1 < props.config.rounds.length) { change(current, state.index + 1); return; }
    if (completed.current) return;
    completed.current = true;
    const words = { ...state.words, [round.canonicalWordId]: current };
    props.onComplete?.({ guided: true, words: props.config.rounds.map((item) => {
      const result = words[item.canonicalWordId];
      const answer = correctVowelTile(item);
      return {
        canonicalWordId: item.canonicalWordId,
        initialChoice: result?.initialChoice ?? null,
        initialCorrect: result?.initialChoice === answer,
        finalChoice: result?.finalChoice ?? null,
        finalCorrect: result?.finalChoice === null ? null : result?.finalChoice === answer,
        familyViewed: Boolean(item.family && result?.finalChoice),
        familyExplored: Boolean(item.family && (Object.values(result?.clues ?? {}).some((clues) => clues.length > 0) ||
          result?.heardWordIds.some((id) => id !== item.canonicalWordId))),
        clues: result?.clues ?? {}, heardWordIds: result?.heardWordIds ?? [],
        evidenceMode: "guided_recognition",
      };
    }) });
  }

  if (props.lessonLayout) return <section className="detective-option-three" aria-labelledby="detective-title" data-detective-phase={current.phase}>
    <audio ref={audio} preload="none" onError={() => setAudioError(true)} />
    <h2 id="detective-title" className="detective-option-three-title">Vowel Detective</h2>
    <div className="detective-option-three-cards">
      <section className="detective-option-three-card" aria-labelledby="detective-game-title">
        <h3 id="detective-game-title">The Game</h3>
        <p>A quiet vowel letter is hidden. Listen and choose its spelling. Explore related words when available, then try again from memory.</p>
      </section>
      <section className="detective-option-three-card detective-option-three-how" aria-labelledby="detective-how-title">
        <h3 id="detective-how-title">How to do the task</h3>
        <p><strong>1</strong> Hear the word and choose a vowel tile.</p>
        <p><strong>2</strong> Submit your first thought.</p>
        <p><strong>3</strong> Explore family clues when available, then try again.</p>
      </section>
    </div>
    {audioError && <p role="alert" className="detective-option-three-error">This recording could not play. Please try again.</p>}

    {(current.phase === "initial" || current.phase === "final") && <div className="detective-option-three-desk">
      <div className="detective-option-three-challenge">
        <p className="detective-option-three-eyebrow">Word {state.index + 1} of {props.config.rounds.length} · {current.phase === "initial" ? "First thought" : "Try again from memory"}</p>
        {current.phase === "final" && (current.finalChoice !== null && current.finalChoice !== correct ||
          !round.family && current.initialChoice !== correct) && <p role="alert" className="detective-option-three-error">× Not quite. That vowel was incorrect. Listen and try another vowel.</p>}
        <div className="detective-option-three-question"><h3>Which vowel belongs in the gap?</h3><button type="button" disabled={props.muted} onClick={() => hear()}>▶ Hear the word</button></div>
        <div ref={gap} className="detective-option-three-word">{masked.replace("_", current.selectedTile ?? "_")}</div>
        <span className="sr-only" aria-live="polite">{masked.replace("_", current.selectedTile ?? "blank")}</span>
        <div className="detective-option-three-tiles" aria-label="Vowel tiles">{TILES.map((letter) => <DraggableTile key={letter} id={letter} text={letter} label={`${letter} vowel tile`} selected={current.selectedTile === letter}
          muted={props.muted} onSelect={() => choose(letter)} onDrop={(_, point) => {
            const rect = gap.current?.getBoundingClientRect();
            if (rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) choose(letter);
          }} />)}</div>
        <p className="detective-option-three-hint">Tap a vowel tile, or drag it into the gap.</p>
        <button type="button" className="detective-option-three-submit" disabled={!current.selectedTile} onClick={submitChoice}>Submit vowel</button>
      </div>
      <aside className="detective-option-three-side" aria-label={current.phase === "initial" ? "Upcoming family investigation" : "Memory reminder"}>
        {current.phase === "initial" ? round.family ? <><p className="detective-option-three-eyebrow">Next: family investigation</p><h3>Unlock after your first answer</h3><p>Listen to related words and collect clues that help you remember the spelling.</p><hr /><p>Then close the tree and try the missing vowel again.</p></>
          : <><p className="detective-option-three-eyebrow">Your first thought</p><h3>Try the quiet vowel</h3><p>If it is incorrect, you can listen again and choose another vowel. Your first choice stays saved.</p></>
          : <><p className="detective-option-three-eyebrow">{round.family ? "The tree is closed" : "Your first answer is saved"}</p><h3>Choose from memory</h3><p>Listen to the original word again if you need to. Your first answer is already saved.</p></>}
      </aside>
    </div>}

    {current.phase === "explore" && round.family && <div className="detective-option-three-desk">
      <div className="detective-option-three-investigate">
        <p className="detective-option-three-eyebrow">Word {state.index + 1} of {props.config.rounds.length} · Family investigation</p>
        {current.initialChoice !== correct && <p role="alert" className="detective-option-three-error">× Not quite. Your first vowel was incorrect. Explore this family, then try again.</p>}
        <h3>{round.family.relationKind === "base_to_derived" ? `How ${round.family.name} becomes ${round.spelling}` : `Explore the ${round.family.name} family`}</h3>
        <p>{round.family.relationKind === "base_to_derived" ? "Look at how the reviewed word parts make the new word. Tap a word to hear it when a recording is available." : "Tap related words with recordings to hear them. Collect clues you notice; it is fine if a relative does not help."}</p>
        {round.family.preservedBaseSpan && <p>Blue shows preserved base letters; yellow marks the target vowel letter.</p>}
        <div className="detective-option-three-family">{round.family.members.map((member) => <FamilyCard key={member.canonicalWordId} member={member} round={round}
          chosen={current.clues[member.canonicalWordId] ?? []} muted={Boolean(props.muted)} onHear={() => hear(member)} onClue={(clue) => toggleClue(member.canonicalWordId, clue)} />)}</div>
        <button type="button" className="detective-option-three-submit" onClick={() => {
          change({ ...current, phase: "final", selectedTile: null });
          void playAudio(round.recording.src);
        }}>Close tree and try again</button>
      </div>
      <aside className="detective-option-three-side" aria-label="Spelling memory tip">
        <p className="detective-option-three-eyebrow">Tip</p>
        <h3>Sound out the spelling</h3>
        <p>Try saying the word with its written vowel sounded clearly, like <strong>HU-MAN</strong>.</p>
        <hr />
        <p>This is a way to remember the letters. The everyday recording may sound different.</p>
      </aside>
    </div>}

    {current.phase === "done" && <div className="detective-option-three-done">
      <p className="detective-option-three-eyebrow">Investigation complete · Word {state.index + 1} of {props.config.rounds.length}</p>
      <h3>The missing vowel is {correct}.</h3>
      <p>{current.initialChoice === correct ? "You chose it on your first try." : current.finalChoice === correct ? "Your first choice was incorrect; you found the vowel on your next try." : "Your earlier choices were incorrect; you found the vowel after trying again."}
        {round.family && current.finalChoice !== null ? ` Your first choice after exploring was ${current.finalChoice}.` : ""}</p>
      <p>{round.family?.explanation ?? `The reviewed spelling is ${round.spelling}.`}</p>
      {!round.family && <p><strong>Tip:</strong> Try saying the word with its written vowel sounded clearly, like HU-MAN. This can help you remember the letters even when the everyday vowel is quiet.</p>}
      <button type="button" className="detective-option-three-submit" onClick={next}>{state.index + 1 < props.config.rounds.length ? "Next word" : "Finish investigation"}</button>
    </div>}
    {props.reducedMotion && <p className="sr-only">Reduced motion is on.</p>}
  </section>;

  return <section className="grid gap-6 text-[color:var(--ink)]" aria-labelledby="detective-title">
    <audio ref={audio} preload="none" onError={() => setAudioError(true)} />
    {props.showInlineGuide === false ? <header className="grid gap-1"><h2 id="detective-title" className="text-xl font-black">Vowel Detective</h2><p>Listen, try the missing vowel, then investigate a word-family clue when one is available.</p></header> : <header className="adie-inline"><Image src="/adie/adie-head.png" width={86} height={86} alt="ADIE, your robot guide" />
      <div className="adie-inline-bubble"><strong>Adie says</strong><h2 id="detective-title" className="text-xl font-black">Vowel Detective</h2>
        <p>Listen, find the missing vowel, then see whether this word family gives you a spelling clue.</p></div></header>}
    {props.previewCandidate && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 font-bold text-amber-950">Review preview: target and family links here are candidates. This does not save spelling evidence.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
      <p className="font-bold">Word {state.index + 1} of {props.config.rounds.length}</p>
      <button type="button" className="brand-secondary-btn min-h-12" disabled={props.muted} onClick={() => hear()}>▶ Hear the word</button>
    </div>
    {audioError && <p role="alert" className="rounded-xl bg-rose-100 p-3 font-bold text-rose-950">This recording could not play. Please try again.</p>}

    {(current.phase === "initial" || current.phase === "final") && <div className="grid gap-5 text-center">
      <div><p className="brand-eyebrow">{current.phase === "initial" ? "First thought" : "Try again from memory"}</p>
        <h3 className="text-2xl font-black">Which vowel belongs in the gap?</h3>
        {current.phase === "final" && (current.finalChoice !== null && current.finalChoice !== correct ||
          !round.family && current.initialChoice !== correct) && <p role="alert" className="mt-2 rounded-xl bg-rose-100 p-3 font-bold text-rose-950">× Not quite. That vowel was incorrect. Listen and try another vowel.</p>}
        {current.phase === "final" && <p className="mt-2 text-sm text-[color:var(--mid)]">{round.family ? "The family tree is closed." : "Your first answer is saved."} Listen to the original word again if you need to.</p>}</div>
      <div ref={gap} role="status" aria-live="polite" className="mx-auto flex min-h-24 min-w-48 items-center justify-center rounded-3xl border-2 border-dashed border-cyan-400 bg-cyan-50 px-6 font-black tracking-wide">
        <span className="text-4xl">{masked.replace("_", current.selectedTile ?? "_")}</span></div>
      <p className="text-sm font-semibold text-[color:var(--mid)]">Tap a letter to fill the gap, or drag it onto the word.</p>
      <div className="flex flex-wrap justify-center gap-3" aria-label="Vowel tiles">{TILES.map((letter) => <DraggableTile key={letter} id={letter} text={letter} label={`${letter} vowel tile`} selected={current.selectedTile === letter}
        muted={props.muted} onSelect={() => choose(letter)} onDrop={(_, point) => {
          const rect = gap.current?.getBoundingClientRect();
          if (rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) choose(letter);
        }} />)}</div>
      <button type="button" className="brand-primary-btn mx-auto" disabled={!current.selectedTile} onClick={submitChoice}>Submit vowel</button>
    </div>}

    {current.phase === "explore" && round.family && <div className="grid gap-5">
      <div className="text-center"><p className="brand-eyebrow">Detective mode</p><h3 className="text-2xl font-black">{round.family.relationKind === "base_to_derived"
        ? `How ${round.family.name} becomes ${round.spelling}` : `Explore the ${round.family.name} family`}</h3>
        <p className="mt-2 text-[color:var(--mid)]">{round.family.relationKind === "base_to_derived"
          ? "Look at how the reviewed word parts make the new word. Tap either word to hear it when a recording is available."
          : "Tap words to hear them. Collect clues you notice; it is fine if a relative does not help."}</p></div>
      {current.initialChoice !== correct && <p role="alert" className="rounded-xl bg-rose-100 p-3 font-bold text-rose-950">× Not quite. Your first vowel was incorrect. Explore this family, then try again.</p>}
      {round.family.preservedBaseSpan && <p className="text-center text-sm font-semibold text-cyan-900">Blue shows preserved base letters; yellow marks the target vowel letter.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{round.family.members.map((member) => <FamilyCard key={member.canonicalWordId} member={member} round={round}
        chosen={current.clues[member.canonicalWordId] ?? []} muted={Boolean(props.muted)} onHear={() => hear(member)} onClue={(clue) => toggleClue(member.canonicalWordId, clue)} />)}</div>
      <button type="button" className="brand-primary-btn mx-auto" onClick={() => {
        change({ ...current, phase: "final", selectedTile: null });
        void playAudio(round.recording.src);
      }}>Close tree and try again</button>
    </div>}

    {current.phase === "done" && <div className="grid gap-4 text-center" role="status">
      <p className="brand-eyebrow">Investigation complete</p>
      <p className="text-2xl font-black">The missing vowel is {correct}.</p>
      <p className="text-[color:var(--mid)]">{current.initialChoice === correct ? "You chose it on your first try." : current.finalChoice === correct ? "Your first choice was incorrect; you found the vowel on your next try." : "Your earlier choices were incorrect; you found the vowel after trying again."}
        {round.family && current.finalChoice !== null ? ` Your first choice after exploring was ${current.finalChoice}.` : ""}</p>
      <p className="rounded-2xl bg-cyan-50 p-4 font-semibold text-cyan-950">{round.family?.explanation ?? `The reviewed spelling is ${round.spelling}.`}</p>
      <button type="button" className="brand-primary-btn mx-auto" onClick={next}>{state.index + 1 < props.config.rounds.length ? "Next word" : "Finish investigation"}</button>
    </div>}
    {props.reducedMotion && <p className="sr-only">Reduced motion is on.</p>}
  </section>;
}
