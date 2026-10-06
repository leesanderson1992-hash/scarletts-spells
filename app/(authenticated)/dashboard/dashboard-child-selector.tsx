"use client";

import Link from "next/link";
import { useState } from "react";

import { setActiveChildContext } from "@/app/children/actions";

type Child = { id: string; first_name: string; last_name: string | null };

export function DashboardChildSelector({ childOptions, selectedChildId, allChildren }: {
  childOptions: Child[]; selectedChildId: string | null; allChildren: boolean;
}) {
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  return <nav className="parent-child-selector" aria-label="Dashboard child context">
    <Link href="/dashboard?scope=all" aria-current={allChildren && !pendingChildId ? "page" : undefined}>All children</Link>
    {childOptions.map((child) => <form key={child.id} action={setActiveChildContext}>
      <input type="hidden" name="child_id" value={child.id} />
      <input type="hidden" name="redirect_path" value="/dashboard" />
      <button type="submit" onClick={() => setPendingChildId(child.id)}
        aria-current={pendingChildId === child.id || (!pendingChildId && !allChildren && selectedChildId === child.id) ? "page" : undefined}>
        <span className="parent-child-initial" aria-hidden="true">{child.first_name.slice(0, 1)}</span>
        {[child.first_name, child.last_name].filter(Boolean).join(" ")}
      </button>
    </form>)}
    <Link href="/children" aria-label="Add a child">+</Link>
  </nav>;
}
