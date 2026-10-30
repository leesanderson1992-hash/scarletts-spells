import type { RouteContentDraft, WordDraftPayload } from "./contracts";

/** Historical route versions and saved drafts remain auditable, but retired
 * micro-skills cannot be selected in the current authoring workspace. */
export function currentWorkspaceSkills(payload: WordDraftPayload, activeSkillKeys: ReadonlySet<string>): WordDraftPayload {
  const skillKeys = payload.skillKeys.filter(key => activeSkillKeys.has(key));
  const routeContents = payload.routeContents.filter(route => activeSkillKeys.has(route.microSkillKey));
  return skillKeys.length === payload.skillKeys.length && routeContents.length === payload.routeContents.length
    ? payload : { ...payload, skillKeys, routeContents };
}

/** Route content is history, not a word-to-skill assignment. */
export function assignedWorkspaceSkills(payload: WordDraftPayload, assignedSkillKeys: readonly string[],
  activeSkillKeys: ReadonlySet<string>): WordDraftPayload {
  const skillKeys = [...new Set(assignedSkillKeys.filter(key => activeSkillKeys.has(key)))];
  const selected = new Set(skillKeys);
  return { ...payload, skillKeys,
    routeContents: payload.routeContents.filter(route => selected.has(route.microSkillKey)) };
}

/** Fill the initial editor from current immutable route authority without replacing edits. */
export function hydrateWorkspaceFacts(input: {
  current: WordDraftPayload;
  initial: WordDraftPayload;
  draftId: string | null;
  edited: boolean;
  skillKeys: string[];
  routeContents: RouteContentDraft[];
  activeSkillKeys?: ReadonlySet<string>;
}): WordDraftPayload {
  const current = input.activeSkillKeys ? currentWorkspaceSkills(input.current, input.activeSkillKeys) : input.current;
  if (input.draftId) return current;
  const { initial } = input;
  const skillKeys = input.activeSkillKeys ? input.skillKeys.filter(key => input.activeSkillKeys!.has(key)) : input.skillKeys;
  const routeContents = input.activeSkillKeys
    ? input.routeContents.filter(route => input.activeSkillKeys!.has(route.microSkillKey)) : input.routeContents;
  const incoming = new Map(routeContents.map(route => [route.microSkillKey, route]));
  return { ...current,
    definition: !input.edited && !current.definition ? routeContents.find(route => route.wordMeaning)?.wordMeaning ?? "" : current.definition,
    skillKeys: [...new Set([...current.skillKeys, ...skillKeys])],
    routeContents: [
      ...current.routeContents.map(route => {
        // A published weak-vowel record is the lesson authority. The generic
        // group preflight can only offer an empty placeholder for this route.
        if (route.routeId === "weak_vowel_word_lab" && route.content.weakVowel) return route;
        const baseline = initial.routeContents.find(row => row.microSkillKey === route.microSkillKey);
        return JSON.stringify(route) === JSON.stringify(baseline) ? incoming.get(route.microSkillKey) ?? route : route;
      }),
      ...routeContents.filter(route => !current.routeContents.some(row => row.microSkillKey === route.microSkillKey)),
    ],
  };
}
