"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { filterBulkWords, nextBulkReviewDraft, type BulkDraftChoice, type BulkFilters, type BulkWord } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import { removeBulkSkillAssignment, saveBulkSkillApprovals, type BulkApprovalResult } from "./actions";
import type { BulkAssignedPair } from "@/lib/teaching-dictionary-manager/bulk-review";

type Family = { key: string; label: string };
type Skill = { key: string; label: string; familyKey: string; clusterKey: string };
const PAGE_SIZE = 50;
const MAX_SELECTION = 100;
const fieldClass = "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

function SearchableFilter({ label, value, options, allLabel, onChange }: {
  label: string; value: string; options: { value: string; label: string }[];
  allLabel: string; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const search = query.trim().toLocaleLowerCase("en-GB");
  const matchingOptions = options.filter((option) => option.label.toLocaleLowerCase("en-GB").includes(search)
    || option.value.toLocaleLowerCase("en-GB").includes(search));
  const selectedOption = !search && value ? options.find((option) => option.value === value) : undefined;
  const displayedOptions = search ? matchingOptions.slice(0, 100)
    : [{ value: "", label: allLabel }, ...(selectedOption ? [selectedOption] : []),
      ...matchingOptions.filter((option) => option.value !== selectedOption?.value).slice(0, 100)];

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    const option = list?.children.item(activeIndex);
    if (!open || !list || !option) return;
    const listBounds = list.getBoundingClientRect();
    const optionBounds = option.getBoundingClientRect();
    if (optionBounds.top < listBounds.top) list.scrollTop -= listBounds.top - optionBounds.top;
    else if (optionBounds.bottom > listBounds.bottom) list.scrollTop += optionBounds.bottom - listBounds.bottom;
  }, [activeIndex, open]);

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    triggerRef.current?.focus();
  }

  return <div ref={containerRef} className="relative grid min-w-0 gap-1 text-sm font-medium"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span id={`${id}-label`}>{label}</span>
    <button ref={triggerRef} type="button" aria-label={`${label} filter`} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? `${id}-options` : undefined}
      className={`${fieldClass} flex min-w-0 items-center justify-between gap-2 text-left font-normal`}
      onClick={() => { setOpen((previous) => !previous); setQuery(""); setActiveIndex(0); }}>
      <span className="truncate">{options.find((option) => option.value === value)?.label ?? allLabel}</span>
      <span aria-hidden="true" className="shrink-0">⌄</span>
    </button>
    {open && <div className={`absolute top-full z-30 mt-1 w-max min-w-full max-w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-white p-2 shadow-xl ${label === "Phoneme" ? "right-0" : "left-0"}`}>
      <input ref={searchRef} id={`${id}-search`} type="search" role="combobox"
        aria-label={`Search ${label.toLowerCase()} options`} aria-autocomplete="list"
        aria-expanded="true" aria-controls={`${id}-options`}
        aria-activedescendant={displayedOptions.length ? `${id}-option-${activeIndex}` : undefined}
        className={fieldClass} value={query} placeholder={`Search ${label.toLowerCase()}…`}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); if (listRef.current) listRef.current.scrollTop = 0; }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (displayedOptions.length) setActiveIndex((previous) =>
              (previous + (event.key === "ArrowDown" ? 1 : -1) + displayedOptions.length) % displayedOptions.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (displayedOptions[activeIndex]) choose(displayedOptions[activeIndex].value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
          }
        }} />
      <div ref={listRef} id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`} className="mt-2 max-h-56 overflow-y-auto">
        {displayedOptions.map((option, index) => <button key={option.value} id={`${id}-option-${index}`}
          type="button" role="option" aria-selected={option.value === value}
          className={`block w-full rounded-md px-3 py-2 text-left text-sm font-normal hover:bg-[var(--paper)] ${index === activeIndex ? "bg-[var(--paper)]" : ""}`}
          onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option.value)}>{option.label}</button>)}
        {matchingOptions.length > 100 && <p className="px-3 py-2 text-xs text-slate-600">Search to narrow {matchingOptions.length} options.</p>}
        {matchingOptions.length === 0 && <p className="px-3 py-2 text-xs text-slate-600">No matching options.</p>}
      </div>
    </div>}
  </div>;
}

export function BulkAssignWorkspace(props: {
  words: BulkWord[];
  families: Family[];
  skills: Skill[];
  assignedPairs: BulkAssignedPair[];
  excludedPairs: string[];
  approvalEnabled: boolean;
}) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [familyKey, setFamilyKey] = useState("");
  const [draftSkillKey, setDraftSkillKey] = useState("");
  const [chosenSkillKey, setChosenSkillKey] = useState("");
  const [draft, setDraft] = useState<Map<string, BulkDraftChoice>>(() => new Map());
  const [assigned, setAssigned] = useState<Map<string, boolean>>(() => new Map(props.assignedPairs.map((pair) =>
    [`${pair.microSkillKey}:${pair.wordId}`, pair.removable])));
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(props.excludedPairs));
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [filters, setFilters] = useState<BulkFilters>({ search: "", schwa: "all", morpheme: "", syllables: "", phoneme: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<BulkApprovalResult | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(filters.search);
  const chosenSkill = props.skills.find((skill) => skill.key === chosenSkillKey);
  const chosenFamily = props.families.find((family) => family.key === chosenSkill?.familyKey);
  const wordById = useMemo(() => new Map(props.words.map((word) => [word.id, word])), [props.words]);
  const parts = useMemo(() => [...new Set(props.words.flatMap((word) => word.morphemeParts))]
    .sort((a, b) => a.localeCompare(b)), [props.words]);
  const counts = useMemo(() => [...new Set(props.words.map((word) => word.syllableCount)
    .filter((count): count is number => count !== null))].sort((a, b) => a - b), [props.words]);
  const phonemes = useMemo(() => [...new Set(props.words.flatMap((word) => word.phonemeSymbols))]
    .sort((a, b) => a.localeCompare(b)), [props.words]);
  const filtered = useMemo(() => filterBulkWords(props.words, { ...filters, search: deferredSearch }),
    [props.words, filters, deferredSearch]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectableVisible = visible.filter((word) => word.approvable && !assigned.has(`${chosenSkillKey}:${word.id}`)
    && (!excluded.has(`${chosenSkillKey}:${word.id}`) || editingWordId === word.id));
  const draftWords = (choice: BulkDraftChoice) => [...draft].filter(([, value]) => value === choice)
    .map(([id]) => wordById.get(id)).filter((word): word is BulkWord => Boolean(word));
  const applyWords = draftWords("apply");
  const excludeWords = draftWords("exclude");
  const clearWords = draftWords("clear");
  const assignedWords = props.words.filter((word) => assigned.has(`${chosenSkillKey}:${word.id}`));

  function updateFilters(patch: Partial<BulkFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  }
  function changeSelection(ids: string[], choice: "apply" | "exclude", checked: boolean) {
    const next = nextBulkReviewDraft(draft, ids, choice, checked, excluded, chosenSkillKey, MAX_SELECTION);
    if (!next) {
      setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`);
      return;
    }
    setDraft(next);
    setSelectionError("");
    setResult(null);
    setRequestId(null);
  }
  function removeDraft(id: string) {
    const next = new Map(draft);
    next.delete(id);
    setDraft(next);
    setRequestId(null);
    setResult(null);
    setSelectionError("");
  }
  function continueToWords() {
    if (!draftSkillKey) return;
    if (chosenSkillKey && draftSkillKey !== chosenSkillKey && draft.size > 0) {
      if (!window.confirm("Changing the micro-skill will clear your pending choices. Continue?")) return;
      setDraft(new Map());
      setRequestId(null);
    }
    setChosenSkillKey(draftSkillKey);
    setStage(2);
    setResult(null);
    setSelectionError("");
    setReviewError("");
    setEditingWordId(null);
  }
  function confirmSelection() {
    if (!chosenSkillKey || draft.size === 0 || pending) return;
    const applyWordIds = applyWords.map((word) => word.id);
    const excludeWordIds = excludeWords.map((word) => word.id);
    const clearWordIds = clearWords.map((word) => word.id);
    const currentRequestId = requestId ?? crypto.randomUUID();
    setRequestId(currentRequestId);
    startTransition(async () => {
      try {
        const response = await saveBulkSkillApprovals({ microSkillKey: chosenSkillKey,
          applyWordIds, excludeWordIds, clearWordIds, requestId: currentRequestId });
        setResult(response);
        if (response.ok) {
          setAssigned((previous) => {
            const next = new Map(previous);
            for (const pair of response.assigned) next.set(`${chosenSkillKey}:${pair.id}`, pair.removable);
            return next;
          });
          setExcluded((previous) => {
            const next = new Set(previous);
            for (const id of [...applyWordIds, ...clearWordIds]) next.delete(`${chosenSkillKey}:${id}`);
            for (const id of excludeWordIds) next.add(`${chosenSkillKey}:${id}`);
            return next;
          });
          setDraft(new Map());
          setEditingWordId(null);
          setRequestId(null);
        }
      } catch {
        setResult({ ok: false, approvedCount: 0, alreadyAssignedCount: 0, excludedCount: 0, clearedCount: 0,
          assigned: [], blocked: [], error: "The review request could not be completed. Please retry." });
      }
    });
  }

  function removeAssignment(wordId: string) {
    if (pending || !chosenSkillKey) return;
    setReviewError("");
    startTransition(async () => {
      try {
        const response = await removeBulkSkillAssignment({ microSkillKey: chosenSkillKey, wordId });
        if (!response.ok) { setReviewError(response.error ?? "Assignment could not be removed."); return; }
        setAssigned((previous) => { const next = new Map(previous); next.delete(`${chosenSkillKey}:${wordId}`); return next; });
        setEditingWordId(null);
      } catch { setReviewError("Assignment could not be removed. Please retry."); }
    });
  }

  function choiceInput(word: BulkWord, choice: "apply" | "exclude") {
    const pairKey = `${chosenSkillKey}:${word.id}`;
    const isAssigned = assigned.has(pairKey);
    const isExcluded = excluded.has(pairKey);
    const draftChoice = draft.get(word.id);
    const checked = draftChoice ? draftChoice === choice : choice === "apply" ? isAssigned : isExcluded;
    const locked = (isAssigned || isExcluded) && editingWordId !== word.id;
    return <input type="checkbox" aria-label={`${choice === "apply" ? "Apply" : "Doesn't apply"}: ${word.displayWord}`}
      checked={checked} disabled={pending || !props.approvalEnabled || !word.approvable || isAssigned || locked}
      onChange={(event) => changeSelection([word.id], choice, event.target.checked)} />;
  }

  function rowStatus(word: BulkWord) {
    const pairKey = `${chosenSkillKey}:${word.id}`;
    const choice = draft.get(word.id);
    const isAssigned = assigned.has(pairKey);
    const isExcluded = excluded.has(pairKey);
    return <div className="flex flex-wrap items-center gap-1 text-xs font-normal">
      {choice === "apply" ? <span>Apply · pending</span>
        : choice === "exclude" ? <span>Doesn’t apply · pending</span>
          : choice === "clear" ? <span>Clear review · pending</span>
            : isAssigned ? <span>Applied</span> : isExcluded ? <span>Doesn’t apply</span>
              : !word.approvable ? <span>Word not approved</span> : null}
      {(isAssigned || isExcluded) && <button type="button" aria-label={`Edit review choice for ${word.displayWord}`}
        title="Edit review choice" disabled={pending || !props.approvalEnabled || (isAssigned && !assigned.get(pairKey))}
        className="rounded border border-[var(--border)] bg-white px-1 disabled:opacity-50"
        onClick={() => setEditingWordId(editingWordId === word.id ? null : word.id)}>✎</button>}
      {isAssigned && editingWordId === word.id && <span>Remove in section 3 before changing this choice.</span>}
      {isExcluded && editingWordId === word.id && <button type="button" className="underline"
        onClick={() => { const next = new Map(draft); next.set(word.id, "clear");
          if (next.size > MAX_SELECTION) { setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`); return; }
          setDraft(next); setRequestId(null); setResult(null); setSelectionError(""); }}>
        Clear saved review
      </button>}
    </div>;
  }

  return <div className="grid gap-5">
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold">1. Choose a micro-skill</h2>
          {stage === 2 && <p className="mt-1 text-sm">{chosenFamily?.label} → <strong>{chosenSkill?.label}</strong></p>}
        </div>
        {stage === 2 && <button type="button" disabled={pending} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
          onClick={() => setStage(1)}>Edit skill</button>}
      </div>
      {stage === 1 && <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium">Family
          <select className={fieldClass} value={familyKey} onChange={(event) => {
            setFamilyKey(event.target.value); setDraftSkillKey("");
          }}><option value="">Choose family</option>{props.families.filter((family) =>
            props.skills.some((skill) => skill.familyKey === family.key)).map((family) =>
            <option key={family.key} value={family.key}>{family.label}</option>)}</select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Micro-skill
          <select className={fieldClass} value={draftSkillKey} disabled={!familyKey}
            onChange={(event) => setDraftSkillKey(event.target.value)}>
            <option value="">Choose micro-skill</option>
            {props.skills.filter((skill) => skill.familyKey === familyKey).map((skill) =>
              <option key={skill.key} value={skill.key}>{skill.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={!draftSkillKey} onClick={continueToWords}
          className="rounded-lg bg-[var(--scarlett)] px-5 py-2 font-semibold text-white disabled:opacity-50">Next</button>
      </div>}
    </section>

    {stage === 2 && <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <h2 className="text-xl font-semibold">2. Assign words to {chosenSkill?.label}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <label className="grid min-w-0 gap-1 text-sm font-medium">Letters anywhere in word
          <input className={fieldClass} type="search" value={filters.search} placeholder="Search words"
            onChange={(event) => updateFilters({ search: event.target.value })} /></label>
        <label className="grid min-w-0 gap-1 text-sm font-medium">Schwa
          <select className={fieldClass} value={filters.schwa}
            onChange={(event) => updateFilters({ schwa: event.target.value as BulkFilters["schwa"] })}>
            <option value="all">All</option><option value="yes">Has schwa</option>
            <option value="no">No schwa</option><option value="unknown">Unknown</option>
          </select></label>
        <SearchableFilter label="Morpheme part" value={filters.morpheme} allLabel="All parts"
          options={parts.map((part) => ({ value: part, label: part }))}
          onChange={(morpheme) => updateFilters({ morpheme })} />
        <label className="grid min-w-0 gap-1 text-sm font-medium">Syllable count
          <select className={fieldClass} value={filters.syllables}
            onChange={(event) => updateFilters({ syllables: event.target.value })}>
            <option value="">Any count</option>{counts.map((count) => <option key={count} value={count}>{count}</option>)}
            <option value="unknown">Unknown</option>
          </select></label>
        <SearchableFilter label="Phoneme" value={filters.phoneme} allLabel="All phonemes"
          options={phonemes.map((phoneme) => ({ value: phoneme, label: `/${phoneme}/` }))}
          onChange={(phoneme) => updateFilters({ phoneme })} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <div className="min-w-0">
          <p className="my-3 text-sm">{filtered.length} matching words · page {currentPage} of {pageCount}</p>
          <div className="mb-3 flex flex-wrap gap-4 text-sm md:hidden">
            {(["apply", "exclude"] as const).map((choice) => {
              const ids = selectableVisible.map((word) => word.id);
              return <label key={choice} className="flex items-center gap-2">
                <input type="checkbox" checked={ids.length > 0 && ids.every((id) => draft.get(id) === choice)}
                  disabled={pending || !props.approvalEnabled || ids.length === 0}
                  onChange={(event) => changeSelection(ids, choice, event.target.checked)} />
                {choice === "apply" ? "Apply" : "Doesn’t apply"} all on this page
              </label>;
            })}
          </div>
          <div className="hidden rounded-lg border border-[var(--border)] md:block">
            <table className="w-full table-fixed text-left text-xs">
              <colgroup><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[17%]" />
                <col className="w-[16%]" /><col className="w-[10%]" /><col className="w-[28%]" /><col className="w-[11%]" /></colgroup>
              <thead className="bg-[var(--paper)]"><tr>
                {(["apply", "exclude"] as const).map((choice) => {
                  const ids = selectableVisible.map((word) => word.id);
                  const allChecked = ids.length > 0 && ids.every((id) => draft.get(id) === choice);
                  return <th key={choice} className="break-words p-1 align-top">
                    <label className="flex flex-col items-start gap-1">
                      {choice === "apply" ? "Apply" : "Doesn’t apply"}
                      <input type="checkbox" aria-label={`${choice === "apply" ? "Apply" : "Doesn't apply"} all available words on this page`}
                        checked={allChecked} disabled={pending || !props.approvalEnabled || ids.length === 0}
                        onChange={(event) => changeSelection(ids, choice, event.target.checked)} />
                    </label>
                  </th>;
                })}
                <th className="p-1">Word</th><th className="p-1">Phoneme</th><th className="p-1">Schwa</th>
                <th className="p-1">Parts</th><th className="p-1">Written syllables / spoken count</th>
              </tr></thead>
              <tbody>{visible.map((word) => {
                const reviewed = assigned.has(`${chosenSkillKey}:${word.id}`)
                  || excluded.has(`${chosenSkillKey}:${word.id}`) || draft.has(word.id);
                return <tr key={word.id} className={`border-t border-[var(--border)] align-top ${reviewed ? "bg-slate-100 text-slate-600" : ""}`}>
                  <td className="p-1">{choiceInput(word, "apply")}</td>
                  <td className="p-1">{choiceInput(word, "exclude")}</td>
                  <td className="break-words p-1 font-semibold" style={{ overflowWrap: "anywhere" }}>
                    {word.displayWord}{rowStatus(word)}</td>
                  <td className="break-words p-1" style={{ overflowWrap: "anywhere" }}>{word.phonemeHint || "Unknown"}</td>
                  <td className="break-words p-1">{word.hasSchwa === null ? "Unknown" : word.hasSchwa ? "Yes" : "No"}</td>
                  <td className="break-words p-1" style={{ overflowWrap: "anywhere" }}>{word.morphemeParts.join(", ") || "Unknown"}</td>
                  <td className="break-words p-1">{word.writtenSyllableBreakdown || "No reviewed split"}<br /><span className="text-[color:var(--mid)]">{word.syllableCount ?? "Unknown"} spoken</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">{visible.map((word) => {
            const reviewed = assigned.has(`${chosenSkillKey}:${word.id}`)
              || excluded.has(`${chosenSkillKey}:${word.id}`) || draft.has(word.id);
            return <article key={word.id} className={`min-w-0 rounded-lg border border-[var(--border)] p-3 text-sm ${reviewed ? "bg-slate-100 text-slate-600" : ""}`}>
              <h3 className="break-words font-semibold">{word.displayWord}</h3>
              {rowStatus(word)}
              <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt>Phoneme</dt><dd className="break-words" style={{ overflowWrap: "anywhere" }}>{word.phonemeHint || "Unknown"}</dd>
                <dt>Schwa</dt><dd>{word.hasSchwa === null ? "Unknown" : word.hasSchwa ? "Yes" : "No"}</dd>
                <dt>Parts</dt><dd className="break-words" style={{ overflowWrap: "anywhere" }}>{word.morphemeParts.join(", ") || "Unknown"}</dd>
                <dt>Written syllables</dt><dd>{word.writtenSyllableBreakdown || "No reviewed split"}</dd>
                <dt>Spoken syllable count</dt><dd>{word.syllableCount ?? "Unknown"}</dd>
              </dl>
              <div className="mt-3 flex gap-5"><label className="flex items-center gap-2">{choiceInput(word, "apply")} Apply</label>
                <label className="flex items-center gap-2">{choiceInput(word, "exclude")} Doesn’t apply</label></div>
            </article>;
          })}</div>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button type="button" className="underline disabled:opacity-40" disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="underline disabled:opacity-40" disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>
        <aside className="grid self-start gap-4">
          {([{ title: "Selected Assigned Words", choice: "apply", words: applyWords },
            { title: "Doesn’t apply", choice: "exclude", words: excludeWords }] as const).map((box) =>
            <section key={box.choice} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-4">
              <h3 className="text-lg font-semibold">{box.title} ({box.words.length})</h3>
              <p className="mt-1 text-sm">{box.choice === "apply" ? "Words to assign" : "Words to mark as not applying"} to {chosenSkill?.label}.</p>
              <div className="mt-3 flex max-h-52 flex-wrap gap-2 overflow-y-auto" aria-label={box.title}>
                {box.words.length ? box.words.map((word) => <span key={word.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm">
                  <span className="break-all">{word.displayWord}</span><button type="button" aria-label={`Remove ${word.displayWord} from ${box.title}`}
                    disabled={pending} className="font-bold disabled:opacity-50" onClick={() => removeDraft(word.id)}>×</button>
                </span>) : <p className="text-sm">Select words from the table.</p>}
              </div>
            </section>)}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-4">
            <p className="text-sm">{draft.size}/{MAX_SELECTION} pending changes
              {clearWords.length ? ` · ${clearWords.length} saved review ${clearWords.length === 1 ? "choice" : "choices"} to clear` : ""}</p>
            {selectionError && <p role="alert" className="mt-3 text-sm text-rose-800">{selectionError}</p>}
            {reviewError && <p role="alert" className="mt-3 text-sm text-rose-800">{reviewError}</p>}
            {!props.approvalEnabled && <p role="alert" className="mt-3 text-sm text-amber-900">Evidence approval controls are disabled in this environment.</p>}
            <button type="button" disabled={!props.approvalEnabled || draft.size === 0 || pending}
              onClick={confirmSelection} className="mt-4 w-full rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white disabled:opacity-50">
              {pending ? "Confirming words…" : `Confirm ${draft.size} word${draft.size === 1 ? "" : "s"}`}
            </button>
            {result && <div className={`mt-4 rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
              role={result.ok ? "status" : "alert"}>
              {result.ok ? `${result.approvedCount} applied; ${result.excludedCount} marked doesn’t apply; ${result.clearedCount} cleared${result.alreadyAssignedCount ? `; ${result.alreadyAssignedCount} already assigned` : ""}.` : result.error}
              {result.blocked.length > 0 && <ul className="mt-2 list-disc pl-5">{result.blocked.map((item) =>
                <li key={item.id}>{item.word}: {item.reason}</li>)}</ul>}
            </div>}
          </div>
        </aside>
      </div>
    </section>}
    {stage === 2 && <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <details>
        <summary className="cursor-pointer text-xl font-semibold">3. See all words in {chosenSkill?.label} ({assignedWords.length})</summary>
        <div className="mt-4 flex flex-wrap gap-2" aria-label={`Words in ${chosenSkill?.label}`}>
          {assignedWords.length ? assignedWords.map((word) => {
            const removable = assigned.get(`${chosenSkillKey}:${word.id}`);
            return <span key={word.id} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--paper)] px-3 py-1 text-sm">
              {word.displayWord}
              {removable && <button type="button" aria-label={`Remove ${word.displayWord} from ${chosenSkill?.label}`}
                title="Remove assignment" disabled={pending || !props.approvalEnabled}
                className="font-bold disabled:opacity-50" onClick={() => removeAssignment(word.id)}>×</button>}
            </span>;
          }) : <p className="text-sm">No assigned words yet.</p>}
        </div>
        {reviewError && <p role="alert" className="mt-3 text-sm text-rose-800">{reviewError}</p>}
      </details>
    </section>}
  </div>;
}
