import { redirect } from "next/navigation";

import { readSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  if (!readSupabaseEnv()) {
    redirect(
      "/login?error=This deployment is missing Supabase environment variables in Vercel.",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
