/** The sentence containing an exact UTF-16 source span. Works in client and server code. */
export function sentenceContext(text: string, startUtf16: number, endUtf16: number) {
  if (!Number.isInteger(startUtf16) || !Number.isInteger(endUtf16) ||
      startUtf16 < 0 || endUtf16 <= startUtf16 || endUtf16 > text.length) return null;
  const before = text.slice(0, startUtf16);
  const after = text.slice(endUtf16);
  const boundary = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"),
    before.lastIndexOf("?"), before.lastIndexOf("\n"));
  const endings = [after.indexOf("."), after.indexOf("!"), after.indexOf("?"), after.indexOf("\n")]
    .filter((position) => position >= 0);
  const rawStart = boundary + 1;
  const rawEnd = endUtf16 + (endings.length ? Math.min(...endings) + 1 : after.length);
  const raw = text.slice(rawStart, rawEnd);
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  return { text: raw.trim(), startUtf16: rawStart + leading, endUtf16: rawEnd - trailing };
}
