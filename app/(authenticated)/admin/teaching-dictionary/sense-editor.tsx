"use client";

import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { targetOccurrences } from "@/lib/teaching-dictionary-manager/authoring";
import { partOfSpeechOptions } from "@/lib/teaching-dictionary-manager/part-of-speech-options";
import { FormatHint } from "./format-hint";
import { DictationListen } from "./dictation-listen";

const field = "w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm";

export function SenseEditor({ value, word, onChange, selectedSenseId, onSelectSense, recordingSources }: {
  value: DictionarySenseSet;
  word: string;
  onChange: (next: DictionarySenseSet) => void;
  selectedSenseId: string;
  onSelectSense: (senseId: string) => void;
  recordingSources: ReadonlyMap<string, string>;
}) {
  const updateSense = (id: string, update: Partial<DictionarySenseSet["senses"][number]>) =>
    onChange({ ...value, senses: value.senses.map(sense => sense.id === id ? { ...sense, ...update } : sense) });
  const updatePronunciation = (id: string, update: Partial<DictionarySenseSet["pronunciations"][number]>) =>
    onChange({ ...value, pronunciations: value.pronunciations.map(pronunciation => pronunciation.id === id ? { ...pronunciation, ...update } : pronunciation) });
  return <section className="space-y-3" aria-label="Selected meaning">
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium">Manage pronunciations</summary>
    {value.pronunciations.map((pronunciation, index) => <div key={pronunciation.id} className="mt-3 grid gap-2 rounded bg-[var(--paper)] p-3 sm:grid-cols-3">
      <label className="text-sm">Pronunciation {index + 1} · IPA <FormatHint label="IPA" format="Enter the reviewed pronunciation in IPA; leave blank only if pronunciation is not applicable to a bound root." example="/laɪv/" />
        <input className={field} value={pronunciation.ipa} onChange={event => updatePronunciation(pronunciation.id, { ipa: event.target.value })} /></label>
      <label className="text-sm">Spoken syllable count <FormatHint label="spoken syllable count" format="Enter the number of syllables heard in this pronunciation. Written syllable divisions are recorded separately." example="2" />
        <input className={field} type="number" min="1" max="20" value={pronunciation.spokenSyllableCount ?? ""} onChange={event => updatePronunciation(pronunciation.id, { spokenSyllableCount: event.target.value ? Number(event.target.value) : null })} /></label>
      <label className="text-sm">Stress pattern <FormatHint label="stress pattern" format="Choose primary, secondary or unstressed for each spoken syllable, separated by hyphens." example="primary-unstressed" />
        <input className={field} value={pronunciation.stressPattern} onChange={event => updatePronunciation(pronunciation.id, { stressPattern: event.target.value })} /></label>
      {value.pronunciations.length > 1 && !value.senses.some(sense => sense.pronunciationId === pronunciation.id) && <button type="button" className="text-left text-sm underline" onClick={() => onChange({ ...value, pronunciations: value.pronunciations.filter(row => row.id !== pronunciation.id) })}>Remove unused pronunciation</button>}
    </div>)}
    <button type="button" className="mt-2 text-sm underline" onClick={() => onChange({ ...value, pronunciations: [...value.pronunciations, { id: crypto.randomUUID(), ipa: "", spokenSyllableCount: null, stressPattern: "" }] })}>Add pronunciation</button>
    </details>
    {value.senses.filter(sense => sense.id === selectedSenseId).map(sense => <div key={sense.id} className="grid gap-3 sm:grid-cols-2">
      <label id="td-definition" className="scroll-mt-6 text-sm sm:col-span-2">Meaning <FormatHint label="meaning" format="Write one reviewed meaning for this sense, reusable across lessons." example="Performed in real time." />
        <input className={field} value={sense.definition} onChange={event => updateSense(sense.id, { definition: event.target.value })} /></label>
      <label id="td-speech" className="scroll-mt-6 text-sm">Part of speech <FormatHint label="part of speech" format="Choose the grammatical role of this meaning." example="verb" />
        <select className={field} value={sense.partOfSpeech} onChange={event => updateSense(sense.id, { partOfSpeech: event.target.value })}>
          <option value="">Select</option>
          {partOfSpeechOptions(sense.partOfSpeech === "root" ? "" : sense.partOfSpeech)
            .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value="root">Bound root</option>
        </select></label>
      <label id="td-phoneme_hint" className="scroll-mt-6 text-sm">Pronunciation <FormatHint label="meaning pronunciation" format="Select the pronunciation used for this meaning. Multiple meanings may select the same one." example="live /laɪv/" />
        <select className={field} value={sense.pronunciationId ?? ""} onChange={event => updateSense(sense.id, { pronunciationId: event.target.value || null })}>
          <option value="">Not applicable</option>{value.pronunciations.map((row, number) => <option key={row.id} value={row.id}>{row.ipa || `Pronunciation ${number + 1}`}</option>)}
        </select><span id="td-syllables" className="text-xs text-[color:var(--mid)]">
          {value.pronunciations.find(row => row.id === sense.pronunciationId)?.spokenSyllableCount ?? "—"} spoken syllables
        </span></label>
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
      {targetOccurrences(sense.dictationSentence ?? "", word).length > 1 &&
        <label className="text-sm">Target occurrence <FormatHint label="target occurrence" format="Choose which occurrence of the word is dictated." example="Select the second occurrence if that is the one learners should spell." />
          <select className={field} value={sense.dictationTargetTokenIndex ?? ""} onChange={event => updateSense(sense.id, {
            dictationTargetTokenIndex: event.target.value === "" ? undefined : Number(event.target.value),
          })}>
            <option value="">Choose target</option>
            {targetOccurrences(sense.dictationSentence ?? "", word).map((target, index) =>
              <option key={target} value={target}>{word} · occurrence {index + 1}</option>)}
          </select>
        </label>}
      </div>
      {value.senses.length > 1 && <button type="button" className="text-left text-sm underline" onClick={() => {
        const senses = value.senses.filter(row => row.id !== sense.id);
        onChange({ ...value, senses });
        if (selectedSenseId === sense.id) onSelectSense?.(senses[0].id);
      }}>Remove meaning</button>}
    </div>)}
  </section>;
}
