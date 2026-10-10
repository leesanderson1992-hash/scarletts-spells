"use client";

import { useEffect, useState } from "react";
import type { WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { normaliseWord, WORD_METADATA_FIELDS } from "@/lib/teaching-dictionary-manager/contracts";
import { saveTeachingDictionaryDraft, saveTeachingDictionarySkillApprovals } from "./actions";

type Skill = { micro_skill_key: string; display_name: string; skill_family_key: string; skill_cluster_key: string };
type Group = { key: string; label: string; parent?: string };
type Route = { routeId: string; routeVersion: string; supportedMicroSkillKeys: readonly string[] };
type ProfileOption = { microSkillKey: string; meaningBins: { id: string; label: string }[]; choices: string[] };

const fieldClass = "min-h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";
const labelClass = "grid gap-1 text-sm font-medium";
const buttonClass = "rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
type EditablePart = { id?: string; kind?: string; sourceText?: string; surfaceText?: string; gloss?: string; displayRange?: { start: number; end: number }; [key: string]: unknown };
type EditableJoin = { afterPartId?: string; beforePartId?: string; joinType?: string; [key: string]: unknown };

function asParts(value: unknown): EditablePart[] {
  return Array.isArray(value) ? value.filter((item): item is EditablePart => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((part) => ({
    ...part,
    surfaceText: String(part.surfaceText ?? part.text ?? ""),
    sourceText: String(part.sourceText ?? part.surfaceText ?? part.text ?? ""),
    kind: ["free_base", "bound_base"].includes(String(part.kind ?? part.role ?? part.type))
      ? "base" : String(part.kind ?? part.role ?? part.type ?? "base"),
    gloss: String(part.gloss ?? part.meaning ?? ""),
  })) : [];
}

function asJoins(value: unknown): EditableJoin[] {
  return Array.isArray(value) ? value.filter((item): item is EditableJoin => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function normaliseParts(parts: EditablePart[]): EditablePart[] {
  let start = 0;
  return parts.map((part, index) => {
    const surfaceText = String(part.surfaceText ?? "");
    const next = { ...part, id: `part_${index + 1}`, text: surfaceText, surfaceText,
      sourceText: String(part.sourceText ?? surfaceText),
      kind: part.kind ?? "base", role: part.kind ?? "base", type: part.kind ?? "base",
      partType: part.kind ?? "base",
      start, end: start + surfaceText.length,
      displayRange: { start, end: start + surfaceText.length } };
    start += surfaceText.length;
    return next;
  });
}

function normaliseJoins(parts: EditablePart[], joins: EditableJoin[]): EditableJoin[] {
  return parts.slice(1).map((part, index) => ({
    ...joins[index], afterPartId: `part_${index + 1}`,
    beforePartId: String(part.id ?? `part_${index + 2}`),
    joinType: joins[index]?.joinType ?? "none",
  }));
}

function PartSequenceEditor(props: {
  id?: string;
  label: string;
  word: string;
  parts: unknown;
  joins: unknown;
  onChange: (parts: EditablePart[], joins: EditableJoin[]) => void;
}) {
  const parts = asParts(props.parts);
  const joins = asJoins(props.joins);
  function save(nextParts: EditablePart[], nextJoins: EditableJoin[] = joins) {
    const normalised = normaliseParts(nextParts);
    props.onChange(normalised, normaliseJoins(normalised, nextJoins));
  }
  return <div id={props.id} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 scroll-mt-6">
    <div><strong className="text-sm">{props.label}</strong><p className="text-xs">Enter the parts the learner should see. Their visible spelling must join to make <strong>{props.word || "the word"}</strong>.</p></div>
    {parts.map((part, index) => <div key={index} className="grid gap-2 rounded-lg bg-[var(--paper)] p-2 md:grid-cols-[1fr_1fr_1fr_auto]">
      <label className={labelClass}>Visible letters<input className={fieldClass} value={String(part.surfaceText ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, surfaceText: event.target.value } : item))} /></label>
      <label className={labelClass}>Underlying form<input className={fieldClass} value={String(part.sourceText ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, sourceText: event.target.value } : item))} /></label>
      <label className={labelClass}>Role<select className={fieldClass} value={String(part.kind ?? "base")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, kind: event.target.value } : item))}>
        {["prefix", "base", "root", "suffix", "connector"].map((role) => <option key={role} value={role}>{role}</option>)}
      </select></label>
      <button type="button" className="self-end rounded-lg border border-[var(--border)] px-3 py-2 text-sm" aria-label={`Remove part ${index + 1}`} onClick={() => save(parts.filter((_, at) => at !== index))}>Remove</button>
      <label className={`${labelClass} md:col-span-3`}>Meaning of this part<input className={fieldClass} value={String(part.gloss ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, gloss: event.target.value } : item))} /></label>
      {index > 0 && <label className={labelClass}>Join before this part<select className={fieldClass} value={String(joins[index - 1]?.joinType ?? "none")} onChange={(event) => save(parts, Array.from({ length: parts.length - 1 }, (_, at) => at === index - 1 ? { ...(joins[at] ?? {}), joinType: event.target.value } : joins[at] ?? {}))}><option value="none">No space</option><option value="space">Space</option><option value="hyphen">Hyphen</option></select></label>}
    </div>)}
    <div className="flex flex-wrap items-center gap-3"><button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" onClick={() => save([...parts, { surfaceText: "", sourceText: "", kind: "base", gloss: "" }])}>Add part</button><span className="text-xs">Preview: {parts.map((part) => String(part.surfaceText ?? "")).join(" | ") || "No parts yet"}</span></div>
  </div>;
}

function skillSlots(initial: string[]) {
  return [...initial, ""];
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
  profileOptions: ProfileOption[];
}) {
  const [slots, setSlots] = useState(() => skillSlots(props.initial.skillKeys));
  const [routes, setRoutes] = useState(props.initial.routeContents);
  const [routeJson, setRouteJson] = useState<Record<string, string>>(() => Object.fromEntries(
    props.initial.routeContents.map((route) => [route.microSkillKey, JSON.stringify(route.content, null, 2)]),
  ));
  const [routeError, setRouteError] = useState("");
  const [definition, setDefinition] = useState(props.initial.definition);
  const [dictation, setDictation] = useState(props.initial.dictationSentence);
  const [targetIndex, setTargetIndex] = useState(props.initial.dictationTargetTokenIndex);
  const [canonicalParts, setCanonicalParts] = useState<EditablePart[]>(() => asParts(props.initial.canonicalMorphology.parts));
  const [canonicalJoins, setCanonicalJoins] = useState<EditableJoin[]>(() => asJoins(props.initial.canonicalMorphology.joins));
  const [canonicalMorphologyEdited, setCanonicalMorphologyEdited] = useState(false);
  useEffect(() => {
    function revealLinkedField() {
      let id = "";
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      let parent = target.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target.scrollIntoView({ block: "center" });
      const field = target.matches("input, select, textarea") ? target : target.querySelector("input, select, textarea");
      if (field instanceof HTMLElement) field.focus({ preventScroll: true });
    }
    revealLinkedField();
    const revealOnClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (link) queueMicrotask(revealLinkedField);
    };
    window.addEventListener("hashchange", revealLinkedField);
    document.addEventListener("click", revealOnClick);
    return () => {
      window.removeEventListener("hashchange", revealLinkedField);
      document.removeEventListener("click", revealOnClick);
    };
  }, []);
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
  function updateRouteFact(key: string, field: string, value: unknown) {
    const current = routes.find((route) => route.microSkillKey === key)?.content ?? {};
    const next = { ...current, [field]: value };
    updateRoute(key, { content: next });
    setRouteJson((previous) => ({ ...previous, [key]: JSON.stringify(next, null, 2) }));
  }
  function routeValue(key: string, field: "wordMeaning" | "wordSum") {
    return routes.find((route) => route.microSkillKey === key)?.[field] ?? "";
  }
  function updateRouteParts(key: string, partsField: string, joinsField: string, parts: EditablePart[], joins: EditableJoin[]) {
    const current = routes.find((route) => route.microSkillKey === key)?.content ?? {};
    const next = { ...current, [partsField]: parts, [joinsField]: joins };
    updateRoute(key, { content: next });
    setRouteJson((previous) => ({ ...previous, [key]: JSON.stringify(next, null, 2) }));
  }
  function prepareRoutePayload(form: HTMLFormElement) {
    try {
      const relevant = activeRoutes.flatMap(({ key, route }) => {
        const saved = routes.find((item) => item.microSkillKey === key && item.routeId === route.routeId);
        const original = props.initial.routeContents.find((item) => item.microSkillKey === key && item.routeId === route.routeId);
        const typedJson = routeJson[key];
        const edited = Boolean(saved) && (!original || JSON.stringify(saved) !== JSON.stringify(original)
          || (typedJson != null && typedJson !== JSON.stringify(original.content, null, 2)));
        if (!edited) return [];
        return [{ routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: key,
          wordMeaning: saved?.wordMeaning?.trim() || definition.trim(),
          wordSum: saved?.wordSum?.trim() || ((form.elements.namedItem("canonical_word_sum") as HTMLInputElement | null)?.value ?? "").trim(),
          content: JSON.parse(typedJson ?? JSON.stringify(saved?.content ?? {})) as Record<string, unknown> }];
      });
      if (relevant.some((route) => !route.content || typeof route.content !== "object" || Array.isArray(route.content))) throw new Error("ROUTE_JSON_INVALID");
      (form.elements.namedItem("route_contents") as HTMLInputElement).value = JSON.stringify(relevant);
      setRouteError("");
      return true;
    } catch { setRouteError("Route content could not be prepared."); return false; }
  }
  const dictationTokens = dictation.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
  const selectedTargetIndex = targetIndex < dictationTokens.length ? targetIndex : 0;
  return <div className="grid gap-6">
    <section id="td-skills" className="rounded-2xl border border-[var(--border)] bg-white p-5 scroll-mt-6">
      <h2 className="text-xl font-semibold">Micro skills</h2>
      <p className="mt-1 text-sm">Choose a skill, then save its evidence approval separately from lesson content.</p>
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
        <label className={labelClass}>Target word in sentence<select className={fieldClass} name="dictation_target_token_index" value={selectedTargetIndex} onChange={(event) => setTargetIndex(Number(event.target.value))}>
          {dictationTokens.map((token, index) => <option key={index} value={index}>{index + 1}. {token}</option>)}
          {dictationTokens.length === 0 && <option value={0}>Write a sentence first</option>}
        </select></label>
        <div className="self-end text-sm"><span className="font-medium">Dictation target: </span>{dictationTokens.length ? dictationTokens.map((token, index) => <span key={index} className={index === selectedTargetIndex ? "rounded bg-amber-100 px-1 font-semibold" : "px-1"}>{token}</span>) : <span className="text-[color:var(--mid)]">Write the sentence to select its word.</span>}
          {dictationTokens.length > 0 && normaliseWord(dictationTokens[selectedTargetIndex] ?? "") !== normaliseWord(props.normalisedWord) && <p className="mt-1 text-xs text-amber-900">Choose the dictionary word as the highlighted target.</p>}
        </div>
        <label id="td-source" className={`${labelClass} scroll-mt-6`}>Source / editorial note<input className={fieldClass} name="source_reference" defaultValue={props.sourceReference} required /></label>
      </div>
      <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-semibold">Source and review details</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={labelClass}>Source category<select className={fieldClass} name="source_category" defaultValue={props.initial.provenance.sourceCategory}>
          {["internal_authored", "internal_reviewed_seed", "public_domain", "open_licensed", "licensed_vendor", "reference_only", "ai_assisted_draft"].map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
        </select></label>
        <label className={labelClass}>Confidence<select className={fieldClass} name="confidence" defaultValue={props.initial.provenance.confidence}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className={labelClass}>Source name<input className={fieldClass} name="source_name" defaultValue={props.initial.provenance.sourceName} /></label>
        <label className={labelClass}>Source URL<input className={fieldClass} name="source_url" defaultValue={props.initial.provenance.sourceUrl} /></label>
        <label className={labelClass}>Source licence<input className={fieldClass} name="source_licence" defaultValue={props.initial.provenance.sourceLicence} /></label>
        <label className={labelClass}>Source use note<input className={fieldClass} name="source_use_note" defaultValue={props.initial.provenance.sourceUseNote} /></label>
        </div>
      </details>
      <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-semibold">Age, frequency and sound facts</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label id="td-age-band" className={`${labelClass} scroll-mt-6`}>Age band<input className={fieldClass} name="age_band" defaultValue={props.initial.ageBand} /></label>
        <label id="td-frequency-band" className={`${labelClass} scroll-mt-6`}>Frequency band<input className={fieldClass} name="frequency_band" defaultValue={props.initial.frequencyBand} /></label>
        <label id="td-complexity-band" className={`${labelClass} scroll-mt-6`}>Complexity band<input className={fieldClass} name="complexity_band" defaultValue={props.initial.complexityBand} /></label>
        <label id="td-has-schwa" className={`${labelClass} scroll-mt-6`}>Has schwa<select className={fieldClass} name="has_schwa" defaultValue={props.initial.metadata.has_schwa == null ? "" : String(props.initial.metadata.has_schwa)}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>
        {WORD_METADATA_FIELDS.map((field) => <label id={`td-${field}`} key={field} className={`${labelClass} scroll-mt-6`}>{field.replaceAll("_", " ")}<input className={fieldClass} name={field} defaultValue={props.initial.metadata[field]} /></label>)}
        </div>
      </details>
      <section className="grid gap-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-lg font-semibold">Canonical morphology</h3>
        <p className="text-xs">Describe the word once. Routes reuse this approved analysis where their question rules allow it.</p>
        <PartSequenceEditor id="td-canonical-parts" label="Word parts and cuts" word={props.initial.displayWord} parts={canonicalParts} joins={canonicalJoins} onChange={(parts, joins) => { setCanonicalParts(parts); setCanonicalJoins(joins); setCanonicalMorphologyEdited(true); }} />
        <input type="hidden" name="morphology_parts" value={JSON.stringify(canonicalMorphologyEdited ? canonicalParts : props.initial.canonicalMorphology.parts)} />
        <input type="hidden" name="morphology_joins" value={JSON.stringify(canonicalMorphologyEdited ? canonicalJoins : props.initial.canonicalMorphology.joins)} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelClass}>Raw segmentation<input className={fieldClass} name="raw_morpholex_segmentation" defaultValue={props.initial.canonicalMorphology.rawSegmentation} /></label>
          <label className={labelClass}>Part of speech<input className={fieldClass} name="raw_morpholex_pos" defaultValue={props.initial.canonicalMorphology.rawPartOfSpeech} /></label>
          <label id="td-canonical-word-sum" className={`${labelClass} scroll-mt-6`}>Canonical word sum<input className={fieldClass} name="canonical_word_sum" defaultValue={props.initial.canonicalMorphology.wordSum} /></label>
          <label className={labelClass}>Analysis status<select className={fieldClass} name="analysis_status" defaultValue={props.initial.canonicalMorphology.analysisStatus}>{["in_review", "approved", "not_applicable", "rejected"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
          <label className={labelClass}>Transformation notes<textarea className={fieldClass} name="transformation_notes" rows={3} defaultValue={props.initial.canonicalMorphology.transformationNotes} /></label>
          <label className={`${labelClass} md:col-span-2`}>Morphology review notes<textarea className={fieldClass} name="morphology_review_notes" rows={2} defaultValue={props.initial.canonicalMorphology.reviewNotes} /></label>
        </div>
        <details className="text-sm"><summary className="cursor-pointer">Advanced source features</summary><label className={labelClass}>Feature keys (JSON array)<textarea className={`${fieldClass} font-mono`} name="feature_keys" rows={3} defaultValue={JSON.stringify(props.initial.canonicalMorphology.featureKeys, null, 2)} /></label></details>
      </section>
      <div className="grid gap-4">
        <h3 className="text-lg font-semibold">Route-specific content</h3>
        {activeRoutes.length ? activeRoutes.map(({ key, route }) => {
          const item = routes.find((candidate) => candidate.microSkillKey === key && candidate.routeId === route.routeId);
          const profile = props.profileOptions.find((candidate) => candidate.microSkillKey === key);
          const choiceAudit = item?.content.choiceAudit && typeof item.content.choiceAudit === "object"
            ? item.content.choiceAudit as { word?: string; choiceVerdicts?: Record<string, boolean> } : null;
          return <details id={`td-route-${key}`} key={`${route.routeId}:${key}`} className="rounded-xl border border-[var(--border)] p-4 scroll-mt-6" open={activeRoutes.length === 1}>
            <summary className="cursor-pointer font-semibold">{props.skills.find((skill) => skill.micro_skill_key === key)?.display_name ?? key} <span className="text-xs font-normal text-[color:var(--mid)]">· {route.routeId.replaceAll("_", " ")}</span></summary>
            <div className="mt-3 grid gap-3">
            <p className="text-xs">Fill only facts this lesson needs beyond the shared dictionary entry. The checklist above links to missing fields.</p>
            <label className={labelClass}>Teaching meaning override<input className={fieldClass} placeholder={`Shared: ${definition}`} value={routeValue(key, "wordMeaning")} onChange={(event) => updateRoute(key, { wordMeaning: event.target.value })} /></label>
            <label className={labelClass}>Word sum<input className={fieldClass} placeholder={`Canonical: ${props.initial.canonicalMorphology.wordSum}`} value={routeValue(key, "wordSum")} onChange={(event) => updateRoute(key, { wordSum: event.target.value })} /></label>
            {route.routeId === "dynamic_prefix_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              {([ ["baseWord", "Base word"], ["baseMeaning", "Base meaning"] ] as const).map(([field, label]) => <label id={`td-route-${key}-${field}`} key={field} className={`${labelClass} scroll-mt-6`}>{label}<input className={fieldClass} value={String(item?.content[field] ?? "")} onChange={(event) => updateRouteFact(key, field, event.target.value)} /></label>)}
              <label id={`td-route-${key}-prefixVariant`} className={labelClass}>Prefix form<select className={fieldClass} value={String(item?.content.prefixVariant ?? "")} onChange={(event) => updateRouteFact(key, "prefixVariant", event.target.value)}><option value="">Choose prefix</option>{profile?.choices.map((choice) => <option key={choice} value={choice}>{choice}-</option>)}</select></label>
              <label id={`td-route-${key}-meaningBinKey`} className={labelClass}>Meaning group<select className={fieldClass} value={String(item?.content.meaningBinKey ?? "")} onChange={(event) => updateRouteFact(key, "meaningBinKey", event.target.value)}><option value="">Choose meaning</option>{profile?.meaningBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.label}</option>)}</select></label>
              <div className="md:col-span-2"><PartSequenceEditor id={`td-route-${key}-teachingSplitParts`} label="Prefix question: visible parts and cuts" word={props.initial.displayWord} parts={item?.content.teachingSplitParts} joins={item?.content.teachingSplitJoins} onChange={(parts, joins) => updateRouteParts(key, "teachingSplitParts", "teachingSplitJoins", parts, joins)} /></div>
              <fieldset id={`td-route-${key}-choiceAudit`} className="md:col-span-2 rounded-lg border border-[var(--border)] p-3 scroll-mt-6"><legend className="font-semibold">Which prefix choice is correct for this word?</legend><p className="text-xs">Review every choice. The compiler needs exactly the accepted answer for this word.</p><div className="mt-2 flex flex-wrap gap-3">{profile?.choices.map((choice) => <label key={choice} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={choiceAudit?.choiceVerdicts?.[choice] === true} onChange={(event) => updateRouteFact(key, "choiceAudit", { word: props.initial.displayWord, choiceVerdicts: Object.fromEntries((profile?.choices ?? []).map((form) => [form, form === choice ? event.target.checked : choiceAudit?.choiceVerdicts?.[form] === true])) })} />{choice}-</label>)}</div></fieldset>
            </div>}
            {route.routeId === "dynamic_affix_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              <label id={`td-route-${key}-suffixVariant`} className={labelClass}>Suffix form<select className={fieldClass} value={String(item?.content.suffixVariant ?? "")} onChange={(event) => updateRouteFact(key, "suffixVariant", event.target.value)}><option value="">Choose suffix</option>{profile?.choices.map((choice) => <option key={choice} value={choice}>-{choice}</option>)}</select></label>
              <label id={`td-route-${key}-semanticBaseText`} className={labelClass}>Semantic base or root<input className={fieldClass} value={String(item?.content.semanticBaseText ?? "")} onChange={(event) => updateRouteFact(key, "semanticBaseText", event.target.value)} /></label>
              <label id={`td-route-${key}-semanticBaseKind`} className={labelClass}>Is it a whole base word or bound root?<select className={fieldClass} value={String(item?.content.semanticBaseKind ?? "")} onChange={(event) => updateRouteFact(key, "semanticBaseKind", event.target.value)}><option value="">Choose</option><option value="base">Whole base word</option><option value="root">Bound root</option></select></label>
              <label id={`td-route-${key}-baseMeaning`} className={labelClass}>Base meaning<input className={fieldClass} value={String(item?.content.baseMeaning ?? "")} onChange={(event) => updateRouteFact(key, "baseMeaning", event.target.value)} /></label>
              <label id={`td-route-${key}-meaningBinKey`} className={labelClass}>Meaning group<select className={fieldClass} value={String(item?.content.meaningBinKey ?? "")} onChange={(event) => updateRouteFact(key, "meaningBinKey", event.target.value)}><option value="">Choose meaning</option>{profile?.meaningBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.label}</option>)}</select></label>
              <div className="md:col-span-2"><PartSequenceEditor id={`td-route-${key}-teachingSplitParts`} label="Learner question: visible parts and cuts" word={props.initial.displayWord} parts={item?.content.teachingSplitParts} joins={item?.content.teachingSplitJoins} onChange={(parts, joins) => updateRouteParts(key, "teachingSplitParts", "teachingSplitJoins", parts, joins)} /></div>
              <div className="md:col-span-2"><PartSequenceEditor id={`td-route-${key}-trueMorphologyParts`} label="Reviewed true morphology" word={props.initial.displayWord} parts={item?.content.trueMorphologyParts} joins={item?.content.trueMorphologyJoins} onChange={(parts, joins) => updateRouteParts(key, "trueMorphologyParts", "trueMorphologyJoins", parts, joins)} /></div>
              <label id={`td-route-${key}-trueMorphologyProvenance`} className={`${labelClass} md:col-span-2 scroll-mt-6`}>Morphology source and reviewer note<input className={fieldClass} value={String((item?.content.trueMorphologyProvenance as Record<string, unknown> | undefined)?.reviewNote ?? "")} onChange={(event) => updateRouteFact(key, "trueMorphologyProvenance", { ...((item?.content.trueMorphologyProvenance as Record<string, unknown> | undefined) ?? {}), reviewNote: event.target.value })} /></label>
            </div>}
            {route.routeId === "base_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              {([ ["familyKey", "Family key"], ["baseWord", "Base word"], ["baseMeaning", "Base meaning"] ] as const).map(([field, label]) => <label id={`td-route-${key}-${field}`} key={field} className={`${labelClass} scroll-mt-6`}>{label}<input className={fieldClass} value={String(item?.content[field] ?? "")} onChange={(event) => updateRouteFact(key, field, event.target.value)} /></label>)}
              <div className="md:col-span-2"><PartSequenceEditor id={`td-route-${key}-morphologyParts`} label="Reviewed family word parts" word={props.initial.displayWord} parts={item?.content.morphologyParts} joins={[]} onChange={(parts) => updateRouteFact(key, "morphologyParts", parts)} /></div>
            </div>}
            {route.routeId === "compound_word_lab" && <div className="grid gap-3">
              <label id={`td-route-${key}-componentToWholeRelationship`} className={`${labelClass} scroll-mt-6`}>How do the component meanings make the whole word?<textarea className={fieldClass} rows={2} value={String(item?.content.componentToWholeRelationship ?? "")} onChange={(event) => updateRouteFact(key, "componentToWholeRelationship", event.target.value)} /></label>
              <p className="text-xs text-amber-900">Component identities, ordered joins and reviewed structure provenance are governed by the compound structure authority. Open the advanced facts to inspect an existing structure; saving this word does not approve a new compound release.</p>
            </div>}
            {route.routeId === "ing_endings_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              <label id={`td-route-${key}-base`} className={`${labelClass} scroll-mt-6`}>Unchanged base word<input className={fieldClass} value={String(item?.content.base ?? "")} onChange={(event) => updateRouteFact(key, "base", event.target.value)} /></label>
              {key.endsWith("DOUBLE_FINAL_CONSONANT") && <label id={`td-route-${key}-doublingPattern`} className={`${labelClass} scroll-mt-6`}>Why is the consonant doubled?<select className={fieldClass} value={String(item?.content.doublingPattern ?? "")} onChange={(event) => updateRouteFact(key, "doublingPattern", event.target.value)}><option value="">Choose the reviewed pattern</option><option value="short_cvc">Short consonant–vowel–consonant base</option><option value="stressed_final_syllable">Stressed final syllable</option></select></label>}
              <label id={`td-route-${key}-sourceRefs`} className={`${labelClass} md:col-span-2 scroll-mt-6`}>Reviewed source references, one per line<textarea className={fieldClass} rows={2} value={Array.isArray(item?.content.sourceRefs) ? item.content.sourceRefs.join("\n") : ""} onChange={(event) => updateRouteFact(key, "sourceRefs", event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))} /></label>
              <p className="md:col-span-2 text-xs text-amber-900">The existing -ing release still requires its own reviewed word authority and learner group checks.</p>
            </div>}
            {route.routeId === "comparative_superlative_word_lab" && <p className="text-xs text-amber-900">This route is governed by a reviewed three-word adjective family, two transformations and a paired sentence. The word page can retain a draft, but the family release authority must validate the complete group before it is a lesson candidate.</p>}
            <details id={`td-route-${key}-advanced`} className="text-sm scroll-mt-6"><summary className="cursor-pointer">Advanced route data</summary><label className={labelClass}>Additional route facts (JSON)<textarea className={`${fieldClass} font-mono`} rows={5} value={routeJson[key] ?? JSON.stringify(item?.content ?? {}, null, 2)} onChange={(event) => {
              setRouteJson((previous) => ({ ...previous, [key]: event.target.value }));
              try { const parsed = JSON.parse(event.target.value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); updateRoute(key, { content: parsed as Record<string, unknown> }); setRouteError(""); }
              catch { setRouteError("Route facts must be a JSON object before saving."); }
            }} /></label></details>
            </div>
          </details>;
        }) : <p className="text-sm">Select a specialist micro skill to edit its route content.</p>}
      </div>
      {routeError && <p role="alert" className="text-rose-700">{routeError}</p>}
      <button className={buttonClass} disabled={Boolean(routeError)}>Save and validate</button>
      <p className="text-xs">Complete reviewed facts publish through the existing checks. Incomplete or blocked work stays as a recoverable draft; existing lesson snapshots stay pinned.</p>
    </form>
  </div>;
}
