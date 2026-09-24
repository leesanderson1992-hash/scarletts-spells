import type { ContextFamilyKey } from "./context";

/** Browser-safe presentation/routing membership, identical to the governed
 * canonical member sets. It does not import analyser manifests or predictions. */
const FAMILY_BY_MEMBER: ReadonlyMap<string, ContextFamilyKey> = new Map(Object.entries({
  there: "THERE_THEIR_THEYRE",
  their: "THERE_THEIR_THEYRE",
  "they're": "THERE_THEIR_THEYRE",
  to: "TO_TOO_TWO",
  too: "TO_TOO_TWO",
  two: "TO_TOO_TWO",
  your: "YOUR_YOURE",
  "you're": "YOUR_YOURE",
  its: "ITS_ITS",
  "it's": "ITS_ITS",
} as Record<string, ContextFamilyKey>));

export function governedContextFamily(surface: string): ContextFamilyKey | null {
  return FAMILY_BY_MEMBER.get(surface.normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'")) ?? null;
}
