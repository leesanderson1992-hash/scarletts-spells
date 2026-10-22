import type { RouteContentDraft, WordDraftPayload } from "./contracts";

/** Fill the initial editor from current immutable route authority without replacing edits. */
export function hydrateWorkspaceFacts(input: {
  current: WordDraftPayload;
  initial: WordDraftPayload;
  draftId: string | null;
  edited: boolean;
  skillKeys: string[];
  routeContents: RouteContentDraft[];
}): WordDraftPayload {
  if (input.draftId) return input.current;
  const { current, initial } = input;
  const incoming = new Map(input.routeContents.map(route => [route.microSkillKey, route]));
  return { ...current,
    definition: !input.edited && !current.definition ? input.routeContents.find(route => route.wordMeaning)?.wordMeaning ?? "" : current.definition,
    skillKeys: [...new Set([...current.skillKeys, ...input.skillKeys])],
    routeContents: [
      ...current.routeContents.map(route => {
        // A published weak-vowel record is the lesson authority. The generic
        // group preflight can only offer an empty placeholder for this route.
        if (route.routeId === "weak_vowel_word_lab" && route.content.weakVowel) return route;
        const baseline = initial.routeContents.find(row => row.microSkillKey === route.microSkillKey);
        return JSON.stringify(route) === JSON.stringify(baseline) ? incoming.get(route.microSkillKey) ?? route : route;
      }),
      ...input.routeContents.filter(route => !current.routeContents.some(row => row.microSkillKey === route.microSkillKey)),
    ],
  };
}
