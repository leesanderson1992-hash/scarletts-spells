import { governedContextFamily } from "./context-advisory-family";
export { governedContextFamily } from "./context-advisory-family";

/** Match the exact written form. Spelling normalisation removes apostrophes and
 * must not turn malformed `youre` into the canonical member `you're`. */
export function isGovernedContextMember(surface: string): boolean {
  return governedContextFamily(surface) !== null;
}

/** The legacy authentic-use bridge collapses a piece to one row per spelling.
 * Until an occurrence-aware evidence bridge is approved, suppress only the
 * affected spelling, never unrelated words from the same piece. */
export function governedEvidenceExclusionWords(text: string): Set<string> {
  const excluded = new Set<string>();
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’ʼ][\p{L}\p{M}]+)*/gu)) {
    if (!isGovernedContextMember(match[0])) continue;
    for (const fragment of match[0].toLowerCase().match(/[a-z]+/g) ?? []) {
      excluded.add(fragment);
    }
  }
  return excluded;
}
