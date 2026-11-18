"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveRootFamily } from "./root-family-actions";
import { FormatHint } from "./format-hint";
export function RootFamilyReview({ wordId, senseId, definition, approved }: {
  wordId: string; senseId: string; definition: string; approved: boolean;
}) {
  const [origin, setOrigin] = useState(""), [otherOrigin, setOtherOrigin] = useState("");
  const [pronunciation, setPronunciation] = useState("not_applicable"), [ipa, setIpa] = useState("");
  const [error, setError] = useState(""), [pending, start] = useTransition();
  const router = useRouter();
  if (approved) return <p role="status" className="text-sm text-emerald-800">✓ Bound-root family approved. Waiting member words are rechecked automatically.</p>;
  return <section className="grid gap-3 rounded-lg border p-3">
    <h4 className="font-semibold">Dedicated bound-root family review</h4>
    <p>{definition}</p>
    <p className="text-sm">This entry supports root teaching and family meanings. It will not be approved as an ordinary spelling or dictation target.</p>
    <label className="grid gap-1 text-sm">Origin language
      <select value={origin} onChange={event => setOrigin(event.target.value)} className="rounded border p-2">
        <option value="">Choose reviewed origin</option><option>Latin</option><option>Greek</option><option>Other</option>
      </select>
    </label>
    {origin === "Other" && <label className="grid gap-1 text-sm"><span className="inline-flex items-center gap-2">Other origin
      <FormatHint label="root origin" format="Enter the reviewed language of origin." example="Old English" /></span>
      <input value={otherOrigin} onChange={event => setOtherOrigin(event.target.value)} className="rounded border p-2" maxLength={120} />
    </label>}
    <label className="grid gap-1 text-sm">Root pronunciation
      <select value={pronunciation} onChange={event => setPronunciation(event.target.value)} className="rounded border p-2">
        <option value="not_applicable">Not applicable</option><option value="reviewed">Reviewed IPA supplied</option>
      </select>
    </label>
    {pronunciation === "reviewed" && <label className="grid gap-1 text-sm"><span className="inline-flex items-center gap-2">Reviewed root IPA
      <FormatHint label="root IPA" format="Enter a reviewed pronunciation for teaching this root, using IPA." example="/vɛdʒ/" /></span>
      <input value={ipa} onChange={event => setIpa(event.target.value)} className="rounded border p-2" maxLength={200} />
    </label>}
    <button type="button" disabled={pending || !origin || origin === "Other" && !otherOrigin.trim() || pronunciation === "reviewed" && !ipa.trim()}
      className="w-fit rounded border px-3 py-2 disabled:opacity-50" onClick={() => { setError(""); start(async () => {
        try {
          const result = await approveRootFamily({ wordId, senseId, origin: origin === "Other" ? otherOrigin : origin,
            pronunciationApplicability: pronunciation, ipa });
          if (!result.ok) setError(result.error ?? "Root review could not be saved."); else router.refresh();
        } catch { setError("Root review could not be saved. Your reviewed entry is retained; retry."); }
      }); }}>{pending ? "Approving root family…" : "Approve bound-root family and recheck waiting words"}</button>
    {error && <p role="alert" className="text-sm text-rose-900">{error}</p>}
  </section>;
}
