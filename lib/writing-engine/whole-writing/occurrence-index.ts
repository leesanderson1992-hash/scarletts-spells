import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { extractWholeWriting, type SourceSnapshot } from "./source";

export type OccurrenceIndexResult = {
  indexed: number;
  learnerResponses: number;
  reason: "NO_VERIFIED_WRITING" | "NO_WORDS" | null;
};

/** Index immutable source positions independently of AI dispatch or approval. */
export async function indexSnapshotOccurrences(client: SupabaseClient, snapshot: SourceSnapshot): Promise<OccurrenceIndexResult> {
  const extraction = extractWholeWriting(snapshot);
  if (extraction.occurrences.length > 10000) throw new Error("WRITING_OCCURRENCE_SOURCE_LIMIT");
  const authoredFields = extraction.fields.filter((field) => field.provenance === "learner_response").length;
  const learnerResponses = extraction.occurrences.filter((row) => row.provenance === "learner_response").length;
  if (!authoredFields) return { indexed: 0, learnerResponses: 0, reason: "NO_VERIFIED_WRITING" };
  if (!learnerResponses) return { indexed: 0, learnerResponses: 0, reason: "NO_WORDS" };

  for (let offset = 0; offset < extraction.occurrences.length; offset += 100) {
    const rows = extraction.occurrences.slice(offset, offset + 100).map((row) => ({
      id: row.id,
      snapshot_id: snapshot.id,
      field_path: row.fieldKey,
      start_utf16: row.start,
      end_utf16: row.end,
      observed_text: row.observedText,
      field_hash: row.textHash,
      provenance: row.provenance === "learner_response" ? "learner_response" : "unknown",
      extractor_version: extraction.version,
    }));
    const saved = await client.from("writing_occurrences").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (saved.error) throw new Error("WRITING_OCCURRENCE_INDEX_UNAVAILABLE");
    const read = await client.from("writing_occurrences")
      .select("id,snapshot_id,field_path,start_utf16,end_utf16,observed_text,field_hash,provenance,extractor_version")
      .in("id", rows.map((row) => row.id));
    if (read.error || read.data?.length !== rows.length || rows.some((row) => {
      const stored = read.data?.find((candidate) => candidate.id === row.id);
      return !stored || Object.entries(row).some(([key, value]) =>
        (stored as Record<string, unknown>)[key] !== value);
    })) throw new Error("WRITING_OCCURRENCE_IDENTITY_MISMATCH");
  }
  return { indexed: extraction.occurrences.length, learnerResponses, reason: null };
}
