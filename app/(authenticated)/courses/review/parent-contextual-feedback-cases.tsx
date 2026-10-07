import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { reconstructOccurrenceContext } from "@/lib/writing-engine/whole-writing/context-source";
import type { SourceSnapshot } from "@/lib/writing-engine/whole-writing/source";
import { sentenceContext } from "@/lib/writing-engine/whole-writing/sentence-context";

import { promoteParentContextualCase } from "./actions";

export async function ParentContextualFeedbackCases(props: {
  submissionId: string;
  parentUserId: string;
  childId: string;
}) {
  const service = createServiceRoleClient();
  const snapshot = await service.from("writing_source_snapshots")
    .select("*").eq("submission_id", props.submissionId)
    .eq("parent_user_id", props.parentUserId).eq("child_id", props.childId).maybeSingle();
  if (snapshot.error || !snapshot.data) return null;
  const cases = await service.from("writing_context_parent_added_cases")
    .select("id,occurrence_id,intended_member,governed_family_key")
    .eq("snapshot_id", snapshot.data.id).eq("parent_user_id", props.parentUserId)
    .order("created_at", { ascending: true });
  if (cases.error || !cases.data?.length) return null;
  const occurrences = await service.from("writing_occurrences")
    .select("id,observed_text,field_path,field_hash,start_utf16,end_utf16")
    .in("id", cases.data.map((item) => item.occurrence_id));
  if (occurrences.error) throw new Error("Parent feedback occurrence is unavailable.");
  const promotions = await service.from("writing_context_research_candidates")
    .select("parent_added_case_id")
    .in("parent_added_case_id", cases.data.map((item) => item.id));
  if (promotions.error) throw new Error("Research candidate state is unavailable.");
  const byOccurrence = new Map((occurrences.data ?? []).map((item) => [item.id, item]));
  const promoted = new Set((promotions.data ?? []).map((item) => item.parent_added_case_id));
  return <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
    <h3 className="p-3 text-sm font-semibold">Parent-added context choices</h3>
    <table className="w-full min-w-[680px] border-collapse text-left text-sm">
      <thead><tr className="bg-[var(--mist)]">
        { ["Origin", "Word", "Sentence context", "Intended word", "Status"].map((label) =>
          <th key={label} scope="col" className="border-y border-[var(--border)] p-3">{label}</th>) }
      </tr></thead>
      <tbody>{cases.data.map((item) => {
        const occurrence = byOccurrence.get(item.occurrence_id);
        const source = occurrence ? reconstructOccurrenceContext({
          snapshot: snapshot.data as SourceSnapshot, fieldPath: occurrence.field_path,
          fieldHash: occurrence.field_hash, startUtf16: occurrence.start_utf16,
          endUtf16: occurrence.end_utf16, observedText: occurrence.observed_text,
        }) : null;
        const sentence = source?.status === "ready" && occurrence
          ? sentenceContext(source.fieldText, occurrence.start_utf16, occurrence.end_utf16)?.text : null;
        return <tr key={item.id} className="border-b border-[var(--border)] align-top">
          <td className="p-3">Parent added</td>
          <td className="p-3 font-semibold">{occurrence?.observed_text ?? "Source unavailable"}</td>
          <td className="p-3">{sentence ?? "Source unavailable"}</td>
          <td className="p-3">{item.intended_member}</td>
          <td className="p-3">{item.governed_family_key ? "Recorded" : "Admin review"}
            {!promoted.has(item.id) ? <form action={promoteParentContextualCase} className="mt-2">
              <input type="hidden" name="submission_id" value={props.submissionId} />
              <input type="hidden" name="case_id" value={item.id} />
              <button className="text-xs underline">Suggest for research review</button>
            </form> : null}
          </td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}
