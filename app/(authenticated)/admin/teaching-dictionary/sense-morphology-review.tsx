"use client";

import { lexicalFamilyDisplayName } from "@/lib/teaching-dictionary-manager/family-display-name";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generatedWordSum } from "@/lib/teaching-dictionary-manager/authoring";
import { PartSequenceEditor, asParts } from "./part-sequence-editor";
import { RootFamilyReview } from "./root-family-review";
import { FamilyRemoveButton } from "./family-remove-button";
import { TransformationEditor } from "./transformation-editor";
import type { AffixCatalog } from "./affix-picker";
import { createSenseFreeBaseFamily, findReviewedFamilyBase, findSenseFamilies, reviewSenseFamilyMembership, reviewSenseMorphology } from "./sense-morphology-actions";

type Suggestion = { label: string; parts: unknown[]; joins: unknown[]; transformations: unknown[] };
type Analysis = { id: string; sense_id: string; morphology_parts: unknown[];
  morphology_joins: unknown[]; morphology_transformations: unknown[]; word_sum: string };
type Family = { base_part_of_speech?: string; family_key: string; base_lemma: string; base_kind: string; base_meaning: string;
  canonical_base_word_id: string | null; canonical_base_sense_id?: string | null };
type Link = { id: string; sense_id: string; sense_morphology_id: string;
  family_key: string; component_part_id: string; relationship_kind: string; base_meaning?: string };
type Transformation = { type: string; sourcePartId: string; sourceText: string;
  surfaceText: string; explanation: string };
const field = "w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm";

function MeaningAnalysisEditor(props: { wordId: string; displayWord: string;
  senseId: string; senseDefinition: string; canCreateFreeBase: boolean; current: Analysis | null;
  shared: { parts: unknown[]; joins: unknown[]; transformations: unknown[] };
  families: Family[]; links: Link[]; affixCatalog: AffixCatalog; panel: "parts" | "family";
  openNext: () => void; suggestions: Suggestion[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [parts, setParts] = useState<unknown[]>(props.current?.morphology_parts ?? props.shared.parts);
  const [joins, setJoins] = useState<unknown[]>(props.current?.morphology_joins ?? props.shared.joins);
  const [transformations, setTransformations] = useState<Transformation[]>(
    (props.current?.morphology_transformations ?? props.shared.transformations) as Transformation[]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [familyMode, setFamilyMode] = useState<"find" | "create" | null>(null);
  const [baseEntry, setBaseEntry] = useState<Awaited<ReturnType<typeof findReviewedFamilyBase>>>(null);
  const [baseSenseId, setBaseSenseId] = useState("");
  const [basePartId, setBasePartId] = useState("");
  const [familyChoice, setFamilyChoice] = useState("");
  const [familySearch, setFamilySearch] = useState("");
  const [searchedFamilies, setSearchedFamilies] = useState<Family[]>([]);
  const [relationship, setRelationship] = useState("derived");
  const typedParts = asParts(parts);
  const families = new Map([...props.families, ...searchedFamilies].map(family => [family.family_key, family]));
  const matches = [...families.values()].flatMap(family => typedParts.filter(part =>
    part.kind === (family.base_kind === "bound_root" ? "root" : "base")
      && part.id && String(part.sourceText).toLowerCase() === family.base_lemma).map(part => ({ family, part })));
  const chosen = matches.find(row => `${row.family.family_key}:${row.part.id}` === familyChoice);
  const visibleMatches = matches.filter(({ family }) => family === chosen?.family ||
    lexicalFamilyDisplayName(family).toLowerCase().includes(familySearch.trim().toLowerCase()));
  const firstPart = typedParts[0];
  const baseParts = typedParts.filter(part => part.kind === "base" && part.id && part.sourceText);
  const basePart = baseParts.find(part => part.id === basePartId) ?? (baseParts.length === 1 ? baseParts[0] : undefined);
  const baseSense = baseEntry?.senses.find(sense => sense.id === baseSenseId);
  const wholeWordBase = typedParts.length === 1 && firstPart?.kind === "base"
    && firstPart.id && String(firstPart.sourceText).toLowerCase() === props.displayWord.toLowerCase()
    && firstPart.surfaceText === props.displayWord
    && firstPart ? firstPart : null;
  const currentLinks = props.links.filter(link => link.sense_id === props.senseId
    && link.sense_morphology_id === props.current?.id);
  const inheritedMeanings = new Map(currentLinks.filter(link => link.base_meaning)
    .map(link => [link.component_part_id, link.base_meaning!]));
  function refreshFamilyChoices() {
    setError("");
    start(async () => {
      try {
        setSearchedFamilies(await findSenseFamilies(typedParts.filter(part =>
          part.kind === "base" || part.kind === "root").map(part => part.sourceText ?? "")));
      } catch {
        setError("Could not load matching families. Try again.");
      }
    });
  }
  const changed = JSON.stringify(parts) !== JSON.stringify(props.current?.morphology_parts ?? props.shared.parts)
    || JSON.stringify(joins) !== JSON.stringify(props.current?.morphology_joins ?? props.shared.joins)
    || JSON.stringify(transformations) !== JSON.stringify(props.current?.morphology_transformations ?? props.shared.transformations);
  async function approveParts(nextParts: unknown[]) {
    const result = await reviewSenseMorphology({ wordId: props.wordId, senseId: props.senseId,
      action: "approve", parts: nextParts, joins, transformations,
      wordSum: generatedWordSum(nextParts, props.displayWord) });
    if (!result.ok) setError(result.error ?? "Review failed.");
    return result.morphologyId;
  }
  function submitAnalysis() {
    setSaved(false); setError("");
    start(async () => {
      if (!await approveParts(parts)) return;
      router.refresh();
    });
  }
  function submitLink(action: "approve" | "withdraw", link?: Link) {
    const familyKey = action === "approve" ? chosen?.family.family_key : link?.family_key;
    const componentPartId = action === "approve" ? String(chosen?.part.id ?? "") : link?.component_part_id;
    const relationshipKind = action === "approve" ? relationship : link?.relationship_kind;
    if (!familyKey || !componentPartId || !relationshipKind) return;
    setSaved(false); setError("");
    start(async () => {
      const morphologyId = props.current?.id;
      if (!morphologyId) return;
      const result = await reviewSenseFamilyMembership({ wordId: props.wordId,
        senseId: props.senseId, morphologyId,
        familyKey, componentPartId, relationshipKind, action });
      if (!result.ok) {
        setError(result.error ?? "Family review failed.");
        return;
      }
      setFamilyMode(null);
      setSaved(true); router.refresh();
    });
  }
  function loadBase(partId: string) {
    setBasePartId(partId);
    setBaseEntry(null);
    setBaseSenseId("");
    setError("");
    const part = baseParts.find(item => item.id === partId);
    if (!part?.sourceText || part.sourceText.toLocaleLowerCase("en-GB") === props.displayWord.toLocaleLowerCase("en-GB")) return;
    const sourceText = part.sourceText;
    start(async () => {
      try {
        const entry = await findReviewedFamilyBase(sourceText);
        setBaseEntry(entry);
        if (entry?.senses.length === 1) setBaseSenseId(entry.senses[0].id);
      } catch {
        setError("Could not load the base word’s meanings.");
      }
    });
  }
  function createFamily() {
    const component = wholeWordBase ?? basePart;
    if (!component?.id || (!wholeWordBase && (!baseEntry || !baseSense))) return;
    const componentPartId = component.id;
    setSaved(false);
    setError("");
    start(async () => {
      try {
        const result = await createSenseFreeBaseFamily({ wordId: props.wordId, senseId: props.senseId,
          componentPartId, baseWordId: wholeWordBase ? undefined : baseEntry?.id,
          baseSenseId: wholeWordBase ? undefined : baseSense?.id, relationshipKind: relationship,
          approveBaseParts: !wholeWordBase && baseSense?.partsStatus === "missing" });
        if (!result.ok) { setError(result.error ?? "Family creation failed."); return; }
        setFamilyMode(null);
        setSaved(true);
        router.refresh();
      } catch {
        setError("The family could not be saved. Your word parts are safe; try again.");
      }
    });
  }
  const familyButton = "rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold disabled:opacity-50";
  function selectMode(mode: "find" | "create") {
    setFamilyMode(current => current === mode ? null : mode);
    setError("");
    if (mode === "find" && !matches.length) refreshFamilyChoices();
    if (mode === "create" && basePart?.id) loadBase(basePart.id);
  }
  if (props.panel === "parts") return <div className="grid gap-3">
    <div id="td-canonical-word-sum" className="flex flex-wrap justify-between gap-2 rounded-lg bg-[var(--paper)] p-3">
      <strong>{typedParts.length ? generatedWordSum(parts, props.displayWord) : "Word parts needed"}</strong>
      <span className="text-sm">{props.current && !changed ? "✓ Parts approved" : "Parts need approval"}</span>
    </div>
    {!props.current && <div className="flex flex-wrap gap-3">
      <button type="button" className={familyButton} onClick={() => {
        setParts([{ id: "base", kind: props.canCreateFreeBase ? "base" : "root", sourceText: props.displayWord, surfaceText: props.displayWord,
          gloss: props.senseDefinition, displayRange: { start: 0, end: props.displayWord.length } }]);
        setJoins([]);
        setTransformations([]);
      }}>Use {props.displayWord} as the whole {props.canCreateFreeBase ? "base" : "root"}</button>
      {props.suggestions.map((suggestion, index) => <button type="button" className={familyButton} key={index}
        onClick={() => {
          setParts(suggestion.parts);
          setJoins(suggestion.joins);
          setTransformations(suggestion.transformations as Transformation[]);
        }}>{suggestion.label}</button>)}
    </div>}
    <PartSequenceEditor label="Parts for this meaning" word={props.displayWord}
      parts={parts} joins={joins} affixCatalog={props.affixCatalog} inheritedMeanings={inheritedMeanings}
      onChange={(nextParts, nextJoins) => { setParts(nextParts); setJoins(nextJoins); setSaved(false); }} />
    <TransformationEditor parts={parts} value={transformations} onChange={setTransformations} />
    <button type="button" className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      disabled={pending || !typedParts.length || (Boolean(props.current) && !changed)} onClick={submitAnalysis}>
      {pending ? "Saving…" : props.current ? "Approve revised parts for this meaning" : "Approve parts for this meaning"}
    </button>
    {props.current && !changed && <button type="button" className={familyButton} onClick={props.openNext}>Continue to Family</button>}
    {error && <p role="alert" className="text-sm text-rose-900">{error}</p>}
  </div>;

  if (!props.current) return <div className="grid gap-2">
    <p className="text-sm">Approve the Word parts for this meaning before linking a family.</p>
    <a className="w-fit text-sm underline" href="#td-canonical-parts">Go to Word parts</a>
  </div>;

  if (!props.canCreateFreeBase) return <RootFamilyReview wordId={props.wordId} senseId={props.senseId}
    definition={props.senseDefinition} approved={props.families.some(family => family.base_kind === "bound_root"
      && family.canonical_base_word_id === props.wordId && family.canonical_base_sense_id === props.senseId)} />;

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--paper)] p-3">
      <p className="font-semibold">{typedParts.length ? generatedWordSum(parts, props.displayWord) : "Word parts needed"}</p>
      <span className={currentLinks.length ? "text-sm text-emerald-800" : "text-sm text-amber-900"}>
        {currentLinks.length > 1 ? `✓ ${currentLinks.length} families linked` : currentLinks.length ? "✓ Family linked" : "Family needed"}
      </span>
    </div>
    {currentLinks.map(link => <div key={link.id} className="flex flex-wrap items-center gap-2 text-sm">
      <span><strong>{families.has(link.family_key) ? lexicalFamilyDisplayName(families.get(link.family_key)!) : `${typedParts.find(part => part.id === link.component_part_id)?.sourceText ?? "Family"} — ${link.base_meaning ?? ""}`}</strong> · {link.relationship_kind.replaceAll("_", " ")}</span>
      <FamilyRemoveButton wordId={props.wordId} word={props.displayWord} familyKey={link.family_key}
        familyName={families.has(link.family_key) ? lexicalFamilyDisplayName(families.get(link.family_key)!) : link.family_key}
        isBase={families.get(link.family_key)?.canonical_base_word_id === props.wordId} />
    </div>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={familyButton} aria-expanded={familyMode === "find"} disabled={pending}
        onClick={() => selectMode("find")}>{currentLinks.length ? "Find another family" : "Find existing family"}</button>
      {props.canCreateFreeBase && <button type="button" className={familyButton}
        aria-expanded={familyMode === "create"} disabled={pending} onClick={() => selectMode("create")}>Create family</button>}
    </div>
    {familyMode === "create" && <div className="grid gap-2 rounded-lg border border-[var(--border)] p-3">
      {baseParts.length > 1 && <label className="text-sm">Base part
        <select className={field} value={basePartId} onChange={event => loadBase(event.target.value)}>
          <option value="">Choose a base</option>
          {baseParts.map(part => <option key={part.id} value={part.id}>{part.sourceText}</option>)}
        </select>
      </label>}
      {baseEntry && baseEntry.senses.length > 0 && <label className="text-sm">Reviewed meaning of {baseEntry.word}
        <select className={field} value={baseSenseId} onChange={event => setBaseSenseId(event.target.value)}>
          <option value="">Choose a meaning</option>
          {baseEntry.senses.map(sense => <option key={sense.id} value={sense.id}>{sense.partOfSpeech} · {sense.definition}</option>)}
        </select>
      </label>}
      {baseEntry && !baseEntry.senses.length && <p className="text-sm text-amber-900">
        {baseEntry.word} is in the Dictionary but has no approved meaning yet. Open its entry, approve the base meaning,
        then return here and reload reviewed meanings.
      </p>}
      {baseEntry && <Link target="_blank" rel="noopener" href={`/admin/teaching-dictionary/${baseEntry.id}`} className="w-fit text-sm underline">
        Open base entry to add or review a meaning (new tab)
      </Link>}
      {baseEntry && <button type="button" className="w-fit text-sm underline" disabled={pending}
        onClick={() => basePart?.id && loadBase(basePart.id)}>Reload reviewed meanings</button>}
      {baseSense && <label className="text-sm">Relationship
        <select className={field} value={relationship} onChange={event => setRelationship(event.target.value)}>
          {["regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"].map(kind =>
            <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}
        </select>
      </label>}
      {!wholeWordBase && !baseEntry && <p className="text-sm">
        {pending ? "Loading reviewed base meanings…" : basePart
          ? <>Add and approve <Link className="underline" target="_blank" rel="noopener" href="/admin/teaching-dictionary/new">{basePart.sourceText} in the Dictionary</Link>, then reload its reviewed meanings here.
            <button type="button" className="ml-2 underline" onClick={() => basePart.id && loadBase(basePart.id)}>Reload reviewed base</button></>
          : "Choose the base part first. Bound roots use the dedicated root review process."}
      </p>}
      {wholeWordBase && <p className="text-sm">{props.senseDefinition}</p>}
      {baseSense && <p className="text-sm">This word will inherit “{baseSense.definition}” from the family.</p>}
      {baseSense?.partsStatus === "missing" && <p className="text-sm">
        Creating this family will also approve {baseEntry?.word} as one whole base, using the reviewed meaning above.
      </p>}
      {baseSense?.partsStatus === "other" && <p className="text-sm text-amber-900">
        This base has a different approved word-parts analysis. Review its Word parts tab before using it as a whole-base family.
      </p>}
      <button type="button" className={familyButton} disabled={pending || (!wholeWordBase && (!baseSense || baseSense.partsStatus === "other"))}
        onClick={createFamily}>Create and link family</button>
    </div>}
    {familyMode === "find" && <div className="grid gap-2 border-t border-[var(--border)] pt-3">
      {chosen && <p className="text-sm">This word will inherit “{chosen.family.base_meaning}” from the family.</p>}
      {!matches.length && <p className="text-sm">{pending ? "Finding families…" : "No approved family matches these parts. Check the base or root spelling, or create a family."}</p>}
      {matches.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Search matching families
          <input type="search" className={field} value={familySearch} onChange={event => setFamilySearch(event.target.value)} />
        </label>
        <label className="text-sm">Matching family <select className={field} value={familyChoice}
          onChange={event => { setFamilyChoice(event.target.value);
            const match = matches.find(row => `${row.family.family_key}:${row.part.id}` === event.target.value);
            setRelationship(match?.family.canonical_base_word_id === props.wordId ? "free_base" : "derived"); }}>
          <option value="">Choose family and part</option>{visibleMatches.map(row =>
            <option key={`${row.family.family_key}:${row.part.id}`} value={`${row.family.family_key}:${row.part.id}`}>
              {lexicalFamilyDisplayName(row.family)} · {row.part.sourceText}
            </option>)}
        </select></label>
        <label className="text-sm">Relationship <select className={field} value={relationship}
          onChange={event => setRelationship(event.target.value)}>
          {(chosen?.family.canonical_base_word_id === props.wordId ? ["free_base"] :
            ["regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"])
            .map(kind => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}
        </select></label>
        <button type="button" className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending || !chosen} onClick={() => submitLink("approve")}>Confirm and link</button>
      </div>}
    </div>}
    {error && <p role="alert" className="text-sm text-rose-900">{error}</p>}
    {saved && <p role="status" className="text-sm text-emerald-800">Saved. Lesson requirements have been rechecked.</p>}
  </div>;
}

export function SenseMorphologyReview(props: { wordId: string; displayWord: string;
  senses: { id: string; definition: string; partOfSpeech: string }[];
  selectedSenseId: string;
  analyses: Analysis[]; links: Link[]; families: Family[];
  shared: { parts: unknown[]; joins: unknown[]; transformations: unknown[] };
  affixCatalog: AffixCatalog; panel: "parts" | "family"; openNext: () => void; suggestions: Suggestion[] }) {
  const senseId = props.selectedSenseId;
  const sense = props.senses.find(row => row.id === senseId);
  const current = props.analyses.find(row => row.sense_id === senseId) ?? null;
  if (!sense) return null;
  return <section id={props.panel === "parts" ? "td-canonical-parts" : "td-sense-morphology"} className="scroll-mt-6">
    <MeaningAnalysisEditor key={`${senseId}:${current?.id ?? "new"}`} wordId={props.wordId}
      displayWord={props.displayWord} senseId={senseId}
      senseDefinition={sense.definition}
      canCreateFreeBase={sense.partOfSpeech !== "root"}
      current={current} shared={props.shared} families={props.families}
      panel={props.panel} openNext={props.openNext} suggestions={props.suggestions}
      links={props.links} affixCatalog={props.affixCatalog} />
  </section>;
}
