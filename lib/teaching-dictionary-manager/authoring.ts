import type { WordDraftPayload } from "./contracts";
const normaliseWord = (value: string) =>
  value.trim().toLocaleLowerCase("en-GB").replace(/[’ʼ]/g, "'");

export type DictationVariant = {
  id: string;
  sentence: string;
  targetTokenIndex: number;
  audioText: string;
};
export type ReviewedTransformation = {
  type: string;
  sourcePartId: string;
  sourceText: string;
  surfaceText: string;
  explanation: string;
};

export function sentenceTokens(sentence: string): string[] {
  return sentence.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
}

export function targetOccurrences(sentence: string, word: string): number[] {
  const tokens = sentenceTokens(sentence);
  const size = normaliseWord(word).split(/\s+/u).length;
  return tokens.flatMap((_, index) =>
    normaliseWord(tokens.slice(index, index + size).join(" ")) ===
    normaliseWord(word)
      ? [index]
      : [],
  );
}

export function dictationVariants(
  payload: Pick<
    WordDraftPayload,
    "dictationSentence" | "dictationTargetTokenIndex" | "dictationVariants"
  >,
): DictationVariant[] {
  return payload.dictationVariants?.length
    ? payload.dictationVariants
    : [
        {
          id: "primary",
          sentence: payload.dictationSentence,
          targetTokenIndex: payload.dictationTargetTokenIndex,
          audioText: payload.dictationSentence,
        },
      ];
}

export function dictationVariantBlockers(
  word: string,
  variants: readonly DictationVariant[],
): string[] {
  if (!Array.isArray(variants) || !variants.length)
    return ["Add a dictation sentence."];
  if (variants.length > 30)
    return ["Keep at most 30 reviewed dictation variants."];
  const blockers: string[] = [];
  const ids = new Set<string>();
  const sentences = new Set<string>();
  variants.forEach((variant, index) => {
    const label = `Dictation sentence ${index + 1}`;
    if (
      !variant ||
      typeof variant.sentence !== "string" ||
      typeof variant.id !== "string"
    ) {
      blockers.push(`${label} is invalid.`);
      return;
    }
    if (!variant.id || ids.has(variant.id))
      blockers.push(`${label} needs a unique identity.`);
    ids.add(variant.id);
    if (!variant.sentence?.trim() || sentences.has(variant.sentence.trim()))
      blockers.push(`${label} is empty or duplicated.`);
    sentences.add(variant.sentence?.trim());
    if (
      !Number.isInteger(variant.targetTokenIndex) ||
      !targetOccurrences(variant.sentence, word).includes(
        variant.targetTokenIndex,
      )
    )
      blockers.push(`${label} needs the exact target occurrence.`);
    if (variant.audioText !== variant.sentence)
      blockers.push(`${label} audio text must match its sentence.`);
  });
  return blockers;
}

/** Stable across a retry, varied across assignment dates, and independent of array/database order. */
export function selectDictationVariant(
  variants: readonly DictationVariant[],
  seed: string,
): DictationVariant | null {
  const ordered = [...variants].sort((a, b) => a.id.localeCompare(b.id));
  if (!ordered.length) return null;
  let hash = 2166136261;
  for (const character of seed)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return ordered[hash % ordered.length]!;
}

export function generatedWordSum(
  parts: readonly unknown[],
  word: string,
): string {
  const sources = parts
    .map((part) =>
      part && typeof part === "object"
        ? String(
            (part as Record<string, unknown>).sourceText ||
              (part as Record<string, unknown>).surfaceText ||
              (part as Record<string, unknown>).text ||
              "",
          )
        : "",
    )
    .filter(Boolean);
  return sources.length ? `${sources.join(" + ")} → ${word}` : "";
}

export function writtenSyllableBlockers(
  word: string,
  breakdown: string | undefined,
): string[] {
  if (!breakdown?.trim()) return [];
  const letters = (value: string) =>
    normaliseWord(value).replace(/[^\p{L}\p{N}]/gu, "");
  return letters(word) === letters(breakdown)
    ? []
    : ["Written syllable breakdown must reproduce the word."];
}

export function canonicalStructureBlockers(
  morphology: WordDraftPayload["canonicalMorphology"],
  word: string,
): string[] {
  if (morphology.analysisStatus !== "approved") return [];
  const blockers: string[] = [];
  const parts = morphology.parts as Record<string, unknown>[];
  if (
    !parts.every(
      (part) =>
        part &&
        typeof part === "object" &&
        typeof part.id === "string" &&
        typeof (part.surfaceText ?? part.text) === "string",
    )
  )
    return ["Canonical morphology parts are invalid."];
  if (new Set(parts.map((part) => part.id)).size !== parts.length)
    blockers.push("Canonical morphology part identities must be unique.");
  if (morphology.joins.length !== Math.max(0, parts.length - 1))
    blockers.push("Canonical morphology joins must connect every part.");
  let surface = "";
  parts.forEach((part, index) => {
    surface += String(part.surfaceText ?? part.text ?? "");
    if (index < parts.length - 1) {
      const join = morphology.joins[index] as
        | Record<string, unknown>
        | undefined;
      const kind = join?.joinType;
      if (
        !join ||
        join.afterPartId !== part.id ||
        join.beforePartId !== parts[index + 1]?.id ||
        !["none", "space", "hyphen"].includes(String(kind))
      )
        blockers.push(
          "Canonical morphology joins must connect the ordered part identities.",
        );
      surface += kind === "space" ? " " : kind === "hyphen" ? "-" : "";
    }
  });
  if (surface !== word)
    blockers.push("Canonical morphology parts and joins must spell the word.");
  const transformed=new Map(parts.map(part=>[part.id,String(part.sourceText??part.surfaceText??part.text??"")]));
  for (const [index,t] of (morphology.transformations ?? []).entries()) {
    const part=t ? parts.find(part=>part.id===t.sourcePartId) : undefined;
    if(!t||!t.type?.trim()||!part||typeof t.sourceText!=="string"||typeof t.surfaceText!=="string"||!t.explanation?.trim()) {
      blockers.push(`Transformation ${index+1} needs its part, forms and explanation.`);continue;
    }
    if(transformed.get(t.sourcePartId)!==t.sourceText)blockers.push(`Transformation ${index+1} disagrees with the preceding form of its part.`);
    transformed.set(t.sourcePartId,t.surfaceText);
  }
  if(morphology.transformations!==undefined)for(const part of parts)if(transformed.get(part.id)!==String(part.surfaceText??part.text??""))
    blockers.push(`Canonical morphology transformation missing or inconsistent for ${String(part.sourceText??part.text??"")} → ${String(part.surfaceText??part.text??"")}.`);
  return [...new Set(blockers)];
}

/** Compatibility columns are derived from the reviewed builder, once approved. */
export function withDerivedMorphologyMetadata(
  payload: WordDraftPayload,
): WordDraftPayload {
  if (
    payload.canonicalMorphology.analysisStatus !== "approved" ||
    !payload.canonicalMorphology.parts.length
  )
    return payload;
  const morphemes = payload.canonicalMorphology.parts
    .map((raw) => {
      const part = raw as Record<string, unknown>;
      return String(part.sourceText ?? part.surfaceText ?? part.text ?? "");
    })
    .join(" + ");
  const notes = [
    payload.canonicalMorphology.wordSum,
    ...(payload.canonicalMorphology.transformations ?? []).map(
      (t) => t.explanation,
    ),
  ]
    .filter(Boolean)
    .join(". ");
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      morphemes: payload.metadata.morphemes || morphemes,
      morphology_notes: payload.metadata.morphology_notes || notes,
    },
  };
}
