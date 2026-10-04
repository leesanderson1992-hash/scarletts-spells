"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AppDialog } from "@/components/app-dialog";
import { SEED_IMPORT_TEMPLATE_HEADER } from "@/lib/writing-engine/seed-import-columns";
import { SeedImportUploadPanel } from "../seed-import-review/upload-panel";
import {
  confirmResolution,
  deleteResolution,
  moveResolutionToNoMatchingSkill,
  reopenResolution,
  saveResolutionDraft,
  setResolutionResolverVisibility,
} from "./resolution-actions";
import type { ResolutionFilters, ResolutionRow, SkillOption } from "./resolution-read-model";

type Family = { skill_family_key: string; display_name: string };
type Cluster = { skill_family_key: string; skill_cluster_key: string; display_name: string };
type DialogKind = "details" | "edit" | "confirm" | "reopen" | "visibility" | "noSkill" | "delete";

function displayDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

function displayStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function SourceList({ row }: { row: ResolutionRow }) {
  return <div className="space-y-3">
    {row.sources.length ? row.sources.map((source) => <details key={`${source.type}:${source.id}`} className="adle-admin-detail-section">
      <summary className="cursor-pointer text-sm font-bold">
        {displayStatus(source.type)} · {displayStatus(source.status)} · {displayDate(source.createdAt)}
      </summary>
      <p className="mt-2 text-sm">Original: {source.originalMisspelling} → {source.originalCorrection}</p>
      {source.note ? <p className="mt-2 text-sm text-[#59616b]">{source.note}</p> : null}
      <p className="mt-2 break-all text-xs text-[#69717b]">Source ID: {source.id}</p>
      <pre className="resolution-source-json">{JSON.stringify(source.details, null, 2)}</pre>
    </details>) : <p className="text-sm text-[#59616b]">Direct canonical mapping; no linked intake record.</p>}
    {row.mappingId ? <section className="adle-admin-detail-section text-sm">
      <h4>Canonical mapping</h4>
      <p className="mt-2 break-all">{row.mappingId}</p>
      <p>{displayStatus(row.mappingStatus ?? "unknown")} · Resolver {displayStatus(row.visibilityStatus ?? "unknown")}</p>
    </section> : null}
    {row.audit.length ? <section className="adle-admin-detail-section text-sm">
      <h4>Recent audit history</h4>
      <ul className="mt-2 space-y-1">{row.audit.map((event, index) =>
        <li key={`${event.created_at}:${index}`}>{displayStatus(event.event_type)} · {displayDate(event.created_at)}
          {event.note ? ` · ${event.note}` : ""}</li>)}</ul>
    </section> : null}
  </div>;
}

function EditForm({ row, skills, families, clusters, readOnlyPreview }: {
  row: ResolutionRow; skills: SkillOption[]; families: Family[]; clusters: Cluster[]; readOnlyPreview: boolean;
}) {
  const [family, setFamily] = useState(row.familyKey ?? "");
  const [cluster, setCluster] = useState(row.clusterKey ?? "");
  const [skill, setSkill] = useState(row.skillKey ?? "");
  const availableClusters = clusters.filter((option) => !family || option.skill_family_key === family);
  const availableSkills = skills.filter((option) => (!family || option.skill_family_key === family) &&
    (!cluster || option.skill_cluster_key === cluster));
  return <form action={saveResolutionDraft} className="resolution-dialog-form">
    <input type="hidden" name="item_id" value={row.id} />
    <label>Misspelling<input name="misspelling" required maxLength={200} defaultValue={row.misspelling} /></label>
    <label>Correction<input name="correction" required maxLength={200} defaultValue={row.correction} /></label>
    <label>Family<select value={family} onChange={(event) => { setFamily(event.target.value); setCluster(""); setSkill(""); }}>
      <option value="">Choose family</option>
      {families.map((option) => <option key={option.skill_family_key} value={option.skill_family_key}>{option.display_name}</option>)}
    </select></label>
    <label>Cluster<select value={cluster} onChange={(event) => { setCluster(event.target.value); setSkill(""); }}>
      <option value="">Choose cluster</option>
      {availableClusters.map((option) => <option key={`${option.skill_family_key}:${option.skill_cluster_key}`}
        value={option.skill_cluster_key}>{option.display_name}</option>)}
    </select></label>
    <label>Skill<select name="micro_skill_key" value={skill} onChange={(event) => setSkill(event.target.value)}>
      <option value="">Choose skill before confirming</option>
      {availableSkills.map((option) => <option key={option.micro_skill_key} value={option.micro_skill_key}>{option.display_name}</option>)}
    </select></label>
    <button type="submit" disabled={readOnlyPreview} className="adle-admin-primary">Save pending changes</button>
  </form>;
}

function ActionDialog({ kind, row, onClose, onPreviewAction, skills, families, clusters, readOnlyPreview }: {
  kind: DialogKind; row: ResolutionRow; onClose: () => void;
  onPreviewAction: (kind: "confirm" | "reopen" | "visibility" | "noSkill", row: ResolutionRow) => void;
  skills: SkillOption[]; families: Family[]; clusters: Cluster[]; readOnlyPreview: boolean;
}) {
  const title = {
    details: "Spelling details", edit: "Edit pending mapping", confirm: "Confirm canonical mapping",
    reopen: "Reopen confirmed mapping", visibility: row.resolverEnabled ? "Remove from Resolver" : "Add to Resolver",
    noSkill: "No Matching Skill",
    delete: "Permanently delete spelling evidence",
  }[kind];
  return <AppDialog open onOpenChange={(open) => { if (!open) onClose(); }}
    title={title} eyebrow={`${row.misspelling} → ${row.correction}`} size="lg">
    <div className="adle-admin-dialog-body">
      {kind === "details" ? <SourceList row={row} /> : null}
      {readOnlyPreview && kind !== "details" ? <p className="adle-admin-alert">Preview only. Mapping changes reset when this page reloads.</p> : null}
      {kind === "edit" ? <EditForm row={row} skills={skills} families={families} clusters={clusters} readOnlyPreview={readOnlyPreview} /> : null}
      {kind === "confirm" ? <form action={confirmResolution} className="resolution-dialog-form">
        <input type="hidden" name="item_id" value={row.id} />
        <p>Are you sure that</p>
        <dl className="resolution-confirm-summary">
          <div><dt>Misspelling:</dt><dd>{row.misspelling}</dd></div>
          <div><dt>Real Spelling:</dt><dd>{row.correction}</dd></div>
          <div><dt>Belongs in the teaching category:</dt><dd>{[row.familyName, row.clusterName, row.skillName].filter(Boolean).join(" / ") || "No skill selected"}</dd></div>
        </dl>
        {!row.skillName ? <p className="adle-admin-alert">Choose a valid skill with Edit before confirming.</p> : null}
        <button type={readOnlyPreview ? "button" : "submit"} onClick={readOnlyPreview ? () => onPreviewAction("confirm", row) : undefined}
          disabled={!row.skillName} className="adle-admin-primary">Confirm mapping</button>
      </form> : null}
      {kind === "reopen" ? <form action={reopenResolution} className="resolution-dialog-form">
        <input type="hidden" name="item_id" value={row.id} />
        <p>Resolver use will pause immediately. Edit the pending row, then confirm it again.</p>
        <button type={readOnlyPreview ? "button" : "submit"} onClick={readOnlyPreview ? () => onPreviewAction("reopen", row) : undefined}
          className="adle-admin-primary">Reopen for editing</button>
      </form> : null}
      {kind === "visibility" ? <form action={setResolutionResolverVisibility} className="resolution-dialog-form">
        <input type="hidden" name="mapping_id" value={row.mappingId ?? ""} />
        <input type="hidden" name="mode" value={row.resolverEnabled ? "disable" : "enable"} />
        <p>{row.resolverEnabled ? "Remove this confirmed pair from resolver use." : "Make this confirmed pair available to the resolver."}</p>
        <button type={readOnlyPreview ? "button" : "submit"} onClick={readOnlyPreview ? () => onPreviewAction("visibility", row) : undefined}
          className="adle-admin-primary">{row.resolverEnabled ? "Remove from Resolver" : "Add to Resolver"}</button>
      </form> : null}
      {kind === "noSkill" ? <form action={moveResolutionToNoMatchingSkill} className="resolution-dialog-form">
        <input type="hidden" name="item_id" value={row.id} />
        <p>Move <strong>{row.misspelling} → {row.correction}</strong> to the No Matching Skill table? This removes it from the canonical resolver queue while preserving its linked evidence.</p>
        {row.mappingId ? <p>The disabled historical mapping stays disabled and remains available for audit.</p> : null}
        <button type={readOnlyPreview ? "button" : "submit"} onClick={readOnlyPreview ? () => onPreviewAction("noSkill", row) : undefined}
          className="adle-admin-primary">Move to No Matching Skill</button>
      </form> : null}
      {kind === "delete" ? <form action={deleteResolution} className="resolution-dialog-form">
        <input type="hidden" name="item_id" value={row.id} />
        <p>The following records and their dedicated decisions and audit events will be permanently removed:</p>
        <ul className="resolution-delete-list">
          {row.mappingId ? <li>Canonical mapping: <code>{row.mappingId}</code> (including earlier versions linked to this resolution)</li> : null}
          {row.sources.filter((source) => source.type !== "candidate").map((source) =>
            <li key={`${source.type}:${source.id}`}>{displayStatus(source.type)} intake: <code>{source.id}</code></li>)}
          {!row.mappingId && row.sources.every((source) => source.type === "candidate") ? <li>Resolution row: <code>{row.id}</code></li> : null}
        </ul>
        {row.sources.some((source) => source.type === "candidate") ?
          <p>Parent verified candidate evidence remains attached to the learner history.</p> : null}
        <p>ADLE canonical links are detached. Child learning records, parent submissions, and writing samples remain.</p>
        <label>Type <strong>DELETE {row.misspelling}</strong> to confirm
          <input name="confirmation" required autoComplete="off" /></label>
        <button type="submit" disabled={readOnlyPreview} className="resolution-delete-button">Delete permanently</button>
      </form> : null}
    </div>
  </AppDialog>;
}

function previewSortGroup(row: ResolutionRow) {
  if (row.status === "pending") return 0;
  if (row.status === "confirmed") return row.resolverEnabled ? 2 : 1;
  return 3;
}

export function ResolutionWorkspace({ rows, skills, families, clusters, total, readOnlyPreview = false, previewFilters }: {
  rows: ResolutionRow[]; skills: SkillOption[]; families: Family[]; clusters: Cluster[]; total: number;
  readOnlyPreview?: boolean; previewFilters?: ResolutionFilters;
}) {
  const [previewRows, setPreviewRows] = useState(rows);
  const [importOpen, setImportOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<{ kind: DialogKind; row: ResolutionRow } | null>(null);
  const [menu, setMenu] = useState<{ row: ResolutionRow; top: number; left: number } | null>(null);
  const visibleRows = readOnlyPreview ? previewRows.filter((row) =>
    (!previewFilters || previewFilters.status === "all" || previewFilters.status === "open" && row.status !== "closed" || row.status === previewFilters.status) &&
    (!previewFilters || previewFilters.resolver === "all" || row.resolverEnabled === (previewFilters.resolver === "yes")))
    .sort((left, right) => previewSortGroup(left) - previewSortGroup(right) || right.updatedAt.localeCompare(left.updatedAt)) : rows;
  const onPreviewAction = (kind: "confirm" | "reopen" | "visibility" | "noSkill", row: ResolutionRow) => {
    if (!readOnlyPreview) return;
    setPreviewRows((current) => kind === "noSkill" ? current.filter((item) => item.id !== row.id) : current.map((item) => item.id !== row.id ? item : kind === "confirm" ? {
      ...item, status: "confirmed", resolverEnabled: false, mappingId: item.mappingId ?? `preview-${item.id}`,
      mappingStatus: "active", visibilityStatus: "hidden", updatedAt: new Date().toISOString(),
    } : kind === "reopen" ? {
      ...item, status: "pending", resolverEnabled: false, visibilityStatus: "hidden", updatedAt: new Date().toISOString(),
    } : {
      ...item, resolverEnabled: !item.resolverEnabled, visibilityStatus: item.resolverEnabled ? "hidden" : "visible",
      updatedAt: new Date().toISOString(),
    }));
    setSelected(null);
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(".resolution-row-menu, .adle-admin-options-button")) {
        setMenu(null);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menu]);
  const show = (kind: DialogKind, row: ResolutionRow) => { setMenu(null); setSelected({ kind, row }); };
  return <>
    <div className="resolution-table-top">
      <p>{readOnlyPreview ? visibleRows.length : total} {(readOnlyPreview ? visibleRows.length : total) === 1 ? "spelling pair" : "spelling pairs"}</p>
      <div className="resolution-table-actions">
        {readOnlyPreview ? <span className="adle-admin-secondary" aria-disabled="true">Export canonical CSV</span> :
          <Link className="adle-admin-secondary" href="/admin/canonical-mappings/export">Export canonical CSV</Link>}
        <div className="resolution-import-anchor">
          <button type="button" className="adle-admin-primary" aria-expanded={importOpen}
            onClick={() => setImportOpen(!importOpen)}>Import <span aria-hidden="true">⌄</span></button>
          {importOpen ? <div className="resolution-import-menu">
            <button type="button" onClick={() => { setImportOpen(false); setUploadOpen(true); }}>Upload</button>
            {readOnlyPreview ? <a download="seed-import-template.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(`${SEED_IMPORT_TEMPLATE_HEADER}\r\n`)}`}
              onClick={() => setImportOpen(false)}>Download Template</a> :
              <Link href="/admin/canonical-mappings/seed-template" onClick={() => setImportOpen(false)}>Download Template</Link>}
          </div> : null}
        </div>
      </div>
    </div>
    <div className="adle-admin-table-wrap">
      <table className="adle-admin-table resolution-table">
        <thead><tr>
          <th scope="col">Misspelling</th><th scope="col">Correction</th><th scope="col">Family</th>
          <th scope="col">Cluster</th><th scope="col">Skill</th><th scope="col">Status</th>
          <th scope="col">Source</th><th scope="col" className="check">Resolver Enabled</th>
          <th scope="col" className="options">Actions</th>
        </tr></thead>
        <tbody>{visibleRows.map((row) => <tr key={row.id} className={row.status === "pending" ? "resolution-pending-row" : row.status === "closed" ? "resolution-closed-row" : ""}>
          <th scope="row" className="word">{row.misspelling}</th>
          <td>{row.correction}</td><td>{row.familyName ?? "—"}</td><td>{row.clusterName ?? "—"}</td>
          <td>{row.skillName ?? <span className="text-[#9a1247]">Needs skill</span>}</td>
          <td><span className={`resolution-status resolution-status-${row.status}`}>{displayStatus(row.status)}</span></td>
          <td>{row.sources.length ? [...new Set(row.sources.map((source) => displayStatus(source.type)))].join(", ") : "Direct"}</td>
          <td className="check">{row.resolverEnabled ? <span className="adle-admin-indicator is-complete" title="Resolver enabled">
            <span aria-hidden="true">✓</span><span className="sr-only">Yes</span></span> : <span aria-label="Resolver disabled">—</span>}</td>
          <td className="options"><button type="button" className="adle-admin-options-button"
            aria-label={`Actions for ${row.misspelling} to ${row.correction}`}
            onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect();
              setMenu(menu?.row.id === row.id ? null : { row, top: Math.min(rect.bottom + 4, window.innerHeight - 235),
                left: Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)) }); }}>⋯</button></td>
        </tr>)}</tbody>
      </table>
      {!visibleRows.length ? <div className="adle-admin-empty">No spelling pairs match these filters.</div> : null}
    </div>
    {menu && typeof document !== "undefined" ? createPortal(<div className="adle-admin-dropdown resolution-row-menu"
      role="menu" style={{ top: menu.top, left: menu.left }}>
      {menu.row.status === "pending" ? <button type="button" role="menuitem" onClick={() => show("confirm", menu.row)}>Confirm</button> : null}
      {menu.row.status === "pending" ? <button type="button" role="menuitem" onClick={() => show("edit", menu.row)}>Edit</button> : null}
      {menu.row.status === "pending" && (!menu.row.mappingId ||
        (menu.row.mappingStatus === "disabled" && menu.row.visibilityStatus === "disabled"))
        ? <button type="button" role="menuitem" onClick={() => show("noSkill", menu.row)}>No Matching Skill</button> : null}
      {menu.row.status === "confirmed" ? <button type="button" role="menuitem" onClick={() => show("reopen", menu.row)}>Edit</button> : null}
      {menu.row.status === "confirmed" && menu.row.mappingId ? <button type="button" role="menuitem"
        onClick={() => show("visibility", menu.row)}>{menu.row.resolverEnabled ? "Remove from Resolver" : "Add to Resolver"}</button> : null}
      <button type="button" role="menuitem" onClick={() => show("details", menu.row)}>View details</button>
      <button type="button" role="menuitem" className="resolution-danger" onClick={() => show("delete", menu.row)}>Delete</button>
    </div>, document.body) : null}
    {selected ? <ActionDialog key={`${selected.row.id}:${selected.kind}`} kind={selected.kind} row={selected.row}
      onClose={() => setSelected(null)} onPreviewAction={onPreviewAction} skills={skills} families={families} clusters={clusters}
      readOnlyPreview={readOnlyPreview} /> : null}
    <AppDialog open={uploadOpen} onOpenChange={setUploadOpen} title="Import seed candidates" size="lg">
      <div className="adle-admin-dialog-body">{readOnlyPreview ?
        <p className="adle-admin-alert">Upload requires the authenticated workspace and a connected Supabase database.</p> :
        <SeedImportUploadPanel />}</div>
    </AppDialog>
  </>;
}
