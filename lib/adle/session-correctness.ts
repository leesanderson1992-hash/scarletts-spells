/**
 * ADLE Slice 6: pure production-correctness derivation shared by the session
 * server actions (which feed the boolean to the Slice 2/3 completion helpers)
 * and the client runner (which uses it to decide which words show a repair
 * reflection). Kept here so both surfaces agree and the rule is regression-
 * covered.
 *
 * Production may be a bare word (plain dictation / controlled spelling) or the
 * target word inside a sentence (homophone-family sentence-context production,
 * per the blueprint): the target counts as produced when it appears as a whole
 * normalised token in the attempt. Token membership is also homophone-
 * sensitive — a sentence carrying the wrong homophone never matches the
 * target's spelling. Deeper evidence scoring stays the evidence engine's job.
 */

export function normaliseSessionWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

export function isAttemptCorrect(attemptText: string, targetWord: string | null): boolean {
  const target = normaliseSessionWord(targetWord ?? "");
  if (target === "") {
    return false;
  }
  const tokens: string[] = attemptText.toLowerCase().match(/[a-z]+/g) ?? [];
  return tokens.includes(target);
}
