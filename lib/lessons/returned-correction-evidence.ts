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

  return {
    markedFixed: matchesApprovedReplacement,
    correctedIndependently: matchesApprovedReplacement,
  };
}
