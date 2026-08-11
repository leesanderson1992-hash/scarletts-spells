export const EXACT_GOVERNED_FORM_ANSWER_POLICY = {
  kind: "exact_governed_form",
  caseSensitive: false,
  trimOuterWhitespace: true,
  separatorsSignificant: true,
} as const;

export type ExactGovernedFormAnswerPolicy =
  typeof EXACT_GOVERNED_FORM_ANSWER_POLICY;

/** Generic form-aware comparator. It does not rewrite evidence or scheduling. */
export function isAnswerCorrectUnderPolicy(
  attempt: string,
  expected: string,
  policy: ExactGovernedFormAnswerPolicy,
): boolean {
  const prepare = (value: string) => {
    const outer = policy.trimOuterWhitespace ? value.trim() : value;
    return policy.caseSensitive
      ? outer
      : outer.toLocaleLowerCase("en-GB");
  };
  return Boolean(expected) && prepare(attempt) === prepare(expected);
}
