"use client";

import { useMemo, useState } from "react";

import { AssemblySlot, SelectableItem } from "@/components/adle/interactions/selectable-item";
import type {
  MeaningFlipViewModel,
  MorphemeGlossCardViewModel,
  MorphemeJoinViewModel,
  MorphemeSequenceViewModel,
  MorphemeTileViewModel,
  MorphologyDiffViewModel,
  MorphologyPartKind,
  MorphologyRevealMode,
  RootArtifactCardViewModel,
  TransformationViewModel,
  WordFamilyViewModel,
  WordSplitViewModel,
} from "@/lib/adle/ui/morphology-primitives";

const KIND_STYLE: Record<MorphologyPartKind, string> = {
  prefix: "border-emerald-300 bg-emerald-50 text-emerald-950",
  base: "border-amber-300 bg-amber-50 text-amber-950",
  root: "border-yellow-400 bg-yellow-50 text-yellow-950",
  suffix: "border-sky-300 bg-sky-50 text-sky-950",
  connector: "border-violet-300 bg-violet-50 text-violet-950",
};

const KIND_MARK: Record<MorphologyPartKind, string> = {
  prefix: "P",
  base: "B",
  root: "R",
  suffix: "S",
  connector: "L",
};

function isAnswerVisible(mode: MorphologyRevealMode): boolean {
  return mode !== "recall_neutral";
}

export function MorphemeTile(props: {
  tile: MorphemeTileViewModel;
  mode?: MorphologyRevealMode;
  selected?: boolean;
  disabled?: boolean;
  interactive?: boolean;
  onSelect?: (id: string) => void;
}) {
  const mode = props.mode ?? "teaching";
  const reveal = isAnswerVisible(mode);
  const content = (
    <span
      className={`block rounded-2xl border-2 px-3 py-2 shadow-sm motion-safe:transition motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none ${
        reveal ? KIND_STYLE[props.tile.kind] : "border-zinc-300 bg-white text-[color:var(--text)]"
      } ${props.selected ? "outline outline-4 outline-[rgba(194,24,91,0.18)]" : ""}`}
    >
      <span className="flex items-start gap-2">
        {reveal ? (
          <span
            aria-hidden="true"
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-current/25 bg-white/75 text-xs font-black"
          >
            {KIND_MARK[props.tile.kind]}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block break-words text-xl font-black leading-tight tracking-normal">{props.tile.text}</span>
          {reveal ? <span className="mt-1 block text-[11px] font-bold uppercase">{props.tile.label}</span> : null}
          {reveal && props.tile.gloss ? (
            <span className="mt-1 block break-words text-xs opacity-85">{props.tile.gloss}</span>
          ) : null}
          {reveal && props.tile.transformationState === "changed" ? (
            <span className="mt-1 block text-xs font-semibold">Source: {props.tile.sourceText}</span>
          ) : null}
        </span>
      </span>
    </span>
  );

  if (!props.interactive) {
    return (
      <span
        aria-label={reveal ? `${props.tile.label}: ${props.tile.text}` : "hidden word part"}
        className={props.disabled ? "opacity-55" : undefined}
      >
        {content}
      </span>
    );
  }

  return (
    <SelectableItem
      id={props.tile.id}
      label={reveal ? `${props.tile.label}: ${props.tile.text}` : "select hidden word part"}
      selected={props.selected}
      disabled={props.disabled}
      onSelect={props.onSelect}
    >
      {content}
    </SelectableItem>
  );
}

export function MorphemeSequence(props: {
  sequence: MorphemeSequenceViewModel;
  mode?: MorphologyRevealMode;
}) {
  return (
    <div aria-label={`Morpheme sequence for ${props.sequence.displayWord}`} className="flex flex-wrap items-stretch gap-2">
      {props.sequence.parts.map((part, index) => {
        const join = props.sequence.joins.find((candidate) => candidate.afterPartId === part.id);
        return (
          <span key={part.id} className="inline-flex items-center gap-2">
            <MorphemeTile tile={part} mode={props.mode} />
            {index < props.sequence.parts.length - 1 ? <JoinMarker join={join} /> : null}
          </span>
        );
      })}
    </div>
  );
}

export function MorphemeRail(props: {
  tiles: MorphemeTileViewModel[];
  slots?: number;
  mode?: MorphologyRevealMode;
  label?: string;
}) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [placedIds, setPlacedIds] = useState<string[]>([]);
  const slots = props.slots ?? props.tiles.length;
  const placedTiles = placedIds
    .map((id) => props.tiles.find((tile) => tile.id === id))
    .filter((tile): tile is MorphemeTileViewModel => tile !== undefined);

  function placeSelected() {
    if (selectedTileId === null || placedIds.includes(selectedTileId) || placedIds.length >= slots) {
      return;
    }
    setPlacedIds([...placedIds, selectedTileId]);
    setSelectedTileId(null);
  }

  function removePlaced(id: string) {
    setPlacedIds(placedIds.filter((placedId) => placedId !== id));
  }

  return (
    <div className="grid gap-3" aria-label={props.label ?? "Morpheme assembly rail"}>
      <div className="flex flex-wrap gap-2">
        {props.tiles.map((tile) => (
          <MorphemeTile
            key={tile.id}
            tile={tile}
            mode={props.mode}
            interactive
            selected={selectedTileId === tile.id}
            disabled={placedIds.includes(tile.id)}
            onSelect={setSelectedTileId}
          />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: slots }).map((_, index) => {
          const placed = placedTiles[index];
          return (
            <AssemblySlot
              key={index}
              label={placed ? `Remove ${placed.text} from position ${index + 1}` : `Position ${index + 1}`}
              active={selectedTileId !== null && placed === undefined}
              onPlace={placed ? () => removePlaced(placed.id) : placeSelected}
            >
              {placed ? (
                <span className="flex items-center justify-between gap-2">
                  <span>{`${index + 1}. ${placed.text}`}</span>
                  <span className="rounded-full px-2 text-xs underline">remove</span>
                </span>
              ) : (
                `Position ${index + 1}`
              )}
            </AssemblySlot>
          );
        })}
      </div>
    </div>
  );
}

export function WordSplitView(props: {
  split: WordSplitViewModel;
  revealed?: boolean;
  onToggleReveal?: () => void;
}) {
  const revealed = props.revealed ?? true;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-words text-3xl font-black tracking-normal text-[color:var(--text)]">{props.split.displayWord}</p>
        {props.onToggleReveal ? (
          <button type="button" className="brand-secondary-btn" onClick={props.onToggleReveal}>
            {revealed ? "Hide split" : "Show split"}
          </button>
        ) : null}
      </div>
      {revealed ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {props.split.parts.map((part, index) => {
            const join = props.split.joins.find((candidate) => candidate.afterPartId === part.id);
            return (
              <span key={part.id} className="inline-flex items-center gap-2">
                <span className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">
                  {part.surfaceText}
                </span>
                {index < props.split.parts.length - 1 ? <JoinMarker join={join} /> : null}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function MeaningFlip(props: { flip: MeaningFlipViewModel; reduceMotion?: boolean }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <MeaningSide label="Before" text={props.flip.beforeText} caption={props.flip.beforeCaption} />
      <span
        aria-hidden="true"
        className={`hidden h-10 w-10 items-center justify-center rounded-full bg-[#fff0f7] text-lg font-black text-[color:var(--scarlett)] sm:inline-flex ${
          props.reduceMotion ? "" : "motion-safe:animate-pulse"
        }`}
      >
        to
      </span>
      <MeaningSide label="After" text={props.flip.afterText} caption={props.flip.afterCaption} />
    </div>
  );
}

export function TransformationView(props: { transformations: TransformationViewModel[] }) {
  if (props.transformations.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4 text-sm text-[color:var(--mid)]">
        No spelling transformation in this approved analysis.
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {props.transformations.map((transformation) => (
        <div key={transformation.id} className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs font-bold uppercase text-[color:var(--mid)]">{transformation.type.replaceAll("_", " ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-lg font-black">
            <span className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950">{transformation.sourceText}</span>
            <span className="text-sm font-semibold text-[color:var(--mid)]">becomes</span>
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-950">{transformation.surfaceText}</span>
          </div>
          <p className="mt-2 text-sm text-[color:var(--mid)]">{transformation.explanation}</p>
        </div>
      ))}
    </div>
  );
}

export function MorphologyDiff(props: { diff: MorphologyDiffViewModel }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <p className="text-sm font-semibold text-[color:var(--text)]">Post-submit comparison</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-50 p-3">
          <dt className="text-xs font-bold uppercase text-[color:var(--mid)]">Attempt</dt>
          <dd className="mt-1 break-words text-xl font-black">{props.diff.attemptedWord}</dd>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <dt className="text-xs font-bold uppercase text-emerald-900">Approved word</dt>
          <dd className="mt-1 break-words text-xl font-black text-emerald-950">{props.diff.expectedWord}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <MorphemeSequence
          sequence={{
            id: props.diff.id,
            displayWord: props.diff.expectedWord,
            microSkillKey: "preview",
            parts: props.diff.parts,
            joins: [],
            transformations: [],
            joiningStrategy: "preview",
            sourceExpression: props.diff.expectedWord,
          }}
          mode="post_submit"
        />
      </div>
      <ul className="mt-3 grid gap-1 text-sm text-[color:var(--mid)]">
        {props.diff.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

export function MorphemeGlossCard(props: { gloss: MorphemeGlossCardViewModel }) {
  return (
    <article className={`rounded-2xl border-2 p-4 ${KIND_STYLE[props.gloss.kind]}`}>
      <p className="text-xs font-bold uppercase">{props.gloss.label}</p>
      <h3 className="mt-1 break-words text-3xl font-black tracking-normal">{props.gloss.text}</h3>
      <p className="mt-2 text-sm font-semibold">{props.gloss.meaning}</p>
      {props.gloss.originLabel ? <p className="mt-1 text-xs">{props.gloss.originLabel}</p> : null}
      {props.gloss.examples.length > 0 ? (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Examples: </span>
          {props.gloss.examples.join(", ")}
        </p>
      ) : null}
    </article>
  );
}

export function RootArtifactCard(props: { artifact: RootArtifactCardViewModel }) {
  return (
    <article className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-yellow-950">
      <p className="text-xs font-bold uppercase">{props.artifact.themeKey} root artifact</p>
      <h3 className="mt-1 break-words text-3xl font-black tracking-normal">{props.artifact.rootText}</h3>
      <p className="mt-2 text-sm font-semibold">Meaning: {props.artifact.meaning}</p>
      <p className="mt-1 text-sm">{props.artifact.originLabel}</p>
      <p className="mt-3 text-sm">{props.artifact.microLore}</p>
      <p className="mt-3 text-sm">
        <span className="font-semibold">Descendants: </span>
        {props.artifact.descendantWords.join(", ")}
      </p>
    </article>
  );
}

export function WordFamilyView(props: { family: WordFamilyViewModel }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <p className="text-sm font-semibold text-[color:var(--text)]">{props.family.label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.family.relatedWords.map((word) => (
          <span
            key={word}
            className={`rounded-full border px-3 py-2 text-sm font-semibold ${
              word === props.family.anchorWord
                ? "border-[color:var(--scarlett)] bg-[#fff0f7] text-[color:var(--scarlett)]"
                : "border-[var(--border)] bg-white text-[color:var(--mid)]"
            }`}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

function JoinMarker(props: { join?: MorphemeJoinViewModel }) {
  const join = props.join;
  const label = join?.label ?? "join";
  const text = join?.joinType === "space" ? "space" : join?.joinType === "hyphen" ? "-" : "+";
  return (
    <span
      aria-label={label}
      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-[var(--border)] bg-white px-2 text-xs font-black text-[color:var(--mid)]"
    >
      {text}
    </span>
  );
}

function MeaningSide(props: { label: string; text: string; caption: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[#fff8fc] p-4">
      <p className="text-xs font-bold uppercase text-[color:var(--mid)]">{props.label}</p>
      <p className="mt-1 break-words text-2xl font-black tracking-normal text-[color:var(--text)]">{props.text}</p>
      <p className="mt-2 text-sm text-[color:var(--mid)]">{props.caption}</p>
    </div>
  );
}

export function useReducedMotionPreference(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
}
