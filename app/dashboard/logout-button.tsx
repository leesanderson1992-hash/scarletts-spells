"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
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
        className="brand-secondary-btn min-h-10 px-4 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Signing out..." : "Log out"}
      </button>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
