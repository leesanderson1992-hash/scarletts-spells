"use client";

import { useFormStatus } from "react-dom";

export function ReviewSendBackButton() {
  const { pending } = useFormStatus();
  return <>
    <button type="submit" disabled={pending} aria-busy={pending}
      className="brand-secondary-btn justify-center disabled:cursor-wait disabled:opacity-60">
      {pending ? "Sending back…" : "Send back to child"}
    </button>
    {pending ? <p role="status" aria-live="polite" className="text-sm text-sky-900">
      Saving feedback and returning the work. Please wait.
    </p> : null}
  </>;
}
