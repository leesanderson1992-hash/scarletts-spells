import Link from "next/link";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadSavedFamilyReviews } from "@/lib/teaching-dictionary-manager/family-dependencies";
import { loadReviewedMeaningBundles } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { SavedFamilyReviewRefresh } from "./saved-family-review-refresh";
import { SavedFamilyAssignments, type SavedFamilyTask } from "./saved-family-assignments";

export async function SavedFamilyReviews({ db, environment, skill }: {
  db: ReturnType<typeof createServiceRoleClient>; environment: string; skill: string;
}) {
  const rows = await loadSavedFamilyReviews(db, environment, skill);
  if (!rows.length) return <p>No saved family assignments for this lesson. Upload a reviewed workbook to add words.</p>;
  const bundles = await loadReviewedMeaningBundles(db, [...new Set(rows.map(row => row.canonical_word_id))]);
  const pending = rows.filter(row => !row.family_resolved);
  const resolved = rows.filter(row => row.family_resolved);
  const tasks: SavedFamilyTask[] = pending.map((row, index) => {
    const bundle = bundles.find(bundle => bundle.wordId === row.canonical_word_id);
    const sense = bundle?.senseSet.senses.find(sense => sense.id === row.sense_id);
    return { row: index + 1, dependencyId: row.id, wordId: row.canonical_word_id, updatedAt: row.updated_at,
      word: bundle?.displayWord ?? row.base_form, meaning: sense?.definition ?? row.expected_meaning,
      sentence: sense?.dictationSentence ?? "", base: row.base_form, baseKind: row.base_kind as "free_base" | "bound_root",
      baseMeaning: row.expected_meaning, senseId: row.sense_id, componentPartId: row.component_part_id, detail: row.detail };
  });
  return <div className="space-y-4">
    <p>Your reviews are saved. Assign an existing family or create a free-base family here. Approved word-page changes update this queue automatically; publishing remains your decision.</p>
    <SavedFamilyReviewRefresh skill={skill} pending={pending.length > 0}
      signature={JSON.stringify(rows.map(({ id, status, detail, updated_at }) => ({ id, status, detail, updated_at })))} />
    <h3 className="font-semibold">Needs family assignment ({pending.length})</h3>
    <SavedFamilyAssignments tasks={tasks} skill={skill} />
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-semibold">Family resolved ({resolved.length})</summary>
      <ul className="mt-3 divide-y">{resolved.map(row => <li key={row.id} className="py-2">
        <Link className="font-semibold underline" href={`/admin/teaching-dictionary/${row.canonical_word_id}`}>
          {bundles.find(bundle => bundle.wordId === row.canonical_word_id)?.displayWord ?? row.base_form}</Link>
        <p className="text-sm">{row.detail}</p>
      </li>)}</ul>
    </details>
    <Link className="font-semibold underline" href={`?skill=${encodeURIComponent(skill)}&view=preview`}>Open current lesson checks and publish preview</Link>
    {rows.length === 100 && <p className="text-sm">Showing the latest 100 saved reviews for this lesson.</p>}
  </div>;
}
