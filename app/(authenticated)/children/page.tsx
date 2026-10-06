import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  archiveChildProfile,
  deleteChildProfile,
  setActiveChildContext,
  unarchiveChildProfile,
} from "@/app/children/actions";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { createClient } from "@/lib/supabase/server";

import { CreateChildForm } from "../dashboard/create-child-form";
import { EditChildForm } from "../dashboard/edit-child-form";

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  date_of_birth: string | null;
  is_archived: boolean;
};

function getChildName(child: ChildRow) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

function getAgeFromDateOfBirth(dateOfBirth: string | null) {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(dateOfBirth);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

type ChildrenPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

export default async function ChildrenPage({ searchParams }: ChildrenPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();

  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, date_of_birth, is_archived")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true });

  const activeChildren = (children ?? []).filter((child) => !child.is_archived);
  const archivedChildren = (children ?? []).filter((child) => child.is_archived);
  const activeChild = selectChildById(
    activeChildren,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );
  const homePath = buildScopedPath(
    mode === "child" ? "/learn/week" : "/dashboard",
    activeChild?.id ?? null,
    mode,
  );

  return (
    <AppShell
      currentPath="/children"
      mode={mode}
      activeChildId={activeChild?.id ?? null}
      availableChildren={activeChildren}
      userEmail={user.email}
    >
    <div className="brand-page px-6 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="brand-card rounded-3xl p-6">
          <p className="brand-eyebrow">
            Scarlett&apos;s Spells
          </p>
          <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
            Children
          </h1>
          <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">
            Manage your child profiles in one place. Choose the active child for the main pages, update details, archive old profiles, or remove a child completely.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={homePath}
              className="brand-primary-btn"
            >
              Back to home
            </Link>
          </div>
        </section>

        <CreateChildForm
          title="Add a child"
          description="Create a new child profile to use across courses, review, and insights."
          submitLabel="Add child"
        />

        {children && children.length > 0 ? (
          <>
            <section className="grid gap-6">
              <div>
                <h2 className="brand-title text-3xl font-semibold tracking-tight">
                  Active children
                </h2>
                <p className="brand-copy mt-2 text-sm leading-6">
                  These profiles appear across dashboard, courses, learn, and insights.
                </p>
              </div>

              {activeChildren.length > 0 ? (
                <div className="grid gap-6">
                  {activeChildren.map((child) => {
                    const childAge = getAgeFromDateOfBirth(child.date_of_birth);
                    const isActiveChild = child.id === activeChild?.id;

                    return (
                      <section
                        key={child.id}
                        className="brand-card grid gap-6 rounded-3xl p-6 lg:grid-cols-[0.9fr,1.1fr]"
                      >
                        <div className="grid gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="brand-title text-3xl font-semibold tracking-tight">
                                {getChildName(child)}
                              </h3>
                              {isActiveChild ? (
                                <span className="brand-status-completed rounded-full px-3 py-1 text-sm font-medium">
                                  Active child
                                </span>
                              ) : null}
                            </div>
                            <p className="brand-copy mt-2 text-sm leading-6">
                              {childAge !== null
                                ? `${getChildName(child)} is ${childAge}.`
                                : "Age not set yet."}
                            </p>
                          </div>

                          {!isActiveChild ? (
                            <form action={setActiveChildContext}>
                              <input type="hidden" name="child_id" value={child.id} />
                              <input type="hidden" name="redirect_path" value={buildScopedPath("/children", child.id, mode)} />
                              <button
                                type="submit"
                                className="brand-secondary-btn"
                              >
                                Make active child
                              </button>
                            </form>
                          ) : null}

                          <div className="flex flex-wrap gap-3">
                            <form action={archiveChildProfile}>
                              <input type="hidden" name="child_id" value={child.id} />
                              <button
                                type="submit"
                                className="brand-warm-btn"
                              >
                                Archive child
                              </button>
                            </form>

                            <form action={deleteChildProfile}>
                              <input type="hidden" name="child_id" value={child.id} />
                              <button
                                type="submit"
                                className="brand-danger-btn"
                              >
                                Delete child
                              </button>
                            </form>
                          </div>
                        </div>

                        <EditChildForm
                          childId={child.id}
                          initialName={getChildName(child)}
                          initialAge={childAge}
                          title="Edit child"
                          description="Update this child's name or age."
                          submitLabel="Save changes"
                        />
                      </section>
                    );
                  })}
                </div>
              ) : (
                <section className="brand-card rounded-3xl p-6">
                  <p className="brand-copy text-sm leading-6">
                    There are no active children right now.
                  </p>
                </section>
              )}
            </section>

            <section className="grid gap-6">
              <div>
                <h2 className="brand-title text-3xl font-semibold tracking-tight">
                  Archived children
                </h2>
                <p className="brand-copy mt-2 text-sm leading-6">
                  Archived children stay in the account but are hidden from the main spelling workflow until restored.
                </p>
              </div>

              {archivedChildren.length > 0 ? (
                <div className="grid gap-6">
                  {archivedChildren.map((child) => {
                    const childAge = getAgeFromDateOfBirth(child.date_of_birth);

                    return (
                      <section
                        key={child.id}
                        className="brand-card grid gap-6 rounded-3xl p-6 lg:grid-cols-[0.9fr,1.1fr]"
                      >
                        <div className="grid gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="brand-title text-3xl font-semibold tracking-tight">
                                {getChildName(child)}
                              </h3>
                              <span className="brand-status-pending rounded-full px-3 py-1 text-sm font-medium">
                                Archived
                              </span>
                            </div>
                            <p className="brand-copy mt-2 text-sm leading-6">
                              {childAge !== null
                                ? `${getChildName(child)} is ${childAge}.`
                                : "Age not set yet."}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <form action={unarchiveChildProfile}>
                              <input type="hidden" name="child_id" value={child.id} />
                              <button
                                type="submit"
                                className="brand-secondary-btn"
                              >
                                Restore child
                              </button>
                            </form>

                            <form action={deleteChildProfile}>
                              <input type="hidden" name="child_id" value={child.id} />
                              <button
                                type="submit"
                                className="brand-danger-btn"
                              >
                                Delete child
                              </button>
                            </form>
                          </div>
                        </div>

                        <EditChildForm
                          childId={child.id}
                          initialName={getChildName(child)}
                          initialAge={childAge}
                          title="Edit child"
                          description="Update this archived child's details if needed."
                          submitLabel="Save changes"
                        />
                      </section>
                    );
                  })}
                </div>
              ) : (
                <section className="brand-card rounded-3xl p-6">
                  <p className="brand-copy text-sm leading-6">
                    No archived children yet.
                  </p>
                </section>
              )}
            </section>
          </>
        ) : (
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-copy text-sm leading-6">
              No child profiles have been added yet. Create your first child above to begin.
            </p>
          </section>
        )}
      </div>
    </div>
    </AppShell>
  );
}
