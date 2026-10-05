import type { IngLessonWordV1 } from "./contracts";

export interface IngTile { id: string; letter: string; origin: "base" | "bank" | "distractor" }
export interface IngScrabbleBoard { tiles: IngTile[]; slots: (string | null)[]; bank: string[] }

function hash(value: string): number { return [...value].reduce((sum, letter) => ((sum * 31) + letter.charCodeAt(0)) >>> 0, 7); }

/** Keep the unchanged prefix in place, exposing each spelling change as a movable tile. */
export function initialIngScrabbleBoard(word: Pick<IngLessonWordV1, "base" | "word" | "canonicalWordId">): IngScrabbleBoard {
  let retained = 0;
  while (retained < Math.min(word.base.length, word.word.length) && word.base[retained] === word.word[retained]) retained++;
  const base = [...word.base].map((letter, index) => ({ id: `base:${index}`, letter: letter.toUpperCase(), origin: "base" as const }));
  const required = [...word.word.slice(retained)].map((letter, index) => ({ id: `required:${index}`, letter: letter.toUpperCase(), origin: "bank" as const }));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const offset = hash(word.canonicalWordId) % alphabet.length;
  const distractors = Array.from({ length: 3 }, (_, index) => ({ id: `distractor:${index}`, letter: alphabet[(offset + index * 7) % alphabet.length], origin: "distractor" as const }));
  const tiles = [...base, ...required, ...distractors];
  const slots = Array.from({ length: Math.max(word.base.length, word.word.length) }, (_, index) => base[index]?.id ?? null);
  return { tiles, slots, bank: [...required, ...distractors].map(tile => tile.id) };
}

export function moveIngTile(board: IngScrabbleBoard, tileId: string, destination: { kind: "slot"; index: number } | { kind: "bank"; index?: number }): IngScrabbleBoard {
  if (!board.tiles.some(tile => tile.id === tileId)) return board;
  const slots = [...board.slots];
  const bank = board.bank.filter(id => id !== tileId);
  const oldSlot = slots.indexOf(tileId);
  if (oldSlot >= 0) slots[oldSlot] = null;
  if (destination.kind === "bank") {
    bank.splice(Math.min(Math.max(destination.index ?? bank.length, 0), bank.length), 0, tileId);
  } else {
    if (!Number.isInteger(destination.index) || destination.index < 0 || destination.index >= slots.length) return board;
    const displaced = slots[destination.index];
    slots[destination.index] = tileId;
    if (displaced && displaced !== tileId) bank.push(displaced);
  }
  return { ...board, slots, bank };
}

export function ingScrabbleSpelling(board: IngScrabbleBoard): string {
  const byId = new Map(board.tiles.map(tile => [tile.id, tile.letter]));
  return board.slots.map(id => id ? byId.get(id) ?? "" : "").join("").toLocaleLowerCase("en-GB");
}

export function validIngScrabbleBoard(board: unknown, word: Pick<IngLessonWordV1, "base" | "word" | "canonicalWordId">): board is IngScrabbleBoard {
  if (!board || typeof board !== "object") return false;
  const value = board as IngScrabbleBoard;
  const expected = initialIngScrabbleBoard(word);
  if (!Array.isArray(value.tiles) || JSON.stringify(value.tiles) !== JSON.stringify(expected.tiles)
    || !Array.isArray(value.slots) || value.slots.length !== expected.slots.length || !Array.isArray(value.bank)) return false;
  const ids = [...value.slots.filter((id): id is string => typeof id === "string"), ...value.bank];
  return ids.length === expected.tiles.length && new Set(ids).size === ids.length && ids.every(id => expected.tiles.some(tile => tile.id === id));
}
