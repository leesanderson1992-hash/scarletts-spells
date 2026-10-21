"use client";

import { useState } from "react";

type Facts = Record<string, unknown>;
const record = (value: unknown): Facts => value && typeof value === "object" && !Array.isArray(value) ? value as Facts : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const numberText = (value: unknown) => Number.isInteger(value) ? String(value) : "";
const field = "w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]";

export function WeakVowelFactsEditor(props: {
  value: unknown;
  word: string;
  sentence: string;
  onChange: (value: Facts) => void;
}) {
  const facts = record(props.value);
  const target = record(facts.target);
  const selected = record(facts.selectionTarget);
  const sentenceTarget = record(facts.sentenceTarget);
  const wordRecording = record(facts.wordRecording);
  const sentenceRecording = record(facts.sentenceRecording);
  const eligibility = record(facts.activityEligibility);
  const cuts = Array.isArray(facts.acceptedCutSets) ? facts.acceptedCutSets as unknown[] : [];
  const [cutsText, setCutsText] = useState(() => cuts.map((entry) => Array.isArray(entry) ? entry.join(", ") : "").join("; "));
  const [cutsError, setCutsError] = useState("");
  function patch(update: Facts) {
    props.onChange({ ...facts, schemaVersion: "weak_vowel_route_facts_v1", ...update });
  }
  function nested(key: string, update: Facts) {
    patch({ [key]: { ...record(facts[key]), ...update } });
  }
  function activity(key: string, update: Facts) {
    patch({ activityEligibility: { ...eligibility, [key]: { ...record(eligibility[key]), ...update } } });
  }
  function number(value: string) {
    return value.trim() && /^\d+$/.test(value.trim()) ? Number(value) : null;
  }
  function saveCuts() {
    const variants = cutsText.split(/[;\n]+/).map((entry) => entry.trim()).filter(Boolean);
    if (!variants.length || variants.some((entry) => !/^\d+(?:\s*,\s*\d+)*$/.test(entry))) {
      setCutsError("Enter letter-gap positions, such as 3 or 2, 5; 3, 5.");
      return;
    }
    setCutsError("");
    patch({ acceptedCutSets: variants.map((entry) => entry.split(",").map((part) => Number(part.trim()))) });
  }
  const input = (label: string, value: unknown, onChange: (value: string) => void, help?: string) =>
    <label className="grid gap-1 text-sm"><span className="font-semibold">{label}</span>
      <input className={field} value={string(value)} onChange={(event) => onChange(event.target.value)} />
      {help ? <span className="text-xs text-[color:var(--mid)]">{help}</span> : null}
    </label>;
  const numeric = (label: string, value: unknown, onChange: (value: number | null) => void) =>
    <label className="grid gap-1 text-sm"><span className="font-semibold">{label}</span>
      <input className={field} inputMode="numeric" value={numberText(value)}
        onChange={(event) => onChange(number(event.target.value))} />
    </label>;

  return <fieldset className="grid gap-4 rounded-xl border border-[var(--border)] p-4">
    <legend className="px-2 font-semibold">Weak-vowel lesson content</legend>
    <p className="text-xs text-[color:var(--mid)]">These facts are reviewed for this word and micro-skill. Saving a draft does not approve it or make the word selectable.</p>
    <div className="grid gap-3 md:grid-cols-2">
      {input("Word sense (blank only when unambiguous)", facts.wordSense, (value) => patch({ wordSense: value.trim() ? value : null }))}
      {input("Reviewed source fingerprint", facts.sourceFingerprint, (value) => patch({ sourceFingerprint: value }), "Copy the exact fingerprint from the repair export. Review checks the current dictionary facts; lesson selection checks the current word–skill assignment.")}
      {input("Reviewed pronunciation ID", facts.pronunciationId, (value) => patch({ pronunciationId: value }))}
      {input("British word recording path", wordRecording.src, (value) => nested("wordRecording", { src: value }), "Use a published /audio/ path.")}
      {input("Word recording SHA-256", wordRecording.sha256, (value) => nested("wordRecording", { sha256: value }))}
      {numeric("Spoken syllable count", facts.spokenSyllableCount, (value) => patch({ spokenSyllableCount: value }))}
      {numeric("Target syllable (starts at 1)", target.syllableIndex, (value) => nested("target", { syllableIndex: value }))}
      {input("Full reviewed target letters", target.text, (value) => nested("target", { text: value }), "For final -er, -or or -ar this may be the two-letter ending.")}
      <label className="grid gap-1 text-sm"><span className="font-semibold">Target sound</span><select className={field}
        value={string(target.soundType)} onChange={(event) => nested("target", { soundType: event.target.value })}>
        <option value="">Choose after listening review</option><option value="schwa">Schwa /ə/</option>
        <option value="other_unstressed">Other unstressed vowel</option>
      </select></label>
      {numeric("Full target start (zero-based)", target.start, (value) => nested("target", { start: value }))}
      {numeric("Full target end (exclusive)", target.end, (value) => nested("target", { end: value }))}
      {input("Dinner vowel letter", selected.text, (value) => nested("selectionTarget", { text: value }))}
      {numeric("Dinner vowel position (zero-based)", selected.start, (value) => {
        patch({ selectionTarget: { ...selected, start: value, end: value === null ? null : value + 1 },
          detectiveVowelIndex: value });
      })}
      <label className="grid gap-1 text-sm md:col-span-2"><span className="font-semibold">Accepted Dinner cuts</span>
        <textarea className={field} rows={2} value={cutsText} onChange={(event) => setCutsText(event.target.value)} onBlur={saveCuts}
          placeholder="3; 2, 5" />
        <span className="text-xs text-[color:var(--mid)]">Enter letter-gap indexes for each approved cut pattern; separate alternatives with a semicolon. Morphology cuts need separate review.</span>
        {cutsError ? <span role="alert" className="text-rose-700">{cutsError}</span> : null}
      </label>
      <label className="grid gap-1 text-sm"><span className="font-semibold">Family exploration</span><select className={field}
        value={string(facts.familyDecision)} onChange={(event) => patch({ familyDecision: event.target.value, familyAuthorityId: event.target.value === "skip" ? null : facts.familyAuthorityId ?? null })}>
        <option value="">Choose</option><option value="skip">Skip: no approved useful family</option>
        <option value="approve">Approved family available</option>
      </select></label>
      {facts.familyDecision === "approve" ? input("Governed family authority ID", facts.familyAuthorityId, (value) => patch({ familyAuthorityId: value })) : null}
      {input("British sentence recording path", sentenceRecording.src, (value) => nested("sentenceRecording", { src: value }))}
      {input("Sentence recording SHA-256", sentenceRecording.sha256, (value) => nested("sentenceRecording", { sha256: value }))}
      {numeric("Sentence target start (zero-based)", sentenceTarget.start, (value) => nested("sentenceTarget", { start: value }))}
      {numeric("Sentence target end (exclusive)", sentenceTarget.end, (value) => nested("sentenceTarget", { end: value }))}
      <p className="md:col-span-2 text-xs text-[color:var(--mid)]">Sentence: {props.sentence || "Add a shared dictation sentence above."} · Word: {props.word}</p>
      <div className="md:col-span-2">{input("Review source reference", facts.reviewSourceReference, (value) => patch({ reviewSourceReference: value }))}</div>
      <fieldset className="grid gap-3 rounded-lg border border-[var(--border)] p-3 md:col-span-2">
        <legend className="px-1 font-semibold">Activity eligibility</legend>
        <p className="text-xs text-[color:var(--mid)]">Review each activity separately. Family exploration may be unavailable while missing-vowel practice remains ready.</p>
        {(["dinner", "detective", "memoryLock", "dictation", "family"] as const).map((key) => {
          const state = record(eligibility[key]);
          return <div key={key} className="grid gap-2 md:grid-cols-[9rem_10rem_1fr] md:items-center">
            <strong className="capitalize">{key === "memoryLock" ? "Memory Lock" : key}</strong>
            <select className={field} value={string(state.status)} onChange={(event) => activity(key, { status: event.target.value })}>
              <option value="">Review status</option><option value="ready">Ready</option><option value="blocked">Blocked</option>
              {key === "family" ? <option value="not_applicable">No approved family</option> : null}
            </select>
            <input className={field} aria-label={`${key} eligibility reason`} placeholder="Reason if blocked"
              value={string(state.reason)} onChange={(event) => activity(key, { reason: event.target.value || null })} />
          </div>;
        })}
      </fieldset>
    </div>
  </fieldset>;
}
