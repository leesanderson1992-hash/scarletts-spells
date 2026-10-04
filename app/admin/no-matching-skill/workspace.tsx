"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AppDialog } from "@/components/app-dialog";
import { createOrLinkMicroSkill, deleteNoMatchingSkillCase } from "./actions";

export type NoSkillRow = {
  queue_id: string;
  misspelling: string;
  correction: string;
  source_type: "resolver_intake" | "parent_catalog" | "parent_context";
  case_status: string;
  updated_at: string;
  parent_note: string | null;
  source_evidence: Array<{ type: string; id: string }>;
};
type Skill = { micro_skill_key: string; display_name: string; skill_family_key: string; skill_cluster_key: string | null };
type Family = { skill_family_key: string; display_name: string };
type Cluster = { skill_cluster_key: string; skill_family_key: string; display_name: string };

function SearchPicker({ label, name, value, onChange, options, create = false, required = true }: {
  label: string; name: string; value: string; onChange: (value: string) => void;
  options: Array<{ key: string; name: string }>;
  create?: boolean; required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = options.filter((option) => `${option.name} ${option.key}`.toLowerCase().includes(query.toLowerCase()));
  return <label className="grid gap-1 text-sm font-medium">
    {label}
    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
      placeholder={`Search ${label.toLowerCase()}`} className="rounded border px-3 py-2 font-normal" />
    <select name={name} value={value} required={required} onChange={(event) => onChange(event.target.value)}
      className="rounded border bg-white px-3 py-2 font-normal">
      <option value="">Choose {label.toLowerCase()}</option>
      {create ? <option value="__new__">＋ Create New</option> : null}
      {filtered.map((option) => <option key={option.key} value={option.key}>{option.name} · {option.key}</option>)}
      {value && value !== "__new__" && !filtered.some((option) => option.key === value)
        ? options.filter((option) => option.key === value).map((option) =>
          <option key={option.key} value={option.key}>{option.name} · {option.key}</option>) : null}
    </select>
  </label>;
}

function CreateDialog({ row, skills, families, clusters, membersBySkill, mappedSkillKey, onClose }: {
  row: NoSkillRow; skills: Skill[]; families: Family[]; clusters: Cluster[];
  membersBySkill: Record<string, string[]>; mappedSkillKey?: string; onClose: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [classification, setClassification] = useState<"context" | "spelling">(
    row.source_type === "parent_context" ? "context" : "spelling");
  const [skill, setSkill] = useState(mappedSkillKey ?? "");
  const [family, setFamily] = useState(families.some((item) => item.skill_family_key === "D4_HOM") ? "D4_HOM" : "");
  const [cluster, setCluster] = useState("");
  const [members, setMembers] = useState(`${row.misspelling}, ${row.correction}`);
  const [newFamilyKey, setNewFamilyKey] = useState("");
  const [newClusterKey, setNewClusterKey] = useState("");
  const selectedSkill = skills.find((item) => item.micro_skill_key === skill);
  const familyKey = family === "__new__" ? newFamilyKey : family;
  const clusterKey = cluster === "__new__" ? newClusterKey : cluster;
  const context = classification === "context";
  const knownMembers = selectedSkill ? membersBySkill[selectedSkill.micro_skill_key] ?? [] : [];

  return <AppDialog open onOpenChange={(open) => { if (!open) onClose(); }} size="lg"
    title="Create or link a micro skill"
    description={<span>Confirmed pair: <strong>{row.misspelling} → {row.correction}</strong>. Choose its learning route.</span>}>
    <form action={createOrLinkMicroSkill} className="grid max-h-[70vh] gap-4 overflow-y-auto pb-1">
      <input type="hidden" name="queue_id" value={row.queue_id} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="classification" value={classification} />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Skill</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === "existing"}
          onChange={() => setMode("existing")} />Select from Database</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === "new"}
          onChange={() => setMode("new")} />Create New Micro Skill</label>
      </fieldset>
      {mappedSkillKey ? <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        This spelling pair already has an active canonical mapping to {skills.find((item) => item.micro_skill_key === mappedSkillKey)?.display_name ?? mappedSkillKey} · {mappedSkillKey}. Select that skill to link this case without creating another mapping.
      </p> : null}
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Error type</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={context}
          disabled={row.source_type === "parent_context"} onChange={() => setClassification("context")} />Contextual word choice</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!context}
          disabled={row.source_type === "parent_context"} onChange={() => setClassification("spelling")} />Genuine misspelling</label>
        <p className="text-xs text-[#59616b]">Contextual choices link to ADLE without a global spelling replacement. Genuine misspellings are added to the Canonical Misspelling Resolver.</p>
      </fieldset>
      {mode === "existing" ? <SearchPicker label="Micro skill" name="micro_skill_key" value={skill} create
        onChange={(key) => {
          if (key === "__new__") { setMode("new"); setSkill(""); return; }
          setSkill(key);
          setMembers([...new Set([...(membersBySkill[key] ?? []), row.misspelling, row.correction])].join(", "));
        }} options={skills.map((item) => ({ key: item.micro_skill_key, name: item.display_name }))} />
        : <>
          <SearchPicker label="Family" name="family_selection" value={family} create
            onChange={(key) => { setFamily(key); setCluster(""); }}
            options={families.map((item) => ({ key: item.skill_family_key, name: item.display_name }))} />
          {family === "__new__" ? <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Family code<input required value={newFamilyKey}
              onChange={(event) => setNewFamilyKey(event.target.value.toUpperCase())}
              placeholder="D4_HOM" className="rounded border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm">Public family name<input required name="new_family_name"
              placeholder="Homophones" className="rounded border px-3 py-2" /></label>
          </div> : null}
          <input type="hidden" name="family_key" value={familyKey} />
          <SearchPicker label="Cluster" name="cluster_selection" value={cluster} create
            onChange={setCluster} options={clusters.filter((item) => item.skill_family_key === familyKey)
              .map((item) => ({ key: item.skill_cluster_key, name: item.display_name }))} />
          {cluster === "__new__" ? <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Cluster code<input required value={newClusterKey}
              onChange={(event) => setNewClusterKey(event.target.value.toUpperCase())}
              placeholder="D4_HOM_FUNCTION_WORD_HOMOPHONES" className="rounded border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm">Public cluster name<input required name="new_cluster_name"
              placeholder="Function word homophones" className="rounded border px-3 py-2" /></label>
          </div> : null}
          <input type="hidden" name="cluster_key" value={clusterKey} />
          <label className="grid gap-1 text-sm font-medium">Micro skill code<input required name="micro_skill_key"
            pattern="D4_[A-Z0-9_]+" placeholder="D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE"
            className="rounded border px-3 py-2 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">Public micro skill name<input required name="display_name"
            minLength={3} maxLength={120} placeholder="Choose there, their, and they’re by meaning"
            className="rounded border px-3 py-2 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">Practice route<select name="practice_route"
            defaultValue="word_practice" className="rounded border bg-white px-3 py-2 font-normal">
            <option value="word_practice">Word practice</option>
            <option value="grouped_set_practice">Grouped set practice</option>
          </select></label>
        </>}
      {context ? <label className="grid gap-1 text-sm font-medium">Full confusable word set
        <textarea name="members" required rows={3} value={members}
          onChange={(event) => setMembers(event.target.value)}
          placeholder="there, their, they’re" className="rounded border px-3 py-2 font-normal" />
        <span className="text-xs font-normal text-[#59616b]">Separate words with commas. All approved words share one micro skill.</span>
      </label> : null}
      {context && knownMembers.length ? <p className="text-xs text-[#59616b]">Existing approved words: {knownMembers.join(", ")}</p> : null}
      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        The skill appears in dropdowns immediately. An ADLE lesson waits for approved words, word support, teaching content, and three parent-confirmed misuses.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="adle-admin-secondary">Cancel</button>
        <button type="submit" className="adle-admin-primary">{mode === "new" ? "Create and link skill" : "Link selected skill"}</button>
      </div>
    </form>
  </AppDialog>;
}

export function NoMatchingSkillWorkspace({ rows, skills, families, clusters, membersBySkill, mappedSkillsByQueueId }: {
  rows: NoSkillRow[]; skills: Skill[]; families: Family[]; clusters: Cluster[];
  membersBySkill: Record<string, string[]>; mappedSkillsByQueueId: Record<string, string>;
}) {
  const [menu, setMenu] = useState<{ row: NoSkillRow; top: number; left: number } | null>(null);
  const [dialog, setDialog] = useState<{ kind: "create" | "delete"; row: NoSkillRow } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest(".resolution-row-menu, .adle-admin-options-button")) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);
  return <>
    <div className="adle-admin-table-wrap">
      <table className="adle-admin-table resolution-table">
        <thead><tr><th scope="col">Observed word</th><th scope="col">Intended word</th>
          <th scope="col">Source</th><th scope="col">Status</th><th scope="col">Evidence</th>
          <th scope="col">Updated</th><th scope="col">Actions</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.queue_id}>
          <th scope="row" className="word">{row.misspelling}</th><td>{row.correction}</td>
          <td>{row.source_type === "parent_context" ? "Parent-confirmed context" :
            row.source_type === "parent_catalog" ? "Parent catalog case" : "Resolver intake"}</td>
          <td>{row.case_status.replaceAll("_", " ")}</td>
          <td><details className="adle-admin-detail-section"><summary className="cursor-pointer">
            {row.source_evidence.length} linked {row.source_evidence.length === 1 ? "record" : "records"}
          </summary><ul className="mt-2 space-y-2">{row.source_evidence.map((source) =>
            <li key={`${source.type}:${source.id}`}><strong>{source.type}</strong> · <code>{source.id}</code></li>)}</ul>
            {row.parent_note ? <p className="mt-2 text-sm text-[#59616b]">Evidence: {row.parent_note}</p> : null}
          </details></td>
          <td>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(row.updated_at))}</td>
          <td><button type="button" className="adle-admin-options-button" aria-label={`Actions for ${row.misspelling} to ${row.correction}`}
            aria-haspopup="menu" aria-expanded={menu?.row.queue_id === row.queue_id}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu(menu?.row.queue_id === row.queue_id ? null : { row, top: rect.bottom + 4, left: Math.max(8, rect.right - 180) });
            }}>⋯</button></td>
        </tr>)}</tbody>
      </table>
      {!rows.length ? <div className="adle-admin-empty">No cases are waiting for a micro skill.</div> : null}
    </div>
    {menu && typeof document !== "undefined" ? createPortal(<div role="menu" className="adle-admin-dropdown resolution-row-menu"
      style={{ position: "fixed", top: menu.top, left: menu.left, zIndex: 1000 }}>
      <button type="button" role="menuitem" onClick={() => { setDialog({ kind: "create", row: menu.row }); setMenu(null); }}>Create New</button>
      <button type="button" role="menuitem" className="resolution-danger"
        onClick={() => { setConfirmed(false); setDialog({ kind: "delete", row: menu.row }); setMenu(null); }}>Delete</button>
    </div>, document.body) : null}
    {dialog?.kind === "create" ? <CreateDialog key={dialog.row.queue_id} row={dialog.row} skills={skills}
      families={families} clusters={clusters} membersBySkill={membersBySkill}
      mappedSkillKey={mappedSkillsByQueueId[dialog.row.queue_id]} onClose={() => setDialog(null)} /> : null}
    {dialog?.kind === "delete" ? <AppDialog open onOpenChange={(open) => { if (!open) setDialog(null); }}
      title="Delete admin case" description={`Remove ${dialog.row.misspelling} → ${dialog.row.correction} from No Matching Skill?`}>
      <form action={deleteNoMatchingSkillCase} className="grid gap-4 text-sm">
        <input type="hidden" name="queue_id" value={dialog.row.queue_id} />
        <input type="hidden" name="confirm_delete" value={confirmed ? "DELETE" : ""} />
        <p>The child’s original writing, parent decision, and learning history are preserved.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)} />I understand this admin case will be removed.</label>
        <div className="flex justify-end gap-2"><button type="button" className="adle-admin-secondary"
          onClick={() => setDialog(null)}>Cancel</button>
          <button type="submit" disabled={!confirmed} className="adle-admin-primary">Delete case</button></div>
      </form>
    </AppDialog> : null}
  </>;
}
