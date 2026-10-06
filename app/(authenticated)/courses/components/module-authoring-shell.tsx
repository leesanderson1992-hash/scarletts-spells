import type { ReactNode } from "react";

type ModuleAuthoringShellProps = {
  builderContext?: ReactNode;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  controls?: ReactNode;
  error?: string;
  saved?: string;
  children: ReactNode;
};

export function ModuleAuthoringShell({
  builderContext,
  eyebrow,
  title,
  description,
  controls,
  error,
  saved,
  children,
}: ModuleAuthoringShellProps) {
  return (
    <section className="grid gap-4">
      {builderContext}
      <div className="brand-card rounded-3xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="brand-eyebrow">{eyebrow}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
              {title}
            </h1>
            {description ? (
              <div className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                {description}
              </div>
            ) : null}
          </div>
          {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
        </div>

        {(error || saved) ? (
          <div className="mt-3 grid gap-2">
            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                Saved {saved}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {children}
    </section>
  );
}
