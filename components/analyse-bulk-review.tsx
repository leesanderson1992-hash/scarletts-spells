"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { updateMisspellingClassification } from "@/app/analyse/actions";

type SelectionContextValue = {
  selectedIds: string[];
  allVisibleIds: string[];
  toggleIds: (ids: string[]) => void;
  selectAll: () => void;
  clearAll: () => void;
  isSelected: (ids: string[]) => boolean;
};

const AnalyseBulkSelectionContext = createContext<SelectionContextValue | null>(
  null,
);

function useAnalyseBulkSelection() {
  const context = useContext(AnalyseBulkSelectionContext);

  if (!context) {
    throw new Error("Bulk review selection must be used inside its provider.");
  }

  return context;
}

type AnalyseBulkReviewProviderProps = {
  allVisibleIds: string[];
  children: ReactNode;
};

export function AnalyseBulkReviewProvider({
  allVisibleIds,
  children,
}: AnalyseBulkReviewProviderProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const dedupedVisibleIds = useMemo(
    () => Array.from(new Set(allVisibleIds)),
    [allVisibleIds],
  );

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => dedupedVisibleIds.includes(id)),
    );
  }, [dedupedVisibleIds]);

  const value = useMemo<SelectionContextValue>(() => {
    return {
      selectedIds,
      allVisibleIds: dedupedVisibleIds,
      toggleIds(ids) {
        const dedupedIds = Array.from(new Set(ids));
        setSelectedIds((current) => {
          const hasAll = dedupedIds.every((id) => current.includes(id));
          if (hasAll) {
            return current.filter((id) => !dedupedIds.includes(id));
          }

          return Array.from(new Set([...current, ...dedupedIds]));
        });
      },
      selectAll() {
        setSelectedIds(dedupedVisibleIds);
      },
      clearAll() {
        setSelectedIds([]);
      },
      isSelected(ids) {
        const dedupedIds = Array.from(new Set(ids));
        return dedupedIds.length > 0 && dedupedIds.every((id) => selectedIds.includes(id));
      },
    };
  }, [dedupedVisibleIds, selectedIds]);

  return (
    <AnalyseBulkSelectionContext.Provider value={value}>
      {children}
    </AnalyseBulkSelectionContext.Provider>
  );
}

type AnalyseBulkReviewBarProps = {
  redirectChildId: string;
  redirectPath?: string;
};

function SelectionIcon({
  kind,
}: {
  kind: "tick" | "cross";
}) {
  if (kind === "tick") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 stroke-current">
        <path
          d="M4.5 10.5 8 14l7.5-8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 stroke-current">
      <path
        d="m6 6 8 8m0-8-8 8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function AnalyseBulkReviewBar({
  redirectChildId,
  redirectPath = "/analyse",
}: AnalyseBulkReviewBarProps) {
  const { selectedIds, allVisibleIds, selectAll, clearAll } =
    useAnalyseBulkSelection();
  const selectedCount = selectedIds.length;

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="sticky top-4 z-10 flex justify-center">
      <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={selectAll}
          disabled={allVisibleIds.length === 0}
          className="inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-zinc-500 transition hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          All
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
        >
          Clear
        </button>

        <form action={updateMisspellingClassification}>
          <input
            type="hidden"
            name="misspelling_instance_ids"
            value={selectedIds.join(",")}
          />
          <input type="hidden" name="redirect_child" value={redirectChildId} />
          <input type="hidden" name="redirect_path" value={redirectPath} />
        </form>
        <form action={updateMisspellingClassification}>
          <input
            type="hidden"
            name="misspelling_instance_ids"
            value={selectedIds.join(",")}
          />
          <input type="hidden" name="redirect_child" value={redirectChildId} />
          <input type="hidden" name="redirect_path" value={redirectPath} />
          <input type="hidden" name="mark_reviewed" value="on" />
          <button
            type="submit"
            title="Mark selected items as reviewed"
            aria-label="Mark selected items as reviewed"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700"
          >
            <SelectionIcon kind="tick" />
          </button>
        </form>
        <form action={updateMisspellingClassification}>
          <input
            type="hidden"
            name="misspelling_instance_ids"
            value={selectedIds.join(",")}
          />
          <input type="hidden" name="redirect_child" value={redirectChildId} />
          <input type="hidden" name="redirect_path" value={redirectPath} />
          <input type="hidden" name="flag_false_positive" value="on" />
          <input type="hidden" name="mark_reviewed" value="on" />
          <button
            type="submit"
            title="Mark selected items as not actually wrong"
            aria-label="Mark selected items as not actually wrong"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
          >
            <SelectionIcon kind="cross" />
          </button>
        </form>
      </div>
    </div>
  );
}

type AnalyseBulkSelectionCheckboxProps = {
  ids: string[];
};

export function AnalyseBulkSelectionCheckbox({
  ids,
}: AnalyseBulkSelectionCheckboxProps) {
  const { isSelected, toggleIds } = useAnalyseBulkSelection();
  const checked = isSelected(ids);

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => toggleIds(ids)}
        className="h-4 w-4 rounded border-zinc-300"
      />
      <span>Select</span>
    </label>
  );
}
