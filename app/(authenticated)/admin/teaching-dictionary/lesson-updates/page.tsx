import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { ING_MICRO_SKILLS } from "@/lib/adle/ing/contracts";
import { ING_REVIEW_LABELS, isIngReviewSkill, loadIngReviewWords } from "@/lib/teaching-dictionary-manager/ing-review-data";
import { LessonFilter } from "./lesson-filter";

export default async function LessonUpdates({ searchParams }: {
  searchParams: Promise<{ skill?: string }>;
}) {
  await requireAdminUser();
  const { skill } = await searchParams;
  const selected = isIngReviewSkill(skill) ? skill : null;
  const rows = selected ? await loadIngReviewWords(selected) : [];
  const released = rows.filter(row => row.released).length;
  return <main className="mx-auto max-w-5xl space-y-5 p-6">
    <Link href="/admin/teaching-dictionary" className="text-sm underline">Teaching Dictionary</Link>
    <h1 className="text-3xl font-semibold">Bulk review</h1>
    <LessonFilter lessons={ING_MICRO_SKILLS.map(key => ({ key, label: ING_REVIEW_LABELS[key] }))} selected={selected ?? ""} />
    {selected ? <section className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-5">
      <h2 className="text-xl font-semibold">{ING_REVIEW_LABELS[selected]}</h2>
      <p>{rows.length} associated words · {released} in the live lesson pool</p>
      <p>Download the workbook to review meanings, families, word parts and dictation. Keep your edited workbook for the publishing step.</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: Math.ceil(rows.length / 100) }, (_, index) =>
          <a key={index} className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white"
            href={`/admin/teaching-dictionary/export/review-workbook?skill=${selected}&batch=${index + 1}`}>
            {rows.length > 100 ? `Download review workbook ${index + 1}` : "Download review workbook"}
          </a>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="p-2">Word</th><th scope="col" className="p-2">Lesson status</th>
            <th scope="col" className="p-2">Review</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.wordId} className="border-t">
            <th scope="row" className="p-2"><Link className="underline" prefetch={false}
              href={`/admin/teaching-dictionary/${row.wordId}`}>{row.displayWord}</Link></th>
            <td className="p-2">{row.released ? "In the live pool" : "Associated"}</td>
            <td className="p-2">{row.released ? row.released.meaning : row.blockers.join(" ") || "Review lesson facts."}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section> : <p>Choose an -ing lesson to see its associated words and download a review workbook.</p>}
  </main>;
}
