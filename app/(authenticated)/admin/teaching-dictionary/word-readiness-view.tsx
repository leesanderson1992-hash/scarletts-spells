import Link from "next/link";
import type { LessonActivityKind } from "@/lib/adle/composable-lesson/contracts";
import type { CanonicalWordSkillRelationship } from "@/lib/adle/word-skill-relationships/contracts";
import { assessWordActivities, type WordActivityAssessment } from "@/lib/teaching-dictionary-manager/activity-assessment";
import { ACTIVITY_LABELS, matrixCell, matrixColumns } from "@/lib/teaching-dictionary-manager/activity-matrix";
import { routeForSkill, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { hasReleasedRouteContent, routeContentForReadiness } from "@/lib/teaching-dictionary-manager/readiness";

type RouteSource = "manager publication" | "manager draft" | "approved teaching submission";
type Member = { key: string; kind: "prefix" | "suffix" | "base"; released: boolean; compilerReady?: boolean; detail?: string; wordSum?: string };

const statusCard = "flex min-h-16 items-center gap-3 rounded-xl border border-[var(--border)] bg-white p-3";
const stepRow = "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] p-3 first:border-t-0";

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function WordReadinessView(props: {
  displayWord: string;
  payload: WordDraftPayload;
  publishedPayload: WordDraftPayload;
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
  const { payload, publishedPayload } = props;
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
  const definitionChanged = props.draftSelected && payload.definition !== publishedPayload.definition;
  const dictationChanged = props.draftSelected && (payload.dictationSentence !== publishedPayload.dictationSentence
    || payload.dictationTargetTokenIndex !== publishedPayload.dictationTargetTokenIndex);
  const metadataChanged = props.draftSelected && !sameJson(payload.metadata, publishedPayload.metadata);
  const morphologyChanged = props.draftSelected && !sameJson(payload.canonicalMorphology, publishedPayload.canonicalMorphology);
  const facts = [
    { label: "Definition", value: payload.definition, publishedValue: publishedPayload.definition,
      changed: definitionChanged, published: props.definitionPublished, target: "td-definition" },
    { label: "Dictation", value: payload.dictationSentence, publishedValue: publishedPayload.dictationSentence,
      changed: dictationChanged, published: props.dictationReview === "approved_for_first_exposure", target: "td-dictation" },
    { label: "Morphemes", value: payload.metadata.morphemes, publishedValue: publishedPayload.metadata.morphemes,
      changed: metadataChanged, published: props.metadataReview === "approved_for_first_exposure", target: "td-morphemes" },
    { label: "Word sum", value: payload.canonicalMorphology.wordSum || baseWordSum,
      publishedValue: publishedPayload.canonicalMorphology.wordSum || baseWordSum,
      changed: morphologyChanged, published: props.morphologyReview === "approved" || Boolean(baseWordSum), target: "td-canonical-word-sum" },
  ];

  const rows = skillKeys.map((key) => {
    const relationship = props.relationships.find((item) => item.microSkillKey === key);
    const route = routeForSkill(key);
    const saved = payload.routeContents.find((item) => item.microSkillKey === key && item.routeId === route?.routeId);
    const member = props.members.find((item) => item.key === key);
    const released = hasReleasedRouteContent(member?.kind ?? null, member?.released ?? false,
      relationship?.sourceProvenance.map((source) => source.sourceAuthority) ?? []);
    const lessonReady = released && member?.compilerReady !== false;
    const content = route ? routeContentForReadiness({ routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: key }, payload, saved) : null;
    const source = props.routeSources[key];
    const assessments = route && content ? assessWordActivities({
      microSkillKey: key,
      payload,
      routeContent: content,
      releasedMember: lessonReady && !props.draftSelected,
      needsReview: (target) => {
        if (target.startsWith("td-route-")) return source !== "manager publication";
        if (target === "td-dictation") return dictationChanged || props.dictationReview !== "approved_for_first_exposure";
        if (target === "td-canonical-word-sum" || target === "td-canonical-parts") return morphologyChanged || props.morphologyReview !== "approved";
        if (target === "td-definition") return definitionChanged || !props.definitionPublished;
        if (target === "td-age-band") return payload.ageBand !== publishedPayload.ageBand;
        if (target === "td-frequency-band") return payload.frequencyBand !== publishedPayload.frequencyBand;
        if (target === "td-complexity-band") return payload.complexityBand !== publishedPayload.complexityBand;
        if (["td-morphemes", "td-morphology_notes", "td-syllables", "td-phoneme_hint", "td-stress_pattern", "td-has-schwa"].includes(target)) {
          return metadataChanged || props.metadataReview !== "approved_for_first_exposure";
        }
        return false;
      },
    }) : [];
    return {
      key, relationship, route, member, released, lessonReady, source, assessments,
      name: props.skills.find((skill) => skill.micro_skill_key === key)?.display_name ?? key,
      suggested: suggestedKeys.includes(key) && !payload.skillKeys.includes(key) && !relationship && !member,
    };
  });
  const columns = matrixColumns(rows.map((row) => row.assessments));
  const visibleColumns: LessonActivityKind[] = columns.length ? columns : ["introduction", "cleaver", "meaning_sort", "dictation"];
  const unregisteredIve = /(?:^|\+)\s*suffix:ive(?:\s|\+|$)/i.test(payload.metadata.morphemes)
    && !routeForSkill("D4_MOR_SUFFIXES_IVE");

  function actionHref(row: (typeof rows)[number], target: string) {
    if (!payload.skillKeys.includes(row.key)) return "#td-skills";
    if (row.route && !["dynamic_prefix_word_lab", "dynamic_affix_word_lab", "base_word_lab"].includes(row.route.routeId)
      && target.startsWith("td-route-")) {
      const plainControls = ["componentToWholeRelationship", "base", "doublingPattern", "sourceRefs"];
      if (!plainControls.some((field) => target === `td-route-${row.key}-${field}`)) return `#td-route-${row.key}-advanced`;
    }
    return `#${target}`;
  }

  const rawIssues = rows.flatMap((row) => row.assessments.flatMap((assessment) => assessment.requirements
    .filter((requirement) => requirement.status !== "present")
    .map((requirement) => ({ row, assessment, requirement, href: actionHref(row, requirement.editTarget) }))));
  const issueByTarget = new Map<string, (typeof rawIssues)[number]>();
  for (const issue of rawIssues) if (!issueByTarget.has(issue.requirement.editTarget)) issueByTarget.set(issue.requirement.editTarget, issue);
  const issuePriority = ["td-canonical-parts", "td-canonical-word-sum", "trueMorphologyParts", "teachingSplitParts",
    "semanticBaseText", "semanticBaseKind", "suffixVariant", "prefixVariant", "baseMeaning", "meaningBinKey", "td-definition", "td-dictation"];
  const issues = [...issueByTarget.values()].sort((left, right) => {
    const rank = (target: string) => {
      const index = issuePriority.findIndex((priority) => target.includes(priority));
      return index === -1 ? issuePriority.length : index;
    };
    const statusRank = (status: "present" | "needs_review" | "missing") => status === "missing" ? 0 : status === "needs_review" ? 1 : 2;
    return statusRank(left.requirement.status) - statusRank(right.requirement.status)
      || rank(left.requirement.editTarget) - rank(right.requirement.editTarget);
  });
  const nextIssue = issues[0];
  const sharedFactsReady = facts.slice(0, 3).every((fact) => fact.value && fact.published && !fact.changed);
  const structureTargets = ["canonical-parts", "canonical-word-sum", "trueMorphology", "teachingSplit", "semanticBase", "suffixVariant", "prefixVariant"];
  const structureIssues = issues.filter((issue) => structureTargets.some((target) => issue.requirement.editTarget.includes(target)));
  const enabledActivities = rows.flatMap((row) => row.assessments.map((assessment) => ({ row, assessment })))
    .filter(({ assessment }) => assessment.variant.enabled && assessment.variant.wordScope !== "no_word");
  const readyActivities = enabledActivities.filter(({ row, assessment }) => matrixCell(assessment, row.key).state === "ready").length;
  const readyCount = rows.filter((row) => row.lessonReady).length;
  const approvedEvidence = rows.filter((row) => row.relationship).length;

  function activityCell(row: (typeof rows)[number], kind: LessonActivityKind) {
    const assessment: WordActivityAssessment | undefined = row.assessments.find((item) => item.variant.kind === kind);
    const cell = matrixCell(assessment, row.key);
    const issuesForCell = assessment?.requirements.filter((item) => item.status !== "present") ?? [];
    if (cell.state === "not_applicable") return <span className="text-slate-500" title={cell.reason}>n/a</span>;
    if (cell.state === "ready") return <span className="font-bold text-emerald-700" title={cell.reason} aria-label={`${ACTIVITY_LABELS[kind]} validated`}>✓</span>;
    return <div className="min-w-28 max-w-44 text-xs leading-5 text-amber-950" title={cell.reason}>
      <span aria-hidden="true" className="text-base">⚠</span><span className="sr-only">Needs work: </span>
      <a className="ml-1 font-semibold underline underline-offset-2" href={actionHref(row, cell.action!.href.slice(1))}>{cell.action!.label}</a>
      {cell.remainingIssues > 0 && <details className="ml-5"><summary className="cursor-pointer">+{cell.remainingIssues} more</summary>
        {issuesForCell.slice(1).map((issue) => <a key={`${issue.editTarget}:${issue.label}`} className="block underline" href={actionHref(row, issue.editTarget)}>{issue.status === "missing" ? "Add" : "Review"} {issue.label}</a>)}
      </details>}
    </div>;
  }

  return <section className="grid gap-4" aria-labelledby="word-readiness-title">
    <div><h2 id="word-readiness-title" className="text-xl font-semibold">Resolve this word</h2><p className="mt-1 text-sm text-[color:var(--mid)]">Work through one clear next action. Published facts stay visible and existing lesson snapshots remain pinned.</p></div>

    <div className="grid gap-3 md:grid-cols-3">
      <div className={statusCard}><span className={`grid size-7 place-items-center rounded-lg ${sharedFactsReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{sharedFactsReady ? "✓" : "!"}</span><div><p className="text-xs text-[color:var(--mid)]">Dictionary facts</p><p className="font-semibold">{sharedFactsReady ? "Published" : "Review needed"}</p></div></div>
      <div className={statusCard}><span className={`grid size-7 place-items-center rounded-lg ${approvedEvidence ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{approvedEvidence ? "✓" : "!"}</span><div><p className="text-xs text-[color:var(--mid)]">Evidence approval</p><p className="font-semibold">{approvedEvidence ? `${approvedEvidence} skill${approvedEvidence === 1 ? "" : "s"} approved` : "Not approved"}</p></div></div>
      <div className={statusCard}><span className={`grid size-7 place-items-center rounded-lg ${rows.length > 0 && readyCount === rows.length ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{rows.length > 0 && readyCount === rows.length ? "✓" : "!"}</span><div><p className="text-xs text-[color:var(--mid)]">ADLE lesson</p><p className="font-semibold">{rows.length === 0 ? "No skill assigned" : readyCount === rows.length ? "Ready" : rows.some((row) => row.released && !row.lessonReady) ? "Published content needs repair" : `${issues.length} decision${issues.length === 1 ? "" : "s"} remaining`}</p></div></div>
    </div>

    <div className={`grid gap-3 rounded-xl border p-4 md:grid-cols-[2.25rem_minmax(0,1fr)_auto] md:items-center ${nextIssue ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-white font-semibold">{nextIssue ? "1" : "✓"}</span>
      <div><p className="font-semibold">{nextIssue ? `Next action: ${nextIssue.requirement.status === "missing" ? "add" : "review"} ${nextIssue.requirement.label}` : "All word-level requirements are resolved"}</p><p className="text-sm">{nextIssue ? `Needed by ${nextIssue.row.name} · ${ACTIVITY_LABELS[nextIssue.assessment.variant.kind]}.` : "Run the publication checks and then confirm learner eligibility."}</p></div>
      <a className="rounded-lg bg-[var(--scarlett)] px-4 py-2 text-center text-sm font-semibold text-white" href={nextIssue?.href ?? "#td-publication"}>{nextIssue ? "Resolve now" : "Review publication"}</a>
    </div>

    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      <div className={`${stepRow} ${sharedFactsReady ? "" : "bg-amber-50"}`}><span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${sharedFactsReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{sharedFactsReady ? "✓" : "1"}</span><div><p className="font-semibold">Shared word facts</p><p className="text-xs text-[color:var(--mid)]">Definition, dictation and dictionary metadata</p></div><span className={`rounded-full px-2 py-1 text-xs ${sharedFactsReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{sharedFactsReady ? "Complete" : "Review"}</span></div>
      <div className={`${stepRow} ${structureIssues.length ? "bg-[var(--paper)]" : ""}`}><span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${structureIssues.length ? "bg-[var(--scarlett)] text-white" : "bg-emerald-50 text-emerald-800"}`}>{structureIssues.length ? "2" : "✓"}</span><div><p className="font-semibold">Word structure</p><p className="text-xs text-[color:var(--mid)]">Parts, joins, word sum and review source</p></div><a className="text-xs font-semibold underline" href={structureIssues[0]?.href ?? "#td-canonical-parts"}>{structureIssues.length ? `${structureIssues.length} to resolve` : "Complete"}</a></div>
      <div className={stepRow}><span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${issues.length ? "bg-[var(--paper)] text-[color:var(--mid)]" : "bg-emerald-50 text-emerald-800"}`}>{issues.length ? "3" : "✓"}</span><div><p className="font-semibold">Lesson checks</p><p className="text-xs text-[color:var(--mid)]">{readyActivities} of {enabledActivities.length} applicable activities validated</p></div><a className="text-xs font-semibold underline" href="#td-lesson-checks">View checks</a></div>
      <div className={stepRow}><span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${rows.length > 0 && readyCount === rows.length ? "bg-emerald-50 text-emerald-800" : "bg-[var(--paper)] text-[color:var(--mid)]"}`}>{rows.length > 0 && readyCount === rows.length ? "✓" : "4"}</span><div><p className="font-semibold">Validate and release</p><p className="text-xs text-[color:var(--mid)]">Compiler, route publication and learner gates</p></div><span className="text-xs text-[color:var(--mid)]">{rows.length > 0 && readyCount === rows.length ? "Ready" : "Waiting"}</span></div>
    </div>

    <details id="td-lesson-checks" className="rounded-xl border border-[var(--border)] bg-white p-4 scroll-mt-6">
      <summary className="cursor-pointer font-semibold">All lesson checks <span className="font-normal text-[color:var(--mid)]">· {issues.length} unresolved</span></summary>
      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full min-w-max border-collapse text-left text-sm"><caption className="sr-only">Question readiness for {props.displayWord} by micro skill</caption><thead className="bg-[var(--paper)]"><tr><th scope="col" className="sticky left-0 z-10 min-w-60 border-b border-r border-[var(--border)] bg-[var(--paper)] p-3">Micro skill</th>{visibleColumns.map((kind) => <th key={kind} scope="col" className="min-w-28 border-b border-[var(--border)] p-3 font-semibold">{ACTIVITY_LABELS[kind]}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-b border-[var(--border)] align-top last:border-0"><th scope="row" className="sticky left-0 z-10 border-r border-[var(--border)] bg-white p-3 text-left font-semibold"><div>{row.name}</div><div className="mt-1 text-xs font-normal text-[color:var(--mid)]">Evidence {row.relationship ? "✓ Approved" : "⚠ Not approved"} · Lesson {row.lessonReady ? "✓ Ready" : row.released ? "⚠ Published, needs repair" : row.route ? "⚠ Needs release" : "n/a"}</div>{row.suggested && <span className="mt-1 block text-xs font-normal">Suggested from reviewed facts.</span>}</th>{visibleColumns.map((kind) => <td key={kind} className="p-3">{activityCell(row, kind)}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={visibleColumns.length + 1} className="p-4">No micro skill is assigned. <a href="#td-skills" className="font-semibold underline">Assign a skill</a> to see its checks.</td></tr>}</tbody></table></div>
      {unregisteredIve && <p className="mt-3 text-xs text-amber-900">Morpheme data mentions -ive, but no -ive specialist lesson route is registered.</p>}
    </details>

    <details className="rounded-xl border border-[var(--border)] bg-white p-4"><summary className="cursor-pointer font-semibold">Published and draft facts</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Fact</th><th className="p-2">Current value</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{facts.map((fact) => <tr key={fact.label} className="border-b last:border-0"><th scope="row" className="p-2 font-medium">{fact.label}</th><td className="max-w-md break-words p-2">{fact.value || <span className="text-amber-900">Missing</span>}</td><td className="p-2 text-xs">{fact.changed ? "Draft · Needs review" : fact.published && fact.publishedValue ? "Published" : "Missing"}</td><td className="p-2"><a className="font-semibold underline" href={`#${fact.target}`}>{fact.changed || !fact.value ? "Resolve" : "Review"}</a></td></tr>)}</tbody></table></div></details>

    <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--mid)]"><span>Dictionary review: {props.wordReview.replaceAll("_", " ")}</span><span>•</span><span>Learner eligibility is checked after word and route checks.</span><Link className="font-semibold underline" href={`/admin/adle-canonical-intake-readiness?q=${encodeURIComponent(props.displayWord)}`}>Check learner readiness</Link></div>
  </section>;
}

export type { Member as ReadinessMember, RouteSource as ReadinessRouteSource };
