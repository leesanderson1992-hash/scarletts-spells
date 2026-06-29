import Link from "next/link";

import { LogoutButton } from "@/app/dashboard/logout-button";
import { buildScopedPath, type AppMode } from "@/lib/children";

import { ChildSwitcher } from "./child-switcher";

type ChildOption = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type AppShellProps = {
  children: React.ReactNode;
  currentPath: string;
  mode: AppMode;
  activeChildId: string | null;
  availableChildren: ChildOption[];
  userEmail?: string | null;
  layout?: "default" | "focus";
  showAdminNav?: boolean;
};

type NavItem = {
  label: string;
  href: string;
  children?: NavItem[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

function getNavSections(mode: AppMode, showAdminNav: boolean): NavSection[] {
  if (mode === "child") {
    return [
      {
        title: "Child mode",
        items: [
          { label: "This Week", href: "/learn/week" },
          { label: "Daily Practice", href: "/learn/week/practice" },
          { label: "My Learning", href: "/learn" },
          { label: "My Progress", href: "/insights" },
        ],
      },
    ];
  }

  const sections: NavSection[] = [
    {
      title: "Parent mode",
      items: [
        { label: "Dashboard", href: "/dashboard" },
        {
          label: "Courses",
          href: "/courses",
          children: [
            { label: "Courses", href: "/courses" },
            { label: "Review Work", href: "/courses/review" },
            { label: "Analyse Writing", href: "/analyse" },
          ],
        },
        { label: "Insights", href: "/insights" },
        { label: "Settings", href: "/settings" },
        { label: "Children", href: "/children" },
      ],
    },
  ];

  if (showAdminNav) {
    sections.push({
      title: "Admin",
      items: [
        { label: "Spelling Review", href: "/admin/spelling-review" },
        { label: "Catalog Review", href: "/admin/catalog-review" },
        {
          label: "Canonical Recommendations",
          href: "/admin/canonical-recommendations",
        },
        { label: "Seed Import Review", href: "/admin/seed-import-review" },
        {
          label: "Resolver Readiness",
          href: "/admin/spelling-canonical-resolver-readiness",
        },
      ],
    });
  }

  return sections;
}

function isCurrentNavItem(currentPath: string, href: string) {
  if (href === "/learn/week" && currentPath.startsWith("/learn/week/practice")) {
    return false;
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function AppShell({
  children,
  currentPath,
  mode,
  activeChildId,
  availableChildren,
  userEmail,
  layout = "default",
  showAdminNav = false,
}: AppShellProps) {
  const navSections = getNavSections(mode, showAdminNav);
  const scopedCurrentPath = buildScopedPath(currentPath, activeChildId, mode);
  const activeChild =
    availableChildren.find((child) => child.id === activeChildId) ?? null;
  const activeChildName = activeChild
    ? [activeChild.first_name, activeChild.last_name].filter(Boolean).join(" ")
    : null;
  const parentModePath = buildScopedPath("/dashboard", activeChildId, "parent");
  const childModePath = buildScopedPath("/learn/week", activeChildId, "child");
  const homePath = buildScopedPath(
    mode === "child" ? "/learn/week" : "/dashboard",
    activeChildId,
    mode,
  );
  const modeDescription =
    mode === "child"
      ? "A simpler view focused on this week's training and current learning."
      : "Parent tools for review, course progress, and spelling insight.";
  const isFocusLayout = layout === "focus";
  const isParentMode = mode === "parent";
  const shellWidthClass = isFocusLayout
    ? "max-w-[96rem]"
    : isParentMode
      ? "max-w-none"
      : "max-w-7xl";

  return (
    <div className="brand-shell min-h-screen">
      <header className="brand-topbar sticky top-0 z-30 border-b border-[var(--border)] backdrop-blur-xl">
        <div className={`mx-auto flex w-full flex-wrap items-center gap-4 px-4 sm:px-6 ${
          isFocusLayout ? "py-3" : "py-4"
        } ${shellWidthClass}`}>
          <Link
            href={homePath}
            className="flex min-w-0 items-center gap-3"
          >
            <div className={`flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] font-semibold text-white shadow-[0_12px_24px_rgba(194,24,91,0.18)] ${
              isFocusLayout ? "h-10 w-10 text-base" : "h-11 w-11 text-lg"
            }`}>
              S
            </div>
            <div className="min-w-0">
              <p className="brand-eyebrow">Scarlett&apos;s Spells</p>
              <p className={`brand-title font-semibold ${isFocusLayout ? "text-lg" : "text-xl"}`}>Spelling Studio</p>
            </div>
          </Link>

          <div className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
            {activeChildId ? (
              <ChildSwitcher
                childOptions={availableChildren}
                activeChildId={activeChildId}
                redirectPath={scopedCurrentPath}
                compact
              />
            ) : (
              <p className="brand-copy text-sm">Add a child profile to get started.</p>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="brand-card-soft hidden rounded-full p-1 md:flex">
              <Link
                href={parentModePath}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  mode === "parent"
                    ? "bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] text-white shadow-[0_10px_20px_rgba(194,24,91,0.18)]"
                    : "text-[var(--mid)]"
                }`}
              >
                Parent mode
              </Link>
              <Link
                href={childModePath}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  mode === "child"
                    ? "bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] text-white shadow-[0_10px_20px_rgba(194,24,91,0.18)]"
                    : "text-[var(--mid)]"
                }`}
              >
                Child mode
              </Link>
            </div>

            <div className="hidden text-right lg:block">
              <p className="brand-copy text-xs uppercase tracking-[0.18em]">
                {mode === "child" ? "Current learner" : "Signed in"}
              </p>
              <p className="text-sm font-medium text-[var(--mid)]">
                {mode === "child"
                  ? activeChildName ?? "Choose a child"
                  : userEmail ?? "Parent"}
              </p>
            </div>

            <LogoutButton />
          </div>
        </div>

        <div className={`mx-auto flex w-full flex-col gap-3 px-4 pb-4 sm:px-6 xl:hidden ${shellWidthClass}`}>
          <div className="brand-card-soft rounded-3xl px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="brand-copy text-xs uppercase tracking-[0.18em]">
                  {mode === "child" ? "Child mode" : "Parent mode"}
                </p>
                <p className="text-sm font-medium text-[var(--mid)]">
                  {activeChildName ?? "No active child selected"}
                </p>
                <p className="brand-copy mt-1 text-xs">{modeDescription}</p>
              </div>

              <div className="brand-card-soft rounded-full p-1">
                <Link
                  href={parentModePath}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                    mode === "parent"
                      ? "bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] text-white"
                      : "text-[var(--mid)]"
                  }`}
                >
                  Parent
                </Link>
                <Link
                  href={childModePath}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                    mode === "child"
                      ? "bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] text-white"
                      : "text-[var(--mid)]"
                  }`}
                >
                  Child
                </Link>
              </div>
            </div>

            {activeChildId ? (
              <ChildSwitcher
                childOptions={availableChildren}
                activeChildId={activeChildId}
                redirectPath={scopedCurrentPath}
                compact
                className="mt-3"
              />
            ) : null}
          </div>
        </div>
      </header>

      <div className={`mx-auto w-full px-4 sm:px-6 ${shellWidthClass} ${
        isFocusLayout ? "py-4" : "py-6"
      }`}>
        <div className={`grid gap-5 ${isFocusLayout ? "lg:grid-cols-[220px_minmax(0,1fr)]" : isParentMode ? "lg:grid-cols-[224px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)]"}`}>
        <aside className={`brand-sidebar brand-card-soft self-start rounded-[24px] ${isParentMode ? "p-3" : "p-4"} lg:sticky lg:top-24 ${
          isFocusLayout ? "hidden xl:block" : ""
        }`}>
          <div className="hidden lg:block">
            {isParentMode ? (
              <div className="px-2 pb-2 pt-1">
                <p className="brand-copy text-[11px] uppercase tracking-[0.18em]">
                  Current child
                </p>
                <p className="mt-1 text-base font-semibold text-[color:var(--ink)]">
                  {activeChildName ?? "Choose a child"}
                </p>
              </div>
            ) : (
              <div className="rounded-3xl border border-[var(--border)] bg-white/60 p-4">
                <p className="brand-copy text-xs uppercase tracking-[0.18em]">
                  Current learner
                </p>
                <p className="brand-title mt-2 text-2xl font-semibold">
                  {activeChildName ?? "Choose a child"}
                </p>
                <p className="brand-copy mt-2 text-sm leading-6">
                  {modeDescription}
                </p>
              </div>
            )}
          </div>

          <nav className={`mt-0 flex gap-2 overflow-x-auto pb-1 ${isParentMode ? "lg:mt-2" : "lg:mt-4"} lg:flex-col lg:overflow-visible lg:pb-0`}>
            {navSections.map((section) => (
              <div key={section.title} className="min-w-max lg:min-w-0">
                <p className={`brand-copy hidden ${isParentMode ? "px-2 pb-1.5 pt-1 text-[11px]" : "px-3 pb-2 pt-2 text-xs"} uppercase tracking-[0.18em] lg:block`}>
                  {section.title}
                </p>
                <div className="flex gap-2 lg:flex-col">
                  {section.items.map((item) => {
                    const href = buildScopedPath(item.href, activeChildId, mode);
                    const isCurrent = isCurrentNavItem(currentPath, item.href);
                    const childLinks = item.children?.map((child) => ({
                      ...child,
                      href: buildScopedPath(child.href, activeChildId, mode),
                      isCurrent: isCurrentNavItem(currentPath, child.href),
                    }));
                    const hasCurrentChild = childLinks?.some((child) => child.isCurrent) ?? false;

                    if (childLinks && childLinks.length > 0) {
                      return (
                        <details
                          key={item.href}
                          open={isCurrent || hasCurrentChild}
                          className={`group ${isParentMode ? "rounded-[18px] bg-white/35 p-0.5" : "rounded-[22px] bg-white/50 p-1"}`}
                        >
                          <summary
                            className={`flex cursor-pointer list-none items-center justify-between ${isParentMode ? "rounded-[16px] px-3 py-2.5 text-[13px]" : "rounded-2xl px-4 py-3 text-sm"} font-medium transition ${
                              isCurrent || hasCurrentChild
                                ? "bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] text-white shadow-[0_14px_28px_rgba(194,24,91,0.18)]"
                                : "text-[var(--mid)] hover:bg-white/80 hover:text-[var(--scarlett)]"
                            }`}
                          >
                            <span>{item.label}</span>
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 20 20"
                              className="h-4 w-4 fill-current transition group-open:rotate-180"
                            >
                              <path d="M5.2 7.2a1 1 0 0 1 1.4 0L10 10.6l3.4-3.4a1 1 0 1 1 1.4 1.4l-4.1 4.1a1 1 0 0 1-1.4 0L5.2 8.6a1 1 0 0 1 0-1.4Z" />
                            </svg>
                          </summary>
                          <div className={`mt-1 grid gap-1 ${isParentMode ? "px-0.5 pb-0.5" : "px-1 pb-1"}`}>
                            {childLinks.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`${isParentMode ? "rounded-[14px] px-3 py-2 text-[13px]" : "rounded-2xl px-4 py-2.5 text-sm"} transition ${
                                  child.isCurrent
                                    ? "bg-white text-[var(--scarlett)] shadow-sm"
                                    : "text-[var(--mid)] hover:bg-white/80 hover:text-[var(--scarlett)]"
                                }`}
                              >
                                {child.label}
                              </Link>
                            ))}
                          </div>
                        </details>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={href}
                        className={`${isParentMode ? "rounded-[16px] px-3 py-2.5 text-[13px]" : "rounded-2xl px-4 py-3 text-sm"} font-medium whitespace-nowrap transition ${
                          isCurrent
                            ? "bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] text-white shadow-[0_14px_28px_rgba(194,24,91,0.18)]"
                            : "text-[var(--mid)] hover:bg-white/80 hover:text-[var(--scarlett)]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
