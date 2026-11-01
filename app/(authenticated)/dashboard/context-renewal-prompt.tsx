"use client";

import { useEffect, useRef, useState } from "react";

import { renewParentWritingContextAuthorisation } from "./context-renewal-actions";

export function ContextRenewalPrompt({ childId, childName, expired, error }: {
  childId: string;
  childName: string;
  expired: boolean;
  error: boolean;
}) {
  const [open, setOpen] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);
  if (!open) return null;
  const close = () => dialogRef.current?.close();
  return <dialog ref={dialogRef} onClose={() => setOpen(false)} aria-labelledby="context-renewal-title"
      className="brand-card m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl border border-[#d8c8f4] bg-[#fffaf5] p-6 shadow-2xl backdrop:bg-[#1d1640]/55">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="brand-eyebrow">Parent choice</p>
          <h2 id="context-renewal-title" className="brand-title mt-2 text-2xl font-semibold">
            Renew writing context checking?
          </h2>
        </div>
        <button type="button" onClick={close} aria-label="Close renewal prompt"
          className="rounded-full border border-[#d8c8f4] bg-white px-3 py-1.5 text-lg text-[#3a285e]">×</button>
      </div>
      <p className="brand-copy mt-4 text-sm leading-6">
        {expired ? "Your previous authorisation has expired." : "Your authorisation is due to expire soon."}
        {` Renew for ${childName} only if you want context checking for writing you submit in the parent area.`}
      </p>
      <p className="brand-copy mt-3 text-sm leading-6">
        Short relevant excerpts may be sent to OpenAI to check word choice. Account details and drafts are not sent.
        OpenAI may retain API safety logs for up to 30 days. A renewal lasts 30 days.
      </p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
        We could not record your choice. Please try again or contact support.
      </p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <form action={renewParentWritingContextAuthorisation}>
          <input type="hidden" name="child_id" value={childId} />
          <button type="submit" className="brand-primary-btn">Renew for 30 days</button>
        </form>
        <button type="button" onClick={close} className="brand-secondary-btn">Not now</button>
      </div>
  </dialog>;
}
