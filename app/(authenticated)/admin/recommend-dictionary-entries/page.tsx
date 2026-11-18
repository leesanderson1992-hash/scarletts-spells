import { FamilyRecommendations } from "./family-recommendations";
import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { loadRecommendationPage, recommendationSearch } from "@/lib/admin/recommend-dictionary-entries";
import { RecommendationWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function RecommendDictionaryEntriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; family_error?: string }>;
}) {
  await requireAdminUser();
  const params = await searchParams;
  const search = recommendationSearch(params?.q ?? "");
  const initial = await loadRecommendationPage(search, 1);

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold">Recommend Dictionary Entries</h1>
      <p className="max-w-3xl text-sm text-slate-700">
        Review missing bases and roots requested by lesson workbooks, alongside words found in parent-verified writing.
        Their spelling still needs editorial review before a dictionary entry is published.
      </p>
      <p className="max-w-3xl text-sm text-slate-700">
        Export selected words as a starter CSV, then import it in Teaching Dictionary Manager.
        Imported words remain reference-only drafts until reviewed and completed.
      </p>
      <p className="text-sm"><Link className="font-semibold underline" href="/admin/teaching-dictionary">
        Open Teaching Dictionary Manager
      </Link></p>
    </header>
    {params?.family_error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">The root family could not be created. Review the existing entry or retry the recommendation.</p>}
    <FamilyRecommendations search={search} />
    <h2 className="text-xl font-semibold">Words from verified writing</h2>
    <RecommendationWorkspace initial={initial} initialSearch={search} />
  </main>;
}
