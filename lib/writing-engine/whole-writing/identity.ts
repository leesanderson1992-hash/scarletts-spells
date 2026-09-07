import { fingerprintSnapshotValue } from "../../adle/composable-lesson/canonical-fingerprint";

export const IDENTITY_VERSION = "WHOLE_WRITING_IDENTITY_V1";
export type WordIdentity = { id: string; normalised_word: string; dialect: string; row_status: string };
export function normaliseSurface(text: string) { return text.normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'"); }

export function buildIdentityIndex(words: readonly WordIdentity[]) {
  const index = new Map<string, WordIdentity[]>();
  for (const word of words) {
    const key = `${word.dialect}:${normaliseSurface(word.normalised_word)}`;
    index.set(key, [...(index.get(key) ?? []), word]);
  }
  const releaseFingerprint = fingerprintSnapshotValue([...words].sort((a, b) => a.id.localeCompare(b.id)));
  return {
    version: IDENTITY_VERSION, releaseFingerprint,
    resolve(text: string, dialect: string) {
      const matches = index.get(`${dialect}:${normaliseSurface(text)}`) ?? [];
      const active = matches.filter((word) => word.row_status === "active");
      const status = active.length === 1 ? "resolved" : active.length > 1 ? "ambiguous" : matches.length ? "inactive" : "unmapped";
      return { status, canonicalWordId: status === "resolved" ? active[0].id : null,
        candidates: active.map((word) => word.id).sort(), dialect, normalizedForm: normaliseSurface(text),
        intendedWordCandidates: [], correctness: "NOT_ASSESSED", identityVersion: IDENTITY_VERSION, releaseFingerprint };
    },
  };
}
