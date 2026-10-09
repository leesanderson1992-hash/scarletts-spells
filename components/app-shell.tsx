"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { LogoutButton } from "@/app/dashboard/logout-button";
import { setActiveChildContext } from "@/app/children/actions";
import { NavIcon, type NavIconName } from "@/components/ui/nav-icon";
import { buildScopedPath, normaliseAppMode, type AppMode } from "@/lib/children-shared";

type ChildOption = { id: string; first_name: string; last_name: string | null };
type AppShellProps = {
  children: React.ReactNode;
  currentPath: string;
  mode: AppMode;
  activeChildId: string | null;
  availableChildren: ChildOption[];
  userEmail?: string | null;
  layout?: "default" | "focus";
  showAdminNav?: boolean;
  hideBrandEyebrow?: boolean;
  hideLearnerIdentity?: boolean;
};
type NavItem = { label: string; href: string; icon: string | NavIconName };

const parentNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "⌂" },
  { label: "Course Creator", href: "/courses", icon: "course" },
  { label: "Analytics", href: "/insights", icon: "analytics" },
  { label: "Review Work", href: "/courses/review", icon: "review" },
  { label: "Settings", href: "/settings", icon: "settings" },
];
const parentMore: NavItem[] = [
  { label: "Analyse Writing", href: "/analyse", icon: "✎" },
  { label: "Children", href: "/children", icon: "♧" },
  { label: "ADLE Spelling", href: "/learn/week/adle", icon: "✧" },
];
const childNav: NavItem[] = [
  { label: "This Week", href: "/learn/week", icon: "◷" },
  { label: "ADLE Spelling", href: "/learn/week/adle", icon: "✧" },
  { label: "My Learning", href: "/learn", icon: "course" },
  { label: "My Progress", href: "/insights", icon: "analytics" },
];
const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin/spelling-review", icon: "⌂" },
  { label: "Canonical Misspelling Resolver", href: "/admin/canonical-mappings", icon: "✎" },
  { label: "No Matching Skill", href: "/admin/no-matching-skill", icon: "◇" },
  { label: "ADLE Requirements", href: "/admin/adle-canonical-intake-readiness", icon: "▤" },
  { label: "Teaching Dictionary", href: "/admin/teaching-dictionary", icon: "▦" },
];
const adminMore: NavItem[] = [
  { label: "Word–skill Review", href: "/admin/word-skill-review", icon: "✓" },
  { label: "Whole-writing Evidence", href: "/admin/whole-writing-evidence", icon: "▥" },
  { label: "Resolver Readiness", href: "/admin/spelling-canonical-resolver-readiness", icon: "◇" },
  { label: "Context Diagnostics", href: "/admin/context-diagnostics", icon: "⌕" },
  { label: "Activity Catalogue", href: "/admin/adle/activity-catalogue", icon: "▤" },
];

function childName(child: ChildOption) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

const ShellMountedContext = createContext(false);

export function AppShell(props: AppShellProps) {
  const alreadyMounted = useContext(ShellMountedContext);
  if (alreadyMounted) return <>{props.children}</>;
  return <AppShellFrame {...props} />;
}

function AppShellFrame({
  children, currentPath: pagePath, mode: initialMode, activeChildId: initialChildId, availableChildren, userEmail,
  layout = "default", showAdminNav = false, hideLearnerIdentity = false,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const isLayoutShell = pagePath === "/";
  const currentPath = isLayoutShell ? pathname : pagePath;
  const mode = isLayoutShell
    ? normaliseAppMode(search.get("mode") ?? (pathname.startsWith("/learn") ? "child" : null))
    : initialMode;
  const requestedChildId = isLayoutShell ? search.get("child") : null;
  const activeChildId = requestedChildId && availableChildren.some((child) => child.id === requestedChildId)
    ? requestedChildId : initialChildId;
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<{ base: string | null; id: string } | null>(null);
  const [adminOpen, setAdminOpen] = useState(true);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const frame = requestAnimationFrame(() => setTheme(saved));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCollapsed(localStorage.getItem("scarlett-sidebar-collapsed") === "true"));
    for (const item of mode === "parent" ? parentNav.slice(0, 3) : childNav.slice(0, 2)) {
      router.prefetch(buildScopedPath(item.href, activeChildId, mode));
    }
    return () => cancelAnimationFrame(frame);
  }, [activeChildId, mode, router]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [drawerOpen]);
  useEffect(() => {
    if (!profileOpen) return;
    profileMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        requestAnimationFrame(() => hamburgerRef.current?.focus());
      }
      if (event.key === "Tab" && drawerRef.current) {
        const items = Array.from(drawerRef.current.querySelectorAll<HTMLElement>("a,button")).filter((item) => !item.hasAttribute("disabled"));
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items[items.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
          event.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const selectedId = selectedOverride?.base === activeChildId ? selectedOverride.id : activeChildId;
  const currentChild = availableChildren.find((child) => child.id === selectedId);
  const displayName = hideLearnerIdentity ? "Current lesson" : currentChild ? childName(currentChild) : "Choose a child";
  const parentHref = buildScopedPath("/dashboard", selectedId, "parent");
  const childHref = buildScopedPath("/learn/week", selectedId, "child");
  const scopedPath = buildScopedPath(currentPath, selectedId, mode);
  const accountName = userEmail?.split("@")[0]?.replace(/[._-]+/g, " ") || "Parent";
  const nav = mode === "child" ? childNav : parentNav;
  const focus = layout === "focus";

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setDrawerOpen((value) => !value);
    } else {
      setCollapsed((value) => {
        localStorage.setItem("scarlett-sidebar-collapsed", String(!value));
        return !value;
      });
    }
  }
  function closeDrawer() {
    setDrawerOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }
  function onMenuKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(profileMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }
  function navLinks(items: NavItem[], extraClass = "") {
    return items.map((item) => {
      const href = buildScopedPath(item.href, selectedId, mode);
      const active = currentPath === item.href || currentPath.startsWith(item.href + "/");
      return <Link key={item.href} href={href} prefetch onClick={() => setDrawerOpen(false)}
        title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined}
        className={"app-nav-link " + (active ? "is-active " : "") + extraClass}>
        <span className="app-nav-icon" aria-hidden="true">{
          item.icon === "course" || item.icon === "analytics" || item.icon === "settings" || item.icon === "review"
            ? <NavIcon name={item.icon} /> : item.icon
        }</span>
        <span className="app-nav-label">{item.label}</span>
      </Link>;
    });
  }
  function sidebar() {
    return <>
      <nav aria-label={mode === "child" ? "Child navigation" : "Parent navigation"} className="app-nav-list">
        {navLinks(nav)}
        {mode === "parent" ? (
          <details className="app-nav-more">
            <summary className="app-nav-link"><span className="app-nav-icon" aria-hidden="true">···</span><span className="app-nav-label">More parent tools</span></summary>
            <div className="app-nav-sublist">{navLinks(parentMore)}</div>
          </details>
        ) : null}
        <div className="app-nav-logout"><LogoutButton /></div>
      </nav>
      {mode === "parent" && showAdminNav ? (
        <div className="app-admin-nav">
          <button type="button" onClick={() => setAdminOpen((value) => !value)} aria-expanded={adminOpen} className="app-nav-section-title">
            <span>Admin</span><span aria-hidden="true">{adminOpen ? "⌄" : "›"}</span>
          </button>
          {adminOpen ? <nav aria-label="Admin navigation" className="app-nav-list">
            {navLinks(adminNav)}
            <details className="app-nav-more">
              <summary className="app-nav-link"><span className="app-nav-icon" aria-hidden="true">···</span><span className="app-nav-label">More admin tools</span></summary>
              <div className="app-nav-sublist">{navLinks(adminMore)}</div>
            </details>
          </nav> : null}
        </div>
      ) : null}
    </>;
  }

  return <div className={"app-shell brand-shell " + (collapsed ? "sidebar-collapsed " : "") + (focus ? "focus-layout " : "") + (mode === "parent" ? "parent-mode" : "child-mode") + (mode === "parent" && pathname.startsWith("/insights") ? " insights-scroll-shell" : "")}>
    <header className="app-topbar brand-topbar" inert={drawerOpen}>
      <button ref={hamburgerRef} type="button" className="app-icon-button" aria-label={drawerOpen ? "Close navigation" : "Toggle navigation"} aria-expanded={drawerOpen}
        aria-controls="app-sidebar" onClick={toggleSidebar}><span aria-hidden="true">☰</span></button>
      <Link href={mode === "child" ? childHref : parentHref} className="app-wordmark" prefetch>
        <span aria-hidden="true" className="app-wordmark-mark">✧</span><span>Scarlett Spells</span>
      </Link>
      <div className="app-topbar-actions">
        {currentPath === "/learn/week/adle" ? <button type="button" className="app-theme-toggle" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} aria-pressed={theme === "dark"} onClick={() => {
          const next = theme === "light" ? "dark" : "light";
          document.documentElement.dataset.theme = next;
          localStorage.setItem("scarlett-theme-v1", next);
          setTheme(next);
        }}><span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span><span>{theme === "light" ? "Dark" : "Light"} mode</span></button> : null}
        <div className="app-mode-switch" aria-label="Experience mode">
          <Link href={parentHref} prefetch aria-current={mode === "parent" ? "page" : undefined}>Parent Mode</Link>
          <Link href={childHref} prefetch aria-current={mode === "child" ? "page" : undefined}>Child Mode</Link>
        </div>
        <div className="app-profile" ref={profileRef}>
          <button ref={profileButtonRef} type="button" className="app-profile-trigger" aria-label={"Open profile menu for " + accountName} aria-haspopup="menu" aria-expanded={profileOpen} aria-controls="app-profile-menu"
            onClick={() => setProfileOpen((value) => !value)}>
            <span className="app-avatar" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
            <span className="app-profile-label"><strong>{accountName}</strong><small>{mode === "child" ? displayName : "Parent"}</small></span>
            <span aria-hidden="true">⌄</span>
          </button>
          {profileOpen ? <div id="app-profile-menu" className="app-profile-menu" role="menu" ref={profileMenuRef} onKeyDown={onMenuKeys}>
            <p className="app-menu-account">{userEmail ?? "Parent account"}</p>
            <p className="app-menu-heading">Children</p>
            {availableChildren.map((child) => <form key={child.id} action={setActiveChildContext}>
              <input type="hidden" name="child_id" value={child.id} /><input type="hidden" name="redirect_path" value={scopedPath} />
              <button role="menuitem" type="submit" className="app-menu-item" onClick={() => { setSelectedOverride({ base: activeChildId, id: child.id }); setProfileOpen(false); }}>
                <span>{childName(child)}</span>{selectedId === child.id ? <span aria-label="Selected child">✓</span> : null}
              </button>
            </form>)}
            {mode === "parent" ? <Link role="menuitem" className="app-menu-item app-menu-accent" href="/children" onClick={() => setProfileOpen(false)}>+ Add Child</Link> : null}
            <p className="app-menu-heading">Mode</p>
            <Link role="menuitem" className="app-menu-item" href={parentHref} onClick={() => setProfileOpen(false)}>Parent Mode {mode === "parent" ? "✓" : ""}</Link>
            <Link role="menuitem" className="app-menu-item" href={childHref} onClick={() => setProfileOpen(false)}>Child Mode {mode === "child" ? "✓" : ""}</Link>
            <div className="app-menu-divider" />
            <Link role="menuitem" className="app-menu-item" href={buildScopedPath("/settings", selectedId, mode)} onClick={() => setProfileOpen(false)}>Account Settings</Link>
            <div className="app-menu-logout"><LogoutButton menuItem /></div>
          </div> : null}
        </div>
      </div>
    </header>
    {drawerOpen ? <button type="button" className="app-drawer-backdrop" aria-label="Close navigation" onClick={closeDrawer} tabIndex={-1} /> : null}
    <aside id="app-sidebar" ref={drawerRef} className={"app-sidebar " + (drawerOpen ? "drawer-open" : "")} aria-label="Application navigation"
      role={drawerOpen ? "dialog" : undefined} aria-modal={drawerOpen ? true : undefined}>
      <div className="app-sidebar-header"><span>{mode === "child" ? "Child Mode" : "Parent Mode"}</span><span className="app-sidebar-child">{displayName}</span>
        <button type="button" className="app-drawer-close" aria-label="Close navigation" onClick={closeDrawer}>×</button>
      </div>
      {sidebar()}
    </aside>
    <main className="app-main" id="main-content" inert={drawerOpen}><ShellMountedContext.Provider value={true}>{children}</ShellMountedContext.Provider></main>
  </div>;
}
