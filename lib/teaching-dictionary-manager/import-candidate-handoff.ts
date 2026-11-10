import { hasCandidateRule } from "./lesson-candidate";

export type ImportCandidatePending = { wordId: string; word: string; skillKey: string;
  reason: string };

/** CSV publication preserves its reviewed facts. Supported lesson candidates
 * then pass through the same governed approval action as the admin screens. */
export async function approveImportedCandidates(input: {
  wordId: string;
  word: string;
  senseId: string | undefined;
  skillKeys: readonly string[];
  approve: (skillKey: string, senseId: string) => Promise<{ ok: boolean; error?: string;
    blocked?: { reason: string }[] }>;
}): Promise<{ approved: number; pending: ImportCandidatePending[] }> {
  const supported = [...new Set(input.skillKeys.filter(hasCandidateRule))];
  const pending: ImportCandidatePending[] = [];
  let approved = 0;
  for (const skillKey of supported) {
    if (!input.senseId) {
      pending.push({ wordId: input.wordId, word: input.word, skillKey,
        reason: "Choose the reviewed meaning on the word page." });
      continue;
    }
    try {
      const result = await input.approve(skillKey, input.senseId);
      if (result.ok) approved += 1;
      else pending.push({ wordId: input.wordId, word: input.word, skillKey,
        reason: result.blocked?.[0]?.reason ?? result.error ?? "Review this candidate on the word page." });
    } catch {
      pending.push({ wordId: input.wordId, word: input.word, skillKey,
        reason: "Candidate approval could not be confirmed. Recheck on the word page." });
    }
  }
  return { approved, pending };
}
