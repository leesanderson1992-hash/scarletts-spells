import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { calculateAuthenticUsePreview, AUTHENTIC_USE_POLICY, type AuthenticUseFinding, type AuthenticUsePreview } from "@/lib/writing-engine/whole-writing/authentic-use-credit";
import { extractWholeWriting, object, type SourceSnapshot } from "@/lib/writing-engine/whole-writing/source";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const string = (value: unknown): string => typeof value === "string" ? value : "";
const missing = (code: string | undefined) => ["PGRST205", "42P01", "PGRST202", "42883"].includes(code ?? "");
export type AuthenticUseControl = { mode: "off" | "shadow" | "enabled"; gold_enabled: boolean; proficiency_enabled: boolean; activation_cutoff: string };
export type AuthenticUseReview = { control: AuthenticUseControl; preview: AuthenticUsePreview | null; fingerprint: string | null;
  firstAttempt: boolean; finalised: boolean; eligibleForAwards: boolean; sourceMissing: boolean };

export async function loadAuthenticUseControl(client: SupabaseClient, parentUserId: string, childId: string): Promise<AuthenticUseControl> {
  const loaded = await client.from("authentic_use_controls").select("mode,gold_enabled,proficiency_enabled,activation_cutoff")
    .eq("parent_user_id", parentUserId).eq("child_id", childId).maybeSingle();
  if (loaded.error && !missing(loaded.error.code)) throw new Error("AUTHENTIC_USE_CONTROL_UNAVAILABLE");
  return loaded.data as AuthenticUseControl ?? { mode: "off", gold_enabled: false, proficiency_enabled: false, activation_cutoff: "" };
}

/** Normalize existing findings only. Never run a new spelling or AI analyser. */
export function findingsFromReviewFacts(facts: Row): AuthenticUseFinding[] {
  const issues = rows(facts.issues);
  const verifications = new Map<string, Row>();
  for (const row of rows(facts.verifications)) verifications.set(string(row.source_entity_id), row);
  const disposition = (issue: Row): AuthenticUseFinding["disposition"] => {
    if (issue.final_classification === "not_an_issue" || issue.draft_final_classification === "not_an_issue") return "dismissed";
    return issue.parent_marked_at || issue.approved_replacement || issue.final_classification || issue.draft_final_classification ? "error" : "unresolved";
  };
  const result: AuthenticUseFinding[] = issues.map(issue => ({ id: string(issue.id), observed: string(issue.observed_text),
    intended: string(issue.approved_replacement) || null, disposition: disposition(issue), occurrenceId: string(issue.source_writing_occurrence_id) || null }));
  for (const suggestion of rows(facts.suggestions)) {
    if (issues.some(issue => issue.source_suggestion_id === suggestion.id)) continue;
    const verification = verifications.get(string(suggestion.id));
    const dismissed = suggestion.suggestion_status === "rejected" || suggestion.suggestion_status === "superseded" || verification?.decision === "false_positive";
    result.push({ id: string(suggestion.id), observed: string(suggestion.observed_text),
      intended: suggestion.suggestion_status === "accepted" ? string(suggestion.suggested_replacement) || null : null,
      disposition: dismissed ? "dismissed" : suggestion.suggestion_status === "accepted" ? "error" : "unresolved" });
  }
  for (const misspelling of rows(facts.misspellings)) {
    if (issues.some(issue => issue.source_misspelling_instance_id === misspelling.id) || rows(facts.suggestions).some(s => s.misspelling_instance_id === misspelling.id)) continue;
    const verification = verifications.get(string(misspelling.id));
    result.push({ id: string(misspelling.id), observed: string(misspelling.misspelled_word),
      intended: verification && ["accepted", "overridden"].includes(string(verification.decision)) ? string(misspelling.corrected_word) || null : null,
      disposition: misspelling.is_false_positive || verification?.decision === "false_positive" ? "dismissed" : verification ? "error" : "unresolved" });
  }
  const passageDecisions = new Map<string, Row>();
  const passageCorrections = new Map<string, string>();
  for (const event of rows(facts.passage_decisions)) {
    passageDecisions.set(string(event.finding_id), event);
    if (event.action === "EDIT") passageCorrections.set(string(event.finding_id), string(event.correction));
  }
  for (const finding of rows(facts.passage_findings)) {
    if (issues.some(issue => issue.source_writing_occurrence_id === finding.occurrence_id && object(issue.metadata).source_kind === "contextual_advisory_v4")) continue;
    const event = passageDecisions.get(string(finding.id));
    const correction = passageCorrections.get(string(finding.id));
    result.push({ id: string(finding.id), observed: string(finding.observed_text), occurrenceId: string(finding.occurrence_id),
      intended: correction || null, disposition: event?.action === "DISMISS" ? "dismissed" : correction ? "error" : "unresolved" });
  }
  for (const observation of rows(facts.context_observations)) {
    if (observation.observation_status === "VALID" || rows(facts.context_decisions).some(d => d.occurrence_id === observation.occurrence_id)) continue;
    result.push({ id: string(observation.id), observed: string(observation.observed_member), occurrenceId: string(observation.occurrence_id), intended: null, disposition: "unresolved" });
  }
  for (const decision of rows(facts.context_decisions)) {
    if (decision.classification === "VALID" || decision.classification === "EXCLUDED") continue;
    result.push({ id: string(decision.id), observed: string(decision.observed_member), occurrenceId: string(decision.occurrence_id),
      intended: string(decision.intended_member) || null, disposition: decision.classification === "INVALID" ? "error" : "unresolved" });
  }
  return result;
}

export async function loadAuthenticUseReview(input: { submissionId: string; parentUserId: string; childId: string; client?: SupabaseClient }): Promise<AuthenticUseReview> {
  const client = input.client ?? createServiceRoleClient();
  const control = await loadAuthenticUseControl(client, input.parentUserId, input.childId);
  const empty: AuthenticUseReview = { control, preview: null, fingerprint: null, firstAttempt: false, finalised: false, eligibleForAwards: false, sourceMissing: false };
  if (control.mode === "off") return empty;
  const loaded = await client.rpc("load_authentic_use_review", { p_submission_id: input.submissionId });
  if (loaded.error) throw new Error("AUTHENTIC_USE_REVIEW_UNAVAILABLE");
  const data = object(loaded.data), facts = object(data.facts), submission = object(facts.submission), chain = object(facts.chain);
  if (submission.parent_user_id !== input.parentUserId || submission.child_id !== input.childId) throw new Error("AUTHENTIC_USE_PARENT_OWNERSHIP");
  const finalised = Boolean(object(facts.review).id);
  const firstAttempt = chain.first_submission_id === input.submissionId;
  const snapshot = facts.snapshot as SourceSnapshot | null;
  if (!snapshot) return { ...empty, firstAttempt, finalised, sourceMissing: true, fingerprint: string(data.fingerprint) };
  const preview = finalised ? object(facts.review).preview as AuthenticUsePreview : calculateAuthenticUsePreview({ snapshot,
    findings: findingsFromReviewFacts(facts), spellingComplete: facts.processing_complete === true,
    scannedWindows: rows(facts.ai_attempts).map(a => ({ windowFingerprint: string(a.window_fingerprint), status: string(a.result_status) })) });
  return { control, preview, fingerprint: string(data.fingerprint), firstAttempt, finalised, sourceMissing: false,
    eligibleForAwards: firstAttempt && !finalised && control.mode === "enabled" && Date.parse(snapshot.occurred_at) >= Date.parse(control.activation_cutoff) };
}

export async function prepareAuthenticUseParentAction(input: { submissionId: string; parentUserId: string; childId: string; formData: FormData }): Promise<{ review: AuthenticUseReview; preparationId: string | null }> {
  const client = createServiceRoleClient();
  const review = await loadAuthenticUseReview({ ...input, client });
  if (review.control.mode === "off" || review.finalised) return { review, preparationId: null };
  if (input.formData.get("authentic_use_review_confirmed") !== "true") throw new Error("Confirm that you reviewed the original writing before awarding authentic uses.");
  const manualReview = input.formData.get("authentic_use_manual_review") === "true";
  const preview = review.preview ?? { policyVersion: AUTHENTIC_USE_POLICY, snapshotId: "", candidates: [], blocked: [], excludedFields: [], requiresManualReview: true };
  if (preview.requiresManualReview && !manualReview) throw new Error("The automatic checks are incomplete. Confirm a manual review of the original writing before continuing.");
  if (review.preview?.snapshotId) {
    const source = await client.from("writing_source_snapshots").select("*").eq("id", review.preview.snapshotId)
      .eq("parent_user_id", input.parentUserId).eq("child_id", input.childId).single();
    if (source.error) throw new Error("The original writing index is unavailable.");
    const baseline = extractWholeWriting(source.data as SourceSnapshot);
    const baselineIds = new Set(baseline.occurrences.map(o => o.id));
    const extraction = extractWholeWriting(source.data as SourceSnapshot, { authenticUse: true });
    for (let offset = 0; offset < extraction.occurrences.length; offset += 100) {
      const saved = await client.from("writing_occurrences").upsert(extraction.occurrences.slice(offset, offset + 100).map(o => ({
        id: o.id, snapshot_id: review.preview!.snapshotId, field_path: o.fieldKey, field_hash: o.textHash,
        start_utf16: o.start, end_utf16: o.end, observed_text: o.observedText, provenance: o.provenance, extractor_version: baselineIds.has(o.id) ? baseline.version : extraction.version,
      })), { onConflict: "id", ignoreDuplicates: true });
      if (saved.error) throw new Error("The original writing index could not be saved.");
    }
  }
  const prepared = await client.rpc("prepare_authentic_use_review", { p_submission_id: input.submissionId,
    p_fingerprint: review.fingerprint, p_preview: preview, p_manual_review: manualReview });
  if (prepared.error || !prepared.data) throw new Error("The review changed. Reload and check the authentic-use preview before continuing.");
  return { review, preparationId: prepared.data as string };
}
