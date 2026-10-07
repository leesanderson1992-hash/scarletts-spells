"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { normaliseParentIdentifiedOccurrenceWord } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { sentenceContext } from "@/lib/writing-engine/whole-writing/sentence-context";
import { useReviewWordSelection } from "./review-word-selection";

export function ReviewAddWordForm(props: {
  spellingAction: (formData: FormData) => Promise<{ ok: boolean; message: string; section: "words"; added: boolean } | void>;
  contextAction: (formData: FormData) => Promise<{ ok: boolean; message: string; section: "context"; added: boolean } | void>;
  submissionId: string; redirectPath: string;
  occurrences: ParentIdentifiedOccurrenceCandidate[];
  sourceFields: { path: string; text: string }[];
}) {
  const [mode, setMode] = useState<"spelling" | "context">("spelling");
  const [typed, setTyped] = useState("");
  const [manualOccurrenceId, setManualOccurrenceId] = useState("");
  const [correction, setCorrection] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const { selected, setSelected, selectedText, setSelectedText } = useReviewWordSelection();
  const observed = selectedText ?? typed;
  const matches = useMemo(() => {
    const normalized = normaliseParentIdentifiedOccurrenceWord(observed);
    return normalized ? props.occurrences.filter((item) => item.provenance === "learner_response" &&
      normaliseParentIdentifiedOccurrenceWord(item.observedText) === normalized) : [];
  }, [observed, props.occurrences]);
  const chosen = selected && matches.some((item) => item.id === selected.id) ? selected
    : matches.find((item) => item.id === manualOccurrenceId) ??
      (matches.length === 1 ? matches[0] : null);
  const sourceText = props.sourceFields.find((field) => field.path === chosen?.fieldPath)?.text;
  const context = chosen && sourceText
    ? sentenceContext(sourceText, chosen.startUtf16, chosen.endUtf16)?.text : null;
  async function addWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (mode === "context" && !chosen)) return;
    const data = new FormData(event.currentTarget);
    data.set("__inline_add", "true");
    setPending(true);
    setNotice(null);
    try {
      const result = await (mode === "spelling" ? props.spellingAction(data) : props.contextAction(data));
      if (!result) return;
      setNotice(result);
      if (result.ok && result.added) {
        window.dispatchEvent(new CustomEvent("review-word-added", { detail: { section: result.section } }));
        setTyped("");
        setSelected(null);
        setSelectedText(null);
        setManualOccurrenceId("");
        setCorrection("");
      }
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : "Could not add this word. Try again." });
    } finally {
      setPending(false);
    }
  }
  return <section className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
    <p className="text-sm font-medium text-[color:var(--ink)]">Add word</p>
    <p className="text-xs text-[color:var(--mid)]">Select one word in the original writing, or enter it and choose its exact occurrence.</p>
    <div className="flex gap-4 text-sm">
      <label><input type="radio" name="add_word_mode" checked={mode === "spelling"}
        onChange={() => setMode("spelling")} /> Misspelling</label>
      <label><input type="radio" name="add_word_mode" checked={mode === "context"}
        onChange={() => setMode("context")} /> Context</label>
    </div>
    <form onSubmit={addWord} className="grid gap-3">
      <input type="hidden" name="submission_id" value={props.submissionId} />
      <input type="hidden" name="redirect_path" value={props.redirectPath} />
      {chosen ? <input type="hidden" name="source_writing_occurrence_id" value={chosen.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Word in writing
          <input required name={mode === "spelling" ? "misspelled_word" : "observed_word"}
            value={observed} onChange={(event) => { setSelected(null); setSelectedText(null); setManualOccurrenceId(""); setTyped(event.target.value); }}
            className="rounded border border-[var(--border)] px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">{mode === "context" ? "Intended word" : "Correct spelling"}
          <input required name={mode === "spelling" ? "corrected_word" : "intended_word"}
            value={correction} onChange={(event) => setCorrection(event.target.value)}
            maxLength={60} className="rounded border border-[var(--border)] px-3 py-2" />
        </label>
      </div>
      {matches.length > 1 && !chosen ? <label className="grid gap-1 text-sm">Where it appeared
        <select required value={manualOccurrenceId} onChange={(event) => setManualOccurrenceId(event.target.value)}
          className="rounded border border-[var(--border)] px-3 py-2">
          <option value="" disabled>Choose occurrence</option>
          {matches.map((item, index) => <option key={item.id} value={item.id}>
            Occurrence {index + 1} · characters {item.startUtf16}–{item.endUtf16}
          </option>)}
        </select>
      </label> : null}
      {mode === "context" && context ? <p className="rounded-xl bg-[var(--mist)] px-3 py-2 text-sm text-[var(--ink)]">
        <span className="font-medium">Sentence context: </span>{context}
      </p> : null}
      {observed.trim() && matches.length === 0 ? <p className="text-xs text-[color:var(--mid)]">
        {mode === "spelling" ? "No indexed occurrence is available; spelling can still be reviewed."
          : "Choose an exact indexed occurrence for a contextual correction."}
      </p> : null}
      {notice ? <p role={notice.ok ? "status" : "alert"} className={notice.ok ? "text-sm text-emerald-800" : "text-sm text-rose-800"}>{notice.message}</p> : null}
      <button type="submit" disabled={pending || (mode === "context" && !chosen)}
        className="brand-secondary-btn w-fit disabled:opacity-50">{pending ? "Adding…" : "Add word"}</button>
    </form>
  </section>;
}
