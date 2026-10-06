import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Shared per-render account and child read for the persistent shell and dashboard. */
export const getAuthenticatedContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, children: [] };
  const { data: children } = await supabase.from("children")
    .select("id, first_name, last_name, date_of_birth, is_archived")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true });
  return { supabase, user, children: children ?? [] };
});
