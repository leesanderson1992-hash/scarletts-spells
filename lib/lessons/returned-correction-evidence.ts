export function normaliseCorrectionComparisonValue(
  value: string | null | undefined,
) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function returnedCorrectionMatchesApprovedReplacement(input: {
  approvedReplacement: string | null | undefined;
  attemptedCorrection: string | null | undefined;
}) {
  const expected = normaliseCorrectionComparisonValue(input.approvedReplacement);
  const actual = normaliseCorrectionComparisonValue(input.attemptedCorrection);

  return expected.length > 0 && actual === expected;
}

export function getReturnedCorrectionEvidenceFlags(input: {
  approvedReplacement: string | null | undefined;
  attemptedCorrection: string | null | undefined;
}) {
  const matchesApprovedReplacement =
    returnedCorrectionMatchesApprovedReplacement(input);
  const hasAttempt = normaliseCorrectionComparisonValue(
    input.attemptedCorrection,
  ).length > 0;

  return {
    markedFixed: matchesApprovedReplacement,
    correctionOutcome: matchesApprovedReplacement
      ? "correct" as const
      : hasAttempt
        ? "incorrect" as const
        : "unknown" as const,
    correctedIndependently: false,
    assistanceState: "unknown" as const,
    answerVisibility: "unknown" as const,
  };
}
