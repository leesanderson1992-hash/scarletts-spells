import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- additive shadow tables intentionally precede generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";

export type WholeWritingReportMode = "current" | "history";

export type WholeWritingReportRow = {
  receiptId: string;
  batchId: string;
  runId: string;
  snapshotId: string;
  learnerId: string;
  occurredAt: string;
  batchCreatedAt: string;
  observedText: string;
  fieldPath: string;
  startUtf16: number;
  endUtf16: number;
  normalizedForm: string;
  resolutionStatus: string;
  canonicalWordId: string | null;
  canonicalWord: string | null;
  disposition: string;
  reason: string;
  performanceLineageKey: string;
  lineageReconciliation: "ORIGINAL" | "EXACT_HISTORICAL_MATCH";
  priorReceiptId: string | null;
  skillCandidates: { microSkillKey: string; displayName: string; authorityFingerprint: string }[];
  admittedProjections: { microSkillKey: string; polarity: string; environment: string }[];
};

export type WholeWritingLongitudinalReport = {
  mode: WholeWritingReportMode;
  selectedChildId: string | null;
  children: { id: string; label: string }[];
  rows: WholeWritingReportRow[];
  batchCount: number;
  candidateCount: number;
  blockedCount: number;
  admittedEventCount: number;
  admittedProjectionCount: number;
  exactHistoricalMatchCount: number;
  truncated: boolean;
};

const BATCH_LIMIT = 50;
const RECEIPT_LIMIT = 500;

function labelForChild(row: { id: string; first_name: string | null; last_name: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.id;
}

export async function loadWholeWritingLongitudinalReport(
  client: SupabaseClient,
  requestedChildId: string | null,
  mode: WholeWritingReportMode,
): Promise<WholeWritingLongitudinalReport> {
  const inventoryResult = await client.from("writing_shadow_projection_batches")
    .select("child_id,created_at").order("created_at", { ascending: false }).limit(1000);
  if (inventoryResult.error) throw new Error("WHOLE_WRITING_REPORT_BATCH_READ_FAILED");
  const inventory = (inventoryResult.data ?? []) as any[];
  const availableChildIds = [...new Set(inventory.map((row) => row.child_id as string))];
  const childResult = availableChildIds.length
    ? await client.from("children").select("id,first_name,last_name").in("id", availableChildIds).order("first_name")
    : { data: [], error: null };
  if (childResult.error) throw new Error("WHOLE_WRITING_REPORT_CHILD_READ_FAILED");
  const children = ((childResult.data ?? []) as any[]).map((row) => ({ id: row.id, label: labelForChild(row) }));
  const selectedChildId = requestedChildId && availableChildIds.includes(requestedChildId)
    ? requestedChildId
    : (inventory[0]?.child_id as string | undefined) ?? null;
  if (!selectedChildId) {
    return { mode, selectedChildId, children, rows: [], batchCount: 0, candidateCount: 0, blockedCount: 0,
      admittedEventCount: 0, admittedProjectionCount: 0, exactHistoricalMatchCount: 0, truncated: inventory.length === 1000 };
  }
  let batches: any[];
  let receipts: any[];
  let batchReadTruncated = false;
  let receiptReadTruncated = false;
  if (mode === "current") {
    const currentResult = await client.from("writing_shadow_current_occurrence_report")
      .select("id,batch_id,occurrence_id,interpretation_id,canonical_word_id,disposition,reason,performance_lineage_key,lineage_reconciliation,prior_receipt_id,occurred_at,created_at,run_id,snapshot_id,child_id,batch_created_at")
      .eq("child_id", selectedChildId).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(RECEIPT_LIMIT + 1);
    if (currentResult.error) throw new Error("WHOLE_WRITING_REPORT_RECEIPT_READ_FAILED");
    const currentRows = (currentResult.data ?? []) as any[];
    receiptReadTruncated = currentRows.length > RECEIPT_LIMIT;
    receipts = currentRows.slice(0, RECEIPT_LIMIT);
    const batchesById = new Map<string, any>();
    for (const row of receipts) batchesById.set(row.batch_id, {
      id: row.batch_id, run_id: row.run_id, snapshot_id: row.snapshot_id, child_id: row.child_id, created_at: row.batch_created_at,
    });
    batches = [...batchesById.values()];
  } else {
    const selectedBatchResult = await client.from("writing_shadow_projection_batches")
      .select("id,run_id,snapshot_id,child_id,candidate_count,admitted_count,blocked_count,projection_count,created_at")
      .eq("child_id", selectedChildId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(BATCH_LIMIT + 1);
    if (selectedBatchResult.error) throw new Error("WHOLE_WRITING_REPORT_BATCH_READ_FAILED");
    const selectedBatches = (selectedBatchResult.data ?? []) as any[];
    batchReadTruncated = selectedBatches.length > BATCH_LIMIT;
    batches = selectedBatches.slice(0, BATCH_LIMIT);
    if (batches.length === 0) {
      return { mode, selectedChildId, children, rows: [], batchCount: 0, candidateCount: 0, blockedCount: 0,
        admittedEventCount: 0, admittedProjectionCount: 0, exactHistoricalMatchCount: 0, truncated: inventory.length === 1000 };
    }
    const receiptResult = await client.from("writing_shadow_occurrence_evidence_receipts")
      .select("id,batch_id,occurrence_id,interpretation_id,canonical_word_id,disposition,reason,performance_lineage_key,lineage_reconciliation,prior_receipt_id,occurred_at,created_at")
      .in("batch_id", batches.map((row) => row.id as string)).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(RECEIPT_LIMIT + 1);
    if (receiptResult.error) throw new Error("WHOLE_WRITING_REPORT_RECEIPT_READ_FAILED");
    const historyRows = (receiptResult.data ?? []) as any[];
    receiptReadTruncated = historyRows.length > RECEIPT_LIMIT;
    receipts = historyRows.slice(0, RECEIPT_LIMIT);
  }
  if (receipts.length === 0) {
    return { mode, selectedChildId, children, rows: [], batchCount: 0, candidateCount: 0, blockedCount: 0,
      admittedEventCount: 0, admittedProjectionCount: 0, exactHistoricalMatchCount: 0, truncated: inventory.length === 1000 };
  }
  const occurrenceIds = [...new Set(receipts.map((row) => row.occurrence_id as string))];
  const interpretationIds = [...new Set(receipts.map((row) => row.interpretation_id as string))];
  const receiptIds = receipts.map((row) => row.id as string);
  const wordIds = [...new Set(receipts.map((row) => row.canonical_word_id as string | null).filter(Boolean))] as string[];
  const [occurrenceResult, interpretationResult, candidateResult, projectionResult, wordResult] = await Promise.all([
    occurrenceIds.length ? client.from("writing_occurrences").select("id,observed_text,field_path,start_utf16,end_utf16").in("id", occurrenceIds) : null,
    interpretationIds.length ? client.from("writing_occurrence_interpretations").select("id,normalized_form,resolution_status").in("id", interpretationIds) : null,
    receiptIds.length ? client.from("writing_shadow_occurrence_skill_candidates").select("receipt_id,micro_skill_key,relationship_authority_fingerprint").in("receipt_id", receiptIds) : null,
    receiptIds.length ? client.from("writing_shadow_skill_evidence_projections").select("receipt_id,micro_skill_key,polarity,environment").in("receipt_id", receiptIds) : null,
    wordIds.length ? client.from("canonical_teaching_dictionary_words").select("id,normalised_word").in("id", wordIds) : null,
  ]);
  if (occurrenceResult?.error || interpretationResult?.error || candidateResult?.error || projectionResult?.error || wordResult?.error) {
    throw new Error("WHOLE_WRITING_REPORT_DETAIL_READ_FAILED");
  }
  const skillKeys = [...new Set([
    ...((candidateResult?.data ?? []) as any[]).map((row) => row.micro_skill_key as string),
    ...((projectionResult?.data ?? []) as any[]).map((row) => row.micro_skill_key as string),
  ])];
  const skillResult = skillKeys.length
    ? await client.from("micro_skill_catalog").select("micro_skill_key,display_name").in("micro_skill_key", skillKeys)
    : null;
  if (skillResult?.error) throw new Error("WHOLE_WRITING_REPORT_SKILL_READ_FAILED");
  const batchById = new Map(batches.map((row) => [row.id as string, row]));
  const occurrenceById = new Map(((occurrenceResult?.data ?? []) as any[]).map((row) => [row.id as string, row]));
  const interpretationById = new Map(((interpretationResult?.data ?? []) as any[]).map((row) => [row.id as string, row]));
  const wordById = new Map(((wordResult?.data ?? []) as any[]).map((row) => [row.id as string, row.normalised_word as string]));
  const skillByKey = new Map(((skillResult?.data ?? []) as any[]).map((row) => [row.micro_skill_key as string, row.display_name as string]));
  const candidatesByReceipt = new Map<string, any[]>();
  for (const row of (candidateResult?.data ?? []) as any[]) candidatesByReceipt.set(row.receipt_id, [...(candidatesByReceipt.get(row.receipt_id) ?? []), row]);
  const projectionsByReceipt = new Map<string, any[]>();
  for (const row of (projectionResult?.data ?? []) as any[]) projectionsByReceipt.set(row.receipt_id, [...(projectionsByReceipt.get(row.receipt_id) ?? []), row]);
  const rows = receipts.map((receipt): WholeWritingReportRow => {
    const batch = batchById.get(receipt.batch_id)!;
    const occurrence = occurrenceById.get(receipt.occurrence_id)!;
    const interpretation = interpretationById.get(receipt.interpretation_id)!;
    return {
      receiptId: receipt.id, batchId: receipt.batch_id, runId: batch.run_id, snapshotId: batch.snapshot_id,
      learnerId: batch.child_id, occurredAt: receipt.occurred_at, batchCreatedAt: batch.created_at,
      observedText: occurrence.observed_text, fieldPath: occurrence.field_path,
      startUtf16: occurrence.start_utf16, endUtf16: occurrence.end_utf16,
      normalizedForm: interpretation.normalized_form, resolutionStatus: interpretation.resolution_status,
      canonicalWordId: receipt.canonical_word_id, canonicalWord: receipt.canonical_word_id ? wordById.get(receipt.canonical_word_id) ?? null : null,
      disposition: receipt.disposition, reason: receipt.reason, performanceLineageKey: receipt.performance_lineage_key,
      lineageReconciliation: receipt.lineage_reconciliation, priorReceiptId: receipt.prior_receipt_id,
      skillCandidates: (candidatesByReceipt.get(receipt.id) ?? []).map((row) => ({
        microSkillKey: row.micro_skill_key, displayName: skillByKey.get(row.micro_skill_key) ?? row.micro_skill_key,
        authorityFingerprint: row.relationship_authority_fingerprint,
      })),
      admittedProjections: (projectionsByReceipt.get(receipt.id) ?? []).map((row) => ({
        microSkillKey: row.micro_skill_key, polarity: row.polarity, environment: row.environment,
      })),
    };
  });
  return {
    mode, selectedChildId, children, rows, batchCount: batches.length,
    candidateCount: mode === "current" ? receipts.length : batches.reduce((sum, row) => sum + row.candidate_count, 0),
    blockedCount: mode === "current" ? receipts.filter((row) => row.disposition === "BLOCKED").length : batches.reduce((sum, row) => sum + row.blocked_count, 0),
    admittedEventCount: mode === "current" ? receipts.filter((row) => row.disposition === "ADMITTED").length : batches.reduce((sum, row) => sum + row.admitted_count, 0),
    admittedProjectionCount: mode === "current" ? ((projectionResult?.data ?? []) as any[]).length : batches.reduce((sum, row) => sum + row.projection_count, 0),
    exactHistoricalMatchCount: rows.filter((row) => row.lineageReconciliation === "EXACT_HISTORICAL_MATCH").length,
    truncated: inventory.length === 1000 || batchReadTruncated || receiptReadTruncated,
  };
}
