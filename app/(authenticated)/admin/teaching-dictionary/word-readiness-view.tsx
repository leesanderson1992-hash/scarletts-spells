import Link from "next/link";
import type { LessonActivityKind } from "@/lib/adle/composable-lesson/contracts";
import type { CanonicalWordSkillRelationship } from "@/lib/adle/word-skill-relationships/contracts";
import { assessWordActivities, type WordActivityAssessment } from "@/lib/teaching-dictionary-manager/activity-assessment";
import { ACTIVITY_LABELS, matrixCell, matrixColumns } from "@/lib/teaching-dictionary-manager/activity-matrix";
import { routeForSkill, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { hasReleasedRouteContent, routeContentForReadiness } from "@/lib/teaching-dictionary-manager/readiness";

type RouteSource = "manager publication" | "manager draft" | "approved teaching submission";
type Member = { key: string; kind: "prefix" | "suffix" | "base"; released: boolean; detail?: string; wordSum?: string };

export function WordReadinessView(props: {
  displayWord: string;
  payload: WordDraftPayload;
  draftSelected: boolean;
  wordReview: string;
  metadataReview: string | null;
  morphologyReview: string | null;
  dictationReview: string | null;
  definitionPublished: boolean;
  derivedIty: { ready: boolean; blockers: readonly string[] } | null;
  routeSources: Record<string, RouteSource>;
  relationships: readonly CanonicalWordSkillRelationship[];
  members: readonly Member[];
  skills: readonly { micro_skill_key: string; display_name: string }[];
}) {
  const { payload } = props;
  const parts = Array.isArray(payload.canonicalMorphology.parts) ? payload.canonicalMorphology.parts : [];
  const lastPart = parts.at(-1);
  const reviewedItyAnalysis = props.morphologyReview === "approved"
    && parts.length >= 2 && lastPart && typeof lastPart === "object" && !Array.isArray(lastPart)
    && String((lastPart as Record<string, unknown>).surfaceText ?? (lastPart as Record<string, unknown>).text ?? "") === "ity"
    && String((lastPart as Record<string, unknown>).kind ?? (lastPart as Record<string, unknown>).role
      ?? (lastPart as Record<string, unknown>).type ?? (lastPart as Record<string, unknown>).partType ?? "") === "suffix";
  const suggestedKeys = reviewedItyAnalysis || props.derivedIty?.ready ? ["D4_MOR_SUFFIXES_ITY"] : [];
  const skillKeys = [...new Set([
    ...payload.skillKeys,
    ...props.relationships.map((relationship) => relationship.microSkillKey),
    ...props.members.map((member) => member.key),
    ...payload.routeContents.map((content) => content.microSkillKey),
    ...suggestedKeys,
  ])];
  const baseWordSum = props.members.find((member) => member.kind === "base" && member.released && member.wordSum)?.wordSum ?? "";
  const facts = [
    { label: "Definition", value: payload.definition, source: props.draftSelected ? "Draft" : props.definitionPublished ? "Dictionary" : "None",
      review: props.draftSelected ? "Needs review" : props.definitionPublished ? "Published" : "Missing", target: "td-definition" },
    { label: "Dictation", value: payload.dictationSentence, source: props.draftSelected ? "Draft" : "Dictionary",
      review: props.draftSelected ? "Needs review" : props.dictationReview ?? "Missing", target: "td-dictation" },
    { label: "Morphemes", value: payload.metadata.morphemes, source: props.draftSelected ? "Draft" : "Dictionary",
      review: props.draftSelected ? "Needs review" : props.metadataReview ?? "Missing", target: "td-morphemes" },
    { label: "Word sum", value: payload.canonicalMorphology.wordSum || baseWordSum,
      source: props.draftSelected && payload.canonicalMorphology.wordSum ? "Draft" : baseWordSum && !payload.canonicalMorphology.wordSum ? "Base-word member" : "Dictionary",
      review: props.draftSelected && payload.canonicalMorphology.wordSum ? "Needs review" : payload.canonicalMorphology.wordSum ? props.morphologyReview ?? "Missing" : baseWordSum ? "Approved" : "Missing",
      target: "td-canonical-word-sum" },
  ];
  const rows = skillKeys.map((key) => {
    const relationship = props.relationships.find((item) => item.microSkillKey === key);
    const route = routeForSkill(key);
    const saved = payload.routeContents.find((item) => item.microSkillKey === key && item.routeId === route?.routeId);
    const member = props.members.find((item) => item.key === key);
    const released = hasReleasedRouteContent(member?.kind ?? null, member?.released ?? false,
      relationship?.sourceProvenance.map((source) => source.sourceAuthority) ?? []);
    const content = route ? routeContentForReadiness({ routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: key }, payload, saved) : null;
    const source = props.routeSources[key];
    const assessments = route && content ? assessWordActivities({
      microSkillKey: key, payload, routeContent: content, releasedMember: released,
      needsReview: (target) => {
        if (props.draftSelected) return true;
        if (target.startsWith("td-route-")) return source !== "manager publication";
        if (target === "td-dictation") return props.dictationReview !== "approved_for_first_exposure";
        if (target === "td-canonical-word-sum") return props.morphologyReview !== "approved";
        if (target === "td-definition") return !props.definitionPublished;
        if (["td-morphemes", "td-morphology_notes", "td-syllables", "td-phoneme_hint", "td-stress_pattern", "td-has-schwa"].includes(target)) {
          return props.metadataReview !== "approved_for_first_exposure";
        }
        return false;
      },
    }) : [];
    return { key, relationship, route, member, released, source, assessments,
      name: props.skills.find((skill) => skill.micro_skill_key === key)?.display_name ?? key,
      suggested: suggestedKeys.includes(key) && !payload.skillKeys.includes(key) && !relationship && !member };
  });
  const columns = matrixColumns(rows.map((row) => row.assessments));
  const visibleColumns: LessonActivityKind[] = columns.length ? columns : ["introduction", "cleaver", "meaning_sort", "dictation"];

  function activityCell(row: (typeof rows)[number], kind: LessonActivityKind) {
    const assessment: WordActivityAssessment | undefined = row.assessments.find((item) => item.variant.kind === kind);
    const cell = matrixCell(assessment, row.key);
    const issues = assessment?.requirements.filter((item) => item.status !== "present") ?? [];
    const actionHref = (target: string) => {
      if (!payload.skillKeys.includes(row.key)) return "#td-skills";
      if (row.route && !["dynamic_prefix_word_lab", "dynamic_affix_word_lab", "base_word_lab"].includes(row.route.routeId)
        && target.startsWith("td-route-")) return `#td-route-${row.key}`;
      return `#${target}`;
    };
    if (cell.state === "not_applicable") return <span className="text-slate-500" title={cell.reason}>n/a</span>;
    if (cell.state === "ready") return <span className="font-bold text-emerald-700" title={cell.reason} aria-label={`${ACTIVITY_LABELS[kind]} validated`}>✓</span>;
    return <div className="min-w-28 max-w-44 text-xs leading-5 text-amber-950" title={cell.reason}>
      <span aria-hidden="true" className="text-base">⚠</span><span className="sr-only">Needs work: </span>
      <a className="ml-1 font-semibold underline underline-offset-2" href={actionHref(issues[0]?.editTarget ?? `td-route-${row.key}`)}>
        {issues[0] ? `${issues[0].status === "missing" ? "Add" : "Review"} ${issues[0].label}` : "Validate route"}
      </a>
      {issues.length > 1 && <details className="ml-5"><summary className="cursor-pointer">+{issues.length - 1} more</summary>
        {issues.slice(1).map((issue) => <a key={`${issue.editTarget}:${issue.label}`} className="block underline" href={actionHref(issue.editTarget)}>{issue.status === "missing" ? "Add" : "Review"} {issue.label}</a>)}
      </details>}
    </div>;
  }

  return <section className="grid gap-4" aria-labelledby="word-readiness-title">
    <div className="flex flex-wrap items-end justify-between gap-2"><div>
      <h2 id="word-readiness-title" className="text-xl font-semibold">Word readiness</h2>
      <p className="text-sm text-[color:var(--mid)]">A tick means a released question was validated. Warnings link to the fact to fix. n/a means this word is not used there.</p>
    </div><a className="text-sm font-semibold underline" href="#td-skills">Assign a micro skill</a></div>

    <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
      <table className="w-full min-w-max border-collapse text-left text-sm"><caption className="sr-only">Question readiness for {props.displayWord} by micro skill</caption>
        <thead className="bg-[var(--paper)]"><tr><th scope="col" className="sticky left-0 z-10 min-w-60 border-b border-r border-[var(--border)] bg-[var(--paper)] p-3">Micro skill</th>
          {visibleColumns.map((kind) => <th key={kind} scope="col" className="min-w-28 border-b border-[var(--border)] p-3 font-semibold">{ACTIVITY_LABELS[kind]}</th>)}
        </tr></thead><tbody>
          {rows.map((row) => <tr key={row.key} className="border-b border-[var(--border)] align-top last:border-0">
            <th scope="row" className="sticky left-0 z-10 border-r border-[var(--border)] bg-white p-3 text-left font-semibold">
              <div>{row.name}</div><div className="mt-1 text-xs font-normal text-[color:var(--mid)]">{row.key}</div>
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs font-normal">
                <span className={row.relationship ? "text-emerald-800" : "text-amber-900"}>Evidence {row.relationship ? "✓ Approved" : "⚠ Not approved"}</span>
                <span className={row.released ? "text-emerald-800" : row.route ? "text-amber-900" : "text-slate-500"}>Lesson {row.released ? "✓ Released" : row.route ? "⚠ Needs release" : "n/a"}</span>
              </div>
              {!row.relationship && !row.suggested && <a href="#td-evidence-approval" className="mt-1 block text-xs font-normal underline">Review evidence approval</a>}
              {row.relationship && <details className="mt-1 text-xs font-normal"><summary className="cursor-pointer">Approval source</summary>
                {row.relationship.sourceProvenance.map((source) => <p key={`${source.sourceAuthority}:${source.provenanceId}`} className="break-all">{source.sourceAuthority.replaceAll("_", " ")} · {source.provenanceId}</p>)}
              </details>}
              {row.route && !row.released && <a className="mt-1 block text-xs font-normal underline" href={row.source === "approved teaching submission" ? "#td-approved-submissions" : payload.skillKeys.includes(row.key) ? `#td-route-${row.key}` : "#td-skills"}>
                {row.source === "approved teaching submission" ? "Open approved submission" : "Edit route facts"}
              </a>}
              {row.suggested && <span className="mt-1 block text-xs font-normal">Suggested from reviewed facts; select this skill to work on it.</span>}
              {row.key === "D4_MOR_SUFFIXES_ITY" && props.derivedIty?.ready && !row.released && <Link className="mt-1 block text-xs font-normal underline" href="/admin/teaching-dictionary/routes?audit=ity">Check direct -ity candidate</Link>}
            </th>
            {visibleColumns.map((kind) => <td key={kind} className="p-3">{activityCell(row, kind)}</td>)}
          </tr>)}
          {rows.length === 0 && <tr><td colSpan={visibleColumns.length + 1} className="p-4 text-sm">No micro skill is assigned or approved for this word. <a href="#td-skills" className="font-semibold underline">Choose a skill</a> to see its lesson questions and required facts.</td></tr>}
        </tbody></table>
    </div>

    <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--mid)]">
      <span>Dictionary review: {props.wordReview.replaceAll("_", " ")}</span>
      <span>•</span><span>Learner eligibility is checked per child after word and route checks.</span>
      <Link className="font-semibold underline" href={`/admin/adle-canonical-intake-readiness?q=${encodeURIComponent(props.displayWord)}`}>Check learner readiness</Link>
    </div>

    <details className="rounded-lg border border-[var(--border)] bg-white p-3" open>
      <summary className="cursor-pointer font-semibold">Shared facts</summary>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Fact</th><th className="p-2">Current value</th><th className="p-2">Source and review</th><th className="p-2">Action</th></tr></thead><tbody>
        {facts.map((fact) => <tr key={fact.label} className="border-b last:border-0"><th scope="row" className="p-2 font-medium">{fact.label}</th><td className="max-w-md break-words p-2">{fact.value || <span className="text-amber-900">Missing</span>}</td><td className="p-2 text-xs">{fact.source} · {fact.review.replaceAll("_", " ")}</td><td className="p-2"><a className="font-semibold underline" href={`#${fact.target}`}>Edit</a></td></tr>)}
      </tbody></table></div>
    </details>
  </section>;
}

export type { Member as ReadinessMember, RouteSource as ReadinessRouteSource };
