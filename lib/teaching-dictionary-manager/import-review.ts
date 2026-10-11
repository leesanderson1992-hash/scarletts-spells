export type ImportDraftSummary = {
  id: string;
  canonical_word_id: string | null;
  normalised_word: string;
  created_at: string;
};

export function pendingImportDrafts(drafts: ImportDraftSummary[], publishedIds: Set<string>): ImportDraftSummary[] {
  const latestByWord = new Map<string, ImportDraftSummary>();
  for (const draft of drafts) {
    const key = draft.canonical_word_id ?? draft.normalised_word;
    const previous = latestByWord.get(key);
    if (!previous || draft.created_at > previous.created_at
      || (draft.created_at === previous.created_at && draft.id > previous.id)) latestByWord.set(key, draft);
  }
  return [...latestByWord.values()].filter((draft) => !publishedIds.has(draft.id))
    .sort((a, b) => a.normalised_word.localeCompare(b.normalised_word) || a.id.localeCompare(b.id));
}
