"use client";

import { useRef, useState } from "react";

type Option = { key: string; label: string };

export function SearchableAssignmentMenu({ label, value, options, disabled, onChange, onCreate }: {
  label: string;
  value: string;
  options: readonly Option[];
  disabled?: boolean;
  onChange: (key: string) => void;
  onCreate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = options.find(option => option.key === value);
  const search = query.trim().toLocaleLowerCase();
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(search));
  function close(restoreFocus = false) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) trigger.current?.focus();
  }

  return <div className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }} onKeyDown={event => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      close(true);
    }
  }}>
    <button ref={trigger} type="button" aria-expanded={open} disabled={disabled}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm disabled:opacity-50"
      onClick={() => open ? close() : setOpen(true)}>
      {selected?.label ?? `Choose ${label.toLowerCase()}`} <span aria-hidden="true">▾</span>
    </button>
    {open && <div aria-label={label} className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg">
      <input autoFocus type="search" aria-label={`Search ${label.toLowerCase()}s`} placeholder={`Search ${label.toLowerCase()}s`}
        className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        value={query} onChange={event => setQuery(event.target.value)} />
      <ul className="mt-1 max-h-60 overflow-y-auto">
        {matches.map(option => <li key={option.key}>
          <button type="button" aria-pressed={option.key === value}
            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--paper)] aria-pressed:bg-[var(--mist)]"
            onClick={() => { close(true); onChange(option.key); }}>{option.label}</button>
        </li>)}
      </ul>
      {onCreate && <button type="button" className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-[var(--scarlett)] hover:bg-[var(--paper)]"
        onClick={() => { close(true); onCreate(); }}>+ Create new {label.toLowerCase()}</button>}
      {!matches.length && <p role="status" className="px-3 py-2 text-sm text-[color:var(--mid)]">No matches</p>}
    </div>}
  </div>;
}
