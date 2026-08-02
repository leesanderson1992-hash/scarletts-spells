"use client";

import { useActionState } from "react";

import {
  runDynamicPrefixQaLauncherAction,
} from "./actions";
import {
  INITIAL_DYNAMIC_PREFIX_QA_ACTION_STATE,
  type DynamicPrefixQaActionState,
} from "./types";

type Child = { id: string; label: string };
type Profile = {
  key: string;
  label: string;
  expectedItemCount: number;
  authority: string;
  dictionaryReady: boolean;
};

function Results({ state }: { state: DynamicPrefixQaActionState }) {
  if (!state.message && !state.results.length) return null;
  return (
    <div className="mt-4" aria-live="polite">
      {state.message ? <p className="text-sm font-medium text-rose-700">{state.message}</p> : null}
      {state.results.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[660px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-[var(--border)]"><th className="py-2 pr-3">Profile</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Items</th><th className="py-2">Lesson</th></tr></thead>
            <tbody>{state.results.map((result) => <tr key={`${result.profileKey}:${result.planDate}`} className="border-b border-[var(--border)] align-top"><td className="py-3 pr-3 font-semibold">{result.label}</td><td className="py-3 pr-3">{result.planDate}</td><td className="py-3 pr-3"><span className="font-semibold">{result.status}</span><span className="mt-1 block text-xs text-[color:var(--muted)]">{result.message}</span></td><td className="py-3 pr-3">{result.itemCount}</td><td className="py-3">{result.lessonUrl ? <a className="font-semibold underline underline-offset-4" href={result.lessonUrl} target="_blank" rel="noreferrer">Open lesson</a> : "—"}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function DynamicPrefixQaLauncher(props: {
  childOptions: Child[];
  profiles: Profile[];
  defaultDate: string;
}) {
  const [singleState, singleAction, singlePending] = useActionState(
    runDynamicPrefixQaLauncherAction,
    INITIAL_DYNAMIC_PREFIX_QA_ACTION_STATE,
  );
  const [sequenceState, sequenceAction, sequencePending] = useActionState(
    runDynamicPrefixQaLauncherAction,
    INITIAL_DYNAMIC_PREFIX_QA_ACTION_STATE,
  );
  const selectClass = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm";
  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold">Create one normal-path lesson</h2>
        <form action={singleAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="operation" value="single" />
          <label className="grid gap-1 text-sm font-medium">Child<select className={selectClass} name="childId" required>{props.childOptions.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium">Prefix profile<select className={selectClass} name="profileKey" required>{props.profiles.map((profile) => <option key={profile.key} value={profile.key} disabled={!profile.dictionaryReady}>{profile.label} · {profile.expectedItemCount} items · {profile.authority}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium">Assignment date<input className={selectClass} type="date" name="planDate" defaultValue={props.defaultDate} required /></label>
          <button className="brand-primary-btn min-h-11" type="submit" disabled={singlePending || !props.childOptions.length}>{singlePending ? "Creating…" : "Create assignment"}</button>
        </form>
        <p className="mt-3 text-xs text-[color:var(--muted)]">If that date already has the same profile, the existing lesson is returned. If it has another ADLE lesson, choose an explicit additional date.</p>
        <Results state={singleState} />
      </section>
      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold">Create the ordered five-lesson QA sequence</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Creates un-, dis-/mis-, in-/im-/il-/ir-, re-/pre-, then sub-/inter-/super- on five consecutive dates. The complete sequence is preflighted before any new write.</p>
        <form action={sequenceAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="operation" value="all-five" />
          <label className="grid gap-1 text-sm font-medium">Child<select className={selectClass} name="childId" required>{props.childOptions.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium">First lesson date<input className={selectClass} type="date" name="planDate" defaultValue={props.defaultDate} required /></label>
          <button className="brand-primary-btn min-h-11" type="submit" disabled={sequencePending || !props.childOptions.length}>{sequencePending ? "Creating sequence…" : "Create all five"}</button>
        </form>
        <Results state={sequenceState} />
      </section>
    </div>
  );
}
