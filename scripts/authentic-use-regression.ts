import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readProficiencyFactRows } from "../lib/authentic-use/paged-facts";
import { drainAuthenticUseDeliveries, recoverAuthenticUseDeliveries } from "../lib/authentic-use/delivery";
import { calculateAuthenticUsePreview, type AuthenticUseFinding } from "../lib/writing-engine/whole-writing/authentic-use-credit";
import { extractWholeWriting, type SourceSnapshot } from "../lib/writing-engine/whole-writing/source";
import { planPassageWindows } from "../lib/writing-engine/whole-writing/context-passage-scan";
import { findingsFromReviewFacts } from "../lib/authentic-use/review";
import { adaptAuthenticUse } from "../lib/adle/proficiency/evidence/adapters";

const snapshot: SourceSnapshot = { id: "snapshot", submission_id: "first", parent_user_id: "parent", child_id: "child",
  source_revision: "1", source_purpose: "REAL_LEARNER", occurred_at: "2026-10-05T10:00:00Z", envelope: {
    draftPayload: { answer: "Because becaus because its it’s novel Novel", copied: "excluded", fixed: "fixed", parent: "feedback" },
    captureMetadata: { rawLessonReviewSummary: "Novel joy" },
    taskContext: { lessonSchema: { target_words: ["novel"], blocks: [
      { block_id: "answer", block_type: "question_textarea" },
      { block_id: "copied", block_type: "question_text", copied: true },
      { block_id: "fixed", block_type: "question_text", response_environment: "FIXED_ANSWER" },
      { block_id: "parent", block_type: "question_text", exclude_from_spelling: true },
    ] } },
  } };
const extracted = extractWholeWriting(snapshot, { authenticUse: true });
const baseline = extractWholeWriting(snapshot);
assert.equal(baseline.version, "WHOLE_WRITING_EXTRACTION_V1");
assert(!baseline.fields.some(f => f.key === "/captureMetadata/rawLessonReviewSummary"));
assert.equal(baseline.fields.find(f => f.key === "/draftPayload/copied")!.provenance, "learner_response");
assert.equal(baseline.occurrences.find(o => o.observedText === "Because")!.id, extracted.occurrences.find(o => o.observedText === "Because")!.id);
const sharedCapture: SourceSnapshot = { ...snapshot, envelope: { rawSubmissionText: "Original lesson writing", processingPayload: { authenticUseCapture: true } } };
assert.equal(extractWholeWriting(sharedCapture).fields[0].provenance, "unknown");
assert.equal(extractWholeWriting(sharedCapture, { authenticUse: true }).fields[0].provenance, "learner_response");
const windows = planPassageWindows({ fields: extracted.fields.filter(f => f.provenance === "learner_response").map(f => ({ path: f.key, hash: f.textHash, text: f.rawText })) })!;
function preview(findings: AuthenticUseFinding[] = []) {
  return calculateAuthenticUsePreview({ snapshot, findings, spellingComplete: true,
    scannedWindows: windows.map(w => ({ windowFingerprint: w.windowFingerprint, status: "SCANNED" })) });
}
const clean = preview();
assert.equal(clean.requiresManualReview, false);
assert.deepEqual(clean.contextCoverage, { status: "complete", expectedWindowCount: windows.length,
  scannedWindowCount: windows.length, missingWindowFingerprints: [] });
assert.deepEqual(clean.candidates.map(c => c.wordKey), ["becaus", "because", "it's", "its", "joy", "novel"]);
assert.equal(clean.candidates.find(c => c.wordKey === "novel")!.occurrenceIds.length, 3);
assert.equal(clean.candidates.find(c => c.wordKey === "novel")!.suppliedSpelling, true);
const copiedTarget: SourceSnapshot = { ...snapshot, envelope: { ...snapshot.envelope, draftPayload: { answer: "novel" }, captureMetadata: {} } };
assert.equal(calculateAuthenticUsePreview({ snapshot: copiedTarget, findings: [], spellingComplete: true, scannedWindows: [] }).candidates.length, 0);
for (const o of extracted.occurrences) {
  const field = extracted.fields.find(f => f.key === o.fieldKey)!;
  assert.equal(field.rawText.slice(o.start, o.end), o.observedText);
}
const mixed = preview([{ id: "parent-error", observed: "becaus", intended: "because", disposition: "error" }]);
assert(!mixed.candidates.some(c => ["because", "becaus"].includes(c.wordKey)));
assert.deepEqual(mixed.blocked.find(c => c.wordKey === "because")!.findingIds, ["parent-error"]);
const unresolved = preview([{ id: "suggestion", observed: "becaus", intended: "because", disposition: "unresolved" }]);
assert(unresolved.candidates.some(c => c.wordKey === "because"));
assert(!unresolved.candidates.some(c => c.wordKey === "becaus"));
assert.deepEqual(preview([{ id: "dismissed", observed: "novel", intended: null, disposition: "dismissed" }]), clean);
const its = extracted.occurrences.find(o => o.observedText === "its")!;
assert(!preview([{ id: "context", observed: "", occurrenceId: its.id, intended: "it's", disposition: "error" }]).candidates.some(c => ["its", "it's"].includes(c.wordKey)));
assert(calculateAuthenticUsePreview({ snapshot, findings: [], spellingComplete: false, scannedWindows: [] }).requiresManualReview);
assert(calculateAuthenticUsePreview({ snapshot, findings: [], spellingComplete: true, scannedWindows: [] }).requiresManualReview);
assert.equal(calculateAuthenticUsePreview({ snapshot, findings: [], spellingComplete: true, scannedWindows: [] }).contextCoverage?.status, "incomplete");
const facts = findingsFromReviewFacts({
  issues: [{ id: "manual", observed_text: "becaus", approved_replacement: "because", parent_marked_at: "now" }],
  suggestions: [{ id: "dismiss", observed_text: "novel", suggestion_status: "rejected" }, { id: "pending", observed_text: "joy", suggestion_status: "pending" }],
  passage_findings: [{ id: "passage", observed_text: "its", occurrence_id: its.id }],
  passage_decisions: [{ finding_id: "passage", action: "EDIT", correction: "it's" }, { finding_id: "passage", action: "DISMISS" }],
  context_decisions: [{ id: "uncertain", occurrence_id: "some", classification: "UNCERTAIN" }],
});
assert.equal(facts.find(f => f.id === "manual")!.disposition, "error");
assert.equal(facts.find(f => f.id === "dismiss")!.disposition, "dismissed");
assert.equal(facts.find(f => f.id === "pending")!.disposition, "unresolved");
assert.equal(facts.find(f => f.id === "passage")!.disposition, "dismissed");
assert.equal(facts.find(f => f.id === "uncertain")!.disposition, "unresolved");
const independentFindings = findingsFromReviewFacts({ issues: [{ id: "dismissed-spelling", source_writing_occurrence_id: its.id, final_classification: "not_an_issue" }], passage_findings: [{ id: "context-remains", occurrence_id: its.id, observed_text: "its" }] });
assert.equal(independentFindings.find(f => f.id === "context-remains")!.disposition, "unresolved");
function spellingFacts(decision?: "false_positive" | "not_a_learning_issue" | "accepted" | "overridden") {
  const sourceEntityId = "authentic_writing::first::sample::8-13::while::whole";
  return findingsFromReviewFacts({
    submission: { id: "first" },
    misspellings: [{ id: "misspelling", writing_sample_id: "sample", position_start: 8, position_end: 13,
      misspelled_word: "while", corrected_word: "whole" }],
    suggestions: [{ id: "suggestion", misspelling_instance_id: "misspelling", observed_text: "while",
      suggested_replacement: "whole", suggestion_status: "pending" }],
    issues: [{ id: "promoted", source_suggestion_id: "suggestion", source_misspelling_instance_id: "misspelling",
      observed_text: "while", final_classification: "learning_gap" }],
    verifications: decision ? [{ id: `verification-${decision}`, source_entity_id: sourceEntityId, decision }] : [],
  });
}
assert.equal(spellingFacts("false_positive")[0].disposition, "dismissed");
assert.equal(spellingFacts("not_a_learning_issue")[0].disposition, "dismissed");
for (const decision of ["accepted", "overridden"] as const) {
  const finding = spellingFacts(decision)[0];
  assert.equal(finding.disposition, "error");
  assert.equal(finding.intended, "whole");
}
assert.equal(spellingFacts()[0].disposition, "unresolved");
const supplied = adaptAuthenticUse({ id: "event", childId: "child", canonicalWordId: "word", occurredOn: "2026-10-05",
  verifiedAt: "2026-10-05T10:00:00Z", useKind: "authentic_correct_use", parentVerified: true, pieceRef: "first-submission:chain",
  sourceRef: "authentic-use:credit", rowStatus: "active", provenanceKind: "parent_verified_supplied_spelling_application", reviewEncounterId: null, linkedReviewAttempt: null });
assert.equal(supplied.independence, "scaffolded");
async function deliveryFailure(failedConsumer: "gold" | "proficiency") {
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: async () => ({ data: [], error: null }) };
  const jobs = ["gold", "proficiency"].map(consumer => ({ consumer, credit_id: "one-credit", child_id: "one-child", parent_user_id: "one-parent", claim_token: `${consumer}-lease` }));
  const fake = {
    from: () => builder,
    rpc: async (name: string, params: Record<string, unknown> = {}) => {
      calls.push({ name, params });
      if (name === "claim_authentic_use_deliveries") return { data: jobs, error: null };
      if (name === "deliver_authentic_use_gold" && failedConsumer === "gold" || name === "stage_authentic_use_proficiency" && failedConsumer === "proficiency") return { data: null, error: { code: "FAILURE" } };
      return { data: { status: name === "stage_authentic_use_proficiency" ? "staged" : "delivered" }, error: null };
    },
  } as unknown as SupabaseClient;
  const result = await recoverAuthenticUseDeliveries(100, fake, async () => []);
  assert.equal(result.failed, 1);
  assert.equal(result.delivered, 1);
  assert.deepEqual(calls.find(c => c.name === "fail_authentic_use_delivery")!.params, {
    p_credit_id: "one-credit", p_consumer: failedConsumer, p_claim_token: `${failedConsumer}-lease`,
  });
  assert(calls.some(c => c.name === (failedConsumer === "gold" ? "complete_authentic_use_proficiency" : "deliver_authentic_use_gold")));
}
async function runDeliveryChecks() {
  const history = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const query = { order: () => query, range: async (from: number, to: number) => ({ data: history.slice(from, to + 1), error: null }) };
  const complete = await readProficiencyFactRows<{ id: number }>(query as never, "history");
  assert.equal(complete.length, 1201);
  assert.equal(complete.at(-1)!.id, 1200);
  await deliveryFailure("gold");
  await deliveryFailure("proficiency");
  const pending = Array.from({ length: 184 }, (_, index) => ({ consumer: index % 2 ? "gold" : "proficiency",
    credit_id: `credit-${Math.floor(index / 2)}`, child_id: "one-child", parent_user_id: "one-parent", claim_token: `lease-${index}` }));
  const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: async () => ({ data: [], error: null }) };
  const drainClient = {
    from: () => builder,
    rpc: async (name: string, params: Record<string, unknown> = {}) => {
      if (name === "claim_authentic_use_deliveries") return { data: pending.splice(0, Number(params.p_limit)), error: null };
      if (name === "count_authentic_use_delivery_backlog") return { data: pending.length, error: null };
      return { data: { status: name === "stage_authentic_use_proficiency" ? "staged" : "delivered" }, error: null };
    },
  } as unknown as SupabaseClient;
  const drained = await drainAuthenticUseDeliveries({ client: drainClient, calculate: async () => [], timeBudgetMs: 60_000 });
  assert.deepEqual({ claimed: drained.claimed, delivered: drained.delivered, remaining: drained.remaining,
    batches: drained.batches, failed: drained.failed, timedOut: drained.timedOut },
  { claimed: 184, delivered: 184, remaining: 0, batches: 2, failed: 0, timedOut: false });
  console.log("Authentic-use candidate, parent-decision, coverage, 184-receipt drain and independent consumer regressions passed.");
}
runDeliveryChecks().catch(error => { console.error(error); process.exitCode = 1; });
