import { normaliseWord } from "./contracts";

export const BASE_WORD_SKILLS = [
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
] as const;

export type BaseWordSkill = (typeof BASE_WORD_SKILLS)[number];

/** A form suggestion only. The reviewer still decides and approves the skill. */
export function suggestedBaseWordSkill(parts: unknown): BaseWordSkill {
  if (!Array.isArray(parts)) return "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
  const kinds = new Set(parts.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const part = raw as Record<string, unknown>;
    const kind = part.kind ?? part.type ?? part.partType;
    return typeof kind === "string" ? [kind] : [];
  }));
  if (kinds.has("prefix") && !kinds.has("suffix")) return "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX";
  if (kinds.has("suffix") && !kinds.has("prefix")) return "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX";
  return "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
}

export interface FamilyCandidateWord {
  id: string;
  normalisedWord: string;
  displayWord: string;
  dialectCode: string;
  rowStatus: string;
  reviewStatus: string;
}

export interface FamilyCandidateMorphology {
  analysisStatus: string;
  reviewStatus: string;
  parts: unknown;
  wordSum: string | null;
}

export interface FamilyCandidate {
  baseWordId: string;
  proposedKey: string;
  memberWordId: string;
  source: "standalone_word" | "reviewed_morphology";
  wordSum: string | null;
}

/** Every approved dictionary word has a virtual singleton. No database row or
 * lesson permission is created until a reviewer accepts a relationship. */
export function virtualFamilyCandidate(word: FamilyCandidateWord): FamilyCandidate | null {
  if (word.rowStatus !== "active" || word.reviewStatus !== "approved_for_first_exposure") return null;
  return {
    baseWordId: word.id,
    proposedKey: `${normaliseWord(word.normalisedWord).replace(/[^\p{L}\p{N}]+/gu, "_")}_family`,
    memberWordId: word.id,
    source: "standalone_word",
    wordSum: null,
  };
}

/** Suggest only exact canonical base identities. A matching letter substring or
 * an unreviewed raw segmentation is never a family relationship. */
export function reviewedMorphologyFamilyCandidates(
  member: FamilyCandidateWord,
  morphology: FamilyCandidateMorphology | null,
  approvedWords: readonly FamilyCandidateWord[],
): FamilyCandidate[] {
  if (!virtualFamilyCandidate(member) || morphology?.analysisStatus !== "approved" ||
      morphology.reviewStatus !== "approved_for_first_exposure" || !Array.isArray(morphology.parts)) return [];
  const baseTexts = new Set(morphology.parts.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const part = raw as Record<string, unknown>;
    if (part.kind !== "base" && part.partType !== "free_base" && part.role !== "base") return [];
    const source = part.sourceText ?? part.text;
    return typeof source === "string" && source.trim() ? [normaliseWord(source)] : [];
  }));
  return approvedWords.flatMap((base) => {
    if (!baseTexts.has(base.normalisedWord) || base.id === member.id ||
        base.dialectCode !== member.dialectCode) return [];
    const virtual = virtualFamilyCandidate(base);
    return virtual ? [{ ...virtual, memberWordId: member.id, source: "reviewed_morphology" as const,
      wordSum: morphology.wordSum }] : [];
  }).sort((a, b) => a.proposedKey.localeCompare(b.proposedKey) || a.baseWordId.localeCompare(b.baseWordId));
}
