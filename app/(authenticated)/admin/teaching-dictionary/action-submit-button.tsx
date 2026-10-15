"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function ActionSubmitButton(props: {
  children: ReactNode;
  pendingLabel: string;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
  form?: string;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const pending=props.pending ?? status.pending;
  return <button
    type="submit" form={props.form} name={props.name} value={props.value}
    className={`${props.className ?? ""} inline-flex min-w-fit items-center justify-center gap-2 transition active:scale-[0.98]`}
    disabled={props.disabled || pending}
    aria-busy={pending}
  >
    {pending && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
    <span>{pending ? props.pendingLabel : props.children}</span>
  </button>;
}
