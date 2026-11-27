import {isLatinRootReviewSkill} from "@/lib/teaching-dictionary-manager/latin-root-review";
import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { CATALOGUE_PATH } from "@/lib/teaching-dictionary-manager/catalogue-navigation";
import { hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { OVERVIEW_EXPORT_BATCH_SIZE } from "@/lib/teaching-dictionary-manager/overview-csv";
import { CsvImportPanel } from "../csv-import-panel";
import { MultiSenseCsvPanel } from "../multi-sense-csv-panel";

export const dynamic = "force-dynamic";

export default async function TeachingDictionaryImportPage({ searchParams }: {
  searchParams: Promise<{ tools?: string }>;
}) {
  await requireAdminUser();
  const { tools } = await searchParams;
  const overview = tools === "overview";
  const guidance = tools === "meanings";
  const db = createServiceRoleClient();
  const [drafts, reviewSkills, activeCount, reviewedSenseCount] = await Promise.all([
    db.from("teaching_dictionary_manager_drafts").select("id,canonical_word_id,normalised_word,created_at")
      .order("created_at", { ascending: false }).limit(12),
    overview || guidance ? db.from("micro_skill_catalog").select("micro_skill_key,display_name")
      .eq("is_active", true).eq("is_assignable", true).order("display_name") : null,
    overview ? db.from("canonical_teaching_dictionary_words").select("id", { count: "exact", head: true })
      .eq("dialect_code", "en-GB").eq("row_status", "active") : null,
    guidance ? db.from("teaching_dictionary_reviewed_sense_sets").select("canonical_word_id", { count: "exact", head: true }) : null,
  ]);
  if (drafts.error) throw new Error("TEACHING_DRAFT_READ_FAILED");
  if (reviewSkills && (reviewSkills.error || reviewSkills.data.length >= 1000)) throw new Error("TEACHING_REVIEW_SKILL_CATALOG_READ_FAILED");
  if (activeCount && (activeCount.error || activeCount.count == null)) throw new Error("TEACHING_WORD_COUNT_READ_FAILED");
  if (reviewedSenseCount && (reviewedSenseCount.error || reviewedSenseCount.count == null)) throw new Error("TEACHING_MEANING_COUNT_READ_FAILED");

  return <main className="mx-auto grid max-w-7xl gap-5 p-4 text-[color:var(--ink)] sm:p-6">
    <header className="space-y-2">
      <Link className="text-sm underline" href={CATALOGUE_PATH} prefetch={false}>← Catalogue</Link>
      <h1 className="text-3xl font-semibold">Import words</h1>
    </header>
    <div id="word-csv-import" className="scroll-mt-16">
      <MultiSenseCsvPanel batchCount={Math.ceil((reviewedSenseCount?.count ?? 0) / 100)}
        skills={reviewSkills?.data?.filter(skill => hasCandidateRule(skill.micro_skill_key)||isLatinRootReviewSkill(skill.micro_skill_key))}
        guidanceHref={guidance ? undefined : "?tools=meanings#word-csv-import"} />
    </div>
    {overview
      ? <CsvImportPanel overviewBatchCount={Math.ceil((activeCount?.count ?? 0) / OVERVIEW_EXPORT_BATCH_SIZE)}
          reviewSkills={reviewSkills?.data ?? []} />
      : <Link href="?tools=overview" prefetch={false} className="w-fit font-semibold underline">Open Overview CSV tools</Link>}
    <section aria-labelledby="recent-drafts-heading" className="rounded-xl border border-[var(--border)] bg-[var(--white)] p-4">
      <h2 id="recent-drafts-heading" className="text-lg font-semibold">Recent drafts</h2>
      {drafts.data.length ? <ul className="mt-2 divide-y divide-[var(--border)] text-sm">
        {drafts.data.map(draft => <li key={draft.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <Link className="font-semibold underline" prefetch={false}
            href={`${CATALOGUE_PATH}/${draft.canonical_word_id ?? "new"}?draft=${draft.id}`}>{draft.normalised_word}</Link>
          <time dateTime={draft.created_at}>{new Date(draft.created_at).toLocaleString("en-GB")}</time>
        </li>)}
      </ul> : <p className="mt-2 text-sm">No saved drafts yet.</p>}
    </section>
  </main>;
}
