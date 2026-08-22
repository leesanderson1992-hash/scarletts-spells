export interface SentenceDictationContract {
  sentence: string;
  audioText: string;
  targetTokenIndex: number;
}

export type CanonicalSentenceDictationTargetBinding =
  | { kind: "token"; tokenIndex: number }
  | { kind: "span"; startTokenIndex: number; endTokenIndexExclusive: number; exactAnswer: string };

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function resolveSentenceDictationContract(
  promptData: Readonly<Record<string, unknown>>,
  targetWord: string | null,
): SentenceDictationContract | null {
  const sentence = nonEmpty(promptData.sentence) ?? nonEmpty(promptData.authoredSentence);
  if (sentence === null || targetWord === null) return null;
  const tokens = sentence
    .split(/\s+/)
    .map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, ""));
  const governed = targetWord.toLocaleLowerCase("en-GB");
  const suppliedIndex = promptData.targetTokenIndex;
  const targetTokenIndex = Number.isInteger(suppliedIndex) && Number(suppliedIndex) >= 0
    ? Number(suppliedIndex)
    : tokens.findIndex((token) => token === governed);
  if (targetTokenIndex < 0 || tokens[targetTokenIndex] !== governed) return null;
  return {
    sentence,
    audioText: nonEmpty(promptData.audioText) ?? sentence,
    targetTokenIndex,
  };
}

export function extractSentenceTarget(attempt: string, targetTokenIndex: number): string {
  return attempt
    .trim()
    .split(/\s+/)
    .map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, ""))
    .filter(Boolean)[targetTokenIndex] ?? "";
}

/** Extracts only the governed evidence target; the learner still writes the whole sentence. */
export function extractCanonicalSentenceTarget(
  attempt: string,
  binding: CanonicalSentenceDictationTargetBinding,
): string {
  const tokens = attempt
    .trim()
    .split(/\s+/)
    .map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, ""))
    .filter(Boolean);
  return binding.kind === "token"
    ? tokens[binding.tokenIndex] ?? ""
    : tokens.slice(binding.startTokenIndex, binding.endTokenIndexExclusive).join(" ");
}
