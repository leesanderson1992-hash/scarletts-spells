"use client";

import { useState } from "react";
import type { WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { WORD_METADATA_FIELDS } from "@/lib/teaching-dictionary-manager/contracts";
import { saveTeachingDictionaryDraft, saveTeachingDictionarySkillApprovals } from "./actions";

type Skill = { micro_skill_key: string; display_name: string; skill_family_key: string; skill_cluster_key: string };
type Group = { key: string; label: string; parent?: string };
type Route = { routeId: string; routeVersion: string; supportedMicroSkillKeys: readonly string[] };

const fieldClass = "min-h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";
const labelClass = "grid gap-1 text-sm font-medium";
const buttonClass = "rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

function skillSlots(initial: string[]) {
  return Array.from({ length: Math.max(5, initial.length) }, (_, index) => initial[index] ?? "");
}

export function WordEditor(props: {
  wordId: string | null;
  normalisedWord: string;
  initial: WordDraftPayload;
  sourceReference: string;
  approvalEnabled: boolean;
  skills: Skill[];
  families: Group[];
  clusters: Group[];
  routes: Route[];
}) {
  const [slots, setSlots] = useState(() => skillSlots(props.initial.skillKeys));
  const [routes, setRoutes] = useState(props.initial.routeContents);
  const [routeJson, setRouteJson] = useState<Record<string, string>>(() => Object.fromEntries(
    props.initial.routeContents.map((route) => [route.microSkillKey, JSON.stringify(route.content, null, 2)]),
  ));
  const [routeError, setRouteError] = useState("");
  const [definition, setDefinition] = useState(props.initial.definition);
  const [dictation, setDictation] = useState(props.initial.dictationSentence);
  const chosen = [...new Set(slots.filter(Boolean))];
  const activeRoutes = chosen.flatMap((key) => {
    const route = props.routes.find((candidate) => candidate.supportedMicroSkillKeys.includes(key));
    return route ? [{ key, route }] : [];
  });
  function updateSlot(index: number, key: string) {
    setSlots((previous) => previous.map((value, at) => at === index ? key : value));
  }
  function updateRoute(key: string, patch: Partial<(typeof routes)[number]>) {
    setRoutes((previous) => {
      const route = activeRoutes.find((candidate) => candidate.key === key)?.route;
      if (!route) return previous;
      const existing = previous.find((candidate) => candidate.microSkillKey === key && candidate.routeId === route.routeId);
      const next = { routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: key,
        wordMeaning: "", wordSum: "", content: {}, ...existing, ...patch };
      return [...previous.filter((candidate) => !(candidate.microSkillKey === key && candidate.routeId === route.routeId)), next];
    });
  }
  function updateRouteFact(key: string, field: string, value: string) {
    const current = routes.find((route) => route.microSkillKey === key)?.content ?? {};
    const next = { ...current, [field]: value };
    updateRoute(key, { content: next });
    setRouteJson((previous) => ({ ...previous, [key]: JSON.stringify(next, null, 2) }));
  }
  function routeValue(key: string, field: "wordMeaning" | "wordSum") {
    return routes.find((route) => route.microSkillKey === key)?.[field] ?? "";
  }
  function prepareRoutePayload(form: HTMLFormElement) {
    try {
      const relevant = activeRoutes.map(({ key, route }) => {
        const saved = routes.find((item) => item.microSkillKey === key && item.routeId === route.routeId);
        return { routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: key,
          wordMeaning: saved?.wordMeaning?.trim() || definition.trim(),
          wordSum: saved?.wordSum?.trim() || ((form.elements.namedItem("canonical_word_sum") as HTMLInputElement | null)?.value ?? "").trim(),
          content: JSON.parse(routeJson[key] ?? JSON.stringify(saved?.content ?? {})) as Record<string, unknown> };
      });
      if (relevant.some((route) => !route.content || typeof route.content !== "object" || Array.isArray(route.content))) throw new Error("ROUTE_JSON_INVALID");
      (form.elements.namedItem("route_contents") as HTMLInputElement).value = JSON.stringify(relevant);
      setRouteError("");
      return true;
    } catch { setRouteError("Route content could not be prepared."); return false; }
  }
  return <div className="grid gap-6">
    <section id="td-skills" className="rounded-2xl border border-[var(--border)] bg-white p-5 scroll-mt-6">
      <h2 className="text-xl font-semibold">Micro skills</h2>
      <p className="mt-1 text-sm">Choose a family, cluster and skill. Saving approvals below makes the exact word–skill pair eligible for verified independent-use evidence. It does not activate an ADLE lesson.</p>
      <div className="mt-4 grid gap-3">
        {slots.map((key, index) => {
          const selected = props.skills.find((skill) => skill.micro_skill_key === key);
          const familyKey = selected?.skill_family_key ?? "";
          const clusterKey = selected?.skill_cluster_key ?? "";
          return <div key={index} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 md:grid-cols-3">
            <label className={labelClass}>Family
              <select className={fieldClass} value={familyKey} onChange={(event) => {
                const first = props.skills.find((skill) => skill.skill_family_key === event.target.value);
                updateSlot(index, first?.micro_skill_key ?? "");
              }}><option value="">Choose family</option>{props.families.map((family) => <option key={family.key} value={family.key}>{family.label}</option>)}</select>
            </label>
            <label className={labelClass}>Cluster
              <select className={fieldClass} value={clusterKey} onChange={(event) => {
                const first = props.skills.find((skill) => skill.skill_cluster_key === event.target.value);
                updateSlot(index, first?.micro_skill_key ?? "");
              }}><option value="">Choose cluster</option>{props.clusters.filter((cluster) => cluster.parent === familyKey).map((cluster) => <option key={cluster.key} value={cluster.key}>{cluster.label}</option>)}</select>
            </label>
            <label className={labelClass}>Micro skill
              <select className={fieldClass} value={key} onChange={(event) => updateSlot(index, event.target.value)}>
                <option value="">Choose skill</option>{props.skills.filter((skill) => !clusterKey || skill.skill_cluster_key === clusterKey).map((skill) => <option key={skill.micro_skill_key} value={skill.micro_skill_key}>{skill.display_name}</option>)}
              </select>
            </label>
          </div>;
        })}
      </div>
      <button type="button" className="mt-3 rounded-lg border border-[var(--border)] px-4 py-2 text-sm" onClick={() => setSlots((previous) => [...previous, ""])}>Add another skill</button>
      {props.wordId ? <form id="td-evidence-approval" action={saveTeachingDictionarySkillApprovals} className="mt-5 scroll-mt-6">
        <input type="hidden" name="word_id" value={props.wordId} />
        {chosen.map((key) => <input key={key} type="hidden" name="skill_key" value={key} />)}
        <button className={buttonClass} disabled={!props.approvalEnabled}>Save evidence approvals</button>
        {!props.approvalEnabled && <p className="mt-2 text-sm text-amber-900">Evidence publication controls are disabled in this environment. Draft editing remains available.</p>}
      </form> : <p className="mt-3 text-sm">Publish the new word before approving its skills.</p>}
    </section>

    <form id="td-word-editor" action={saveTeachingDictionaryDraft} className="grid gap-5 rounded-2xl border border-[var(--border)] bg-white p-5 scroll-mt-6"
      onSubmit={(event) => { if (!prepareRoutePayload(event.currentTarget)) event.preventDefault(); }}>
      <input type="hidden" name="word_id" value={props.wordId ?? ""} />
      <input type="hidden" name="route_contents" value="[]" />
      {chosen.map((key) => <input key={key} type="hidden" name="skill_key" value={key} />)}
      <h2 className="text-xl font-semibold">Word and teaching facts</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>Dictionary word<input className={fieldClass} name="normalised_word" defaultValue={props.normalisedWord} readOnly={Boolean(props.wordId)} required /></label>
        <label className={labelClass}>Display word<input className={fieldClass} name="display_word" defaultValue={props.initial.displayWord} required /></label>
        <label id="td-definition" className={`${labelClass} md:col-span-2 scroll-mt-6`}>Shared definition<textarea className={fieldClass} name="definition" value={definition} onChange={(event) => setDefinition(event.target.value)} rows={2} /></label>
        <label id="td-dictation" className={`${labelClass} md:col-span-2 scroll-mt-6`}>Dictation sentence<textarea className={fieldClass} name="dictation_sentence" value={dictation} onChange={(event) => setDictation(event.target.value)} rows={2} /></label>
        <label className={labelClass}>Target word position (zero based)<input className={fieldClass} type="number" min={0} name="dictation_target_token_index" defaultValue={props.initial.dictationTargetTokenIndex} /></label>
        <label className={labelClass}>Source / editorial note<input className={fieldClass} name="source_reference" defaultValue={props.sourceReference} required /></label>
        <label className={labelClass}>Source category<select className={fieldClass} name="source_category" defaultValue={props.initial.provenance.sourceCategory}>
          {["internal_authored", "internal_reviewed_seed", "public_domain", "open_licensed", "licensed_vendor", "reference_only", "ai_assisted_draft"].map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
        </select></label>
        <label className={labelClass}>Confidence<select className={fieldClass} name="confidence" defaultValue={props.initial.provenance.confidence}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className={labelClass}>Source name<input className={fieldClass} name="source_name" defaultValue={props.initial.provenance.sourceName} /></label>
        <label className={labelClass}>Source URL<input className={fieldClass} name="source_url" defaultValue={props.initial.provenance.sourceUrl} /></label>
        <label className={labelClass}>Source licence<input className={fieldClass} name="source_licence" defaultValue={props.initial.provenance.sourceLicence} /></label>
        <label className={labelClass}>Source use note<input className={fieldClass} name="source_use_note" defaultValue={props.initial.provenance.sourceUseNote} /></label>
        <label id="td-age-band" className={`${labelClass} scroll-mt-6`}>Age band<input className={fieldClass} name="age_band" defaultValue={props.initial.ageBand} /></label>
        <label id="td-frequency-band" className={`${labelClass} scroll-mt-6`}>Frequency band<input className={fieldClass} name="frequency_band" defaultValue={props.initial.frequencyBand} /></label>
        <label id="td-complexity-band" className={`${labelClass} scroll-mt-6`}>Complexity band<input className={fieldClass} name="complexity_band" defaultValue={props.initial.complexityBand} /></label>
        <label id="td-has-schwa" className={`${labelClass} scroll-mt-6`}>Has schwa<select className={fieldClass} name="has_schwa" defaultValue={props.initial.metadata.has_schwa == null ? "" : String(props.initial.metadata.has_schwa)}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>
        {WORD_METADATA_FIELDS.map((field) => <label id={`td-${field}`} key={field} className={`${labelClass} scroll-mt-6`}>{field.replaceAll("_", " ")}<input className={fieldClass} name={field} defaultValue={props.initial.metadata[field]} /></label>)}
      </div>
      <section className="grid gap-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-lg font-semibold">Canonical morphology</h3>
        <p className="text-xs">The dictionary word analysis is versioned separately from route teaching content.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelClass}>Raw segmentation<input className={fieldClass} name="raw_morpholex_segmentation" defaultValue={props.initial.canonicalMorphology.rawSegmentation} /></label>
          <label className={labelClass}>Part of speech<input className={fieldClass} name="raw_morpholex_pos" defaultValue={props.initial.canonicalMorphology.rawPartOfSpeech} /></label>
          <label id="td-canonical-word-sum" className={`${labelClass} scroll-mt-6`}>Canonical word sum<input className={fieldClass} name="canonical_word_sum" defaultValue={props.initial.canonicalMorphology.wordSum} /></label>
          <label className={labelClass}>Analysis status<select className={fieldClass} name="analysis_status" defaultValue={props.initial.canonicalMorphology.analysisStatus}>{["in_review", "approved", "not_applicable", "rejected"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
          <label className={labelClass}>Parts (JSON array)<textarea className={`${fieldClass} font-mono`} name="morphology_parts" rows={3} defaultValue={JSON.stringify(props.initial.canonicalMorphology.parts, null, 2)} /></label>
          <label className={labelClass}>Feature keys (JSON array)<textarea className={`${fieldClass} font-mono`} name="feature_keys" rows={3} defaultValue={JSON.stringify(props.initial.canonicalMorphology.featureKeys, null, 2)} /></label>
          <label className={labelClass}>Joins (JSON array)<textarea className={`${fieldClass} font-mono`} name="morphology_joins" rows={3} defaultValue={JSON.stringify(props.initial.canonicalMorphology.joins, null, 2)} /></label>
          <label className={labelClass}>Transformation notes<textarea className={fieldClass} name="transformation_notes" rows={3} defaultValue={props.initial.canonicalMorphology.transformationNotes} /></label>
          <label className={`${labelClass} md:col-span-2`}>Morphology review notes<textarea className={fieldClass} name="morphology_review_notes" rows={2} defaultValue={props.initial.canonicalMorphology.reviewNotes} /></label>
        </div>
      </section>
      <div className="grid gap-4">
        <h3 className="text-lg font-semibold">Route-specific content</h3>
        {activeRoutes.length ? activeRoutes.map(({ key, route }) => {
          const item = routes.find((candidate) => candidate.microSkillKey === key && candidate.routeId === route.routeId);
          return <div id={`td-route-${key}`} key={`${route.routeId}:${key}`} className="grid gap-3 rounded-xl border border-[var(--border)] p-4 scroll-mt-6">
            <p className="font-semibold">{route.routeId} {route.routeVersion} · {key}</p>
            <label className={labelClass}>Teaching meaning override<input className={fieldClass} placeholder={`Shared: ${definition}`} value={routeValue(key, "wordMeaning")} onChange={(event) => updateRoute(key, { wordMeaning: event.target.value })} /></label>
            <label className={labelClass}>Word sum<input className={fieldClass} placeholder={`Canonical: ${props.initial.canonicalMorphology.wordSum}`} value={routeValue(key, "wordSum")} onChange={(event) => updateRoute(key, { wordSum: event.target.value })} /></label>
            {route.routeId === "dynamic_prefix_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              {([ ["baseWord", "Base word"], ["baseMeaning", "Base meaning"], ["prefixVariant", "Prefix form"], ["meaningBinKey", "Meaning group"] ] as const).map(([field, label]) => <label id={`td-route-${key}-${field}`} key={field} className={`${labelClass} scroll-mt-6`}>{label}<input className={fieldClass} value={String(item?.content[field] ?? "")} onChange={(event) => updateRouteFact(key, field, event.target.value)} /></label>)}
              <p className="md:col-span-2 text-xs">The reviewed choice audit and teaching split remain in the JSON below. The route reports them as missing until supplied.</p>
            </div>}
            {route.routeId === "dynamic_affix_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              {([ ["suffixVariant", "Suffix form"], ["semanticBaseText", "Semantic base or root"], ["semanticBaseKind", "Base or root classification"], ["baseMeaning", "Base meaning"], ["meaningBinKey", "Meaning group"] ] as const).map(([field, label]) => <label id={`td-route-${key}-${field}`} key={field} className={`${labelClass} scroll-mt-6`}>{label}<input className={fieldClass} value={String(item?.content[field] ?? "")} onChange={(event) => updateRouteFact(key, field, event.target.value)} /></label>)}
              <p className="md:col-span-2 text-xs">Add reviewed teaching and true-morphology parts, joins, transformations and provenance in the JSON below.</p>
            </div>}
            {route.routeId === "base_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              {([ ["familyKey", "Family key"], ["baseWord", "Base word"], ["baseMeaning", "Base meaning"] ] as const).map(([field, label]) => <label id={`td-route-${key}-${field}`} key={field} className={`${labelClass} scroll-mt-6`}>{label}<input className={fieldClass} value={String(item?.content[field] ?? "")} onChange={(event) => updateRouteFact(key, field, event.target.value)} /></label>)}
            </div>}
            {route.routeId === "compound_word_lab" && <label className={labelClass}>Component-to-whole explanation<input className={fieldClass} value={String(item?.content.componentToWholeRelationship ?? "")} onChange={(event) => updateRouteFact(key, "componentToWholeRelationship", event.target.value)} /></label>}
            <label className={labelClass}>Additional route facts (JSON)<textarea className={`${fieldClass} font-mono`} rows={5} value={routeJson[key] ?? JSON.stringify(item?.content ?? {}, null, 2)} onChange={(event) => {
              setRouteJson((previous) => ({ ...previous, [key]: event.target.value }));
              try { const parsed = JSON.parse(event.target.value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); updateRoute(key, { content: parsed as Record<string, unknown> }); setRouteError(""); }
              catch { setRouteError("Route facts must be a JSON object before saving."); }
            }} /></label>
          </div>;
        }) : <p className="text-sm">Select a specialist micro skill to edit its route content.</p>}
      </div>
      {routeError && <p role="alert" className="text-rose-700">{routeError}</p>}
      <button className={buttonClass} disabled={Boolean(routeError)}>Save reviewed draft</button>
      <p className="text-xs">Saving a draft does not change a live lesson. Publish the draft after reviewing its blockers.</p>
    </form>
  </div>;
}
