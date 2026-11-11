"use client";

import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { FormatHint } from "./format-hint";

const field = "w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm";

export function SenseEditor({ value, onChange, selectedSenseId, onSelectSense }: {
  value: DictionarySenseSet;
  onChange: (next: DictionarySenseSet) => void;
  selectedSenseId?: string;
  onSelectSense?: (senseId: string) => void;
}) {
  const updateSense = (id: string, update: Partial<DictionarySenseSet["senses"][number]>) =>
    onChange({ ...value, senses: value.senses.map(sense => sense.id === id ? { ...sense, ...update } : sense) });
  const updatePronunciation = (id: string, update: Partial<DictionarySenseSet["pronunciations"][number]>) =>
    onChange({ ...value, pronunciations: value.pronunciations.map(pronunciation => pronunciation.id === id ? { ...pronunciation, ...update } : pronunciation) });
  return <section className="mt-5 rounded-lg border border-[var(--border)] p-3" aria-label="Word meanings and pronunciations">
    <h3 className="font-semibold">Meanings and pronunciations <FormatHint label="word meanings" format="Give each distinct meaning its own row. Meanings can share a pronunciation; different pronunciations need separate rows." example="live: performed in real time; live: remain alive" /></h3>
    <p className="mt-1 text-xs text-[color:var(--mid)]">These reviewed facts belong to the word. A lesson will select one meaning.</p>
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
    {value.senses.map((sense, index) => <div key={sense.id} className={`mt-4 grid gap-2 rounded border p-3 sm:grid-cols-3 ${selectedSenseId === sense.id ? "border-[var(--scarlett)]" : "border-[var(--border)]"}`}>
      {onSelectSense && <button type="button" className="text-left text-sm underline sm:col-span-3" aria-pressed={selectedSenseId === sense.id}
        onClick={() => onSelectSense(sense.id)}>{selectedSenseId === sense.id ? "Showing this meaning below" : "Show family and lessons for this meaning"}</button>}
      <label className="text-sm">Meaning {index + 1} <FormatHint label="meaning" format="Write one reviewed meaning for this sense, reusable across lessons." example="Performed in real time." />
        <input className={field} value={sense.definition} onChange={event => updateSense(sense.id, { definition: event.target.value })} /></label>
      <label className="text-sm">Part of speech <FormatHint label="part of speech" format="Choose the grammatical role of this meaning." example="verb" />
        <select className={field} value={sense.partOfSpeech} onChange={event => updateSense(sense.id, { partOfSpeech: event.target.value })}>
          <option value="">Select</option>{["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner", "interjection", "root"].map(option => <option key={option} value={option}>{option}</option>)}
        </select></label>
      <label className="text-sm">Pronunciation <FormatHint label="meaning pronunciation" format="Select the pronunciation used for this meaning. Multiple meanings may select the same one." example="live /laɪv/" />
        <select className={field} value={sense.pronunciationId ?? ""} onChange={event => updateSense(sense.id, { pronunciationId: event.target.value || null })}>
          <option value="">Not applicable</option>{value.pronunciations.map((row, number) => <option key={row.id} value={row.id}>{row.ipa || `Pronunciation ${number + 1}`}</option>)}
        </select></label>
      <label className="text-sm sm:col-span-2">Sentence for this meaning <FormatHint label="meaning sentence" format="Write a complete sentence that makes this meaning clear. Use the spelling exactly once for dictation." example="The band will play live on stage." />
        <input className={field} value={sense.dictationSentence ?? ""} onChange={event => updateSense(sense.id, { dictationSentence: event.target.value })} /></label>
      <label className="text-sm">Target word position <FormatHint label="target word position" format="Count words from zero to identify the dictated word in the sentence." example="The band will play live on stage: 4" />
        <input className={field} type="number" min="0" value={sense.dictationTargetTokenIndex ?? ""} onChange={event => updateSense(sense.id, { dictationTargetTokenIndex: event.target.value ? Number(event.target.value) : undefined })} /></label>
      {value.senses.length > 1 && <button type="button" className="text-left text-sm underline" onClick={() => onChange({ ...value, senses: value.senses.filter(row => row.id !== sense.id) })}>Remove meaning</button>}
    </div>)}
    <button type="button" className="mt-2 text-sm underline" onClick={() => onChange({ ...value, senses: [...value.senses, { id: crypto.randomUUID(), definition: "", partOfSpeech: "", pronunciationId: value.pronunciations[0]?.id ?? null }] })}>Add meaning</button>
  </section>;
}
