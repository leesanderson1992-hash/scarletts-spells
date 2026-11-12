import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";

export function canUpdateStagingIngLesson() {
  return resolveAdleRouteActivationEnvironment() === "staging"
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") === "https://qkpjbajicacbrphthibk.supabase.co";
}
