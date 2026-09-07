export type ParentIdentifiedOccurrenceCandidate = {
  id: string;
  observedText: string;
  fieldPath: string;
  startUtf16: number;
  endUtf16: number;
  provenance: "learner_response" | "unknown";
};

export type ParentIdentifiedOccurrenceResolution =
  | {
      status: "resolved";
      occurrence: ParentIdentifiedOccurrenceCandidate;
      resolution: "explicit" | "unique_match";
    }
  | { status: "ambiguous"; matchingOccurrenceIds: string[] }
  | { status: "unavailable" }
  | { status: "invalid_explicit_occurrence" }
  | { status: "observed_spelling_mismatch" };

export function normaliseParentIdentifiedOccurrenceWord(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("en-GB")
    .replace(/[’ʼ]/g, "'");
}

/**
 * Resolves a parent's spelling observation to one immutable learner-authored
 * occurrence. Repetition stays explicit: an unselected repeated form is never
 * attached to an arbitrary occurrence.
 */
export function resolveParentIdentifiedOccurrence(input: {
  observedSpelling: string;
  explicitOccurrenceId?: string | null;
  candidates: readonly ParentIdentifiedOccurrenceCandidate[];
}): ParentIdentifiedOccurrenceResolution {
  const observed = normaliseParentIdentifiedOccurrenceWord(
    input.observedSpelling,
  );
  const eligible = input.candidates.filter(
    (candidate) => candidate.provenance === "learner_response",
  );

  if (input.explicitOccurrenceId) {
    const selected = eligible.find(
      (candidate) => candidate.id === input.explicitOccurrenceId,
    );
    if (!selected) return { status: "invalid_explicit_occurrence" };
    if (
      normaliseParentIdentifiedOccurrenceWord(selected.observedText) !==
      observed
    ) {
      return { status: "observed_spelling_mismatch" };
    }
    return {
      status: "resolved",
      occurrence: selected,
      resolution: "explicit",
    };
  }

  const matches = eligible.filter(
    (candidate) =>
      normaliseParentIdentifiedOccurrenceWord(candidate.observedText) ===
      observed,
  );
  if (matches.length === 1) {
    return {
      status: "resolved",
      occurrence: matches[0],
      resolution: "unique_match",
    };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      matchingOccurrenceIds: matches.map((candidate) => candidate.id).sort(),
    };
  }
  return { status: "unavailable" };
}
