import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed tables precede generated types */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { homophoneLessonEvidence, HOMOPHONE_CONTEXT_EVIDENCE_VERSION } from "@/lib/adle/proficiency/homophone-context";
import { homophoneWritingEvidence } from "@/lib/adle/proficiency/homophone-writing";
import { homophoneAdleReviewEvidence } from "@/lib/adle/proficiency/homophone-adle-review";
import type { V2Evidence } from "@/lib/adle/proficiency/v2";

async function scoped<T>(client: SupabaseClient, table: string, columns: string, column: string, ids: readonly string[]): Promise<T[]> {
  const result: T[] = [];
  const validIds = [...new Set(ids.filter(id => typeof id === "string" && id.length > 0))];
  const orderKey = table === "adle_specialist_stage_checkpoints" ? "daily_assignment_id"
    : table === "contextual_micro_skill_case_links" ? "catalog_case_id"
      : table === "adle_review_parent_reviews" ? "review_session_id" : "id";
  for (let start = 0; start < validIds.length; start += 100) {
    const slice = validIds.slice(start, start + 100);
    for (let from = 0;; from += 500) {
      const page = await client.from(table).select(columns).in(column, slice).order(orderKey).range(from, from + 499);
      if (page.error) throw new Error(`homophone evidence ${table}: ${page.error.message}`);
      result.push(...(page.data ?? []) as T[]);
      if ((page.data ?? []).length < 500) break;
    }
  }
  return result;
}

export async function loadHomophoneContextEvidence(client: SupabaseClient, childId: string,
  words: readonly { id: string; normalised_word: string }[],
  members: readonly { micro_skill_key: string; member_normalized: string }[],
  attempts: readonly any[]): Promise<{ bySkill: Map<string, V2Evidence[]>; fingerprint: string }> {
  const [assignments, snapshots, pairs, credits, decisions, addedCases, adleSources, adleChoices, adleDecisions] = await Promise.all([
    scoped<any>(client, "daily_assignments", "id,status,compiled_lesson_snapshot", "child_id", [childId]),
    scoped<any>(client, "writing_source_snapshots", "id,occurred_at,envelope", "child_id", [childId]),
    client.from("contextual_micro_skill_pairs").select("micro_skill_key,member_a,member_b").eq("dialect_code", "en-GB"),
    scoped<any>(client, "authentic_use_credits", "id,review_id,snapshot_id,adle_review_id,adle_source_id,canonical_word_id,occurrence_ids,observed_word,supplied_spelling", "child_id", [childId]),
    scoped<any>(client, "writing_context_parent_decisions", "id,occurrence_id,classification,intended_member,supersedes_decision_id", "child_id", [childId]),
    scoped<any>(client, "writing_context_parent_added_cases", "id,occurrence_id,intended_member", "child_id", [childId]),
    scoped<any>(client, "adle_review_context_sources", "id,review_session_id,submitted_text,source_hash,submitted_at", "child_id", [childId]),
    scoped<any>(client, "adle_review_parent_context_choices", "id,review_session_id,source_hash,start_utf16,end_utf16,observed_text,intended_word,decision", "child_id", [childId]),
    scoped<any>(client, "adle_review_context_decisions", "id,finding_id,source_id,action,intended_word", "child_id", [childId]),
  ]);
  if (pairs.error) throw new Error(`homophone evidence pairs: ${pairs.error.message}`);
  const assignmentIds = assignments.filter(row => row.status === "completed").map(row => row.id as string);
  const [items, checkpoints, reviews, occurrences, caseReviews, adleReviews, adleReceipts, adleFindings] = await Promise.all([
    scoped<any>(client, "assignment_items", "id,daily_assignment_id,metadata,prompt_data", "daily_assignment_id", assignmentIds),
    scoped<any>(client, "adle_specialist_stage_checkpoints", "daily_assignment_id,adapter_key,lesson_snapshot_fingerprint,checkpoint_payload,completed_at", "daily_assignment_id", assignmentIds),
    scoped<any>(client, "authentic_use_reviews", "id,parent_action,snapshot_id", "id", credits.map(row => row.review_id)),
    scoped<any>(client, "writing_occurrences", "id,snapshot_id,observed_text,provenance,field_hash,field_path,start_utf16,end_utf16", "snapshot_id", snapshots.map(row => row.id)),
    scoped<any>(client, "writing_context_catalog_review_cases", "id,parent_added_case_id,case_status", "parent_added_case_id", addedCases.map(row => row.id)),
    scoped<any>(client, "authentic_use_adle_reviews", "id,review_session_id,source_id,source_hash", "id", credits.map(row => row.adle_review_id)),
    scoped<any>(client, "adle_review_parent_reviews", "review_session_id", "review_session_id", adleSources.map(row => row.review_session_id)),
    scoped<any>(client, "adle_review_context_findings", "id,source_id,source_hash,start_utf16,end_utf16,observed_text", "source_id", adleSources.map(row => row.id)),
  ]);
  const links = await scoped<any>(client, "contextual_micro_skill_case_links", "catalog_case_id,micro_skill_key",
    "catalog_case_id", caseReviews.map(row => row.id));
  const lesson = homophoneLessonEvidence({ attempts, words, members, pairs: pairs.data ?? [], assignments, items, checkpoints });
  const writing = homophoneWritingEvidence({ words, members, pairs: pairs.data ?? [], snapshots, occurrences,
    credits, reviews, decisions, addedCases, caseReviews, caseLinks: links });
  const adleReview = homophoneAdleReviewEvidence({ words, members, pairs: pairs.data ?? [], credits,
    reviews: adleReviews, sources: adleSources, receipts: adleReceipts, choices: adleChoices,
    findings: adleFindings, decisions: adleDecisions });
  const bySkill = new Map<string, V2Evidence[]>();
  for (const source of [lesson, writing, adleReview]) for (const [skill, events] of source)
    bySkill.set(skill, [...(bySkill.get(skill) ?? []), ...events]);
  const fingerprint = createHash("sha256").update(JSON.stringify({ version: HOMOPHONE_CONTEXT_EVIDENCE_VERSION,
    events: [...bySkill.entries()].sort(([a], [b]) => a.localeCompare(b)),
    sourceRows: { attempts: attempts.map(row => [row.id, row.daily_assignment_id, row.assignment_item_id, row.is_correct]),
      checkpoints: checkpoints.map(row => [row.daily_assignment_id, row.completed_at, row.lesson_snapshot_fingerprint]),
      credits: credits.map(row => [row.id, row.review_id, row.occurrence_ids]),
      reviews: reviews.map(row => [row.id, row.parent_action]),
      decisions: decisions.map(row => [row.id, row.classification, row.intended_member, row.supersedes_decision_id]),
      addedCases: addedCases.map(row => [row.id, row.occurrence_id, row.intended_member]),
      caseReviews: caseReviews.map(row => [row.id, row.case_status]),
      adleSources: adleSources.map(row => [row.id, row.source_hash, row.submitted_at]),
      adleReviews: adleReviews.map(row => [row.id, row.source_hash]),
      adleReceipts: adleReceipts.map(row => row.review_session_id),
      adleChoices: adleChoices.map(row => [row.id, row.decision]),
      adleDecisions: adleDecisions.map(row => [row.id, row.action]),
      links, pairs: pairs.data ?? [] } })).digest("hex");
  return { bySkill, fingerprint };
}
