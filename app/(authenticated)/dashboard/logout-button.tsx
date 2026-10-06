"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { NavIcon } from "@/components/ui/nav-icon";

export function LogoutButton({ menuItem = false }: { menuItem?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        role={menuItem ? "menuitem" : undefined}
        onClick={() => {
          setError(null);

          startTransition(async () => {
            const supabase = createClient();
            const { error: signOutError } = await supabase.auth.signOut();

            if (signOutError) {
              setError(signOutError.message);
              return;
            }

            router.push("/login");
            router.refresh();
          });
        }}
        disabled={isPending}
        className="brand-secondary-btn min-h-10 gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <NavIcon name="logout" />
        <span className="app-logout-label">{isPending ? "Signing out..." : "Log out"}</span>
      </button>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
