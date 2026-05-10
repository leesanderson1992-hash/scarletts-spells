import { SUGGESTION_WORDS } from "./lexicon";

const DEFAULT_MAX_EDIT_DISTANCE = 2;

function buildDeletes(
  word: string,
  maxEditDistance: number,
  deletes = new Set<string>(),
  distance = 0,
) {
  if (distance >= maxEditDistance || word.length === 0) {
    return deletes;
  }

  for (let index = 0; index < word.length; index += 1) {
    const deleted = `${word.slice(0, index)}${word.slice(index + 1)}`;

    if (deletes.has(deleted)) {
      continue;
    }

    deletes.add(deleted);
    buildDeletes(deleted, maxEditDistance, deletes, distance + 1);
  }

  return deletes;
}

function buildDeleteIndex(words: string[], maxEditDistance: number) {
  const index = new Map<string, string[]>();

  for (const word of words) {
    for (const deleted of buildDeletes(word, maxEditDistance)) {
      const existing = index.get(deleted);

      if (existing) {
        existing.push(word);
      } else {
        index.set(deleted, [word]);
      }
    }
  }

  return index;
}

const DELETE_INDEX = buildDeleteIndex(
  SUGGESTION_WORDS,
  DEFAULT_MAX_EDIT_DISTANCE,
);

export function getSymSpellCandidates(
  input: string,
  maxEditDistance = DEFAULT_MAX_EDIT_DISTANCE,
) {
  const suggestions = new Set<string>();
  const queue = [{ term: input, distance: 0 }];
  const seen = new Set<string>([input]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    const matches = DELETE_INDEX.get(current.term);
    if (matches) {
      for (const candidate of matches) {
        suggestions.add(candidate);
      }
    }

    if (current.distance >= maxEditDistance || current.term.length === 0) {
      continue;
    }

    for (let index = 0; index < current.term.length; index += 1) {
      const deleted = `${current.term.slice(0, index)}${current.term.slice(index + 1)}`;

      if (seen.has(deleted)) {
        continue;
      }

      seen.add(deleted);
      queue.push({
        term: deleted,
        distance: current.distance + 1,
      });
    }
  }

  return Array.from(suggestions);
}
