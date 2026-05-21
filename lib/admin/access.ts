import "server-only";

import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type AdminAccessResult =
  | {
      status: "unauthenticated";
      user: null;
    }
  | {
      status: "forbidden";
      user: User;
    }
  | {
      status: "authorized";
      user: User;
    };

function parseAllowlist(value: string | undefined) {
  if (!value) {
    return new Set<string>();
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function isAdminUser(user: User) {
  const adminUserIds = parseAllowlist(process.env.ADMIN_USER_IDS);

  if (adminUserIds.has(user.id)) {
    return true;
  }

  const email = user.email?.trim().toLowerCase();

  if (!email) {
    return false;
  }

  return parseAllowlist(process.env.ADMIN_EMAILS?.toLowerCase()).has(email);
}

export async function getAdminUser(): Promise<AdminAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated", user: null };
  }

  if (!isAdminUser(user)) {
    return { status: "forbidden", user };
  }

  return { status: "authorized", user };
}

export async function requireAdminUser() {
  const result = await getAdminUser();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  if (result.status === "forbidden") {
    notFound();
  }

  return result.user;
}
