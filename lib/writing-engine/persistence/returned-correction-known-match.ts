import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findResolverVisibleExactPairMapping } from "./spelling-canonical-mappings";

type ReturnedCorrectionKnownMatchSupabase = SupabaseClient;

export type ReturnedCorrectionKnownMatchIssue = {
  id: string;
  child_id: string;
  parent_user_id: string;
  issue_status: string;
  final_classification: string | null;
  observed_text: string | null;
  suggested_replacement: string | null;
  approved_replacement: string | null;
  micro_skill_key: string | null;
  metadata: Record<string, unknown> | null;
};

export type ReturnedCorrectionKnownMatchResolutionResult =
  | {
      status: "resolved" | "already_resolved";
      mappingId: string;
      microSkillKey: string;
    }
  | {
      status: "not_resolved";
      reason: string;
    };

function parseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Resolves only the learning route for an open returned correction. It never
 * final-classifies the issue, creates a learning item, or creates admin review
 * evidence. The parent must still select the educational reason.
 */
export async function preResolveReturnedCorrectionKnownMatch(input: {
  supabase: ReturnedCorrectionKnownMatchSupabase;
  issue: ReturnedCorrectionKnownMatchIssue;
  nowIso?: string;
  persist?: boolean;
  canonicalLookup?: typeof findResolverVisibleExactPairMapping;
}): Promise<ReturnedCorrectionKnownMatchResolutionResult> {
  const correctedSpelling =
    input.issue.approved_replacement ?? input.issue.suggested_replacement;
  const canonicalLookup =
    input.canonicalLookup ?? findResolverVisibleExactPairMapping;
  const resolution = await canonicalLookup({
    supabase: input.supabase as never,
    misspellingNormalized: input.issue.observed_text,
    correctSpellingNormalized: correctedSpelling,
  });

  if (resolution.status !== "resolved") {
    return {
      status: "not_resolved",
      reason: resolution.reason,
    };
  }

  const metadata = parseMetadata(input.issue.metadata);
  const existing = parseMetadata(metadata.known_match_auto_resolution);
  const existingMatches =
    existing.authority === "known_match" &&
    readString(existing, "canonical_mapping_id") === resolution.mappingId &&
    readString(existing, "micro_skill_key") === resolution.microSkillKey &&
    Boolean(readString(existing, "resolved_at"));

  if (existingMatches && input.issue.micro_skill_key === resolution.microSkillKey) {
    return {
      status: "already_resolved",
      mappingId: resolution.mappingId,
      microSkillKey: resolution.microSkillKey,
    };
  }

  if (input.persist === false) {
    return {
      status: "resolved",
      mappingId: resolution.mappingId,
      microSkillKey: resolution.microSkillKey,
    };
  }

  const nowIso = input.nowIso ?? new Date().toISOString();
  const { data, error } = await input.supabase
    .from("writing_issues")
    .update({
      micro_skill_key: resolution.microSkillKey,
      metadata: {
        ...metadata,
        known_match_auto_resolution: {
          authority: "known_match",
          authority_reference: `spelling_canonical_mappings:${resolution.mappingId}`,
          canonical_mapping_id: resolution.mappingId,
          canonical_correction: resolution.correctSpellingNormalized,
          dialect_code: resolution.dialectCode,
          micro_skill_key: resolution.microSkillKey,
          normalization_version: resolution.normalizationVersion,
          resolved_at: nowIso,
        },
      },
      updated_at: nowIso,
    })
    .eq("id", input.issue.id)
    .eq("parent_user_id", input.issue.parent_user_id)
    .eq("child_id", input.issue.child_id)
    .in("issue_status", ["sent_back_to_child", "child_responded"])
    .is("final_classification", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message || "Failed to persist returned-correction known match.",
    );
  }

  if (!data) {
    throw new Error(
      "Returned-correction known match was not persisted because the issue changed.",
    );
  }

  input.issue.micro_skill_key = resolution.microSkillKey;
  input.issue.metadata = {
    ...metadata,
    known_match_auto_resolution: {
      authority: "known_match",
      authority_reference: `spelling_canonical_mappings:${resolution.mappingId}`,
      canonical_mapping_id: resolution.mappingId,
      canonical_correction: resolution.correctSpellingNormalized,
      dialect_code: resolution.dialectCode,
      micro_skill_key: resolution.microSkillKey,
      normalization_version: resolution.normalizationVersion,
      resolved_at: nowIso,
    },
  };

  return {
    status: "resolved",
    mappingId: resolution.mappingId,
    microSkillKey: resolution.microSkillKey,
  };
}
