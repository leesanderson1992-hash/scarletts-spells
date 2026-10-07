import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleReviewWorkDetail } from "@/lib/adle/review-work/read-model";
import { readAttributedOccurrence } from "@/lib/adle/review-work/additional-spelling";
import { calculateAuthenticUseFromOccurrences, extractAdleAuthenticWriting,
  type AuthenticUseFinding, type AuthenticUsePreview } from "@/lib/writing-engine/whole-writing/authentic-use-credit";
import { object } from "@/lib/writing-engine/whole-writing/source";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const string = (value: unknown): string => typeof value === "string" ? value : "";

export type AdleAuthenticUseReview = {
  enabled: boolean; eligibleForAwards: boolean; finalised: boolean; sourceMissing: boolean;
  sourceId: string | null; sourceHash: string | null; fingerprint: string | null;
  preview: AuthenticUsePreview | null;
  occurrences: { id: string; startUtf16: number; endUtf16: number; observed: string }[];
};

/** Read only: the database fingerprint covers every mutable parent decision. */
export async function loadAdleAuthenticUseReview(input: {
  client: SupabaseClient; detail: AdleReviewWorkDetail;
}): Promise<AdleAuthenticUseReview> {
  const { client, detail } = input;
  const empty: AdleAuthenticUseReview = { enabled: false, eligibleForAwards: false, finalised: false,
    sourceMissing: false, sourceId: null, sourceHash: null, fingerprint: null, preview: null, occurrences: [] };
  const loaded = await client.rpc("load_adle_authentic_use_review", { p_review_session_id: detail.reviewSessionId });
  if (loaded.error) throw new Error("ADLE_AUTHENTIC_USE_REVIEW_UNAVAILABLE");
  const response = object(loaded.data), facts = object(response.facts), source = object(facts.source);
  const control = object(facts.control), runtime = object(facts.runtime), review = object(facts.review), job = object(facts.job);
  if (!source.id) return { ...empty, sourceMissing: true };
  if (source.parent_user_id !== detail.parentUserId || source.child_id !== detail.childId ||
    source.review_session_id !== detail.reviewSessionId) throw new Error("ADLE_AUTHENTIC_USE_OWNERSHIP");
  const sourceHash = createHash("sha256").update(detail.submittedWritingText).digest("hex");
  if (source.source_hash !== sourceHash || source.submitted_text !== detail.submittedWritingText)
    throw new Error("ADLE_AUTHENTIC_USE_SOURCE_MISMATCH");
  const finalised = !!review.id || !!object(facts.receipt).review_session_id;
  const enabled = control.mode === "enabled" && runtime.enabled === true;
  const historical = object(facts.historical_grant).source_hash === sourceHash;
  const eligibleForAwards = enabled && !finalised && (!!historical ||
    Date.parse(string(source.submitted_at)) >= Date.parse(string(control.activation_cutoff)));
  if (finalised) return { ...empty, enabled, finalised, sourceId: string(source.id),
    sourceHash, fingerprint: string(response.fingerprint), preview: review.id ? review.preview as AuthenticUsePreview : null };

  const extracted = extractAdleAuthenticWriting({ sourceId: detail.reviewSessionId,
    sourceHash, text: detail.submittedWritingText });
  const occurrenceAt = (start: number, end: number) => extracted.occurrences.find(o => o.start === start && o.end === end)?.id ?? null;
  const findings: AuthenticUseFinding[] = [];
  for (const finding of rows(facts.context_findings)) {
    const start = Number(finding.start_utf16), end = Number(finding.end_utf16);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      detail.submittedWritingText.slice(start, end) !== finding.observed_text || finding.source_hash !== sourceHash)
      throw new Error("ADLE_AUTHENTIC_USE_CONTEXT_SPAN");
    const decision = rows(facts.context_decisions).find(d => d.finding_id === finding.id &&
      ["confirm", "dismiss"].includes(string(d.action)));
    const action = string(decision?.action);
    findings.push({ id: string(finding.id), observed: string(finding.observed_text),
      intended: action === "confirm" ? string(decision?.intended_word) : null,
      disposition: action === "dismiss" ? "dismissed" : action === "confirm" ? "error" : "unresolved",
      occurrenceId: occurrenceAt(start, end) });
  }
  for (const choice of rows(facts.parent_context_choices)) {
    const start = Number(choice.start_utf16), end = Number(choice.end_utf16);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start ||
      detail.submittedWritingText.slice(start, end) !== choice.observed_text || choice.source_hash !== sourceHash)
      throw new Error("ADLE_AUTHENTIC_USE_PARENT_CONTEXT_SPAN");
    const decision = string(choice.decision);
    findings.push({ id: string(choice.id), observed: string(choice.observed_text),
      intended: decision === "confirmed" ? string(choice.intended_word) : null,
      disposition: decision === "dismissed" ? "dismissed" : decision === "confirmed" ? "error" : "unresolved",
      occurrenceId: occurrenceAt(start, end) });
  }
  for (const issue of rows(facts.parent_issues)) {
    const start = Number(issue.position_start), end = Number(issue.position_end);
    const observed = detail.submittedWritingText.slice(start, end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || !observed ||
      observed.normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'") !== string(issue.observed_spelling_normalized).normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'"))
      throw new Error("ADLE_AUTHENTIC_USE_PARENT_SPAN");
    const status = string(issue.resolution_status);
    findings.push({ id: string(issue.id), observed, intended: ["confirmed", "sent_to_admin"].includes(status) ? string(issue.correct_spelling_normalized) : null,
      disposition: status === "not_a_learning_issue" ? "dismissed" : status === "needs_route" ? "unresolved" : "error",
      occurrenceId: occurrenceAt(start, end) });
  }
  for (const target of detail.targets) {
    if (target.originalOutcomeSource !== "writing" || target.originalOutcome !== "failure") continue;
    const attributed = readAttributedOccurrence({ attributionProvenance: target.attributionProvenance,
      canonicalSpelling: target.canonicalSpelling, encounterId: target.encounterId,
      originalOutcomeSource: target.originalOutcomeSource });
    const exactSpan = attributed.positionStart !== null && attributed.positionEnd !== null &&
      detail.submittedWritingText.slice(attributed.positionStart, attributed.positionEnd) === attributed.originalObservedSpelling;
    findings.push({ id: `target:${target.encounterId}`,
      observed: attributed.originalObservedSpelling || target.originalAttempt?.attemptText || target.canonicalSpelling,
      intended: target.canonicalSpelling, disposition: "error",
      occurrenceId: exactSpan ? occurrenceAt(attributed.positionStart!, attributed.positionEnd!) : null });
  }
  const preview = calculateAuthenticUseFromOccurrences({ sourceId: string(source.id),
    fields: [extracted.field], occurrences: extracted.occurrences, findings,
    scannedWindows: rows(facts.context_attempts).map(a => ({ windowFingerprint: string(a.window_fingerprint), status: string(a.result_status) })),
    spellingComplete: job.status === "complete" && rows(facts.parent_issues).every(i => i.resolution_status !== "needs_route"),
    suppliedWords: detail.targets.map(t => t.canonicalSpelling) });
  return { enabled, eligibleForAwards, finalised, sourceMissing: false,
    sourceId: string(source.id), sourceHash, fingerprint: string(response.fingerprint), preview,
    occurrences: extracted.occurrences.map(o => ({ id: o.id, startUtf16: o.start, endUtf16: o.end,
      observed: o.observedText })) };
}
