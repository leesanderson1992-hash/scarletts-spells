"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AppDialog } from "@/components/app-dialog";
import Link from "next/link";

import { enqueueIntakeDemandRecheck, setIntakeDemandArchived } from "./actions";
import { FACET_KEYS, type Facet, type FacetKey } from "./readiness-projection";
import type { ReadinessRow, ReadinessView } from "./read-model";
import { readinessHref, type ReadinessControls, type SortKey } from "./readiness-controls";

const LABELS: Record<FacetKey, string> = {
  resolver: "Resolver", teaching: "Teaching content", dictionary: "Dictionary",
  metadata: "Metadata", lesson: "ADLE lesson",
};

function date(value: string | null) {
  if (!value) return "Not evaluated";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short",
  }).format(parsed);
}

function Indicator({ facet, label }: { facet: Facet; label: string }) {
  const status = facet.state === "complete" ? "Complete" : facet.state === "missing" ? "Missing" : "Not yet checkable";
  return <span className={`adle-admin-indicator is-${facet.state}`} title={`${label}: ${status}`}>
    <span aria-hidden="true">{facet.state === "complete" ? "✓" : facet.state === "missing" ? "!" : "—"}</span>
    <span className="sr-only">{label}: {status}</span>
  </span>;
}

function DetailDialog({ row, onClose }: { row: ReadinessRow; onClose: () => void }) {
  const incomplete = FACET_KEYS.filter((key) => row.facets[key].state !== "complete");
  return <AppDialog open onOpenChange={(open) => { if (!open) onClose(); }}
    title={`${row.word} · readiness details`} eyebrow={row.microSkillKey} size="lg"
    description={<span>{row.routeId} {row.routeVersion} · Last evaluated {date(row.lastEvaluatedAt)}</span>}
    footer={<button type="button" className="adle-admin-dialog-close" onClick={onClose}>Close</button>}>
    <div className="adle-admin-dialog-body">
      {incomplete.length ? incomplete.map((key) => <section key={key} className="adle-admin-detail-section">
        <h4>{LABELS[key]} <span className="text-xs font-normal text-[#69717b]">{row.facets[key].state === "unknown" ? "Not yet checkable" : "Missing"}</span></h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#414a55]">
          {row.facets[key].details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      </section>) : <p className="text-sm text-[#414a55]">All five readiness checks are complete.</p>}
      <div className="mt-5 border-t border-[#e5e8eb] pt-4 text-sm text-[#59616b]">
        <p><strong>{row.occurrences}</strong> authentic occurrences · <strong>{row.usersWaiting}</strong> users waiting · Last seen {date(row.lastSeenAt)}</p>
        <h4 className="mt-4 font-semibold text-[#20242a]">Recent audit history</h4>
        {row.history.length ? <ul className="mt-2 space-y-1">
          {row.history.map((item) => <li key={item.id}>{item.type.replaceAll("_", " ")} · {date(item.at)}</li>)}
        </ul> : <p className="mt-2">No events recorded.</p>}
      </div>
    </div>
  </AppDialog>;
}

function SortHeading({ field, label, className = "", controls, view, search }: {
  field: SortKey; label: string; className?: string; controls: ReadinessControls;
  view: ReadinessView; search: string;
}) {
  const active = controls.sort === field;
  const direction = active && controls.direction === "asc" ? "desc" : "asc";
  return <th scope="col" className={className} aria-sort={active ? controls.direction === "asc" ? "ascending" : "descending" : "none"}>
    <Link className="adle-admin-sort-link" href={readinessHref({ ...controls, view, search, sort: field, direction })}
      aria-label={`Sort ${label} ${direction === "asc" ? "ascending" : "descending"}`}>
      {label}<span className={`adle-admin-sort-arrows ${active ? "is-active" : ""}`} aria-hidden="true">
        {active ? controls.direction === "asc" ? "↑" : "↓" : "↕"}</span>
    </Link>
  </th>;
}

export function ReadinessTable({ rows, view, controls = {
  microSkill: "", without: "all", sort: "usersWaiting", direction: "desc",
}, search = "", preview = false }: { rows: ReadinessRow[]; view: ReadinessView;
  controls?: ReadinessControls; search?: string; preview?: boolean }) {
  const [selected, setSelected] = useState<ReadinessRow | null>(null);
  const [optionsMenu, setOptionsMenu] = useState<{
    row: ReadinessRow; top: number; left: number;
  } | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!optionsMenu) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!optionsMenuRef.current?.contains(event.target as Node)) setOptionsMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOptionsMenu(null); optionsTriggerRef.current?.focus(); }
    };
    const closeOnScroll = () => setOptionsMenu(null);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    const firstItem = optionsMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    firstItem?.focus();
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [optionsMenu]);

  return <>
    <div className="adle-admin-table-wrap" role="region" aria-label="ADLE word readiness table" tabIndex={0}>
      <table className="adle-admin-table">
        <thead><tr>
          <SortHeading field="word" label="Word" controls={controls} view={view} search={search} />
          <SortHeading field="microSkillKey" label="Micro skill" controls={controls} view={view} search={search} />
          <SortHeading field="occurrences" label="Occurrences" className="number" controls={controls} view={view} search={search} />
          <SortHeading field="usersWaiting" label="Users Waiting" className="number" controls={controls} view={view} search={search} />
          {FACET_KEYS.map((key) => <SortHeading key={key} field={key} label={LABELS[key]} className="check" controls={controls} view={view} search={search} />)}
          <th scope="col" className="options"><span className="sr-only">Options</span></th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}>
          <th scope="row" className="word">{row.word}</th>
          <td className="skill" title={row.microSkillKey}>{row.microSkillKey.replace(/^D4_/, "").replaceAll("_", " ").toLowerCase()}</td>
          <td className="number">{row.occurrences}</td><td className="number">{row.usersWaiting}</td>
          {FACET_KEYS.map((key) => <td key={key} className="check"><Indicator facet={row.facets[key]} label={LABELS[key]} /></td>)}
          <td className="options"><div className="adle-admin-options-anchor">
            <button type="button" className="adle-admin-options-button"
              aria-label={`Options for ${row.word}, ${row.microSkillKey}`} aria-expanded={optionsMenu?.row.key === row.key}
              aria-haspopup="menu" onClick={(event) => {
                if (optionsMenu?.row.key === row.key) return setOptionsMenu(null);
                const bounds = event.currentTarget.getBoundingClientRect();
                optionsTriggerRef.current = event.currentTarget;
                setOptionsMenu({ row, top: bounds.bottom + 6, left: Math.max(12, bounds.right - 172) });
              }}>⋯</button>
          </div></td>
        </tr>)}</tbody>
      </table>
      {!rows.length ? <p className="adle-admin-empty">No words match this view. Try another filter or search.</p> : null}
    </div>
    {optionsMenu ? createPortal(<div ref={optionsMenuRef} className="adle-admin-dropdown" role="menu"
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = [...(optionsMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
          event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items[next].focus();
      }}
      aria-label={`Options for ${optionsMenu.row.word}`} style={{ top: optionsMenu.top, left: optionsMenu.left }}>
      <button type="button" role="menuitem" onClick={() => { setSelected(optionsMenu.row); setOptionsMenu(null); }}>View details</button>
      {!preview && optionsMenu.row.facets.dictionary.state === "complete" && optionsMenu.row.facets.resolver.state === "missing" ?
        <Link role="menuitem" href={`/admin/canonical-mappings/resolve?word=${encodeURIComponent(optionsMenu.row.word)}&skill=${encodeURIComponent(optionsMenu.row.microSkillKey)}`}>Add to resolver</Link> : null}
      {preview ? <button type="button" role="menuitem" disabled title="Unavailable in sample preview">Recheck · sample only</button> :
        optionsMenu.row.waitingCandidates > 0 ? <form action={enqueueIntakeDemandRecheck}>
        <input type="hidden" name="word" value={optionsMenu.row.word} /><input type="hidden" name="micro_skill_key" value={optionsMenu.row.microSkillKey} />
        <button type="submit" role="menuitem">Recheck</button>
      </form> : <span className="adle-admin-menu-note">No users to recheck</span>}
      {preview ? <button type="button" role="menuitem" disabled title="Unavailable in sample preview">Archive · sample only</button> :
        view !== "resolved" ? <form action={setIntakeDemandArchived}>
        <input type="hidden" name="word" value={optionsMenu.row.word} /><input type="hidden" name="micro_skill_key" value={optionsMenu.row.microSkillKey} />
        <input type="hidden" name="archive" value={optionsMenu.row.archived ? "false" : "true"} />
        <button type="submit" role="menuitem">{optionsMenu.row.archived ? "Restore" : "Archive"}</button>
      </form> : null}
    </div>, document.body) : null}
    {selected ? <DetailDialog row={selected} onClose={() => setSelected(null)} /> : null}
  </>;
}
