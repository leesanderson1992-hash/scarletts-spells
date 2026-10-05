import { extractWholeWriting, object, type SourceSnapshot } from "./source";
import { normaliseSurface } from "./identity";
import { planPassageWindows } from "./context-passage-scan";

export const AUTHENTIC_USE_POLICY = "FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05";
export type AuthenticUseFinding = {
  id: string; observed: string; intended: string | null;
  disposition: "error" | "unresolved" | "dismissed";
  occurrenceId?: string | null;
};
export type AuthenticUseCreditCandidate = {
  wordKey: string; observedWord: string; occurrenceIds: string[];
  suppliedSpelling: boolean;
};
export type AuthenticUsePreview = {
  policyVersion: string; snapshotId: string; candidates: AuthenticUseCreditCandidate[];
  blocked: { wordKey: string; findingIds: string[] }[];
  excludedFields: string[]; requiresManualReview: boolean;
};

/** Recognition is deliberately separate from correctness and skill membership.
 * The parent's whole-piece confirmation verifies all otherwise eligible words. */
export function calculateAuthenticUsePreview(input: {
  snapshot: SourceSnapshot; findings: AuthenticUseFinding[];
  scannedWindows: { windowFingerprint: string; status: string }[];
  spellingComplete: boolean;
}): AuthenticUsePreview {
  const extracted = extractWholeWriting(input.snapshot, { authenticUse: true });
  const fields = extracted.fields.filter(field => field.provenance === "learner_response");
  const eligiblePaths = new Set(fields.map(field => field.key));
  const occurrences = extracted.occurrences.filter(o => eligiblePaths.has(o.fieldKey));
  const expectedWindows = planPassageWindows({ fields: fields.map(f => ({ path: f.key, hash: f.textHash, text: f.rawText })) });
  const scanned = new Set(input.scannedWindows.filter(w => w.status === "SCANNED").map(w => w.windowFingerprint));
  const blocked = new Map<string, Set<string>>();
  const block = (text: string, id: string) => {
    // Multiword findings block their observed span. Only explicit intended forms
    // block a correctly written sibling; never derive corrections heuristically.
    for (const word of text.match(/[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu) ?? []) {
      const key = normaliseSurface(word);
      const ids = blocked.get(key) ?? new Set<string>(); ids.add(id); blocked.set(key, ids);
    }
  };
  for (const finding of input.findings) {
    if (finding.disposition === "dismissed") continue;
    const occurrence = finding.occurrenceId ? occurrences.find(o => o.id === finding.occurrenceId) : null;
    block(occurrence?.observedText ?? finding.observed, finding.id);
    // An unconfirmed suggestion must not invalidate another correctly spelt word.
    if (finding.disposition === "error" && finding.intended) block(finding.intended, finding.id);
  }
  const schema = object(object(input.snapshot.envelope.taskContext).lessonSchema);
  const supplied = new Set<string>();
  function collectTargets(value: unknown) {
    if (Array.isArray(value)) { value.forEach(collectTargets); return; }
    for (const [key, entry] of Object.entries(object(value))) {
      if (["target_word", "target_words", "supplied_word", "supplied_words"].includes(key)) {
        for (const word of Array.isArray(entry) ? entry : [entry]) if (typeof word === "string") supplied.add(normaliseSurface(word));
      } else if (typeof entry === "object") collectTargets(entry);
    }
  }
  collectTargets(schema);
  // Supplied spellings must sit within the child's own writing, rather than
  // an isolated copy/list of the supplied targets. Context correctness still
  // comes from existing findings and the parent's whole-piece confirmation.
  const authoredContextPaths = new Set(occurrences.filter(o => !supplied.has(normaliseSurface(o.observedText))).map(o => o.fieldKey));
  const candidates = new Map<string, AuthenticUseCreditCandidate>();
  for (const occurrence of occurrences) {
    const key = normaliseSurface(occurrence.observedText);
    if (blocked.has(key) || (supplied.has(key) && !authoredContextPaths.has(occurrence.fieldKey))) continue;
    const candidate = candidates.get(key) ?? { wordKey: key, observedWord: occurrence.observedText,
      occurrenceIds: [], suppliedSpelling: supplied.has(key) };
    candidate.occurrenceIds.push(occurrence.id); candidates.set(key, candidate);
  }
  return { policyVersion: AUTHENTIC_USE_POLICY, snapshotId: input.snapshot.id,
    candidates: [...candidates.values()].sort((a, b) => a.wordKey.localeCompare(b.wordKey)),
    blocked: [...blocked].map(([wordKey, ids]) => ({ wordKey, findingIds: [...ids].sort() })).sort((a,b) => a.wordKey.localeCompare(b.wordKey)),
    excludedFields: extracted.fields.filter(f => f.provenance !== "learner_response").map(f => f.key),
    requiresManualReview: input.findings.some(f => f.disposition === "unresolved") || !input.spellingComplete || expectedWindows === null || expectedWindows.some(w => !scanned.has(w.windowFingerprint)) ||
      extracted.fields.some(f => f.provenance === "unknown"),
  };
}
