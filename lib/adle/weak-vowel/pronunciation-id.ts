import { createHash } from "node:crypto";

/** Technical identity for the owner-approved British word clip, not a new
 * linguistic judgement. A changed clip receives a different variant ID. */
export function reviewedBritishPronunciationId(canonicalWordId: string, recordingSha256: string): string {
  if (!canonicalWordId || !/^[a-f0-9]{64}$/.test(recordingSha256)) throw new Error("reviewed_word_recording_binding_invalid");
  return `gb-word-${createHash("sha256").update(`${canonicalWordId}|${recordingSha256}`).digest("hex").slice(0, 20)}`;
}
