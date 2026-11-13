"use client";

import { useState } from "react";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { sentenceTokens, targetOccurrences } from "@/lib/teaching-dictionary-manager/authoring";
import { partOfSpeechOptions } from "@/lib/teaching-dictionary-manager/part-of-speech-options";
import { FormatHint } from "./format-hint";
import { DictationListen } from "./dictation-listen";

const field = "w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm";

export function SenseEditor({ value, word, onChange, selectedSenseId, onSelectSense, recordingSources, panel }: {
  value: DictionarySenseSet;
  word: string;
  onChange: (next: DictionarySenseSet) => void;
  selectedSenseId: string;
  onSelectSense: (senseId: string) => void;
  recordingSources: ReadonlyMap<string, string>;
  panel: "meaning" | "pronunciation";
}) {
  const updateSense = (id: string, update: Partial<DictionarySenseSet["senses"][number]>) =>
    onChange({ ...value, senses: value.senses.map(sense => sense.id === id ? { ...sense, ...update } : sense) });
  const updatePronunciation = (id: string, update: Partial<DictionarySenseSet["pronunciations"][number]>) =>
    onChange({ ...value, pronunciations: value.pronunciations.map(pronunciation => pronunciation.id === id ? { ...pronunciation, ...update } : pronunciation) });
  const [editingPronunciation, setEditingPronunciation] = useState(false);
  const selected = value.senses.find(sense => sense.id === selectedSenseId);
  const pronunciation = value.pronunciations.find(row => row.id === selected?.pronunciationId);
  const targets = targetOccurrences(selected?.dictationSentence ?? "", word);
  const tokens = sentenceTokens(selected?.dictationSentence ?? "");
  const targetLength = word.trim().split(/\s+/u).length;
  return <section className="space-y-3" aria-label={panel === "meaning" ? "Selected meaning" : "Pronunciation and dictation"}>
    {value.senses.filter(sense => sense.id === selectedSenseId).map(sense => <div key={sense.id} className="grid gap-3 sm:grid-cols-2">
      {panel === "meaning" && <>
      <label id="td-definition" className="scroll-mt-6 text-sm sm:col-span-2">Meaning <FormatHint label="meaning" format="Write one reviewed meaning for this sense, reusable across lessons." example="Performed in real time." />
        <input className={field} value={sense.definition} onChange={event => updateSense(sense.id, { definition: event.target.value })} /></label>
      <label id="td-speech" className="scroll-mt-6 text-sm">Part of speech <FormatHint label="part of speech" format="Choose the grammatical role of this meaning." example="verb" />
        <select className={field} value={sense.partOfSpeech} onChange={event => updateSense(sense.id, { partOfSpeech: event.target.value })}>
          <option value="">Select</option>
          {partOfSpeechOptions(sense.partOfSpeech === "root" ? "" : sense.partOfSpeech)
            .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value="root">Bound root</option>
        </select></label>
      </>}
      {panel === "pronunciation" && <>
      <div id="td-phoneme_hint" className="scroll-mt-6 rounded-lg bg-[var(--paper)] p-3 sm:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span><strong>{pronunciation?.ipa || (sense.partOfSpeech === "root" ? "Not applicable" : "Pronunciation needed")}</strong>
            {pronunciation?.spokenSyllableCount != null && <span id="td-syllables" className="ml-2 text-[color:var(--mid)]">
              {pronunciation.spokenSyllableCount} spoken {pronunciation.spokenSyllableCount === 1 ? "syllable" : "syllables"}
            </span>}</span>
          <button type="button" className="font-semibold underline" aria-expanded={editingPronunciation}
            onClick={() => setEditingPronunciation(open => !open)}>{editingPronunciation ? "Done" : "Edit pronunciation"}</button>
        </div>
        {editingPronunciation && <div className="mt-3">
          {(value.pronunciations.length > 1 || !sense.pronunciationId || sense.partOfSpeech === "root") && <label className="text-sm">Pronunciation for this meaning
            <select className={field} value={sense.pronunciationId ?? ""} onChange={event => updateSense(sense.id, { pronunciationId: event.target.value || null })}>
              <option value="" disabled={sense.partOfSpeech !== "root"}>{sense.partOfSpeech === "root" ? "Not applicable" : "Choose pronunciation"}</option>
              {value.pronunciations.map((row, index) => <option key={row.id} value={row.id}>{row.ipa || `Pronunciation ${index + 1}`}</option>)}
            </select>
          </label>}
    {value.pronunciations.filter(row => row.id === sense.pronunciationId).map((pronunciation) => <div key={pronunciation.id} className="mt-3 grid gap-2 rounded bg-[var(--paper)] p-3 sm:grid-cols-3">
      <label className="text-sm">IPA <FormatHint label="IPA" format="Enter the reviewed pronunciation in IPA; leave blank only if pronunciation is not applicable to a bound root." example="/laɪv/" />
        <input className={field} value={pronunciation.ipa} onChange={event => updatePronunciation(pronunciation.id, { ipa: event.target.value })} /></label>
      <label className="text-sm">Spoken syllable count <FormatHint label="spoken syllable count" format="Enter the number of syllables heard in this pronunciation. Written syllable divisions are recorded separately." example="2" />
        <input className={field} type="number" min="1" max="20" value={pronunciation.spokenSyllableCount ?? ""} onChange={event => updatePronunciation(pronunciation.id, { spokenSyllableCount: event.target.value ? Number(event.target.value) : null })} /></label>
      <label className="text-sm">Stress pattern <FormatHint label="stress pattern" format="Choose primary, secondary or unstressed for each spoken syllable, separated by hyphens." example="primary-unstressed" />
        <input className={field} value={pronunciation.stressPattern} onChange={event => updatePronunciation(pronunciation.id, { stressPattern: event.target.value })} /></label>
    </div>)}
    <button type="button" className="mt-2 text-sm underline" onClick={() => {
      const id = crypto.randomUUID();
      onChange({ pronunciations: [...value.pronunciations, { id, ipa: "", spokenSyllableCount: null, stressPattern: "" }],
        senses: value.senses.map(row => row.id === sense.id ? { ...row, pronunciationId: id } : row) });
    }}>Add pronunciation</button>
    {value.pronunciations.filter(row => !value.senses.some(sense => sense.pronunciationId === row.id)).map(row =>
      <button key={row.id} type="button" className="ml-3 text-sm underline"
        onClick={() => onChange({ ...value, pronunciations: value.pronunciations.filter(item => item.id !== row.id) })}>
        Remove unused {row.ipa || "pronunciation"}
      </button>)}
        </div>}
      </div>
      <div id="td-dictation" className="grid scroll-mt-6 gap-2 border-t border-[var(--border)] pt-3 sm:col-span-2">
      <label className="text-sm">Dictation sentence <FormatHint label="meaning sentence" format="Write a complete sentence that makes this meaning clear. Use the spelling exactly once for dictation." example="The band will play live on stage." />
        <input className={field} value={sense.dictationSentence ?? ""} onChange={event => {
          const sentence = event.target.value;
          const matches = word?.trim() ? targetOccurrences(sentence, word) : [];
          updateSense(sense.id, { dictationSentence: sentence, ...(word ? {
            dictationTargetTokenIndex: matches.length === 1 ? matches[0] : undefined,
          } : {}) });
        }} /></label>
      <DictationListen key={sense.dictationSentence ?? ""} sentence={sense.dictationSentence ?? ""}
        recordingSrc={recordingSources.get(sense.dictationSentence ?? "")} />
      {sense.dictationSentence?.trim() && <div aria-live="polite" className="text-sm">
        {targets.length === 0 && <p className="text-amber-900">Include “{word}” in the sentence.</p>}
        {targets.length === 1 && <p className="text-emerald-800">✓ Target identified · {tokens.slice(targets[0], targets[0] + targetLength).join(" ")}</p>}
        {targets.length > 1 && <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1">Choose which “{word}” the learner should spell</legend>
          {targets.map((target, index) => {
            const phrase = tokens.slice(Math.max(0, target - 2), target + targetLength + 2).join(" ");
            return <button key={target} type="button" aria-pressed={sense.dictationTargetTokenIndex === target}
              className="rounded-lg border border-[var(--border)] px-3 py-2 aria-pressed:border-[var(--scarlett)] aria-pressed:bg-[var(--mist)]"
              onClick={() => updateSense(sense.id, { dictationTargetTokenIndex: target })}>
              {index + 1} · {phrase}
            </button>;
          })}
        </fieldset>}
      </div>}
      </div>
      </>}
      {panel === "meaning" && value.senses.length > 1 && <button type="button" className="text-left text-sm underline" onClick={() => {
        const senses = value.senses.filter(row => row.id !== sense.id);
        onChange({ ...value, senses });
        if (selectedSenseId === sense.id) onSelectSense?.(senses[0].id);
      }}>Remove meaning</button>}
    </div>)}
  </section>;
}
