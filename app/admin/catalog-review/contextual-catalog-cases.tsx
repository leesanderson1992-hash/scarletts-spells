import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { resolveContextualCatalogCase } from "./contextual-case-actions";

export async function ContextualCatalogCases() {
  const service = createServiceRoleClient();
  const queue = await service.from("writing_context_catalog_review_cases")
    .select("id,parent_added_case_id,created_at")
    .eq("case_status", "open").order("created_at", { ascending: true }).limit(100);
  if (queue.error) throw new Error("Contextual catalog cases are unavailable.");
  const caseIds = (queue.data ?? []).map((row) => row.parent_added_case_id);
  const cases = caseIds.length ? await service.from("writing_context_parent_added_cases")
    .select("id,occurrence_id,intended_member,pair_fingerprint")
    .in("id", caseIds) : { data: [], error: null };
  if (cases.error) throw new Error("Contextual case source is unavailable.");
  const occurrenceIds = (cases.data ?? []).map((row) => row.occurrence_id);
  const occurrences = occurrenceIds.length ? await service.from("writing_occurrences")
    .select("id,observed_text")
    .in("id", occurrenceIds) : { data: [], error: null };
  if (occurrences.error) throw new Error("Contextual case occurrence is unavailable.");
  const byCase = new Map((cases.data ?? []).map((row) => [row.id, row]));
  const byOccurrence = new Map((occurrences.data ?? []).map((row) => [row.id, row]));
  return <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
    <h2 className="text-xl font-semibold">No matching skill · contextual pairs</h2>
    <p className="mt-1 text-sm">Parent-confirmed learner cases for Admin curation. Reviewing a case does not activate a family, microskill, prompt, or learning route.</p>
    {(queue.data ?? []).length === 0 ? <p className="mt-3 text-sm">No open contextual pairs.</p> :
      <table className="mt-3 w-full text-left text-sm"><thead><tr>
        <th>Child wrote</th><th>Parent intended</th><th>Pair fingerprint</th><th>Action</th>
      </tr></thead><tbody>{(queue.data ?? []).map((row) => {
        const source = byCase.get(row.parent_added_case_id);
        const occurrence = source ? byOccurrence.get(source.occurrence_id) : null;
        return <tr key={row.id} className="border-t">
          <td>{occurrence?.observed_text ?? "Source unavailable"}</td>
          <td>{source?.intended_member ?? "Unavailable"}</td>
          <td className="font-mono text-xs">{source?.pair_fingerprint.slice(0, 12) ?? ""}</td>
          <td><form action={resolveContextualCatalogCase} className="flex gap-2">
            <input type="hidden" name="case_id" value={row.id} />
            <button name="case_status" value="reviewed" className="underline">Mark reviewed</button>
            <button name="case_status" value="dismissed" className="underline">Dismiss</button>
          </form></td>
        </tr>;
      })}</tbody></table>}
  </section>;
}
