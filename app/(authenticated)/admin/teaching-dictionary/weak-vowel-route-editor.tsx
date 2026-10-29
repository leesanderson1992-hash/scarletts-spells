"use client";

import type { WeakVowelRouteFactsV1 } from "@/lib/teaching-dictionary-manager/weak-vowel-authoring";

type Facts = Partial<WeakVowelRouteFactsV1>;
type Activity = keyof WeakVowelRouteFactsV1["activityEligibility"];
const activities: { key: Activity; label: string }[] = [
  { key: "dinner", label: "Call It to Dinner" },
  { key: "detective", label: "Vowel Detective" },
  { key: "memoryLock", label: "Memory Lock" },
  { key: "dictation", label: "Dictation" },
  { key: "family", label: "Family exploration (optional)" },
];
const field = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]";

export function WeakVowelRouteEditor({ skillKey, word, sentence, facts, dictionaryFingerprint, dictionarySyllables,
  blockers, onChange }: {
  skillKey: string;
  word: string;
  sentence: string;
  facts: Facts | undefined;
  dictionaryFingerprint: string | null;
  dictionarySyllables: string;
  blockers: string[];
  onChange: (facts: Facts) => void;
}) {
  const current = facts ?? {};
  const change = (patch: Partial<WeakVowelRouteFactsV1>) => onChange({ ...current, ...patch });
  const label = (title: string, id: string, value: string, update: (value: string) => void, hint?: string) =>
    <label className="block min-w-0 text-sm" htmlFor={id}>
      <span className="font-medium">{title}</span>
      {hint && <span className="ml-1 text-xs text-[var(--mid)]">{hint}</span>}
      <input id={id} className={`${field} mt-1`} value={value} onChange={event => update(event.target.value)} />
    </label>;
  const id = (name: string) => `td-route-${skillKey}-weak-${name}`;
  const target = current.target;
  const selected = current.selectionTarget;
  const wordRecording = current.wordRecording;
  const sentenceRecording = current.sentenceRecording;
  const integer = (value: string) => value.trim() === "" ? 0 : Number(value);
  const sentenceStart = sentence.toLocaleLowerCase("en-GB").indexOf(word.toLocaleLowerCase("en-GB"));
  const uniqueSentenceTarget = sentenceStart >= 0 && sentence.toLocaleLowerCase("en-GB").lastIndexOf(word.toLocaleLowerCase("en-GB")) === sentenceStart
    && (sentenceStart === 0 || !/[\p{L}\p{N}]/u.test(sentence[sentenceStart - 1]))
    && (sentenceStart + word.length === sentence.length || !/[\p{L}\p{N}]/u.test(sentence[sentenceStart + word.length]))
    ? { start: sentenceStart, end: sentenceStart + word.length } : undefined;
  const updateTarget = (start: number, end: number) => change({ target: {
    text: word.slice(start, end), start, end,
    syllableIndex: target?.syllableIndex ?? 0,
    soundType: target?.soundType ?? "",
  } });
  const updateSelected = (start: number) => change({
    selectionTarget: { text: word.slice(start, start + 1), start, end: start + 1 },
    detectiveVowelIndex: start,
  });
  const setEligibility = (activity: Activity, update: { status?: "ready" | "blocked" | "not_applicable"; reason?: string | null }) =>
    change({ activityEligibility: {
      dinner: current.activityEligibility?.dinner ?? { status: "blocked", reason: "Awaiting review" },
      detective: current.activityEligibility?.detective ?? { status: "blocked", reason: "Awaiting review" },
      memoryLock: current.activityEligibility?.memoryLock ?? { status: "blocked", reason: "Awaiting review" },
      dictation: current.activityEligibility?.dictation ?? { status: "blocked", reason: "Awaiting review" },
      family: current.activityEligibility?.family ?? { status: "not_applicable", reason: null },
      [activity]: { ...current.activityEligibility?.[activity], ...update },
    } });
  return <div className="space-y-5" id={`td-route-${skillKey}-weak`}>
    <div className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm">
      <p className="font-semibold">Shared facts already in the dictionary</p>
      <p>Word: <strong>{word}</strong> · Syllables: {dictionarySyllables || "not recorded"}</p>
      <p className="mt-1 text-xs text-[var(--mid)]">Previously approved pronunciation and sentence facts are filled when they match this word. Review the target letter, spoken cuts and activity decisions for this micro-skill before publication.</p>
    </div>
    {!facts && <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold"
      onClick={() => onChange({ schemaVersion: "weak_vowel_route_facts_v1", sourceFingerprint: dictionaryFingerprint ?? "",
        sentenceTarget: uniqueSentenceTarget,
        wordSense: undefined, activityEligibility: {
          dinner: { status: "blocked", reason: "Awaiting review" }, detective: { status: "blocked", reason: "Awaiting review" },
          memoryLock: { status: "blocked", reason: "Awaiting review" }, dictation: { status: "blocked", reason: "Awaiting review" },
          family: { status: "not_applicable", reason: null },
        }, familyAuthorityId: null })}>
      Start weak-vowel review record
    </button>}
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 font-semibold">Source and pronunciation</legend>
      {label("Source fingerprint", id("sourceFingerprint"), current.sourceFingerprint ?? "", v => change({ sourceFingerprint: v }), "Current shared dictionary fingerprint may be used when opening a new review")}
      {label("Reviewed source link or reference", id("reviewSourceReference"), current.reviewSourceReference ?? "", v => change({ reviewSourceReference: v }))}
      <label className="block text-sm" htmlFor={id("wordSense")}><span className="font-medium">Word sense</span>
        <select id={id("wordSense")} className={`${field} mt-1`} value={current.wordSense === undefined ? "unreviewed" : current.wordSense === null ? "unambiguous" : "specified"}
          onChange={e => change({ wordSense: e.target.value === "unambiguous" ? null : e.target.value === "specified" ? "" : undefined })}>
          <option value="unreviewed">Needs review</option><option value="unambiguous">Unambiguous</option><option value="specified">Specify sense</option>
        </select>
      </label>
      {typeof current.wordSense === "string" && label("Chosen sense", id("senseText"), current.wordSense, v => change({ wordSense: v }))}
      {label("Reviewed pronunciation ID", id("pronunciationId"), current.pronunciationId ?? "", v => change({ pronunciationId: v }))}
      {label("Word audio source (British recording or device voice)", id("wordAudio"), wordRecording?.src ?? "", v => change({ wordRecording: { src: v, sha256: wordRecording?.sha256 ?? "" } }))}
      {label("Word recording SHA-256", id("wordHash"), wordRecording?.sha256 ?? "", v => change({ wordRecording: { src: wordRecording?.src ?? "", sha256: v } }))}
      {wordRecording?.src?.startsWith("/audio/") && <audio className="w-full sm:col-span-2" controls preload="none" src={wordRecording.src} aria-label={`Play reviewed ${word} recording`} />}
    </fieldset>
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 font-semibold">Dinner and Detective targets</legend>
      {label("Spoken syllable count", id("syllableCount"), current.spokenSyllableCount ? String(current.spokenSyllableCount) : "", v => change({ spokenSyllableCount: integer(v) }), "for the chosen recording")}
      {label("Accepted cut positions", id("cuts"), current.acceptedCutSets?.map(set => set.join(",")).join("; ") ?? "", v => change({ acceptedCutSets: v.split(";").map(set => set.trim()).filter(Boolean).map(set => set.split(",").map(n => Number(n.trim()))) }), "zero-based letter gaps; separate alternatives with ;")}
      {label("Full target start", id("targetStart"), target ? String(target.start) : "", v => updateTarget(integer(v), target?.end ?? 0))}
      {label("Full target end (exclusive)", id("targetEnd"), target ? String(target.end) : "", v => updateTarget(target?.start ?? 0, integer(v)))}
      <p className="text-sm">Full reviewed target: <strong>{target?.text || "missing"}</strong></p>
      {label("Target spoken syllable (1-based)", id("targetSyllable"), target?.syllableIndex ? String(target.syllableIndex) : "", v => change({ target: { text: target?.text ?? "", start: target?.start ?? 0, end: target?.end ?? 0, syllableIndex: integer(v), soundType: target?.soundType ?? "" } }))}
      <label className="text-sm" htmlFor={id("soundType")}>Sound heard
        <select id={id("soundType")} className={`${field} mt-1`} value={target?.soundType ?? ""} onChange={e => change({ target: { text: target?.text ?? "", start: target?.start ?? 0, end: target?.end ?? 0, syllableIndex: target?.syllableIndex ?? 0, soundType: e.target.value as "schwa" | "other_unstressed" } })}>
          <option value="">Review sound</option><option value="schwa">Schwa /ə/</option><option value="other_unstressed">Other unstressed vowel</option>
        </select>
      </label>
      <label className="text-sm" htmlFor={id("selectedVowel")}>Vowel letter selected in Dinner and missing in Detective
        <select id={id("selectedVowel")} className={`${field} mt-1`} value={selected?.start ?? ""} onChange={e => updateSelected(Number(e.target.value))}>
          <option value="">Choose reviewed occurrence</option>
          {[...word].map((letter, index) => /^[aeiouy]$/i.test(letter) && <option key={index} value={index}>{letter} · position {index + 1}</option>)}
        </select>
      </label>
    </fieldset>
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 font-semibold">Sentence and optional family</legend>
      <p className="text-sm sm:col-span-2">Dictionary sentence: {sentence || "not recorded"} Confirm the target binding and recording below.</p>
      {label("Sentence audio source (British recording or device voice)", id("sentenceAudio"), sentenceRecording?.src ?? "", v => change({ sentenceRecording: { src: v, sha256: sentenceRecording?.sha256 ?? "" } }))}
      {label("Sentence recording SHA-256", id("sentenceHash"), sentenceRecording?.sha256 ?? "", v => change({ sentenceRecording: { src: sentenceRecording?.src ?? "", sha256: v } }))}
      {sentenceRecording?.src?.startsWith("/audio/") && <audio className="w-full sm:col-span-2" controls preload="none" src={sentenceRecording.src} aria-label="Play reviewed dictation sentence" />}
      {label("Target start in full sentence", id("sentenceStart"), current.sentenceTarget ? String(current.sentenceTarget.start) : "", v => change({ sentenceTarget: { start: integer(v), end: current.sentenceTarget?.end ?? 0 } }))}
      {label("Target end in full sentence (exclusive)", id("sentenceEnd"), current.sentenceTarget ? String(current.sentenceTarget.end) : "", v => change({ sentenceTarget: { start: current.sentenceTarget?.start ?? 0, end: integer(v) } }))}
      <label className="text-sm" htmlFor={id("familyDecision")}>Family exploration
        <select id={id("familyDecision")} className={`${field} mt-1`} value={current.familyDecision ?? ""} onChange={e => change({ familyDecision: e.target.value as "approve" | "skip", familyAuthorityId: e.target.value === "skip" ? null : current.familyAuthorityId ?? null })}>
          <option value="">Review decision</option><option value="approve">Use approved family</option><option value="skip">Skip family exploration</option>
        </select>
      </label>
      {current.familyDecision === "approve" && label("Approved family authority ID", id("familyAuthorityId"), current.familyAuthorityId ?? "", v => change({ familyAuthorityId: v }))}
    </fieldset>
    <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Activity eligibility</legend>
      {activities.map(({ key, label: activity }) => <div id={id(`activity-${key}`)} key={key} className="grid gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_2fr] sm:items-center">
        <span className="text-sm font-medium">{activity}</span>
        <select aria-label={`${activity} eligibility`} className={field} value={current.activityEligibility?.[key]?.status ?? ""}
          onChange={e => setEligibility(key, { status: e.target.value as "ready" | "blocked" | "not_applicable", reason: e.target.value === "ready" ? null : current.activityEligibility?.[key]?.reason ?? "Awaiting review" })}>
          <option value="">Review status</option><option value="ready">Ready</option><option value="blocked">Blocked</option>{key === "family" && <option value="not_applicable">Not applicable</option>}
        </select>
        <input aria-label={`${activity} reason`} placeholder="Reason when blocked" className={field} value={current.activityEligibility?.[key]?.reason ?? ""} onChange={e => setEligibility(key, { reason: e.target.value || null })} />
      </div>)}
    </fieldset>
    <div role="status" className="rounded-lg border border-[var(--border)] p-3 text-sm">
      <p className="font-semibold">{blockers.length ? `${blockers.length} content requirement${blockers.length === 1 ? "" : "s"} outstanding` : "Content fields pass local checks"}</p>
      {blockers.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{blockers.map((blocker, index) => <li key={`${index}-${blocker}`}>{blocker}</li>)}</ul>}
      <p className="mt-2 text-xs text-[var(--mid)]">Save a draft at any time. Complete fields, stage a version, review it, then publish it. Publication and current assignment are both required before future lessons can select the word.</p>
    </div>
  </div>;
}
