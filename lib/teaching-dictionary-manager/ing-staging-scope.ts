import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";

export function ingReviewEnvironment() {
  const environment = resolveAdleRouteActivationEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (environment === "staging" && url === "https://qkpjbajicacbrphthibk.supabase.co") return environment;
  if (environment === "production" && url === "https://wwohrqtunajrbwxyssjf.supabase.co") return environment;
  return null;
}

export function canUpdateIngLesson() {
  return ingReviewEnvironment() !== null;
}
