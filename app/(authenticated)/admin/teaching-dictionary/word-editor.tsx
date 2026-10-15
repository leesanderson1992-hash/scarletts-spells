"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { normaliseWord, WORD_METADATA_FIELDS } from "@/lib/teaching-dictionary-manager/contracts";
import { routeEditorPayload } from "@/lib/teaching-dictionary-manager/route-editor-payload";
import { saveTeachingDictionaryDraft, saveTeachingDictionarySkillApprovals } from "./actions";
import { ActionSubmitButton } from "./action-submit-button";

type Skill = { micro_skill_key: string; display_name: string; skill_family_key: string; skill_cluster_key: string };
type Group = { key: string; label: string; parent?: string };
type Route = { routeId: string; routeVersion: string; supportedMicroSkillKeys: readonly string[] };
type ProfileOption = { microSkillKey: string; meaningBins: { id: string; label: string }[]; choices: string[] };

const fieldClass = "min-h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";
const labelClass = "grid gap-1 text-sm font-medium";
const buttonClass = "rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
type EditablePart = { id?: string; kind?: string; sourceText?: string; surfaceText?: string; gloss?: string; displayRange?: { start: number; end: number }; [key: string]: unknown };
type EditableJoin = { afterPartId?: string; beforePartId?: string; joinType?: string; [key: string]: unknown };

const FIELD_GUIDANCE: Record<string, { format: string; example: string }> = {
  "Dictionary word": { format: "The standard dictionary spelling, in lower case unless capitals are part of the word.", example: "ability" },
  "Display word": { format: "How the word should appear to the learner.", example: "ability" },
  "Shared definition": { format: "One short, child-friendly meaning that works across lessons.", example: "Being able to do something successfully." },
  "Dictation sentence": { format: "A natural sentence containing the exact dictionary word once.", example: "Mia showed her ability by solving the puzzle." },
  "Target word in sentence": { format: "Choose the numbered token that is the dictionary word.", example: "4. ability" },
  "Source / editorial note": { format: "Say where the fact came from and what was reviewed.", example: "Internally authored and reviewed for UK English." },
  "Source category": { format: "Choose the category that describes the source authority.", example: "internal reviewed seed" },
  "Confidence": { format: "How certain the reviewer is that the facts are suitable for teaching.", example: "High" },
  "Source name": { format: "Name the dictionary, research source or internal review set.", example: "Scarlett's Spells editorial review" },
  "Source URL": { format: "A complete https link when the source is online.", example: "https://example.org/dictionary/ability" },
  "Source licence": { format: "State the licence or permission governing reuse.", example: "Internal authored content" },
  "Source use note": { format: "Record any restriction on how the source may be used.", example: "Approved for child-facing teaching content." },
  "Age band": { format: "Use the learner age range expected to understand this word.", example: "7–9" },
  "Frequency band": { format: "Use a consistent frequency label.", example: "common" },
  "Complexity band": { format: "Use a consistent teaching difficulty label.", example: "developing" },
  "Has schwa": { format: "Choose Yes when an unstressed vowel reduces to a schwa sound.", example: "Yes, for the first sound in ability." },
  syllables: { format: "Enter the number of spoken syllables.", example: "4" },
  "phoneme hint": { format: "Use a short pronunciation cue or IPA transcription.", example: "/əˈbɪləti/" },
  "grapheme notes": { format: "Explain the spelling letters that need attention.", example: "The final y in able changes before -ity." },
  "stress pattern": { format: "Name or number the stressed syllable.", example: "Stress on the second syllable: a-BIL-i-ty." },
  morphemes: { format: "List meaningful parts in reading order.", example: "able + ity" },
  "morphology notes": { format: "Explain the spelling change between the underlying parts and the final word.", example: "able changes to abil- before -ity." },
  "irregularity notes": { format: "Record only spelling or meaning behaviour that the normal rule does not explain.", example: "Leave blank when the regular rule explains the word." },
  "Visible letters": { format: "Enter the letters the learner sees in this part.", example: "abil" },
  "Underlying form": { format: "Enter the base, root or affix before any spelling change.", example: "able" },
  Role: { format: "Choose what this part does in the word.", example: "base" },
  "Meaning of this part": { format: "Give the short meaning contributed by this part.", example: "able to do something" },
  "Join before this part": { format: "Choose whether the printed word uses no space, a space or a hyphen.", example: "No space" },
  "Raw segmentation": { format: "Write the source segmentation in its original notation when available.", example: "abil + ity" },
  "Part of speech": { format: "Use a familiar grammar label.", example: "noun" },
  "Canonical word sum": { format: "Show underlying parts, any spelling change, then the finished word.", example: "able + ity → ability" },
  "Analysis status": { format: "Choose approved only after the word sum and parts have been reviewed.", example: "approved" },
  "Transformation notes": { format: "Describe the spelling operation in plain language.", example: "Drop final e from able before adding -ity." },
  "Lesson true morphology notes": { format: "Explain the reviewed word structure used by this suffix lesson.", example: "In ability, able changes to abil- before -ity." },
  "Morphology review notes": { format: "Record the review decision and any useful explanation.", example: "Reviewed as able + -ity; the base appears as abil-." },
  "Teaching meaning override": { format: "Use only when this lesson needs a narrower meaning than the shared definition.", example: "The state or quality of being able." },
  "Word sum override": { format: "Use only when this lesson must display a different instructional analysis.", example: "able + ity → ability" },
  "Base word": { format: "Enter the independent word left after the prefix is removed.", example: "new" },
  "Base meaning": { format: "Give the meaning of the base or root in this word.", example: "make or become new again" },
  "Prefix form": { format: "Choose the exact prefix visible in the word.", example: "re-" },
  "Suffix form": { format: "Choose the exact suffix used by the word.", example: "-ity" },
  "Meaning group": { format: "Choose the lesson's reviewed meaning category.", example: "STATE OR QUALITY OF BEING" },
  "Semantic base or root": { format: "Enter the base or root that carries the central meaning.", example: "able" },
  "Is it a whole base word or bound root?": { format: "Choose whole base when it can stand alone; otherwise choose bound root.", example: "Whole base word" },
  "Family key": { format: "Use one stable label for every member of the same word family.", example: "able" },
  "Unchanged base word": { format: "Enter the base before the -ing spelling rule is applied.", example: "run" },
  "Reviewed source references, one per line": { format: "Enter one reviewed source name or URL on each line.", example: "Scarlett's Spells editorial review" },
  Family: { format: "Choose the broad curriculum family containing the skill.", example: "Morphology" },
  Cluster: { format: "Choose the smaller topic group inside that family.", example: "Derivational suffixes" },
  "Micro skill": { format: "Choose the exact skill this word can provide evidence for.", example: "Spell words with suffix -ity" },
  "Feature keys (JSON array)": { format: "Advanced use only: enter a valid JSON array of reviewed feature names.", example: '["suffix_change"]' },
  "Morphology source and reviewer note": { format: "Record why the morphology is trusted and who or what reviewed it.", example: "Editorially reviewed against the canonical word sum." },
  "How do the component meanings make the whole word?": { format: "Explain how the component words combine into the compound meaning.", example: "A raincoat is a coat worn to keep rain off." },
  "Why is the consonant doubled?": { format: "Choose the rule that justifies doubling before -ing.", example: "Short consonant–vowel–consonant base" },
  "Additional route facts (JSON)": { format: "Advanced use only: enter one valid JSON object.", example: '{"reviewed":true}' },
};

function FieldTitle({ label, helpKey = label }: { label: string; helpKey?: string }) {
  const guidance = FIELD_GUIDANCE[helpKey] ?? {
    format: "Enter the reviewed teaching fact in plain language.",
    example: "Use the wording or option that should be shown in the lesson.",
  };
  return <span className="flex flex-wrap items-center gap-2">
    <span>{label}</span>
    <details className="group relative inline-block font-normal">
      <summary className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] text-xs font-bold text-[color:var(--scarlett)]" aria-label={`How to fill ${label}`}>i</summary>
      <span className="mt-1 block rounded-lg bg-[var(--paper)] p-2 text-xs font-normal text-[color:var(--ink)]">
        <strong>Format:</strong> {guidance.format}<br /><strong>Example:</strong> {guidance.example}
      </span>
    </details>
  </span>;
}

function PencilIcon() {
  return <span aria-hidden="true">✎</span>;
}

function SharedMorphologySummary(props: {
  parts: EditablePart[];
  wordSum: string;
  custom: boolean;
  onEdit: () => void;
  onUseShared: () => void;
  children?: ReactNode;
}) {
  const split = props.parts.map((part) => String(part.sourceText || part.surfaceText || "")).filter(Boolean).join(" + ");
  return <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold">Shared morphology split</p><p className="text-sm">{split || "Add the shared word parts above"}</p><p className="text-xs text-[color:var(--mid)]">Word sum: {props.wordSum || "Not entered yet"}</p></div>
      <button type="button" className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-sm" onClick={props.onEdit}><PencilIcon /> Customise</button>
    </div>
    {props.custom && <div className="grid gap-3 border-t border-[var(--border)] pt-3">{props.children}<button type="button" className="justify-self-start text-xs font-semibold text-[color:var(--scarlett)]" onClick={props.onUseShared}>Use shared morphology</button></div>}
  </div>;
}

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
      <label className={labelClass}><FieldTitle label="Visible letters" /><input className={fieldClass} value={String(part.surfaceText ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, surfaceText: event.target.value } : item))} /></label>
      <label className={labelClass}><FieldTitle label="Underlying form" /><input className={fieldClass} value={String(part.sourceText ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, sourceText: event.target.value } : item))} /></label>
      <label className={labelClass}><FieldTitle label="Role" /><select className={fieldClass} value={String(part.kind ?? "base")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, kind: event.target.value } : item))}>
        {["prefix", "base", "root", "suffix", "connector"].map((role) => <option key={role} value={role}>{role}</option>)}
      </select></label>
      <button type="button" className="self-end rounded-lg border border-[var(--border)] px-3 py-2 text-sm" aria-label={`Remove part ${index + 1}`} onClick={() => save(parts.filter((_, at) => at !== index))}>Remove</button>
      <label className={`${labelClass} md:col-span-3`}><FieldTitle label="Meaning of this part" /><input className={fieldClass} value={String(part.gloss ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, gloss: event.target.value } : item))} /></label>
      {index > 0 && <label className={labelClass}><FieldTitle label="Join before this part" /><select className={fieldClass} value={String(joins[index - 1]?.joinType ?? "none")} onChange={(event) => save(parts, Array.from({ length: parts.length - 1 }, (_, at) => at === index - 1 ? { ...(joins[at] ?? {}), joinType: event.target.value } : joins[at] ?? {}))}><option value="none">No space</option><option value="space">Space</option><option value="hyphen">Hyphen</option></select></label>}
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
  const [canonicalWordSum, setCanonicalWordSum] = useState(props.initial.canonicalMorphology.wordSum);
  const [canonicalMorphologyEdited, setCanonicalMorphologyEdited] = useState(false);
  const [openOverrides, setOpenOverrides] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const route of props.initial.routeContents) {
      if (route.wordMeaning.trim() && route.wordMeaning.trim() !== props.initial.definition.trim()) open.add(`${route.microSkillKey}:meaning`);
      if (route.wordSum.trim() && route.wordSum.trim() !== props.initial.canonicalMorphology.wordSum.trim()) open.add(`${route.microSkillKey}:wordSum`);
      const routeParts = route.content.teachingSplitParts ?? route.content.morphologyParts;
      if (Array.isArray(routeParts) && JSON.stringify(routeParts) !== JSON.stringify(props.initial.canonicalMorphology.parts)) open.add(`${route.microSkillKey}:morphology`);
    }
    return open;
  });
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
  function removeRouteFacts(key: string, fields: string[]) {
    const current = routes.find((route) => route.microSkillKey === key)?.content ?? {};
    const next = { ...current };
    for (const field of fields) delete next[field];
    updateRoute(key, { content: next });
    setRouteJson((previous) => ({ ...previous, [key]: JSON.stringify(next, null, 2) }));
  }
  function setOverride(key: string, kind: string, enabled: boolean) {
    const token = `${key}:${kind}`;
    setOpenOverrides((previous) => {
      const next = new Set(previous);
      if (enabled) next.add(token); else next.delete(token);
      return next;
    });
  }
  function hasOverride(key: string, kind: string) {
    return openOverrides.has(`${key}:${kind}`);
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
      const relevant = routeEditorPayload(activeRoutes.map(({ key, route }) => ({
        routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: key,
      })), routes, routeJson, definition, canonicalWordSum);
      (form.elements.namedItem("route_contents") as HTMLInputElement).value = JSON.stringify(relevant);
      setRouteError("");
      return true;
    } catch { setRouteError("Route content could not be prepared."); return false; }
  }
  const dictationTokens = dictation.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
  const selectedTargetIndex = targetIndex < dictationTokens.length ? targetIndex : 0;
  return <div className="order-1 grid gap-6">
    <section id="td-skills" className="order-2 rounded-2xl border border-[var(--border)] bg-white p-5 scroll-mt-6">
      <h2 className="text-xl font-semibold">Skill evidence approvals</h2>
      <p className="mt-1 text-sm">Choose a skill, then save its evidence approval separately from lesson content.</p>
      <div className="mt-4 grid gap-3">
        {slots.map((key, index) => {
          const selected = props.skills.find((skill) => skill.micro_skill_key === key);
          const familyKey = selected?.skill_family_key ?? "";
          const clusterKey = selected?.skill_cluster_key ?? "";
          return <div key={index} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 md:grid-cols-3">
            <label className={labelClass}><FieldTitle label="Family" />
              <select className={fieldClass} value={familyKey} onChange={(event) => {
                const first = props.skills.find((skill) => skill.skill_family_key === event.target.value);
                updateSlot(index, first?.micro_skill_key ?? "");
              }}><option value="">Choose family</option>{props.families.map((family) => <option key={family.key} value={family.key}>{family.label}</option>)}</select>
            </label>
            <label className={labelClass}><FieldTitle label="Cluster" />
              <select className={fieldClass} value={clusterKey} onChange={(event) => {
                const first = props.skills.find((skill) => skill.skill_cluster_key === event.target.value);
                updateSlot(index, first?.micro_skill_key ?? "");
              }}><option value="">Choose cluster</option>{props.clusters.filter((cluster) => cluster.parent === familyKey).map((cluster) => <option key={cluster.key} value={cluster.key}>{cluster.label}</option>)}</select>
            </label>
            <label className={labelClass}><FieldTitle label="Micro skill" />
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
        <ActionSubmitButton className={buttonClass} disabled={!props.approvalEnabled} pendingLabel="Saving approvals…">Save evidence approvals</ActionSubmitButton>
        {!props.approvalEnabled && <p className="mt-2 text-sm text-amber-900">Evidence publication controls are disabled in this environment. Draft editing remains available.</p>}
      </form> : <p className="mt-3 text-sm">Publish the new word before approving its skills.</p>}
    </section>

    <form id="td-word-editor" action={saveTeachingDictionaryDraft} className="order-1 grid gap-5 rounded-2xl border border-[var(--border)] bg-white p-5 scroll-mt-6"
      onSubmit={(event) => { if (!prepareRoutePayload(event.currentTarget)) event.preventDefault(); }}>
      <input type="hidden" name="word_id" value={props.wordId ?? ""} />
      <input type="hidden" name="route_contents" value="[]" />
      {chosen.map((key) => <input key={key} type="hidden" name="skill_key" value={key} />)}
      <div><h2 className="text-xl font-semibold">Resolve teaching facts</h2><p className="mt-1 text-sm text-[color:var(--mid)]">Review shared facts once, then complete only the fields required by each assigned lesson.</p></div>
      <details className="rounded-xl border border-[var(--border)] p-4" open={!props.wordId}>
        <summary className="cursor-pointer font-semibold">Shared word facts <span className="font-normal text-[color:var(--mid)]">· definition, dictation and source</span></summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className={labelClass}><FieldTitle label="Dictionary word" /><input className={fieldClass} name="normalised_word" defaultValue={props.normalisedWord} readOnly={Boolean(props.wordId)} required /></label>
        <label className={labelClass}><FieldTitle label="Display word" /><input className={fieldClass} name="display_word" defaultValue={props.initial.displayWord} required /></label>
        <label id="td-definition" className={`${labelClass} md:col-span-2 scroll-mt-6`}><FieldTitle label="Shared definition" /><textarea className={fieldClass} name="definition" value={definition} onChange={(event) => setDefinition(event.target.value)} rows={2} /></label>
        <label id="td-dictation" className={`${labelClass} md:col-span-2 scroll-mt-6`}><FieldTitle label="Dictation sentence" /><textarea className={fieldClass} name="dictation_sentence" value={dictation} onChange={(event) => setDictation(event.target.value)} rows={2} /></label>
        <label className={labelClass}><FieldTitle label="Target word in sentence" /><select className={fieldClass} name="dictation_target_token_index" value={selectedTargetIndex} onChange={(event) => setTargetIndex(Number(event.target.value))}>
          {dictationTokens.map((token, index) => <option key={index} value={index}>{index + 1}. {token}</option>)}
          {dictationTokens.length === 0 && <option value={0}>Write a sentence first</option>}
        </select></label>
        <div className="self-end text-sm"><span className="font-medium">Dictation target: </span>{dictationTokens.length ? dictationTokens.map((token, index) => <span key={index} className={index === selectedTargetIndex ? "rounded bg-amber-100 px-1 font-semibold" : "px-1"}>{token}</span>) : <span className="text-[color:var(--mid)]">Write the sentence to select its word.</span>}
          {dictationTokens.length > 0 && normaliseWord(dictationTokens[selectedTargetIndex] ?? "") !== normaliseWord(props.normalisedWord) && <p className="mt-1 text-xs text-amber-900">Choose the dictionary word as the highlighted target.</p>}
        </div>
        <label id="td-source" className={`${labelClass} scroll-mt-6`}><FieldTitle label="Source / editorial note" /><input className={fieldClass} name="source_reference" defaultValue={props.sourceReference} required /></label>
      </div>
      </details>
      <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-semibold">Source and review details</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={labelClass}><FieldTitle label="Source category" /><select className={fieldClass} name="source_category" defaultValue={props.initial.provenance.sourceCategory}>
          {["internal_authored", "internal_reviewed_seed", "public_domain", "open_licensed", "licensed_vendor", "reference_only", "ai_assisted_draft"].map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
        </select></label>
        <label className={labelClass}><FieldTitle label="Confidence" /><select className={fieldClass} name="confidence" defaultValue={props.initial.provenance.confidence}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className={labelClass}><FieldTitle label="Source name" /><input className={fieldClass} name="source_name" defaultValue={props.initial.provenance.sourceName} /></label>
        <label className={labelClass}><FieldTitle label="Source URL" /><input className={fieldClass} name="source_url" defaultValue={props.initial.provenance.sourceUrl} /></label>
        <label className={labelClass}><FieldTitle label="Source licence" /><input className={fieldClass} name="source_licence" defaultValue={props.initial.provenance.sourceLicence} /></label>
        <label className={labelClass}><FieldTitle label="Source use note" /><input className={fieldClass} name="source_use_note" defaultValue={props.initial.provenance.sourceUseNote} /></label>
        </div>
      </details>
      <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-semibold">Age, frequency and sound facts</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label id="td-age-band" className={`${labelClass} scroll-mt-6`}><FieldTitle label="Age band" /><input className={fieldClass} name="age_band" defaultValue={props.initial.ageBand} /></label>
        <label id="td-frequency-band" className={`${labelClass} scroll-mt-6`}><FieldTitle label="Frequency band" /><input className={fieldClass} name="frequency_band" defaultValue={props.initial.frequencyBand} /></label>
        <label id="td-complexity-band" className={`${labelClass} scroll-mt-6`}><FieldTitle label="Complexity band" /><input className={fieldClass} name="complexity_band" defaultValue={props.initial.complexityBand} /></label>
        <label id="td-has-schwa" className={`${labelClass} scroll-mt-6`}><FieldTitle label="Has schwa" /><select className={fieldClass} name="has_schwa" defaultValue={props.initial.metadata.has_schwa == null ? "" : String(props.initial.metadata.has_schwa)}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>
        {WORD_METADATA_FIELDS.map((field) => { const label = field.replaceAll("_", " "); return <label id={`td-${field}`} key={field} className={`${labelClass} scroll-mt-6`}><FieldTitle label={label} /><input className={fieldClass} name={field} defaultValue={props.initial.metadata[field]} /></label>; })}
        </div>
      </details>
      <section id="td-word-structure" className="grid gap-3 rounded-xl border border-[var(--border)] p-4 scroll-mt-6">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--scarlett)]">Current resolution step</p><h3 className="text-lg font-semibold">Word structure</h3></div><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">Review parts and word sum</span></div>
        <p className="text-xs">Describe the word once. Routes reuse this approved analysis where their question rules allow it.</p>
        <PartSequenceEditor id="td-canonical-parts" label="Word parts and cuts" word={props.initial.displayWord} parts={canonicalParts} joins={canonicalJoins} onChange={(parts, joins) => { setCanonicalParts(parts); setCanonicalJoins(joins); setCanonicalMorphologyEdited(true); }} />
        <input type="hidden" name="morphology_parts" value={JSON.stringify(canonicalMorphologyEdited ? canonicalParts : props.initial.canonicalMorphology.parts)} />
        <input type="hidden" name="morphology_joins" value={JSON.stringify(canonicalMorphologyEdited ? canonicalJoins : props.initial.canonicalMorphology.joins)} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelClass}><FieldTitle label="Raw segmentation" /><input className={fieldClass} name="raw_morpholex_segmentation" defaultValue={props.initial.canonicalMorphology.rawSegmentation} /></label>
          <label className={labelClass}><FieldTitle label="Part of speech" /><input className={fieldClass} name="raw_morpholex_pos" defaultValue={props.initial.canonicalMorphology.rawPartOfSpeech} /></label>
          <label id="td-canonical-word-sum" className={`${labelClass} scroll-mt-6`}><FieldTitle label="Canonical word sum" /><input className={fieldClass} name="canonical_word_sum" value={canonicalWordSum} onChange={(event) => setCanonicalWordSum(event.target.value)} /></label>
          <label className={labelClass}><FieldTitle label="Analysis status" /><select className={fieldClass} name="analysis_status" defaultValue={props.initial.canonicalMorphology.analysisStatus}>{["in_review", "approved", "not_applicable", "rejected"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
          <label className={labelClass}><FieldTitle label="Transformation notes" /><textarea className={fieldClass} name="transformation_notes" rows={3} defaultValue={props.initial.canonicalMorphology.transformationNotes} /></label>
          <label className={`${labelClass} md:col-span-2`}><FieldTitle label="Morphology review notes" /><textarea className={fieldClass} name="morphology_review_notes" rows={2} defaultValue={props.initial.canonicalMorphology.reviewNotes} /></label>
        </div>
        <details className="text-sm"><summary className="cursor-pointer">Advanced source features</summary><label className={labelClass}><FieldTitle label="Feature keys (JSON array)" /><textarea className={`${fieldClass} font-mono`} name="feature_keys" rows={3} defaultValue={JSON.stringify(props.initial.canonicalMorphology.featureKeys, null, 2)} /></label></details>
      </section>
      <div className="grid gap-4">
        <div><h3 className="text-lg font-semibold">Lesson-specific facts</h3><p className="text-xs text-[color:var(--mid)]">Open an assigned skill only when the readiness steps above link to it.</p></div>
        {activeRoutes.length ? activeRoutes.map(({ key, route }) => {
          const item = routes.find((candidate) => candidate.microSkillKey === key && candidate.routeId === route.routeId);
          const profile = props.profileOptions.find((candidate) => candidate.microSkillKey === key);
          const choiceAudit = item?.content.choiceAudit && typeof item.content.choiceAudit === "object"
            ? item.content.choiceAudit as { word?: string; choiceVerdicts?: Record<string, boolean> } : null;
          return <details id={`td-route-${key}`} key={`${route.routeId}:${key}`} className="rounded-xl border border-[var(--border)] p-4 scroll-mt-6" open={activeRoutes.length === 1}>
            <summary className="cursor-pointer font-semibold">{props.skills.find((skill) => skill.micro_skill_key === key)?.display_name ?? key} <span className="text-xs font-normal text-[color:var(--mid)]">· {route.routeId.replaceAll("_", " ")}</span></summary>
            <div className="mt-3 grid gap-3">
            <p className="text-xs">Fill only facts this lesson needs beyond the shared dictionary entry. The checklist above links to missing fields.</p>
            <div className="grid gap-2 rounded-lg bg-[var(--paper)] p-3">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Shared definition</p><p className="text-sm">{routeValue(key, "wordMeaning") || definition || "Not entered yet"}</p></div><button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm" onClick={() => setOverride(key, "meaning", true)} aria-label="Customise the teaching meaning"><PencilIcon /> Edit</button></div>
              {hasOverride(key, "meaning") && <div className="grid gap-2 border-t border-[var(--border)] pt-2"><label className={labelClass}><FieldTitle label="Teaching meaning override" /><input className={fieldClass} placeholder={`Shared: ${definition}`} value={routeValue(key, "wordMeaning")} onChange={(event) => updateRoute(key, { wordMeaning: event.target.value })} /></label><button type="button" className="justify-self-start text-xs font-semibold text-[color:var(--scarlett)]" onClick={() => { updateRoute(key, { wordMeaning: "" }); setOverride(key, "meaning", false); }}>Use shared definition</button></div>}
            </div>
            <div className="grid gap-2 rounded-lg bg-[var(--paper)] p-3">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Shared word sum</p><p className="text-sm">{routeValue(key, "wordSum") || canonicalWordSum || "Not entered yet"}</p></div><button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm" onClick={() => setOverride(key, "wordSum", true)} aria-label="Customise the word sum"><PencilIcon /> Edit</button></div>
              {hasOverride(key, "wordSum") && <div className="grid gap-2 border-t border-[var(--border)] pt-2"><label className={labelClass}><FieldTitle label="Word sum override" /><input className={fieldClass} placeholder={`Shared: ${canonicalWordSum}`} value={routeValue(key, "wordSum")} onChange={(event) => updateRoute(key, { wordSum: event.target.value })} /></label><button type="button" className="justify-self-start text-xs font-semibold text-[color:var(--scarlett)]" onClick={() => { updateRoute(key, { wordSum: "" }); setOverride(key, "wordSum", false); }}>Use shared word sum</button></div>}
            </div>
            {route.routeId === "dynamic_prefix_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              {([ ["baseWord", "Base word"], ["baseMeaning", "Base meaning"] ] as const).map(([field, label]) => <label id={`td-route-${key}-${field}`} key={field} className={`${labelClass} scroll-mt-6`}><FieldTitle label={label} /><input className={fieldClass} value={String(item?.content[field] ?? "")} onChange={(event) => updateRouteFact(key, field, event.target.value)} /></label>)}
              <label id={`td-route-${key}-prefixVariant`} className={labelClass}><FieldTitle label="Prefix form" /><select className={fieldClass} value={String(item?.content.prefixVariant ?? "")} onChange={(event) => updateRouteFact(key, "prefixVariant", event.target.value)}><option value="">Choose prefix</option>{profile?.choices.map((choice) => <option key={choice} value={choice}>{choice}-</option>)}</select></label>
              <label id={`td-route-${key}-meaningBinKey`} className={labelClass}><FieldTitle label="Meaning group" /><select className={fieldClass} value={String(item?.content.meaningBinKey ?? "")} onChange={(event) => updateRouteFact(key, "meaningBinKey", event.target.value)}><option value="">Choose meaning</option>{profile?.meaningBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.label}</option>)}</select></label>
              <div id={`td-route-${key}-teachingSplitParts`} className="md:col-span-2 scroll-mt-6"><SharedMorphologySummary parts={canonicalParts} wordSum={canonicalWordSum} custom={hasOverride(key, "morphology")} onEdit={() => setOverride(key, "morphology", true)} onUseShared={() => { removeRouteFacts(key, ["teachingSplitParts", "teachingSplitJoins"]); setOverride(key, "morphology", false); }}><PartSequenceEditor label="Custom prefix question split" word={props.initial.displayWord} parts={item?.content.teachingSplitParts ?? canonicalParts} joins={item?.content.teachingSplitJoins ?? canonicalJoins} onChange={(parts, joins) => updateRouteParts(key, "teachingSplitParts", "teachingSplitJoins", parts, joins)} /></SharedMorphologySummary></div>
              <fieldset id={`td-route-${key}-choiceAudit`} className="md:col-span-2 rounded-lg border border-[var(--border)] p-3 scroll-mt-6"><legend className="font-semibold">Which prefix choice is correct for this word?</legend><p className="text-xs">Review every choice. The compiler needs exactly the accepted answer for this word.</p><div className="mt-2 flex flex-wrap gap-3">{profile?.choices.map((choice) => <label key={choice} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={choiceAudit?.choiceVerdicts?.[choice] === true} onChange={(event) => updateRouteFact(key, "choiceAudit", { word: props.initial.displayWord, choiceVerdicts: Object.fromEntries((profile?.choices ?? []).map((form) => [form, form === choice ? event.target.checked : choiceAudit?.choiceVerdicts?.[form] === true])) })} />{choice}-</label>)}</div></fieldset>
            </div>}
            {route.routeId === "dynamic_affix_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3 text-sm">
                <strong>Compare the two analyses before review</strong>
                <p>Shared dictionary suggestion: {canonicalParts.map((part) => String(part.sourceText || part.surfaceText || "")).filter(Boolean).join(" + ") || "No shared parts"}</p>
                <p>Lesson true morphology: {asParts(item?.content.trueMorphologyParts).map((part) => String(part.sourceText || part.surfaceText || "")).filter(Boolean).join(" + ") || "No lesson parts"}</p>
                {canonicalParts.length && asParts(item?.content.trueMorphologyParts).length
                  && canonicalParts.map((part) => String(part.sourceText || part.surfaceText || "")).join("|") !== asParts(item?.content.trueMorphologyParts).map((part) => String(part.sourceText || part.surfaceText || "")).join("|")
                  ? <p className="mt-1 font-semibold text-amber-900">These analyses differ. Check the source and choose the lesson parts deliberately before signing off.</p> : null}
                <p className="mt-1 text-xs">Shared and imported facts are suggestions; the lesson analysis is approved only by the sign-off on its saved version.</p>
              </div>
              <label id={`td-route-${key}-suffixVariant`} className={labelClass}><FieldTitle label="Suffix form" /><select className={fieldClass} value={String(item?.content.suffixVariant ?? "")} onChange={(event) => updateRouteFact(key, "suffixVariant", event.target.value)}><option value="">Choose suffix</option>{profile?.choices.map((choice) => <option key={choice} value={choice}>-{choice}</option>)}</select></label>
              <label id={`td-route-${key}-semanticBaseText`} className={labelClass}><FieldTitle label="Semantic base or root" /><input className={fieldClass} value={String(item?.content.semanticBaseText ?? "")} onChange={(event) => updateRouteFact(key, "semanticBaseText", event.target.value)} /></label>
              <label id={`td-route-${key}-semanticBaseKind`} className={labelClass}><FieldTitle label="Is it a whole base word or bound root?" /><select className={fieldClass} value={String(item?.content.semanticBaseKind ?? "")} onChange={(event) => updateRouteFact(key, "semanticBaseKind", event.target.value)}><option value="">Choose</option><option value="base">Whole base word</option><option value="root">Bound root</option></select></label>
              <label id={`td-route-${key}-baseMeaning`} className={labelClass}><FieldTitle label="Base meaning" /><input className={fieldClass} value={String(item?.content.baseMeaning ?? "")} onChange={(event) => updateRouteFact(key, "baseMeaning", event.target.value)} /></label>
              <label id={`td-route-${key}-meaningBinKey`} className={labelClass}><FieldTitle label="Meaning group" /><select className={fieldClass} value={String(item?.content.meaningBinKey ?? "")} onChange={(event) => updateRouteFact(key, "meaningBinKey", event.target.value)}><option value="">Choose meaning</option>{profile?.meaningBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.label}</option>)}</select></label>
              <div id={`td-route-${key}-teachingSplitParts`} className="md:col-span-2 scroll-mt-6"><SharedMorphologySummary parts={canonicalParts} wordSum={canonicalWordSum} custom={hasOverride(key, "morphology")} onEdit={() => setOverride(key, "morphology", true)} onUseShared={() => { removeRouteFacts(key, ["teachingSplitParts", "teachingSplitJoins", "trueMorphologyParts", "trueMorphologyJoins"]); setOverride(key, "morphology", false); }}><PartSequenceEditor label="Custom learner split" word={props.initial.displayWord} parts={item?.content.teachingSplitParts ?? canonicalParts} joins={item?.content.teachingSplitJoins ?? canonicalJoins} onChange={(parts, joins) => updateRouteParts(key, "teachingSplitParts", "teachingSplitJoins", parts, joins)} /><PartSequenceEditor label="Custom reviewed morphology" word={props.initial.displayWord} parts={item?.content.trueMorphologyParts ?? canonicalParts} joins={item?.content.trueMorphologyJoins ?? canonicalJoins} onChange={(parts, joins) => updateRouteParts(key, "trueMorphologyParts", "trueMorphologyJoins", parts, joins)} /></SharedMorphologySummary></div>
              <label id={`td-route-${key}-transformationNotes`} className={`${labelClass} md:col-span-2 scroll-mt-6`}><FieldTitle label="Lesson true morphology notes (optional)" helpKey="Lesson true morphology notes" /><textarea className={fieldClass} rows={3} value={String(item?.content.transformationNotes ?? "")} onChange={(event) => updateRouteFact(key, "transformationNotes", event.target.value)} /></label>
              <fieldset id={`td-route-${key}-trueMorphologyProvenance`} className="grid gap-3 rounded-lg border border-[var(--border)] p-3 md:col-span-2 scroll-mt-6"><legend className="font-semibold">Lesson morphology review</legend>
                <label className={labelClass}><FieldTitle label="Morphology source and reviewer note" /><input className={fieldClass} value={String((item?.content.trueMorphologyProvenance as Record<string, unknown> | undefined)?.reviewNote ?? "")} onChange={(event) => updateRouteFact(key, "trueMorphologyProvenance", { ...((item?.content.trueMorphologyProvenance as Record<string, unknown> | undefined) ?? {}), reviewNote: event.target.value })} /></label>
                <label className={labelClass}><FieldTitle label="Editorial review status" /><select className={fieldClass} value={(item?.content.trueMorphologyProvenance as Record<string, unknown> | undefined)?.status === "draft_requires_editorial_review" ? "draft_requires_editorial_review" : "reviewed"} onChange={(event) => updateRouteFact(key, "trueMorphologyProvenance", { ...((item?.content.trueMorphologyProvenance as Record<string, unknown> | undefined) ?? {}), status: event.target.value })}><option value="draft_requires_editorial_review">Needs editorial review</option><option value="reviewed">Reviewed</option></select></label>
              </fieldset>
            </div>}
            {route.routeId === "base_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              {([ ["familyKey", "Family key"], ["baseWord", "Base word"], ["baseMeaning", "Base meaning"] ] as const).map(([field, label]) => <label id={`td-route-${key}-${field}`} key={field} className={`${labelClass} scroll-mt-6`}><FieldTitle label={label} /><input className={fieldClass} value={String(item?.content[field] ?? "")} onChange={(event) => updateRouteFact(key, field, event.target.value)} /></label>)}
              <div id={`td-route-${key}-morphologyParts`} className="md:col-span-2 scroll-mt-6"><SharedMorphologySummary parts={canonicalParts} wordSum={canonicalWordSum} custom={hasOverride(key, "morphology")} onEdit={() => setOverride(key, "morphology", true)} onUseShared={() => { removeRouteFacts(key, ["morphologyParts"]); setOverride(key, "morphology", false); }}><PartSequenceEditor label="Custom family word parts" word={props.initial.displayWord} parts={item?.content.morphologyParts ?? canonicalParts} joins={[]} onChange={(parts) => updateRouteFact(key, "morphologyParts", parts)} /></SharedMorphologySummary></div>
            </div>}
            {route.routeId === "compound_word_lab" && <div className="grid gap-3">
              <label id={`td-route-${key}-componentToWholeRelationship`} className={`${labelClass} scroll-mt-6`}><FieldTitle label="How do the component meanings make the whole word?" /><textarea className={fieldClass} rows={2} value={String(item?.content.componentToWholeRelationship ?? "")} onChange={(event) => updateRouteFact(key, "componentToWholeRelationship", event.target.value)} /></label>
              <p className="text-xs text-amber-900">Component identities, ordered joins and reviewed structure provenance are governed by the compound structure authority. Open the advanced facts to inspect an existing structure; saving this word does not approve a new compound release.</p>
            </div>}
            {route.routeId === "ing_endings_word_lab" && <div className="grid gap-3 md:grid-cols-2">
              <label id={`td-route-${key}-base`} className={`${labelClass} scroll-mt-6`}><FieldTitle label="Unchanged base word" /><input className={fieldClass} value={String(item?.content.base ?? "")} onChange={(event) => updateRouteFact(key, "base", event.target.value)} /></label>
              {key.endsWith("DOUBLE_FINAL_CONSONANT") && <label id={`td-route-${key}-doublingPattern`} className={`${labelClass} scroll-mt-6`}><FieldTitle label="Why is the consonant doubled?" /><select className={fieldClass} value={String(item?.content.doublingPattern ?? "")} onChange={(event) => updateRouteFact(key, "doublingPattern", event.target.value)}><option value="">Choose the reviewed pattern</option><option value="short_cvc">Short consonant–vowel–consonant base</option><option value="stressed_final_syllable">Stressed final syllable</option></select></label>}
              <label id={`td-route-${key}-sourceRefs`} className={`${labelClass} md:col-span-2 scroll-mt-6`}><FieldTitle label="Reviewed source references, one per line" /><textarea className={fieldClass} rows={2} value={Array.isArray(item?.content.sourceRefs) ? item.content.sourceRefs.join("\n") : ""} onChange={(event) => updateRouteFact(key, "sourceRefs", event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))} /></label>
              <p className="md:col-span-2 text-xs text-amber-900">The existing -ing release still requires its own reviewed word authority and learner group checks.</p>
            </div>}
            {route.routeId === "comparative_superlative_word_lab" && <p className="text-xs text-amber-900">This route is governed by a reviewed three-word adjective family, two transformations and a paired sentence. The word page can retain a draft, but the family release authority must validate the complete group before it is a lesson candidate.</p>}
            <details id={`td-route-${key}-advanced`} className="text-sm scroll-mt-6"><summary className="cursor-pointer">Advanced route data</summary><label className={labelClass}><FieldTitle label="Additional route facts (JSON)" /><textarea className={`${fieldClass} font-mono`} rows={5} value={routeJson[key] ?? JSON.stringify(item?.content ?? {}, null, 2)} onChange={(event) => {
              setRouteJson((previous) => ({ ...previous, [key]: event.target.value }));
              try { const parsed = JSON.parse(event.target.value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); updateRoute(key, { content: parsed as Record<string, unknown> }); setRouteError(""); }
              catch { setRouteError("Route facts must be a JSON object before saving."); }
            }} /></label></details>
            </div>
          </details>;
        }) : <p className="text-sm">Select a specialist micro skill to edit its route content.</p>}
      </div>
      {routeError && <p role="alert" className="text-rose-700">{routeError}</p>}
      <div id="td-publication" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 scroll-mt-6"><p className="max-w-2xl text-xs">Complete reviewed facts publish through the existing checks. Incomplete work stays as a recoverable draft; existing lesson snapshots stay pinned.</p><ActionSubmitButton className={buttonClass} disabled={Boolean(routeError)} pendingLabel="Saving and validating…">Save and validate</ActionSubmitButton></div>
    </form>
  </div>;
}
