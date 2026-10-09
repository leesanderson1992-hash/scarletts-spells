import Link from "next/link";
import type { CanonicalWordSkillRelationship } from "@/lib/adle/word-skill-relationships/contracts";
import { routeForSkill, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { hasReleasedRouteContent, requirementPreview, routeContentForReadiness, routeRequirements } from "@/lib/teaching-dictionary-manager/readiness";

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
  routeSources: Record<string, RouteSource>;
  relationships: readonly CanonicalWordSkillRelationship[];
  members: readonly Member[];
  skills: readonly { micro_skill_key: string; display_name: string }[];
}) {
  const { payload } = props;
  const skillKeys = [...new Set([
    ...payload.skillKeys,
    ...props.relationships.map((relationship) => relationship.microSkillKey),
    ...props.members.map((member) => member.key),
    ...payload.routeContents.map((content) => content.microSkillKey),
  ])];
  const baseWordSum = props.members.find((member) => member.kind === "base" && member.released && member.wordSum)?.wordSum ?? "";
  const factRows = [
    { label: "Definition", value: payload.definition, source: props.draftSelected ? "selected draft" : props.definitionPublished ? "published dictionary definition" : "no published definition", review: props.draftSelected ? "Needs review" : props.definitionPublished ? "Published" : "Missing", target: "td-definition" },
    { label: "Dictation", value: payload.dictationSentence, source: props.draftSelected ? "selected draft" : "dictionary sentence", review: props.draftSelected ? "Needs review" : props.dictationReview ?? "Missing", target: "td-dictation" },
    { label: "Morphemes", value: payload.metadata.morphemes, source: props.draftSelected ? "selected draft" : "dictionary metadata", review: props.draftSelected ? "Needs review" : props.metadataReview ?? "Missing", target: "td-morphemes" },
    { label: "Word sum", value: payload.canonicalMorphology.wordSum || baseWordSum,
      source: payload.canonicalMorphology.wordSum ? props.draftSelected ? "selected draft" : "canonical morphology" : baseWordSum ? "reviewed base-word member" : "canonical morphology",
      review: props.draftSelected && payload.canonicalMorphology.wordSum ? "Needs review" : payload.canonicalMorphology.wordSum ? props.morphologyReview ?? "Missing" : baseWordSum ? "Approved for base-word route" : "Missing",
      target: "td-canonical-word-sum" },
  ];
  const mentionsIve = /(?:^|\+)\s*suffix:ive(?:\s|\+|$)/i.test(payload.metadata.morphemes);
  const iveRoute = routeForSkill("D4_MOR_SUFFIXES_IVE");
  return <section className="grid gap-4 rounded-2xl border border-[var(--border)] bg-white p-5" aria-labelledby="word-readiness-title">
    <div><h2 id="word-readiness-title" className="text-xl font-semibold">Readiness for {props.displayWord}</h2>
      <p className="mt-1 text-sm">What is recorded, which skills have authority, and the exact facts still needed for each lesson.</p></div>
    <div className="grid gap-2 md:grid-cols-2">
      {factRows.map((fact) => <div key={fact.label} className="rounded-lg border border-[var(--border)] p-3 text-sm">
        <div className="flex items-center justify-between gap-2"><strong>{fact.label}</strong><span className={fact.value ? "text-emerald-800" : "text-amber-800"}>{fact.value ? fact.review.replaceAll("_", " ") : "Missing"}</span></div>
        <p className="mt-1 break-words">{fact.value || "No value recorded"}</p>
        <p className="mt-1 text-xs text-[color:var(--mid)]">Source: {fact.source}</p>
        <a href={`#${fact.target}`} className="mt-1 inline-block text-xs font-semibold underline">Edit {fact.label.toLowerCase()}</a>
      </div>)}
    </div>
    <p className="text-xs">Dictionary word: {props.wordReview.replaceAll("_", " ")}. A draft value needs publication before a lesson uses it.</p>
    {mentionsIve && !iveRoute && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">The morpheme note mentions -ive. There is no registered -ive ADLE lesson route; this note does not approve one.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Micro skill</th><th className="p-2">Evidence</th><th className="p-2">Word content</th><th className="p-2">Lesson route</th><th className="p-2">Learner</th></tr></thead><tbody>
      {skillKeys.map((key) => {
        const relationship = props.relationships.find((item) => item.microSkillKey === key);
        const route = routeForSkill(key);
        const saved = payload.routeContents.find((item) => item.microSkillKey === key && item.routeId === route?.routeId);
        const member = props.members.find((item) => item.key === key);
        const released = hasReleasedRouteContent(member?.kind ?? null, member?.released ?? false,
          relationship?.sourceProvenance.map((source) => source.sourceAuthority) ?? []);
        const content = route ? routeContentForReadiness({ routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: key }, payload, saved) : null;
        const source = props.routeSources[key];
        const requirements = content && !released ? routeRequirements(content, payload, (target) => {
          if (props.draftSelected) return true;
          if (target.startsWith("td-route-")) return source !== "manager publication";
          if (target === "td-dictation") return props.dictationReview !== "approved_for_first_exposure";
          if (target === "td-canonical-word-sum") return props.morphologyReview !== "approved";
          if (["td-definition"].includes(target)) return !props.definitionPublished;
          if (["td-morphemes", "td-morphology_notes", "td-syllables", "td-phoneme_hint", "td-stress_pattern", "td-has-schwa"].includes(target)) return props.metadataReview !== "approved_for_first_exposure";
          return false;
        }) : [];
        const missing = requirements.filter((item) => item.status === "missing");
        const reviewNeeded = requirements.filter((item) => item.status === "needs_review");
        const contentState = !route ? "No specialist content required" : released ? "Present in released member" : saved ? missing.length ? `${missing.length} missing facts` : reviewNeeded.length ? "Content needs review" : "Content ready for release" : member ? "Reviewed member present" : "Missing route content";
        const routeState = !route ? "No specialist ADLE route" : released ? "Released" : member ? "Member present; release check needed" : source === "approved teaching submission" && missing.length === 0 ? "Publish approved submission" : missing.length ? "Blocked by missing facts" : reviewNeeded.length ? "Review then publish" : "Publish route member";
        return <tr key={key} className="border-b align-top last:border-0"><td className="p-2 font-semibold">{props.skills.find((skill) => skill.micro_skill_key === key)?.display_name ?? key}<p className="text-xs font-normal">{key}</p>{member?.detail && <p className="mt-1 font-normal">{member.detail}</p>}</td>
          <td className="p-2">{relationship ? <><span className="text-emerald-800">Approved</span><details className="mt-1 text-xs"><summary>Approval sources</summary>{relationship.sourceProvenance.map((item) => <p key={`${item.sourceAuthority}:${item.provenanceId}`}>{item.sourceAuthority.replaceAll("_", " ")} · {item.provenanceId}</p>)}</details></> : <><span>Not approved</span><p><a className="underline" href="#td-evidence-approval">Review approval</a></p></>}</td>
          <td className="p-2">{contentState}{route && <p className="text-xs">{released ? "Source: released route authority" : source ? `Source: ${source}` : "No reviewed route content"}</p>}</td>
          <td className="p-2">{routeState}{route && <details className="mt-1" open={missing.length > 0 && missing.length <= 5}><summary>{released ? "Reviewed member supplies route content" : `${requirements.length - missing.length - reviewNeeded.length} present · ${reviewNeeded.length} need review · ${missing.length} missing`}</summary>
            {requirements.length > 0 && <ul className="mt-1 grid gap-1">{requirements.map((item) => <li key={item.label} className={item.status === "missing" ? "text-amber-900" : item.status === "needs_review" ? "text-blue-800" : "text-emerald-800"}>{item.status === "missing" ? "Missing" : item.status === "needs_review" ? "Needs review" : "Present"}: {item.label}{item.status !== "missing" && content && <span className="block text-xs text-[color:var(--mid)]">{requirementPreview(item.editTarget, content, payload)}</span>}{item.status !== "present" && <a className="ml-2 font-semibold underline" href={`#${item.editTarget}`}>Edit</a>}</li>)}</ul>}</details>}
            {!released && source === "approved teaching submission" && <a className="mt-1 block font-semibold underline" href="#td-approved-submissions">Open approved submission</a>}
            {!released && !source && route && <a className="mt-1 block font-semibold underline" href={`#td-route-${key}`}>Edit route facts</a>}
          </td><td className="p-2">Check for a child<Link className="mt-1 block underline" href="/admin/adle-canonical-intake-readiness">Open child readiness</Link></td></tr>;
      })}
    </tbody></table></div>
    {skillKeys.length === 0 && <p className="text-sm">No reviewed word–skill relationship is recorded. Select a micro skill below to inspect its requirements.</p>}
    <p className="text-xs">Skills appear here from selections, effective reviewed associations, or reviewed route members. Descriptive morpheme notes do not create skill approvals.</p>
  </section>;
}

export type { Member as ReadinessMember, RouteSource as ReadinessRouteSource };
