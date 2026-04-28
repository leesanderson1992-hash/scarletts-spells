"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type FamilyComboboxOption = {
  value: string;
  label: string;
  category?: string;
  description?: string;
  teachingNote?: string;
  recommendationReason?: string;
};

type FamilyComboboxProps = {
  name: string;
  options?: FamilyComboboxOption[];
  allOptions?: FamilyComboboxOption[];
  recommendedOptions?: FamilyComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
};

const FamilyComboboxOptionsContext = createContext<FamilyComboboxOption[] | null>(
  null,
);

export function FamilyComboboxProvider({
  options,
  children,
}: {
  options: FamilyComboboxOption[];
  children: ReactNode;
}) {
  return (
    <FamilyComboboxOptionsContext.Provider value={options}>
      {children}
    </FamilyComboboxOptionsContext.Provider>
  );
}

function getCompactPreview(option: FamilyComboboxOption | null) {
  if (!option) {
    return null;
  }

  const preview = option.teachingNote || option.description || "";
  if (!preview) {
    return null;
  }

  return preview.length > 110 ? `${preview.slice(0, 107).trimEnd()}...` : preview;
}

export function FamilyCombobox({
  name,
  options: directOptions,
  allOptions: directAllOptions,
  recommendedOptions = [],
  defaultValue = "",
  placeholder = "Search word families",
}: FamilyComboboxProps) {
  const contextOptions = useContext(FamilyComboboxOptionsContext);
  const options = directOptions ?? contextOptions ?? [];
  const allOptions = directAllOptions ?? contextOptions ?? options;
  const defaultOption =
    allOptions.find((option) => option.value === defaultValue) ?? null;
  const [query, setQuery] = useState(defaultOption?.label ?? "");
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [showAllFamilies, setShowAllFamilies] = useState(false);

  useEffect(() => {
    const nextDefaultOption =
      allOptions.find((option) => option.value === defaultValue) ?? null;
    setSelectedValue(defaultValue);
    setQuery(nextDefaultOption?.label ?? "");
    setShowAllFamilies(false);
  }, [allOptions, defaultValue]);

  const filteredOptions = useMemo(() => {
    const sourceOptions = showAllFamilies ? allOptions : options;
    const normalisedQuery = query.trim().toLowerCase();

    if (!normalisedQuery) {
      return sourceOptions;
    }

    return sourceOptions.filter((option) => {
      return [
        option.label,
        option.category ?? "",
        option.teachingNote ?? "",
        option.description ?? "",
        option.value,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalisedQuery);
    });
  }, [allOptions, options, query, showAllFamilies]);

  const selectedOption =
    allOptions.find((option) => option.value === selectedValue) ?? null;
  const groupedOptions = useMemo(() => {
    const grouped = new Map<string, FamilyComboboxOption[]>();

    filteredOptions.forEach((option) => {
      const group = option.category || "Other";
      const existing = grouped.get(group) ?? [];
      existing.push(option);
      grouped.set(group, existing);
    });

    return Array.from(grouped.entries());
  }, [filteredOptions]);
  const isSearchMode = query.trim().length > 0;
  const visibleRecommendedOptions = useMemo(() => {
    if (recommendedOptions.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    return recommendedOptions.filter((option) => {
      if (seen.has(option.value)) {
        return false;
      }

      seen.add(option.value);
      return true;
    });
  }, [recommendedOptions]);

  return (
    <div className="relative grid gap-2">
      <input type="hidden" name={name} value={selectedValue} />
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedValue("");
          setIsOpen(true);
          setShowAllFamilies(false);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setIsOpen(false);
            if (!selectedValue) {
              const matchingOption =
                options.find(
                  (option) => option.label.toLowerCase() === query.trim().toLowerCase(),
                ) ??
                allOptions.find(
                (option) => option.label.toLowerCase() === query.trim().toLowerCase(),
                );

              if (matchingOption) {
                setSelectedValue(matchingOption.value);
                setQuery(matchingOption.label);
              } else if (defaultOption) {
                setQuery(defaultOption.label);
                setSelectedValue(defaultOption.value);
              } else {
                setQuery("");
              }
            }
          }, 120);
        }}
        placeholder={placeholder}
        className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none transition focus:border-zinc-950"
      />

      {getCompactPreview(selectedOption) ? (
        <p className="text-xs leading-5 text-zinc-500">
          {getCompactPreview(selectedOption)}
        </p>
      ) : null}

      {isOpen ? (
        <div className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSelectedValue("");
              setQuery("");
              setIsOpen(false);
            }}
            className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition hover:bg-zinc-50"
          >
            <span className="text-sm font-medium text-zinc-900">
              Use detected family
            </span>
          </button>

          {!isSearchMode && !showAllFamilies ? (
            <div className="pt-1">
              {visibleRecommendedOptions.length > 0 ? (
                <>
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Recommended first
                  </p>
                  {visibleRecommendedOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedValue(option.value);
                        setQuery(option.label);
                        setIsOpen(false);
                      }}
                      className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition hover:bg-zinc-50"
                    >
                      <span className="text-sm font-medium text-zinc-900">
                        {option.label}
                      </span>
                      {option.recommendationReason ? (
                        <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                          {option.recommendationReason}
                        </span>
                      ) : null}
                      {getCompactPreview(option) ? (
                        <span className="mt-1 text-xs leading-5 text-zinc-500">
                          {getCompactPreview(option)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </>
              ) : (
                <p className="px-3 py-2 text-sm text-zinc-500">
                  No strong family recommendations yet for this choice.
                </p>
              )}

              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowAllFamilies(true)}
                className="mt-2 flex w-full items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                <span>Show all lesson families</span>
                <span aria-hidden="true" className="text-zinc-400">
                  →
                </span>
              </button>
            </div>
          ) : groupedOptions.length > 0 ? (
            groupedOptions.map(([group, groupOptions]) => (
              <div key={group} className="pt-1">
                {!isSearchMode && showAllFamilies && group === groupedOptions[0]?.[0] ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowAllFamilies(false)}
                    className="mb-2 flex w-full items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    <span>Back to recommended families</span>
                    <span aria-hidden="true" className="text-zinc-400">
                      ←
                    </span>
                  </button>
                ) : null}
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {group}
                </p>
                {groupOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedValue(option.value);
                      setQuery(option.label);
                      setIsOpen(false);
                    }}
                    className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition hover:bg-zinc-50"
                  >
                    <span className="text-sm font-medium text-zinc-900">
                      {option.label}
                    </span>
                    {getCompactPreview(option) ? (
                      <span className="mt-1 text-xs leading-5 text-zinc-500">
                        {getCompactPreview(option)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-zinc-500">
              No families match that search yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
