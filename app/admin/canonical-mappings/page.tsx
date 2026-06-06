import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  disableCanonicalMappingResolverVisibility,
  enableCanonicalMappingResolverVisibility,
} from "./actions";

export const dynamic = "force-dynamic";

type CanonicalMappingRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string;
  resolver_visibility_status: string;
  dialect_code: string;
  normalization_version: string;
  source_case_id: string | null;
  source_decision_id: string | null;
  created_by_admin_email: string | null;
  created_at: string;
};

type MicroSkillRow = {
  micro_skill_key: string;
  display_name: string;
};

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusMessage({
  error,
  saved,
}: {
  error?: string;
  saved?: string;
}) {
  if (error) {
    return (
      <section
        className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-950"
        role="status"
      >
        {error}
      </section>
    );
  }

  if (saved) {
    return (
      <section
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-950"
        role="status"
      >
        {saved}
      </section>
    );
  }

  return null;
}

function VisibilityForm({
  action,
  label,
  mappingId,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  mappingId: string;
}) {
  return (
    <form action={action} className="flex min-w-52 flex-col gap-2">
      <input type="hidden" name="mapping_id" value={mappingId} />
      <label className="sr-only" htmlFor={`${mappingId}-${label}-note`}>
        {label} note
      </label>
      <textarea
        id={`${mappingId}-${label}-note`}
        name="note"
        required
        maxLength={600}
        rows={2}
        placeholder="Admin reason"
        className="min-h-16 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs text-[color:var(--ink)]"
      />
      <button
        type="submit"
        className="min-h-9 rounded-xl border border-[var(--border)] bg-[var(--mist)] px-3 py-2 text-xs font-semibold text-[color:var(--ink)] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
      >
        {label}
      </button>
    </form>
  );
}

async function getCanonicalMappings() {
  const supabase = createServiceRoleClient();

  return supabase
    .from("spelling_canonical_mappings")
    .select(
      [
        "id",
        "misspelling_normalized",
        "correct_spelling_normalized",
        "micro_skill_key",
        "mapping_status",
        "resolver_visibility_status",
        "dialect_code",
        "normalization_version",
        "source_case_id",
        "source_decision_id",
        "created_by_admin_email",
        "created_at",
      ].join(", "),
    )
    .order("created_at", { ascending: false })
    .limit(100);
}

async function getMicroSkillNames(keys: string[]) {
  if (keys.length === 0) {
    return new Map<string, string>();
  }

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key, display_name")
    .in("micro_skill_key", keys);

  return new Map(
    ((data ?? []) as MicroSkillRow[]).map((row) => [
      row.micro_skill_key,
      row.display_name,
    ]),
  );
}

export default async function AdminCanonicalMappingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdminUser();

  const params = (await searchParams) ?? {};
  const { data, error } = await getCanonicalMappings();

  if (error) {
    throw error;
  }

  const mappings = ((data ?? []) as unknown) as CanonicalMappingRow[];
  const microSkillNames = await getMicroSkillNames([
    ...new Set(mappings.map((row) => row.micro_skill_key)),
  ]);

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-4xl">
          <p className="brand-eyebrow">Admin</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            Canonical Spelling Mappings
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            Enable or disable resolver visibility for already-created canonical
            exact-pair mappings. This surface only changes resolver visibility
            and does not change resolver behavior.
          </p>
          <Link
            href="/admin/spelling-review"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
          >
            Back to spelling review
          </Link>
        </header>

        <StatusMessage error={params.error} saved={params.saved} />

        <section
          className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
          aria-labelledby="canonical-mappings-heading"
        >
          <div className="border-b border-[var(--border)] px-6 py-5">
            <h2
              id="canonical-mappings-heading"
              className="brand-title text-2xl font-semibold"
            >
              Resolver visibility controls
            </h2>
            <p className="brand-copy mt-2 text-sm">
              Resolver visibility is explicit admin enable/disable authority.
              Runtime use still requires the resolver-visible mappings feature
              flag.
            </p>
          </div>

          {mappings.length === 0 ? (
            <p className="px-6 py-8 text-sm text-[color:var(--mid)]">
              No canonical mappings have been created yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="bg-[rgba(255,247,220,0.45)] text-left text-[10px] font-medium uppercase leading-tight tracking-normal text-[color:var(--mid)]">
                    <th scope="col" className="px-3 py-3">
                      Exact Pair
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Micro-skill
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Scope
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Source
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Created
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping) => {
                    const canEnable =
                      mapping.mapping_status === "active" &&
                      (mapping.resolver_visibility_status === "hidden" ||
                        mapping.resolver_visibility_status === "disabled");
                    const canDisable =
                      mapping.mapping_status === "active" &&
                      mapping.resolver_visibility_status === "visible";

                    return (
                      <tr key={mapping.id} className="align-top">
                        <th
                          scope="row"
                          className="border-t border-[var(--border)] px-3 py-4 text-sm font-medium text-[color:var(--ink)]"
                        >
                          <span className="block">
                            {mapping.misspelling_normalized}
                          </span>
                          <span className="block text-xs text-[color:var(--mid)]">
                            to {mapping.correct_spelling_normalized}
                          </span>
                        </th>
                        <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                          <span className="block font-semibold text-[color:var(--ink)]">
                            {microSkillNames.get(mapping.micro_skill_key) ??
                              mapping.micro_skill_key}
                          </span>
                          <span className="block">{mapping.micro_skill_key}</span>
                        </td>
                        <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                          <span className="block">{mapping.dialect_code}</span>
                          <span className="block">
                            {mapping.normalization_version}
                          </span>
                        </td>
                        <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                          <span className="block font-semibold text-[color:var(--ink)]">
                            {formatLabel(mapping.mapping_status)}
                          </span>
                          <span className="block">
                            Resolver:{" "}
                            {formatLabel(mapping.resolver_visibility_status)}
                          </span>
                        </td>
                        <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                          <span className="block">
                            Case: {mapping.source_case_id ?? "none"}
                          </span>
                          <span className="block">
                            Decision: {mapping.source_decision_id ?? "none"}
                          </span>
                          <span className="block">
                            Admin: {mapping.created_by_admin_email ?? "unknown"}
                          </span>
                        </td>
                        <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                          {formatDate(mapping.created_at)}
                        </td>
                        <td className="border-t border-[var(--border)] px-3 py-4">
                          {canEnable ? (
                            <VisibilityForm
                              action={
                                enableCanonicalMappingResolverVisibility
                              }
                              label="Enable visibility"
                              mappingId={mapping.id}
                            />
                          ) : null}
                          {canDisable ? (
                            <VisibilityForm
                              action={
                                disableCanonicalMappingResolverVisibility
                              }
                              label="Disable visibility"
                              mappingId={mapping.id}
                            />
                          ) : null}
                          {!canEnable && !canDisable ? (
                            <span className="text-xs text-[color:var(--mid)]">
                              No resolver visibility action available.
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
