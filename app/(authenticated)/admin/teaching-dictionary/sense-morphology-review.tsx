"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generatedWordSum } from "@/lib/teaching-dictionary-manager/authoring";
import { PartSequenceEditor, asParts } from "./part-sequence-editor";
import { FormatHint } from "./format-hint";
import { reviewSenseFamilyMembership, reviewSenseMorphology } from "./sense-morphology-actions";

type Analysis = { id: string; sense_id: string; morphology_parts: unknown[];
  morphology_joins: unknown[]; morphology_transformations: unknown[]; word_sum: string };
type Family = { family_key: string; base_lemma: string; base_kind: string; base_meaning: string;
  canonical_base_word_id: string | null };
type Link = { id: string; sense_id: string; sense_morphology_id: string;
  family_key: string; component_part_id: string; relationship_kind: string };
type Transformation = { type: string; sourcePartId: string; sourceText: string;
  surfaceText: string; explanation: string };
const field = "w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm";

function MeaningAnalysisEditor(props: { wordId: string; displayWord: string;
  senseId: string; senseLabel: string; current: Analysis | null;
  shared: { parts: unknown[]; joins: unknown[]; transformations: unknown[] };
  families: Family[]; links: Link[]; affixMeanings: Record<string, string[]> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [parts, setParts] = useState<unknown[]>(props.current?.morphology_parts ?? props.shared.parts);
  const [joins, setJoins] = useState<unknown[]>(props.current?.morphology_joins ?? props.shared.joins);
  const [transformations, setTransformations] = useState<Transformation[]>(
    (props.current?.morphology_transformations ?? props.shared.transformations) as Transformation[]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [familyChoice, setFamilyChoice] = useState("");
  const [relationship, setRelationship] = useState("derived");
  const typedParts = asParts(parts);
  const matches = props.families.flatMap(family => typedParts.filter(part =>
    part.kind === (family.base_kind === "bound_root" ? "root" : "base")
      && String(part.sourceText).toLowerCase() === family.base_lemma
      && part.gloss === family.base_meaning).map(part => ({ family, part })));
  const chosen = matches.find(row => `${row.family.family_key}:${row.part.id}` === familyChoice);
  const currentLinks = props.links.filter(link => link.sense_id === props.senseId
    && link.sense_morphology_id === props.current?.id);
  const changed = JSON.stringify(parts) !== JSON.stringify(props.current?.morphology_parts ?? props.shared.parts)
    || JSON.stringify(joins) !== JSON.stringify(props.current?.morphology_joins ?? props.shared.joins)
    || JSON.stringify(transformations) !== JSON.stringify(props.current?.morphology_transformations ?? props.shared.transformations);
  function submitAnalysis() {
    setSaved(false); setError("");
    start(async () => {
      const result = await reviewSenseMorphology({ wordId: props.wordId, senseId: props.senseId,
        action: "approve", parts, joins, transformations,
        wordSum: generatedWordSum(parts, props.displayWord) });
      if (!result.ok) { setError(result.error ?? "Review failed."); return; }
      setSaved(true); router.refresh();
    });
  }
  function submitLink(action: "approve" | "withdraw", link?: Link) {
    const familyKey = action === "approve" ? chosen?.family.family_key : link?.family_key;
    const componentPartId = action === "approve" ? String(chosen?.part.id ?? "") : link?.component_part_id;
    const relationshipKind = action === "approve" ? relationship : link?.relationship_kind;
    if (!props.current || !familyKey || !componentPartId || !relationshipKind) return;
    setSaved(false); setError("");
    start(async () => {
      const result = await reviewSenseFamilyMembership({ wordId: props.wordId,
        senseId: props.senseId, morphologyId: props.current!.id,
        familyKey, componentPartId, relationshipKind, action });
      if (!result.ok) { setError(result.error ?? "Family review failed."); return; }
      setSaved(true); router.refresh();
    });
  }
  return <div className="mt-3 grid gap-3 rounded-lg border border-[var(--border)] p-3">
    <p className="text-sm"><strong>{props.senseLabel}</strong> · {props.current ? "Approved analysis" : "Needs a meaning-specific analysis"}</p>
    <PartSequenceEditor label="Parts for this meaning" word={props.displayWord}
      parts={parts} joins={joins} affixMeanings={props.affixMeanings}
      onChange={(nextParts, nextJoins) => { setParts(nextParts); setJoins(nextJoins); setSaved(false); }} />
    <div className="grid gap-2">
      <h4 className="font-semibold">Spelling changes <FormatHint label="spelling changes"
        format="Record each change from an underlying part to the letters shown in the word. Leave empty when no spelling changes occur."
        example="make → mak before -ing; drop final e" /></h4>
      {transformations.map((item, index) => <div key={index} className="grid gap-2 rounded bg-[var(--paper)] p-2 sm:grid-cols-2">
        <label className="text-sm">Part <select className={field} value={item.sourcePartId}
          onChange={event => setTransformations(current => current.map((row, at) => at === index
            ? { ...row, sourcePartId: event.target.value } : row))}>
          <option value="">Choose part</option>{typedParts.map(part =>
            <option key={part.id} value={part.id}>{part.sourceText} → {part.surfaceText}</option>)}
        </select></label>
        <label className="text-sm">Change <select className={field} value={item.type}
          onChange={event => setTransformations(current => current.map((row, at) => at === index
            ? { ...row, type: event.target.value } : row))}>
          {(["drop_final_e", "change_final_y_to_i", "remove_letter", "replace_final", "base_spelling_change"])
            .map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
        </select></label>
        {(["sourceText", "surfaceText", "explanation"] as const).map(key => <label key={key} className="text-sm">
          {key === "sourceText" ? "Before" : key === "surfaceText" ? "After" : "Explanation"}
          <input className={field} value={item[key] ?? ""}
            onChange={event => setTransformations(current => current.map((row, at) => at === index
              ? { ...row, [key]: event.target.value } : row))} />
        </label>)}
        <button type="button" className="self-end text-sm underline" onClick={() =>
          setTransformations(current => current.filter((_, at) => at !== index))}>Remove change</button>
      </div>)}
      <button type="button" className="w-fit text-sm underline" onClick={() => setTransformations(current =>
        [...current, { type: "drop_final_e", sourcePartId: "", sourceText: "",
          surfaceText: "", explanation: "" }])}>Add spelling change</button>
    </div>
    <p className="text-sm">Word sum: {generatedWordSum(parts, props.displayWord)}</p>
    <button type="button" className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      disabled={pending || !typedParts.length || (Boolean(props.current) && !changed)} onClick={submitAnalysis}>
      {pending ? "Saving…" : props.current ? "Approve revised parts for this meaning" : "Approve parts for this meaning"}
    </button>
    {props.current && <div className="grid gap-2 border-t pt-3">
      <h4 className="font-semibold">Family for this meaning <FormatHint label="meaning family"
        format="Choose an approved family whose base or root spelling and meaning match a reviewed part above."
        example="live · To be alive or remain alive" /></h4>
      {currentLinks.map(link => <div key={link.id} className="flex flex-wrap items-center gap-2 text-sm">
        <span>{link.family_key} · {link.relationship_kind.replaceAll("_", " ")}</span>
        <button type="button" className="underline disabled:opacity-50" disabled={pending}
          onClick={() => submitLink("withdraw", link)}>Remove link</button>
      </div>)}
      {changed && <p className="text-sm text-amber-900">Approve the revised parts before changing the family link.</p>}
      {!matches.length && <p className="text-sm">No approved family matches these parts and meanings. Review the family or create a free-base family above.</p>}
      {matches.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Matching family <select className={field} value={familyChoice}
          onChange={event => { setFamilyChoice(event.target.value);
            const match = matches.find(row => `${row.family.family_key}:${row.part.id}` === event.target.value);
            setRelationship(match?.family.canonical_base_word_id === props.wordId ? "free_base" : "derived"); }}>
          <option value="">Choose family and part</option>{matches.map(row =>
            <option key={`${row.family.family_key}:${row.part.id}`} value={`${row.family.family_key}:${row.part.id}`}>
              {row.family.base_lemma} · {row.family.base_meaning} · {row.part.id}
            </option>)}
        </select></label>
        <label className="text-sm">Relationship <select className={field} value={relationship}
          onChange={event => setRelationship(event.target.value)}>
          {(chosen?.family.canonical_base_word_id === props.wordId ? ["free_base"] :
            ["regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"])
            .map(kind => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}
        </select></label>
        <button type="button" className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending || changed || !chosen} onClick={() => submitLink("approve")}>Approve family link</button>
      </div>}
    </div>}
    {error && <p role="alert" className="text-sm text-rose-900">{error}</p>}
    {saved && <p role="status" className="text-sm text-emerald-800">Saved. Lesson requirements have been rechecked.</p>}
  </div>;
}

export function SenseMorphologyReview(props: { wordId: string; displayWord: string;
  senses: { id: string; definition: string; partOfSpeech: string }[];
  selectedSenseId: string; onSelectSense: (senseId: string) => void;
  analyses: Analysis[]; links: Link[]; families: Family[];
  shared: { parts: unknown[]; joins: unknown[]; transformations: unknown[] };
  affixMeanings: Record<string, string[]> }) {
  const senseId = props.selectedSenseId;
  const sense = props.senses.find(row => row.id === senseId);
  const current = props.analyses.find(row => row.sense_id === senseId) ?? null;
  if (!sense) return null;
  return <section id="td-sense-morphology" className="mt-4 scroll-mt-6 rounded-lg border border-[var(--border)] p-3">
    <h3 className="font-semibold">Parts and family for each meaning <FormatHint label="meaning-specific word parts"
      format="Approve the word-part analysis for each reviewed meaning that will enter a lesson. A matching family can then be linked to that meaning."
      example="live /lɪv/ and live /laɪv/ can keep separate analyses" /></h3>
    <label className="mt-2 block text-sm">Reviewed meaning <select className={field} value={senseId}
      onChange={event => props.onSelectSense(event.target.value)}>
      {props.senses.map(row => <option key={row.id} value={row.id}>
        {row.definition} · {row.partOfSpeech}</option>)}
    </select></label>
    <MeaningAnalysisEditor key={`${senseId}:${current?.id ?? "new"}`} wordId={props.wordId}
      displayWord={props.displayWord} senseId={senseId}
      senseLabel={`${sense.definition} · ${sense.partOfSpeech}`}
      current={current} shared={props.shared} families={props.families}
      links={props.links} affixMeanings={props.affixMeanings} />
  </section>;
}
