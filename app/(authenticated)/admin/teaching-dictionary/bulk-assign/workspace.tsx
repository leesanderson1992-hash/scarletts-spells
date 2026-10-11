"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { filterBulkWords, nextBulkSelection, type BulkFilters, type BulkWord } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import { saveBulkSkillApprovals, type BulkApprovalResult } from "./actions";

type Family = { key: string; label: string };
type Skill = { key: string; label: string; familyKey: string; clusterKey: string };
const PAGE_SIZE = 50;
const MAX_SELECTION = 100;
const fieldClass = "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

export function BulkAssignWorkspace(props: {
  words: BulkWord[];
  families: Family[];
  skills: Skill[];
  assignedPairs: string[];
  approvalEnabled: boolean;
}) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [familyKey, setFamilyKey] = useState("");
  const [draftSkillKey, setDraftSkillKey] = useState("");
  const [chosenSkillKey, setChosenSkillKey] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [assigned, setAssigned] = useState<Set<string>>(() => new Set(props.assignedPairs));
  const [filters, setFilters] = useState<BulkFilters>({ search: "", schwa: "all", morpheme: "", syllables: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<BulkApprovalResult | null>(null);
  const [selectionError, setSelectionError] = useState("");
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
  const filtered = useMemo(() => filterBulkWords(props.words, { ...filters, search: deferredSearch }),
    [props.words, filters, deferredSearch]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectableVisible = visible.filter((word) => word.approvable && !assigned.has(`${chosenSkillKey}:${word.id}`));
  const selectedWords = [...selected].map((id) => wordById.get(id)).filter((word): word is BulkWord => Boolean(word));
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((word) => selected.has(word.id));

  function updateFilters(patch: Partial<BulkFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  }
  function changeSelection(ids: string[], checked: boolean) {
    const next = nextBulkSelection(selected, ids, checked, MAX_SELECTION);
    if (!next) {
      setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`);
      return;
    }
    setSelected(next);
    setSelectionError("");
    setResult(null);
    setRequestId(null);
  }
  function continueToWords() {
    if (!draftSkillKey) return;
    if (chosenSkillKey && draftSkillKey !== chosenSkillKey && selected.size > 0) {
      if (!window.confirm("Changing the micro-skill will clear your selected words. Continue?")) return;
      setSelected(new Set());
      setRequestId(null);
    }
    setChosenSkillKey(draftSkillKey);
    setStage(2);
    setResult(null);
    setSelectionError("");
  }
  function confirmSelection() {
    if (!chosenSkillKey || selected.size === 0 || pending) return;
    const ids = [...selected];
    const currentRequestId = requestId ?? crypto.randomUUID();
    setRequestId(currentRequestId);
    startTransition(async () => {
      try {
        const response = await saveBulkSkillApprovals({ microSkillKey: chosenSkillKey,
          wordIds: ids, requestId: currentRequestId });
        setResult(response);
        if (response.ok) {
          setAssigned((previous) => {
            const next = new Set(previous);
            for (const id of ids) next.add(`${chosenSkillKey}:${id}`);
            return next;
          });
          setSelected(new Set());
          setRequestId(null);
        }
      } catch {
        setResult({ ok: false, approvedCount: 0, alreadyAssignedCount: 0, blocked: [],
          error: "The approval request could not be completed. Please retry." });
      }
    });
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
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">Letters anywhere in word
              <input className={fieldClass} type="search" value={filters.search} placeholder="Search words"
                onChange={(event) => updateFilters({ search: event.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Schwa
              <select className={fieldClass} value={filters.schwa}
                onChange={(event) => updateFilters({ schwa: event.target.value as BulkFilters["schwa"] })}>
                <option value="all">All</option><option value="yes">Has schwa</option>
                <option value="no">No schwa</option><option value="unknown">Unknown</option>
              </select></label>
            <label className="grid gap-1 text-sm font-medium">Morpheme part
              <select className={fieldClass} value={filters.morpheme}
                onChange={(event) => updateFilters({ morpheme: event.target.value })}>
                <option value="">All parts</option>{parts.map((part) => <option key={part} value={part}>{part}</option>)}
              </select></label>
            <label className="grid gap-1 text-sm font-medium">Syllable count
              <select className={fieldClass} value={filters.syllables}
                onChange={(event) => updateFilters({ syllables: event.target.value })}>
                <option value="">Any count</option>{counts.map((count) => <option key={count} value={count}>{count}</option>)}
                <option value="unknown">Unknown</option>
              </select></label>
          </div>
          <p className="my-3 text-sm">{filtered.length} matching words · page {currentPage} of {pageCount}</p>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-[var(--paper)]"><tr>
                <th className="p-2"><input type="checkbox" aria-label="Select all available words on this page"
                  checked={allVisibleSelected} disabled={pending || !props.approvalEnabled || selectableVisible.length === 0}
                  onChange={(event) => changeSelection(selectableVisible.map((word) => word.id), event.target.checked)} /></th>
                <th className="p-2">Word</th><th className="p-2">Schwa</th><th className="p-2">Parts</th>
                <th className="p-2">Syllables</th><th className="p-2">Status</th>
              </tr></thead>
              <tbody>{visible.map((word) => {
                const isAssigned = assigned.has(`${chosenSkillKey}:${word.id}`);
                return <tr key={word.id} className="border-t border-[var(--border)]">
                  <td className="p-2"><input type="checkbox" aria-label={`Select ${word.displayWord}`}
                    checked={selected.has(word.id)} disabled={pending || !props.approvalEnabled || !word.approvable || isAssigned}
                    onChange={(event) => changeSelection([word.id], event.target.checked)} /></td>
                  <td className="p-2 font-semibold">{word.displayWord}</td>
                  <td className="p-2">{word.hasSchwa === null ? "Unknown" : word.hasSchwa ? "Yes" : "No"}</td>
                  <td className="p-2">{word.morphemeParts.join(", ") || "Unknown"}</td>
                  <td className="p-2">{word.syllableCount ?? "Unknown"}</td>
                  <td className="p-2">{isAssigned ? "Assigned" : word.approvable ? "Available" : "Word not approved"}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button type="button" className="underline disabled:opacity-40" disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="underline disabled:opacity-40" disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>
        <aside className="self-start rounded-xl border border-[var(--border)] bg-[var(--paper)] p-4">
          <h3 className="text-lg font-semibold">Selected words ({selected.size}/{MAX_SELECTION})</h3>
          <p className="mt-1 text-sm">These words will be approved for authentic-use evidence for {chosenSkill?.label}.</p>
          <div className="mt-4 flex max-h-[440px] flex-wrap gap-2 overflow-y-auto" aria-label="Selected words">
            {selectedWords.length ? selectedWords.map((word) => <span key={word.id}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm">
              {word.displayWord}<button type="button" aria-label={`Remove ${word.displayWord}`}
                disabled={pending} className="font-bold disabled:opacity-50" onClick={() => changeSelection([word.id], false)}>×</button>
            </span>) : <p className="text-sm">Select words from the table.</p>}
          </div>
          {selectionError && <p role="alert" className="mt-3 text-sm text-rose-800">{selectionError}</p>}
          {!props.approvalEnabled && <p role="alert" className="mt-3 text-sm text-amber-900">Evidence approval controls are disabled in this environment.</p>}
          <button type="button" disabled={!props.approvalEnabled || selected.size === 0 || pending}
            onClick={confirmSelection} className="mt-5 w-full rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white disabled:opacity-50">
            {pending ? "Approving words…" : `Confirm ${selected.size} word${selected.size === 1 ? "" : "s"}`}
          </button>
          {result && <div className={`mt-4 rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
            role={result.ok ? "status" : "alert"}>
            {result.ok ? `${result.approvedCount} approved${result.alreadyAssignedCount ? `; ${result.alreadyAssignedCount} already assigned` : ""}.` : result.error}
            {result.blocked.length > 0 && <ul className="mt-2 list-disc pl-5">{result.blocked.map((item) =>
              <li key={item.id}>{item.word}: {item.reason}</li>)}</ul>}
          </div>}
        </aside>
      </div>
    </section>}
  </div>;
}
