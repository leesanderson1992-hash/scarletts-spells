type DictationRow = {
  row_status?: unknown;
  review_status?: unknown;
};

type PrefixMemberWithDictationRows = {
  canonical_teaching_dictionary_words?: {
    canonical_teaching_dictionary_dictation_sentences?: DictationRow[] | null;
  } | null;
};

export function approvedDictationCoverage(
  members: readonly PrefixMemberWithDictationRows[],
): { wordCount: number; rowCount: number } {
  let wordCount = 0;
  let rowCount = 0;
  for (const member of members) {
    const approvedRows = (
      member.canonical_teaching_dictionary_words
        ?.canonical_teaching_dictionary_dictation_sentences ?? []
    ).filter(
      (row) => row.row_status === "active"
        && row.review_status === "approved_for_first_exposure",
    );
    if (approvedRows.length > 0) wordCount += 1;
    rowCount += approvedRows.length;
  }
  return { wordCount, rowCount };
}
