import Link from "next/link";
import { rootReviewGroupIsComplete } from "@/lib/teaching-dictionary-manager/root-family-audit";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadRootFamilyAudit } from "@/lib/teaching-dictionary-manager/root-family-audit-loader";

export async function RootReviewPage({ other = false, showCompleted = false }: { other?: boolean; showCompleted?: boolean }) {
  await requireAdminUser();
  const audit = await loadRootFamilyAudit(createServiceRoleClient(), other);
  const completed = audit.groups.filter(rootReviewGroupIsComplete);
  const groups = showCompleted ? audit.groups : audit.groups.filter(group => !rootReviewGroupIsComplete(group));
  const words = new Set(groups.flatMap(group => group.rows.map(row => row.wordId))).size;
  const pagePath = `/admin/teaching-dictionary/root-review${other ? "/other" : ""}`;
  return <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <Link href="/admin/teaching-dictionary/lesson-updates?skill=D4_MOR_ROOTS_COMMON_LATIN_ROOTS" className="font-semibold underline">← Common Latin roots bulk review</Link>
    <h1 className="text-2xl font-bold">{other ? "Other assigned root families" : "Root-family dictionary review"}</h1>
    <nav aria-label="Root review pages" className="flex flex-wrap gap-4 border-b border-[var(--border)] pb-3">
      <Link href="/admin/teaching-dictionary/root-review" aria-current={!other ? "page" : undefined} className="font-semibold underline">Your 18 roots</Link>
      <Link href="/admin/teaching-dictionary/root-review/other" aria-current={other ? "page" : undefined} className="font-semibold underline">Other assigned families</Link>
    </nav>
    <p>{other
      ? "These families sit outside your current 18-root review list. Review them by root before deciding whether to deassign their words. Existing exclusions are shown separately."
      : "Review existing dictionary words whose breakdown may need to expose a root. A spelling match is a candidate for investigation; it is not a verified root relationship."}</p>
    <p className="text-sm">{words} distinct dictionary words · {groups.length} root groups shown. These pages do not change assignments or publish words. Open a word to review its meaning, parts, family and micro-skills.</p>
    {completed.length > 0 && <p className="text-sm">{completed.length} completed root groups{showCompleted ? " included" : " cleared from this view"}. <Link prefetch={false} className="font-semibold underline" href={showCompleted ? pagePath : `${pagePath}?completed=1`}>{showCompleted ? "Hide completed" : "Show completed"}</Link></p>}
    {groups.length === 0 && <p>No root groups currently need review.</p>}
    {!other && <p className="text-sm">Pict includes the registered picto family; pos includes pose. Scribe searches scribe, scrib and script. Related forms still need review. Affect, effect and combustion retain your exclusions.</p>}
    <nav aria-label="Jump to root" className="flex flex-wrap gap-x-4 gap-y-2">{groups.map(group => <a key={group.root} href={`#root-${group.root}`} className="font-semibold underline">{group.root} ({new Set(group.rows.map(row => row.wordId)).size})</a>)}</nav>
    {groups.map(group => <section key={group.root} id={`root-${group.root}`} aria-labelledby={`heading-${group.root}`} className="scroll-mt-6 space-y-3 border-t border-[var(--border)] pt-5">
      <h2 id={`heading-${group.root}`} className="text-xl font-bold">{group.root}</h2>
      <p className="text-sm">{group.registered.length ? `Registered family: ${group.registered.join(", ")}.` : "No reviewed Latin-root family registered yet."} {group.assigned} linked words without an exclusion{group.excluded ? ` · ${group.excluded} already excluded or deassigned` : ""}.</p>
      {group.dismissed > 0 && <p className="text-sm">{group.dismissed} unselected candidates reviewed and dismissed. Your assigned words remain. Changed word facts will be offered for review again.</p>}
      {group.reviewed && <p className="text-sm font-semibold">{group.rows.some(row => !row.linked) ? "New or changed candidates since your review." : "Review complete. No further candidates selected."}</p>}
      {!group.rows.length ? <p>No ordinary dictionary candidates found for the searched forms. No entries were created.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <caption className="sr-only">{group.root} dictionary candidates and their current breakdowns</caption>
          <thead><tr className="border-b border-[var(--border)]"><th scope="col" className="p-2">Word and meaning</th><th scope="col" className="p-2">Current word sum</th><th scope="col" className="p-2">Relationship</th><th scope="col" className="p-2">Review</th><th scope="col" className="p-2">Open</th></tr></thead>
          <tbody>{group.rows.map(row => <tr key={`${row.wordId}:${row.senseId ?? "unreviewed"}`} className="border-b border-[var(--border)] align-top">
            <th scope="row" className="max-w-64 p-2 font-normal"><strong>{row.word}</strong><p>{row.meaning}</p>{row.partOfSpeech && <p className="text-xs">{row.partOfSpeech}</p>}</th>
            <td className="max-w-64 p-2"><strong>{row.wordSum}</strong><p className="mt-1 text-xs">{row.parts}</p><p className="mt-1 text-xs">{row.source}</p></td>
            <td className="p-2">{row.excluded ? "Excluded from Common Latin roots" : row.linked ? "Existing root-family link" : "Unverified spelling candidate"}</td>
            <td className="max-w-80 p-2">{row.issues.length ? <ul className="list-disc space-y-1 pl-4">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : "Explicit root breakdown recorded. Review meanings and lesson eligibility before publication."}</td>
            <td className="p-2"><Link prefetch={false} className="font-semibold underline" href={`/admin/teaching-dictionary/${row.wordId}${row.senseId ? `?sense=${encodeURIComponent(row.senseId)}` : ""}`}>Review {row.word}</Link></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>)}
  </main>;
}
