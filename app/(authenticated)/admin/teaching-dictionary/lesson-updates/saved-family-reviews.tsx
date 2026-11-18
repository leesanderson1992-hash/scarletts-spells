import Link from "next/link";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadSavedFamilyReviews } from "@/lib/teaching-dictionary-manager/family-dependencies";
import { resolveSavedFamilyReview } from "./family-dependency-actions";
import { SavedFamilyReviewRefresh } from "./saved-family-review-refresh";
import { ActionSubmitButton } from "../action-submit-button";

export async function SavedFamilyReviews({ db, environment, skill }: {
  db: ReturnType<typeof createServiceRoleClient>; environment: string; skill: string;
}) {
  const rows = await loadSavedFamilyReviews(db, environment, skill);
  if (!rows.length) return null;
  const [words, choices] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,display_word").in("id", [...new Set(rows.map(row => row.canonical_word_id))]),
    db.from("teaching_dictionary_families_with_current_meaning").select("family_key,base_lemma,base_kind,base_meaning,review_status,revision")
      .in("base_lemma", [...new Set(rows.map(row => row.base_form))]).order("revision", { ascending: false }),
  ]);
  if (words.error || choices.error) throw new Error("Could not load saved family choices.");
  const families = [...new Map([...choices.data].reverse().map(row => [row.family_key, row])).values()].filter(row => row.review_status === "approved");
  return <details className="space-y-3 rounded-xl border bg-white p-5" open={rows.some(row => !row.family_resolved)}>
    <summary className="cursor-pointer text-xl font-semibold">Saved family reviews ({rows.length})</summary>
    <p className="text-sm">Your reviewed facts are saved. You can leave and return without re-uploading. Family approvals trigger a recheck; retries also run every five minutes. Publishing remains your decision.</p>
    <SavedFamilyReviewRefresh skill={skill} pending={rows.some(row => !row.family_resolved)}
      signature={JSON.stringify(rows.map(({ id, status, detail }) => ({ id, status, detail })))} />
    <ul className="divide-y">{rows.map(row => <li key={row.id} className="space-y-2 py-3">
      <Link className="font-semibold underline" href={`/admin/teaching-dictionary/${row.canonical_word_id}`}>
        {words.data.find(word => word.id === row.canonical_word_id)?.display_word}</Link>
      <p className="text-sm">{row.base_kind === "bound_root" ? "Root" : "Base"}: {row.base_form} · {row.expected_meaning}</p>
      <p role="status" className="text-sm">{row.family_resolved ? "Family resolved. Lesson checks rerun; Preview shows the current remaining facts and publishing status." : `${row.status.replaceAll("_", " ")} · ${row.detail}`}</p>
      {row.family_resolved && <Link className="text-sm underline" href={`/admin/teaching-dictionary/lesson-updates?skill=${encodeURIComponent(skill)}&view=preview`}>Open current lesson checks and publish preview</Link>}
      {!row.family_resolved && <form action={resolveSavedFamilyReview} className="flex flex-wrap gap-2">
        <input type="hidden" name="dependency_id" value={row.id} />
        <label className="grid gap-1 text-sm">Approved family meaning
          <select name="family_key" className="rounded border p-2" defaultValue="">
            <option value="">Recheck automatic matching</option>
            {families.filter(family => family.base_lemma === row.base_form && family.base_kind === row.base_kind).map(family =>
              <option key={family.family_key} value={family.family_key}>{family.base_lemma} · {family.base_meaning}</option>)}
          </select>
        </label>
        <ActionSubmitButton pendingLabel="Rechecking saved reviews…" className="self-end rounded border px-3 py-2 text-sm">Confirm and recheck matching words</ActionSubmitButton>
        <Link className="self-end p-2 text-sm underline" href={`/admin/recommend-dictionary-entries?q=${encodeURIComponent(row.base_form)}`}>Review base/root recommendation</Link>
      </form>}
    </li>)}</ul>
    {rows.length === 100 && <p className="text-sm">Showing the latest 100 saved dependencies for this lesson.</p>}
  </details>;
}
