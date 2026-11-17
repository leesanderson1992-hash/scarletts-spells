"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { defaultBulkFilters, nextAssignedBulkDraft, nextBulkReviewDraft, type BulkDraftChoice, type BulkFilters, type BulkWord } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import type { loadBulkWordFilterOptions } from "./candidate-page";
import { normaliseBulkSpellingSearch, rememberSpellingPage, reuseSpellingPage,
  type BulkCandidatePage, type RecentSpellingPages } from "@/lib/teaching-dictionary-manager/bulk-spelling-search";
import { loadBulkCandidateDetails } from "./candidate-details";
import { saveBulkSkillApprovals, type BulkApprovalResult } from "./actions";
import type { BulkAssignedPair } from "@/lib/teaching-dictionary-manager/bulk-review";
import { bulkSenseChoiceError } from "@/lib/teaching-dictionary-manager/bulk-sense-approval";
import { evaluateLessonCandidate, hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";

type Cluster = { key: string; label: string };
type Skill = { key: string; label: string; clusterKey: string };
const emptySenseChoices: Record<string, string> = {};
type FilterOptions = Awaited<ReturnType<typeof loadBulkWordFilterOptions>>;
const candidatePagePath = "/api/admin/teaching-dictionary/bulk-assign/candidates";
type DraftWord = Pick<BulkWord, "id" | "displayWord" | "normalisedWord" | "senseSet">;
const emptyPage: BulkCandidatePage = { words: [], total: 0, currentPage: 1, pageCount: 1, details: undefined };
const MAX_SELECTION = 100;
const fieldClass = "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

function SearchableFilter({ label, value, options, allLabel, onChange, loadOptions, optionsStatus }: {
  label: string; value: string; options: { value: string; label: string }[];
  allLabel: string; onChange: (value: string) => void;
  loadOptions?: () => void; optionsStatus?: "loading" | "error";
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
      onClick={() => { if (!open) loadOptions?.(); setOpen(!open); setQuery(""); setActiveIndex(0); }}>
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
        {optionsStatus === "loading" ? <p role="status" className="px-3 py-2 text-xs text-slate-600">Loading options…</p>
          : optionsStatus === "error" ? <p className="px-3 py-2 text-xs">Could not load options. {loadOptions &&
            <button type="button" className="underline" onClick={loadOptions}>Retry</button>}</p>
          : matchingOptions.length === 0 && <p className="px-3 py-2 text-xs text-slate-600">No matching options.</p>}
      </div>
    </div>}
  </div>;
}

export function BulkAssignWorkspace(props: {
  initialPage?: BulkCandidatePage;
  assignedWords: DraftWord[];
  clusters: Cluster[];
  initialSkillKey: string;
  child?: string;
  skills: Skill[];
  assignedPairs: BulkAssignedPair[];
  assignedSenseIds: Record<string, string>;
  approvedSenseIdsByPair: Record<string, string[]>;
  excludedPairs: string[];
  approvalEnabled: boolean;
}) {
  const router = useRouter();
  const chosenSkillKey = props.initialSkillKey;
  const chosenSkill = props.skills.find(skill => skill.key === chosenSkillKey);
  const [stage, setStage] = useState<1 | 2>(chosenSkill ? 2 : 1);
  const [clusterKey, setClusterKey] = useState(chosenSkill?.clusterKey ?? "");
  const [draftSkillKey, setDraftSkillKey] = useState(chosenSkillKey);
  const [opening, openSkill] = useTransition();
  const [draftState, setDraftState] = useState({ choices: new Map<string, BulkDraftChoice>(), rows: new Map<string, DraftWord>() });
  const draft = draftState.choices;
  const [addedAssignedWords, setAddedAssignedWords] = useState<DraftWord[]>([]);
  const [assigned, setAssigned] = useState<Map<string, boolean>>(() => new Map(props.assignedPairs.map((pair) =>
    [`${pair.microSkillKey}:${pair.wordId}`, pair.removable])));
  const [selectedSenses, setSelectedSenses] = useState<Record<string, string>>(props.assignedSenseIds);
  const [approvedSenseIdsByPair, setApprovedSenseIdsByPair] = useState<Record<string, string[]>>(props.approvedSenseIdsByPair);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(props.excludedPairs));
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [filters, setFilters] = useState<BulkFilters>(defaultBulkFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<BulkApprovalResult | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosenCluster = props.clusters.find(cluster => cluster.key === chosenSkill?.clusterKey);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>();
  const [optionsStatus, setOptionsStatus] = useState<"loading" | "error">();
  const optionsRequest = useRef<Promise<void> | null>(null);
  const { parts, counts, phonemes } = filterOptions ?? { parts: [], counts: [], phonemes: [] };
  function loadOptions() {
    if (filterOptions || optionsRequest.current) return;
    setOptionsStatus("loading");
    optionsRequest.current = fetch(candidatePagePath, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Filter options could not load.");
      setFilterOptions(await response.json() as FilterOptions);
      setOptionsStatus(undefined);
    }).catch(() => setOptionsStatus("error")).finally(() => { optionsRequest.current = null; });
  }
  const { schwa, morpheme, syllables, phoneme } = filters;
  const search = normaliseBulkSpellingSearch(filters.search);
  const requestFilters = useMemo(() => ({ search, schwa, morpheme, syllables, phoneme }),
    [search, schwa, morpheme, syllables, phoneme]);
  const filtersUseMeaning = schwa !== "all" || Boolean(syllables || phoneme);
  const spellingOnly = !filtersUseMeaning && !morpheme;
  const filterSenses = filtersUseMeaning ? selectedSenses : emptySenseChoices;
  const useInitialPage = page === 1 && spellingOnly && !search;
  const pageKey = useMemo(() => JSON.stringify([page, requestFilters, filterSenses]), [page, requestFilters, filterSenses]);
  const [loadedPage, setLoadedPage] = useState<{ key: string; data?: BulkCandidatePage }>({ key: "" });
  const [pageAttempt, setPageAttempt] = useState(0);
  const recentSpellingPages = useRef<RecentSpellingPages>(new Map());
  const currentKey = `${pageAttempt}:${pageKey}`;
  function invalidateCandidatePages() {
    recentSpellingPages.current = new Map();
    setPageAttempt(attempt => attempt + 1);
  }
  useEffect(() => {
    recentSpellingPages.current = new Map();
    function clearAfterReturning() {
      if (!document.hidden) recentSpellingPages.current = new Map();
    }
    document.addEventListener("visibilitychange", clearAfterReturning);
    return () => document.removeEventListener("visibilitychange", clearAfterReturning);
  }, [chosenSkillKey, props.initialPage]);
  useEffect(() => {
    if (stage !== 2 || useInitialPage) return;
    const controller = new AbortController();
    const pages = recentSpellingPages.current;
    const cached = spellingOnly ? reuseSpellingPage(pages, search, page, Date.now()) : undefined;
    const timer = window.setTimeout(() => {
      if (cached) {
        setLoadedPage({ key: currentKey, data: cached });
        return;
      }
      fetch(candidatePagePath, {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: chosenSkillKey, filters: requestFilters, page, selectedSenses: filterSenses }),
      }).then(async response => {
        if (!response.ok) throw new Error("Candidate page could not load.");
        return response.json() as Promise<BulkCandidatePage>;
      }).then(data => {
        if (controller.signal.aborted) return;
        if (spellingOnly && (data.details || !data.words.length || !hasCandidateRule(chosenSkillKey))) {
          rememberSpellingPage(pages, search, page, data, Date.now());
        }
        setLoadedPage({ key: currentKey, data });
      }).catch(() => { if (!controller.signal.aborted) setLoadedPage({ key: currentKey }); });
    }, cached || !search ? 0 : 60);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [stage, useInitialPage, chosenSkillKey, requestFilters, search, page, filterSenses, spellingOnly, currentKey, props.initialPage]);
  const pageLoading = !useInitialPage && loadedPage.key !== currentKey;
  const pageError = !useInitialPage && loadedPage.key === currentKey && !loadedPage.data;
  const candidatePage = useInitialPage ? props.initialPage ?? emptyPage : loadedPage.data ?? emptyPage;
  const { words: pageWords, total, currentPage, pageCount } = candidatePage;
  const pageById = useMemo(() => new Map(pageWords.map(word => [word.id, word])), [pageWords]);
  const assignedWords = [...new Map([...props.assignedWords, ...addedAssignedWords].map(word => [word.id, word])).values()]
    .filter(word => assigned.has(`${chosenSkillKey}:${word.id}`))
    .sort((a, b) => a.normalisedWord.localeCompare(b.normalisedWord));
  function setDraft(change: Map<string, BulkDraftChoice> | ((previous: Map<string, BulkDraftChoice>) => Map<string, BulkDraftChoice>)) {
    setDraftState(previous => {
      const choices = typeof change === "function" ? change(previous.choices) : change;
      const rows = new Map<string, DraftWord>();
      for (const id of choices.keys()) {
        const row = pageById.get(id) ?? previous.rows.get(id) ?? assignedWords.find(word => word.id === id);
        if (row) rows.set(id, row);
      }
      return { choices, rows };
    });
  }
  const selectedSenseId = (word: DraftWord) => selectedSenses[`${chosenSkillKey}:${word.id}`]
    ?? (word.senseSet?.senses.length === 1 ? word.senseSet.senses[0].id : "");
  const selectedPronunciation = (word: BulkWord) => {
    const sense = word.senseSet?.senses.find(row => row.id === selectedSenseId(word));
    return word.senseSet?.pronunciations.find(row => row.id === sense?.pronunciationId);
  };
  const displayedSchwa = (word: BulkWord): boolean | null => {
    const pronunciation = selectedPronunciation(word);
    if (pronunciation?.ipa.trim()) return pronunciation.ipa.includes("ə");
    return word.senseSet?.senses.length ? null : word.hasSchwa;
  };
  const candidateRule = hasCandidateRule(chosenSkillKey);
  const visiblePage = pageLoading || pageError ? [] : pageWords;
  const pageIds = visiblePage.map(word => word.id).join(",");
  const pageDetails = candidatePage.details;
  const [details, setDetails] = useState<{ pageIds: string; rows: Awaited<ReturnType<typeof loadBulkCandidateDetails>> }>();
  const [failedPage, setFailedPage] = useState("");
  const [retry, setRetry] = useState({ pageIds: "", attempt: 0 });
  const retryAttempt = retry.pageIds === pageIds ? retry.attempt : 0;
  const activeDetailsRequest = useRef<{ key: string; result: ReturnType<typeof loadBulkCandidateDetails> } | null>(null);
  function retryDetails() {
    setFailedPage("");
    setDetails(undefined);
    setRetry(previous => ({ pageIds, attempt: previous.attempt + 1 }));
  }
  useEffect(() => {
    if (stage !== 2 || !candidateRule || !pageIds || (pageDetails && !retryAttempt)) return;
    let cancelled = false;
    const key = `${retryAttempt}:${pageIds}`;
    if (activeDetailsRequest.current?.key !== key) {
      activeDetailsRequest.current = { key, result: loadBulkCandidateDetails(pageIds.split(",")) };
    }
    activeDetailsRequest.current.result.then(rows => {
      if (!cancelled) {
        setDetails({ pageIds, rows });
        setFailedPage("");
      }
    }, () => { if (!cancelled) setFailedPage(pageIds); });
    return () => { cancelled = true; };
  }, [stage, candidateRule, pageIds, pageDetails, retryAttempt]);
  const visible = visiblePage.map(word => ({ ...word, candidateSenseFacts:
    details?.pageIds === pageIds ? details.rows[word.id] : retryAttempt ? undefined : pageDetails?.[word.id] }));
  const candidateReady = (word: BulkWord) => !candidateRule || word.candidateSenseFacts !== undefined;
  const selectableVisible = visible.filter((word) => word.approvable
    && (!assigned.has(`${chosenSkillKey}:${word.id}`) || editingWordId === word.id)
    && (!excluded.has(`${chosenSkillKey}:${word.id}`) || editingWordId === word.id));
  const draftWords = (choice: BulkDraftChoice) => [...draft].filter(([, value]) => value === choice)
    .map(([id]) => draftState.rows.get(id)).filter((word): word is DraftWord => Boolean(word));
  const applyWords = draftWords("apply");
  const excludeWords = draftWords("exclude");
  const clearWords = draftWords("clear");
  const deassignWords = draftWords("deassign");

  function updateFilters(patch: Partial<BulkFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  }
  function changeSelection(ids: string[], choice: "apply" | "exclude", checked: boolean) {
    const next = new Map(draft);
    for (const id of ids) {
      const isAssigned = assigned.has(`${chosenSkillKey}:${id}`);
      if (isAssigned) {
        const changed = nextAssignedBulkDraft(next, id, choice, checked, MAX_SELECTION);
        if (!changed) { setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`); return; }
        if (changed.has(id)) next.set(id, changed.get(id)!);
        else next.delete(id);
      } else {
        const changed = nextBulkReviewDraft(next, [id], choice, checked, excluded, chosenSkillKey, MAX_SELECTION);
        if (!changed) { setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`); return; }
        changed.forEach((value, key) => next.set(key, value));
        if (!changed.has(id)) next.delete(id);
      }
    }
    if (next.size > MAX_SELECTION) {
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
    if (draftSkillKey !== chosenSkillKey) {
      const query = new URLSearchParams({ skill: draftSkillKey });
      if (props.child) query.set("child", props.child);
      openSkill(() => router.push(`?${query}`));
      return;
    }
    setStage(2);
    setResult(null);
    setSelectionError("");
    setReviewError("");
    setEditingWordId(null);
  }
  function confirmSelection() {
    if (!chosenSkillKey || draft.size === 0 || pending) return;
    const applyWordIds = applyWords.map((word) => word.id);
    const senseIds = Object.fromEntries(applyWords.map(word => [word.id, selectedSenseId(word)]));
    const excludeWordIds = excludeWords.map((word) => word.id);
    const clearWordIds = clearWords.map((word) => word.id);
    const deassignWordIds = deassignWords.map((word) => word.id);
    const currentRequestId = requestId ?? crypto.randomUUID();
    setRequestId(currentRequestId);
    startTransition(async () => {
      try {
        const response = await saveBulkSkillApprovals({ microSkillKey: chosenSkillKey,
          applyWordIds, excludeWordIds, clearWordIds, deassignWordIds, senseIds, requestId: currentRequestId, queueForReview: true });
        setResult(response);
        if (response.ok) {
          if (response.readbackRequired) { window.location.reload(); return; }
          invalidateCandidatePages();
          setAddedAssignedWords(previous => [...new Map([...previous, ...applyWords]
            .filter(word => response.assigned.some(pair => pair.id === word.id)).map(word => [word.id, word])).values()]);
          setAssigned((previous) => {
            const next = new Map(previous);
            for (const key of next.keys()) if (key.startsWith(`${chosenSkillKey}:`)) next.delete(key);
            for (const pair of response.assigned) next.set(`${chosenSkillKey}:${pair.id}`, pair.removable);
            return next;
          });
          setExcluded((previous) => {
            const next = new Set(previous);
            for (const key of next) if (key.startsWith(`${chosenSkillKey}:`)) next.delete(key);
            for (const id of response.excluded) next.add(`${chosenSkillKey}:${id}`);
            return next;
          });
          setSelectedSenses(previous => {
            const next = { ...previous };
            for (const [id, senseId] of Object.entries(senseIds)) next[`${chosenSkillKey}:${id}`] = senseId;
            for (const id of [...deassignWordIds, ...excludeWordIds]) delete next[`${chosenSkillKey}:${id}`];
            return next;
          });
          setApprovedSenseIdsByPair(previous => {
            const next = { ...previous };
            for (const [id, senseId] of Object.entries(senseIds)) {
              if (!senseId || !response.approvedWordIds?.includes(id)) continue;
              const key = `${chosenSkillKey}:${id}`;
              next[key] = [...new Set([...(next[key] ?? []), senseId])];
            }
            for (const id of [...deassignWordIds, ...excludeWordIds]) delete next[`${chosenSkillKey}:${id}`];
            return next;
          });
          setDraft(new Map());
          setEditingWordId(null);
          setRequestId(null);
        }
      } catch {
        setResult({ ok: false, approvedCount: 0, alreadyAssignedCount: 0, excludedCount: 0, clearedCount: 0,
          deassignedCount: 0, assigned: [], excluded: [], blocked: [], error: "The review request could not be completed. Please retry." });
      }
    });
  }

  function removeAssignment(wordId: string) {
    if (pending || !chosenSkillKey) return;
    const next = draft.get(wordId) === "deassign" ? new Map(draft)
      : nextAssignedBulkDraft(draft, wordId, "deassign", true, MAX_SELECTION);
    if (!next) { setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`); return; }
    if (draft.get(wordId) === "deassign") next.delete(wordId);
    setDraft(next);
    setResult(null);
    setRequestId(null);
    setReviewError("");
  }

  function candidateFor(word: BulkWord) {
    return candidateRule && candidateReady(word) ? evaluateLessonCandidate({
      wordId: word.id, displayWord: word.displayWord, skillKey: chosenSkillKey,
      senseId: selectedSenseId(word), senseSet: word.senseSet ?? null,
      morphology: word.candidateSenseFacts
        ? word.candidateSenseFacts[selectedSenseId(word)]?.morphology ?? null
        : word.candidateMorphology ?? null,
      familyLinks: word.candidateSenseFacts
        ? word.candidateSenseFacts[selectedSenseId(word)]?.familyLinks ?? []
        : word.candidateFamilyLinks ?? [],
    }) : null;
  }

  function choiceInput(word: BulkWord, choice: "apply" | "exclude") {
    const pairKey = `${chosenSkillKey}:${word.id}`;
    const isAssigned = assigned.has(pairKey);
    const isExcluded = excluded.has(pairKey);
    const draftChoice = draft.get(word.id);
    const checked = draftChoice ? draftChoice === choice : choice === "apply" ? isAssigned : isExcluded;
    const locked = (isAssigned || isExcluded) && editingWordId !== word.id;
    return <input type="checkbox" aria-label={`${choice === "apply" ? "Apply" : "Doesn't apply"}: ${word.displayWord}`}
      checked={checked} disabled={pending || !props.approvalEnabled || !word.approvable || locked
        || choice === "apply" && !isAssigned && (!candidateReady(word) || candidateFor(word)?.status === "not_match")}
      onChange={(event) => changeSelection([word.id], choice, event.target.checked)} />;
  }

  function senseChoice(word: BulkWord) {
    const senses = word.senseSet?.senses ?? [];
    if (!senses.length) return <a className="text-xs underline" href={`/admin/teaching-dictionary/${word.id}#td-definition`}>Review meanings in Overview</a>;
    const chosen = senses.find(sense => sense.id === selectedSenseId(word));
    if (senses.length === 1) return <span className="block text-xs font-normal">{chosen?.definition} · {chosen?.partOfSpeech}</span>;
    return <label className="mt-1 block text-xs font-normal">Meaning taught
      <select className={`${fieldClass} mt-1`} aria-label={`Meaning taught for ${word.displayWord}`}
        value={selectedSenseId(word)} onChange={event => {
          setSelectedSenses(previous => ({ ...previous, [`${chosenSkillKey}:${word.id}`]: event.target.value }));
          if (assigned.has(`${chosenSkillKey}:${word.id}`)) {
            if (draft.size >= MAX_SELECTION && !draft.has(word.id))
              setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`);
            else setDraft(previous => {
              const next = new Map(previous);
              if (approvedSenseIdsByPair[`${chosenSkillKey}:${word.id}`]?.includes(event.target.value)) next.delete(word.id);
              else next.set(word.id, "apply");
              return next;
            });
          }
          setReviewError(""); setRequestId(null);
        }}>
        <option value="">Choose meaning</option>
        {senses.map(sense => {
          const ipa = word.senseSet?.pronunciations.find(row => row.id === sense.pronunciationId)?.ipa ?? "";
          return <option key={sense.id} value={sense.id}>{sense.definition} · {sense.partOfSpeech}{ipa ? ` · ${ipa}` : ""}</option>;
        })}
      </select>
    </label>;
  }

  function senseDetails(word: BulkWord) {
    if (!candidateReady(word)) return <p className="mt-1 text-xs">
      {failedPage === pageIds ? "Candidate facts unavailable" : "Loading candidate facts…"}
    </p>;
    const sense = word.senseSet?.senses.find(row => row.id === selectedSenseId(word));
    const issue = bulkSenseChoiceError({ wordId: word.id, displayWord: word.displayWord,
      senseSet: word.senseSet ?? null, senseId: selectedSenseId(word) });
    const candidate = candidateFor(word);
    return <div className="mt-1 text-xs font-normal">
      {sense?.dictationSentence && <p>Sentence: {sense.dictationSentence}</p>}
      {candidate ? <p className={candidate.status === "ready" ? "text-emerald-800" : "text-amber-900"}>
        {candidate.status === "ready" ? "Lesson facts ready · assignment will approve automatically"
          : candidate.status === "not_match" ? "This meaning and spelling do not match the lesson rule."
          : candidate.issues[0] ? <a className="underline" href={candidate.issues[0].href}>{candidate.issues[0].message}</a>
          : "Review this lesson's requirements."}</p>
        : <p className={issue ? "text-amber-900" : "text-emerald-800"}>{issue ?? "Reviewed meaning facts ready"}</p>}
      {candidate?.status === "needs_facts" && <button type="button" className="mt-1 underline"
        onClick={() => { invalidateCandidatePages(); retryDetails(); router.refresh(); }}>Recheck requirements</button>}
    </div>;
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
            : choice === "deassign" ? <span>De-assign · pending</span>
            : isAssigned ? <span>{approvedSenseIdsByPair[pairKey]?.length > 1
              ? `${approvedSenseIdsByPair[pairKey].length} meanings approved · choose one for a lesson`
              : approvedSenseIdsByPair[pairKey]?.length ? "Applied to reviewed meaning" : "Assigned · meaning needs review"}</span> : isExcluded ? <span>Doesn’t apply</span>
              : !word.approvable ? <span>Word not approved</span> : null}
      {(isAssigned || isExcluded) && <button type="button" aria-label={`Edit review choice for ${word.displayWord}`}
        title="Edit review choice" disabled={pending || !props.approvalEnabled}
        className="rounded border border-[var(--border)] bg-white px-1 disabled:opacity-50"
        onClick={() => setEditingWordId(editingWordId === word.id ? null : word.id)}>✎</button>}
      {isAssigned && editingWordId === word.id && <button type="button" className="underline"
        onClick={() => removeAssignment(word.id)}>De-assign</button>}
      {isAssigned && editingWordId === word.id
        && word.senseSet?.senses.length && <button type="button" className="underline"
          onClick={() => {
            if (draft.size >= MAX_SELECTION && !draft.has(word.id)) {
              setSelectionError(`Choose up to ${MAX_SELECTION} words per confirmation.`); return;
            }
            setDraft(previous => new Map(previous).set(word.id, "apply"));
            setSelectionError(""); setResult(null); setRequestId(null);
          }}>{approvedSenseIdsByPair[pairKey]?.length ? "Add or review meaning" : "Review meaning"}</button>}
      {isAssigned && choice && <button type="button" className="underline" onClick={() => removeDraft(word.id)}>Undo</button>}
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
          {stage === 2 && <p className="mt-1 text-sm">{chosenCluster?.label} → <strong>{chosenSkill?.label}</strong></p>}
        </div>
        {stage === 2 && <button type="button" disabled={pending} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
          onClick={() => setStage(1)}>Edit skill</button>}
      </div>
      {stage === 1 && <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <SearchableFilter label="Cluster" value={clusterKey} allLabel="Choose a cluster"
          options={props.clusters.map(cluster => ({ value: cluster.key, label: cluster.label }))}
          onChange={value => { setClusterKey(value); setDraftSkillKey(""); }} />
        <SearchableFilter label="Micro-skill" value={draftSkillKey} allLabel="Choose a micro-skill"
          options={props.skills.filter(skill => skill.clusterKey === clusterKey).map(skill =>
            ({ value: skill.key, label: skill.label }))}
          onChange={setDraftSkillKey} />
        <button type="button" disabled={!draftSkillKey || opening} onClick={continueToWords}
          className="rounded-lg bg-[var(--scarlett)] px-5 py-2 font-semibold text-white disabled:opacity-50">{opening ? "Loading words…" : "Next"}</button>
      </div>}
    </section>

    {stage === 2 && <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <h2 className="text-xl font-semibold">2. Assign words to {chosenSkill?.label}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <label className="grid min-w-0 gap-1 text-sm font-medium">Letters anywhere in word
          <input className={fieldClass} type="search" value={filters.search} maxLength={256} placeholder="Search words"
            onChange={(event) => updateFilters({ search: event.target.value })} /></label>
        <label className="grid min-w-0 gap-1 text-sm font-medium">Schwa
          <select className={fieldClass} value={filters.schwa}
            onChange={(event) => updateFilters({ schwa: event.target.value as BulkFilters["schwa"] })}>
            <option value="all">All</option><option value="yes">Has schwa</option>
            <option value="no">No schwa</option><option value="unknown">Unknown</option>
          </select></label>
        <SearchableFilter label="Morpheme part" value={filters.morpheme} allLabel="All parts"
          loadOptions={loadOptions} optionsStatus={optionsStatus}
          options={parts.map((part) => ({ value: part, label: part }))}
          onChange={(morpheme) => updateFilters({ morpheme })} />
        <label className="grid min-w-0 gap-1 text-sm font-medium">Syllable count
          <select className={fieldClass} value={filters.syllables} onFocus={loadOptions} onPointerDown={loadOptions}
            onChange={(event) => updateFilters({ syllables: event.target.value })}>
            <option value="">Any count</option>{optionsStatus && <option disabled>{optionsStatus === "loading" ? "Loading counts…" : "Counts could not load"}</option>}{counts.map((count) => <option key={count} value={count}>{count}</option>)}
            <option value="unknown">Unknown</option>
          </select></label>
        <SearchableFilter label="Phoneme" value={filters.phoneme} allLabel="All phonemes"
          loadOptions={loadOptions} optionsStatus={optionsStatus}
          options={phonemes.map((phoneme) => ({ value: phoneme, label: `/${phoneme}/` }))}
          onChange={(phoneme) => updateFilters({ phoneme })} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <div className="min-w-0">
          <p className="my-3 text-sm">{pageLoading ? "Loading words…" : `${total} matching words · page ${currentPage} of ${pageCount}`}</p>
          {pageError && <p role="alert" className="text-sm">Could not load this page. <button type="button" className="underline" onClick={invalidateCandidatePages}>Retry</button></p>}
          {failedPage === pageIds && pageIds && <p role="alert" className="text-sm">
            Candidate facts could not load. <button type="button" className="underline"
              onClick={retryDetails}>Retry</button>
          </p>}
          <div className="mb-3 flex flex-wrap gap-4 text-sm md:hidden">
            {(["apply", "exclude"] as const).map((choice) => {
              const ids = selectableVisible.filter(word => choice === "exclude"
                || candidateReady(word) && candidateFor(word)?.status !== "not_match").map(word => word.id);
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
                  const ids = selectableVisible.filter(word => choice === "exclude"
                || candidateReady(word) && candidateFor(word)?.status !== "not_match").map(word => word.id);
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
                    <a className="underline" href={`/admin/teaching-dictionary/${word.id}`}>{word.displayWord}</a>{senseChoice(word)}{senseDetails(word)}{rowStatus(word)}</td>
                  <td className="break-words p-1" style={{ overflowWrap: "anywhere" }}>{selectedPronunciation(word)?.ipa ?? word.phonemeHint ?? "Unknown"}</td>
                  <td className="break-words p-1">{displayedSchwa(word) === null ? "Unknown" : displayedSchwa(word) ? "Yes" : "No"}</td>
                  <td className="break-words p-1" style={{ overflowWrap: "anywhere" }}>{word.morphemeParts.join(", ") || "Unknown"}<span className="block text-[color:var(--mid)]">Word analysis</span></td>
                  <td className="break-words p-1">{word.writtenSyllableBreakdown || "No reviewed split"}<br /><span className="text-[color:var(--mid)]">{selectedPronunciation(word)?.spokenSyllableCount ?? word.syllableCount ?? "Unknown"} spoken</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">{visible.map((word) => {
            const reviewed = assigned.has(`${chosenSkillKey}:${word.id}`)
              || excluded.has(`${chosenSkillKey}:${word.id}`) || draft.has(word.id);
            return <article key={word.id} className={`min-w-0 rounded-lg border border-[var(--border)] p-3 text-sm ${reviewed ? "bg-slate-100 text-slate-600" : ""}`}>
              <h3 className="break-words font-semibold"><a className="underline" href={`/admin/teaching-dictionary/${word.id}`}>{word.displayWord}</a></h3>
              {senseChoice(word)}
              {senseDetails(word)}
              {rowStatus(word)}
              <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt>Phoneme</dt><dd className="break-words" style={{ overflowWrap: "anywhere" }}>{selectedPronunciation(word)?.ipa ?? word.phonemeHint ?? "Unknown"}</dd>
                <dt>Schwa</dt><dd>{displayedSchwa(word) === null ? "Unknown" : displayedSchwa(word) ? "Yes" : "No"}</dd>
                <dt>Parts</dt><dd className="break-words" style={{ overflowWrap: "anywhere" }}>{word.morphemeParts.join(", ") || "Unknown"} <span className="text-[color:var(--mid)]">(word analysis)</span></dd>
                <dt>Written syllables</dt><dd>{word.writtenSyllableBreakdown || "No reviewed split"}</dd>
                <dt>Spoken syllable count</dt><dd>{selectedPronunciation(word)?.spokenSyllableCount ?? word.syllableCount ?? "Unknown"}</dd>
              </dl>
              <div className="mt-3 flex gap-5"><label className="flex items-center gap-2">{choiceInput(word, "apply")} Apply</label>
                <label className="flex items-center gap-2">{choiceInput(word, "exclude")} Doesn’t apply</label></div>
            </article>;
          })}</div>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button type="button" className="underline disabled:opacity-40" disabled={pageLoading || pageError || currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="underline disabled:opacity-40" disabled={pageLoading || pageError || currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>
        <aside className="grid self-start gap-4">
          {([{ title: "Words selected for this lesson", choice: "apply", words: applyWords },
            { title: "Doesn’t apply", choice: "exclude", words: excludeWords }] as const).map((box) =>
            <section key={box.choice} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-4">
              <h3 className="text-lg font-semibold">{box.title} ({box.words.length})</h3>
              <p className="mt-1 text-sm">{box.choice === "apply" ? "Words to assign" : "Words to mark as not applying"} to {chosenSkill?.label}.</p>
              <div className="mt-3 flex max-h-52 flex-wrap gap-2 overflow-y-auto" aria-label={box.title}>
                {box.words.length ? box.words.map((word) => <span key={word.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm">
                  <span className="break-all">{word.displayWord}{box.choice === "apply" && <span className="block text-xs">{word.senseSet?.senses.find(sense => sense.id === selectedSenseId(word))?.definition ?? "Choose meaning"}</span>}</span><button type="button" aria-label={`Remove ${word.displayWord} from ${box.title}`}
                    disabled={pending} className="font-bold disabled:opacity-50" onClick={() => removeDraft(word.id)}>×</button>
                </span>) : <p className="text-sm">Select words from the table.</p>}
              </div>
            </section>)}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-4">
            <p className="text-sm">{draft.size}/{MAX_SELECTION} pending changes
              {clearWords.length ? ` · ${clearWords.length} saved review ${clearWords.length === 1 ? "choice" : "choices"} to clear` : ""}
              {deassignWords.length ? ` · ${deassignWords.length} to de-assign` : ""}</p>
            {selectionError && <p role="alert" className="mt-3 text-sm text-rose-800">{selectionError}</p>}
            {reviewError && <p role="alert" className="mt-3 text-sm text-rose-800">{reviewError}</p>}
            {!props.approvalEnabled && <p role="alert" className="mt-3 text-sm text-amber-900">Evidence approval controls are disabled in this environment.</p>}
            <button type="button" disabled={!props.approvalEnabled || draft.size === 0 || pending}
              onClick={confirmSelection} className="mt-4 w-full rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white disabled:opacity-50">
              {pending ? "Confirming words…" : `Confirm ${draft.size} word${draft.size === 1 ? "" : "s"}`}
            </button>
            {result && <div className={`mt-4 rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
              role={result.ok ? "status" : "alert"}>
              {result.ok ? `${result.approvedCount} applied; ${result.excludedCount} marked doesn’t apply; ${result.deassignedCount} de-assigned; ${result.clearedCount} cleared${result.alreadyAssignedCount ? `; ${result.alreadyAssignedCount} already assigned` : ""}.` : result.error}
              {result.ok && (Boolean(result.queuedCount) || Boolean(result.approvedWordIds?.length)) && <p>
                {Boolean(result.queuedCount) && `${result.queuedCount} need review. `}
                <a className="underline" href={`/admin/teaching-dictionary/lesson-updates?skill=${encodeURIComponent(chosenSkillKey)}`}>Open Bulk review</a>
              </p>}
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
            const pendingChoice = draft.get(word.id);
            return <span key={word.id} className={`inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--paper)] px-3 py-1 text-sm ${pendingChoice === "deassign" || pendingChoice === "exclude" ? "opacity-50" : ""}`}>
              {word.displayWord}{pendingChoice === "deassign" || pendingChoice === "exclude" ? " · De-assign pending" : ""}
              <button type="button" aria-label={`${pendingChoice ? "Undo pending change for" : "De-assign"} ${word.displayWord} from ${chosenSkill?.label}`}
                title={pendingChoice ? "Undo pending change" : "De-assign on confirmation"} disabled={pending || !props.approvalEnabled}
                className="font-bold disabled:opacity-50" onClick={() => pendingChoice ? removeDraft(word.id) : removeAssignment(word.id)}>{pendingChoice ? "Undo" : "×"}</button>
            </span>;
          }) : <p className="text-sm">No assigned words yet.</p>}
        </div>
        {reviewError && <p role="alert" className="mt-3 text-sm text-rose-800">{reviewError}</p>}
      </details>
    </section>}
  </div>;
}
