import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { loadRecommendationPage, recommendationSearch } from "@/lib/admin/recommend-dictionary-entries";
import { RecommendationWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function RecommendDictionaryEntriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireAdminUser();
  const search = recommendationSearch((await searchParams)?.q ?? "");
  const initial = await loadRecommendationPage(search, 1);

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold">Recommend Dictionary Entries</h1>
      <p className="max-w-3xl text-sm text-slate-700">
        These words occurred in parent-verified work but have no canonical Teaching Dictionary entry.
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
    <RecommendationWorkspace initial={initial} initialSearch={search} />
  </main>;
}
