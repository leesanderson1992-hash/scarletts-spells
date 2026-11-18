import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { createRecommendedRootEntry } from "../teaching-dictionary/root-family-actions";
export async function FamilyRecommendations({ search }: { search: string }) {
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) return null;
  let query = createServiceRoleClient().from("teaching_dictionary_family_recommendations")
    .select("base_form,base_kind,waiting_words,meanings,existing_word_id")
    .eq("environment_key", environment).order("waiting_words", { ascending: false }).order("base_form").limit(100);
  if (search) query = query.ilike("base_form", `%${search}%`);
  const rows = await query;
  if (rows.error) throw new Error("Could not load base/root recommendations.");
  return <section className="space-y-3 rounded-xl border bg-white p-5">
    <h2 className="text-xl font-semibold">Bases and roots needed by saved reviews</h2>
    <p className="text-sm">Each base/root appears once. Existing entries are reviewed instead of duplicated. Bound roots are support entries; their family review includes meaning and origin, and pronunciation can be Not applicable.</p>
    {!rows.data.length ? <p>No matching family dependencies.</p> : <ul className="divide-y">{rows.data.map(row => <li key={`${row.base_kind}:${row.base_form}`} className="space-y-1 py-3">
      <strong>{row.base_form}</strong> · {row.base_kind === "bound_root" ? "Bound root" : "Free base"} · {row.waiting_words} waiting review(s)
      <p className="text-sm">Reviewed meanings requested: {(row.meanings as string[]).join("; ")}</p>
      <Link className="font-semibold underline" href={row.existing_word_id
        ? `/admin/teaching-dictionary/${row.existing_word_id}` : "/admin/teaching-dictionary/new"}>
        {row.existing_word_id ? "Review existing entry and family" : "Add missing dictionary entry"}
      </Link>
      <p className="text-sm">{row.existing_word_id ? "Entry exists; approve its intended meaning and family." : "Entry missing; add the spelling shown above and its reviewed meaning."}</p>
      {!row.existing_word_id && row.base_kind === "bound_root" && <form action={createRecommendedRootEntry} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
        <input type="hidden" name="root" value={row.base_form} />
        <label className="grid gap-1 text-sm">Reviewed root meaning
          <select name="definition" className="rounded border p-2" required>{(row.meanings as string[]).map(meaning => <option key={meaning}>{meaning}</option>)}</select>
        </label>
        <label className="grid gap-1 text-sm">Reviewed origin
          <select name="origin" className="rounded border p-2" required><option value="">Choose origin</option><option>Latin</option><option>Greek</option></select>
        </label>
        <p className="text-sm sm:col-span-2">Creates a bound-root support entry and its reviewed family. Root pronunciation is Not applicable; no ordinary spelling or dictation approval is created.</p>
        <button className="w-fit rounded border px-3 py-2 text-sm sm:col-span-2">Approve root entry and family; recheck waiting words</button>
      </form>}
    </li>)}</ul>}
    {rows.data.length === 100 && <p>Showing the first 100 recommendations. Search by base/root to narrow the list.</p>}
  </section>;
}
