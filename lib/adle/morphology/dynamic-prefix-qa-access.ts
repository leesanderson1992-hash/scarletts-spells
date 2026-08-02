import "server-only";

import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { isAdminUser } from "@/lib/admin/access";
import { createClient } from "@/lib/supabase/server";
import {
  isDynamicPrefixQaUserAuthorized,
  isPinnedDynamicPrefixQaEnvironment,
} from "./dynamic-prefix-qa-policy";

export function isDynamicPrefixQaAuthorizedForUser(user: User): boolean {
  return isPinnedDynamicPrefixQaEnvironment(process.env)
    && isDynamicPrefixQaUserAuthorized({
      userId: user.id,
      isAdmin: isAdminUser(user),
      qaUserIds: process.env.ADLE_DYNAMIC_PREFIX_QA_USER_IDS,
    });
}

export async function requireDynamicPrefixQaUser(): Promise<User> {
  if (!isPinnedDynamicPrefixQaEnvironment(process.env)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isDynamicPrefixQaAuthorizedForUser(user)) notFound();
  return user;
}
