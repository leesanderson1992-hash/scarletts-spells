import { notFound } from "next/navigation";

import type { DictionaryRecommendation } from "@/lib/admin/recommend-dictionary-entries";
import { RecommendationWorkspace } from "@/app/(authenticated)/admin/recommend-dictionary-entries/workspace";

const previewRows: DictionaryRecommendation[] = [
  { word_key: "butterfly", verified_uses: 8, children_count: 3, adle_uses: 5, other_writing_uses: 3,
    first_seen_at: "2026-10-04T10:00:00Z", last_seen_at: "2026-10-12T10:00:00Z" },
  { word_key: "puddle", verified_uses: 6, children_count: 2, adle_uses: 2, other_writing_uses: 4,
    first_seen_at: "2026-10-05T10:00:00Z", last_seen_at: "2026-10-11T10:00:00Z" },
  { word_key: "can’t", verified_uses: 4, children_count: 2, adle_uses: 3, other_writing_uses: 1,
    first_seen_at: "2026-10-06T10:00:00Z", last_seen_at: "2026-10-10T10:00:00Z" },
  { word_key: "lantern", verified_uses: 2, children_count: 1, adle_uses: 0, other_writing_uses: 2,
    first_seen_at: "2026-10-09T10:00:00Z", last_seen_at: "2026-10-09T10:00:00Z" },
];

export default function RecommendDictionaryEntriesPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold">Recommend Dictionary Entries</h1>
      <p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900">
        Local visual preview with sample words. No learner data is shown.
      </p>
      <p className="max-w-3xl text-sm text-slate-700">
        These words occurred in parent-verified work but have no canonical Teaching Dictionary entry.
        Their spelling still needs editorial review before a dictionary entry is published.
      </p>
      <p className="max-w-3xl text-sm text-slate-700">
        Export selected words as a starter CSV, then import it in Teaching Dictionary Manager.
        Imported words remain reference-only drafts until reviewed and completed.
      </p>
    </header>
    <RecommendationWorkspace initial={{ rows: previewRows, total: previewRows.length, page: 1 }}
      initialSearch="" previewRows={previewRows} />
  </main>;
}
