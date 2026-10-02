import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { promoteParentContextualCase } from "./actions";

export async function ParentContextualFeedbackCases(props: {
  submissionId: string;
  parentUserId: string;
  childId: string;
}) {
  const service = createServiceRoleClient();
  const snapshot = await service.from("writing_source_snapshots")
    .select("id").eq("submission_id", props.submissionId)
    .eq("parent_user_id", props.parentUserId).eq("child_id", props.childId).maybeSingle();
  if (snapshot.error || !snapshot.data) return null;
  const cases = await service.from("writing_context_parent_added_cases")
    .select("id,occurrence_id,intended_member,governed_family_key")
    .eq("snapshot_id", snapshot.data.id).eq("parent_user_id", props.parentUserId)
    .order("created_at", { ascending: true });
  if (cases.error || !cases.data?.length) return null;
  const occurrences = await service.from("writing_occurrences")
    .select("id,observed_text,field_path,start_utf16,end_utf16")
    .in("id", cases.data.map((item) => item.occurrence_id));
  if (occurrences.error) throw new Error("Parent feedback occurrence is unavailable.");
  const promotions = await service.from("writing_context_research_candidates")
    .select("parent_added_case_id")
    .in("parent_added_case_id", cases.data.map((item) => item.id));
  if (promotions.error) throw new Error("Research candidate state is unavailable.");
  const byOccurrence = new Map((occurrences.data ?? []).map((item) => [item.id, item]));
  const promoted = new Set((promotions.data ?? []).map((item) => item.parent_added_case_id));
  return <section className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
    <h3 className="text-sm font-semibold">Parent-added contextual cases</h3>
    <div className="mt-2 space-y-2">{cases.data.map((item) => {
      const occurrence = byOccurrence.get(item.occurrence_id);
      return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
        <span>{occurrence?.observed_text ?? "Source unavailable"} → {item.intended_member}
          {occurrence ? ` · ${occurrence.field_path} · ${occurrence.start_utf16}–${occurrence.end_utf16}` : ""}
          {item.governed_family_key ? " · governed family" : " · No matching skill sent to Admin"}</span>
        {promoted.has(item.id) ? <span className="text-xs">Research candidate saved</span> :
          <form action={promoteParentContextualCase}>
            <input type="hidden" name="submission_id" value={props.submissionId} />
            <input type="hidden" name="case_id" value={item.id} />
            <button className="text-xs underline">Suggest for research review</button>
          </form>}
      </div>;
    })}</div>
    <p className="mt-2 text-xs">A research candidate is not benchmark truth; separate privacy review and adjudication are required.</p>
  </section>;
}
