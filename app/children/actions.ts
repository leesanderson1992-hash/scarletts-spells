"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACTIVE_CHILD_COOKIE_NAME,
} from "@/lib/children";
import { createClient } from "@/lib/supabase/server";

export type ChildFormState = {
  error: string | null;
};

function splitChildName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ") || null;

  return { firstName, lastName };
}

function getApproximateDateOfBirth(ageValue: string) {
  if (!ageValue) {
    return null;
  }

  const age = Number(ageValue);

  if (!Number.isInteger(age) || age < 1 || age > 18) {
    return null;
  }

  const today = new Date();
  const dateOfBirth = new Date(
    today.getFullYear() - age,
    today.getMonth(),
    today.getDate(),
  );

  return dateOfBirth.toISOString().slice(0, 10);
}

function parseChildProfileForm(formData: FormData) {
  const rawName = formData.get("name");
  const rawAge = formData.get("age");

  if (typeof rawName !== "string" || !rawName.trim()) {
    return { error: "Please enter your child's name." } as const;
  }

  const ageValue = typeof rawAge === "string" ? rawAge.trim() : "";
  if (ageValue && getApproximateDateOfBirth(ageValue) === null) {
    return { error: "Please enter an age between 1 and 18." } as const;
  }

  const { firstName, lastName } = splitChildName(rawName);
  const dateOfBirth = getApproximateDateOfBirth(ageValue);

  return {
    error: null,
    firstName,
    lastName,
    dateOfBirth,
  } as const;
}

function revalidateChildPages() {
  revalidatePath("/dashboard");
  revalidatePath("/insights");
  revalidatePath("/children");
  revalidatePath("/courses");
  revalidatePath("/learn");
}

async function getAuthenticatedSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null };
  }

  return { supabase, user };
}

async function setNextActiveChildForParent(parentUserId: string) {
  const { supabase } = await getAuthenticatedSupabase();
  const { data: nextChild } = await supabase
    .from("children")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const cookieStore = await cookies();

  if (nextChild?.id) {
    cookieStore.set(ACTIVE_CHILD_COOKIE_NAME, nextChild.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return;
  }

  cookieStore.delete(ACTIVE_CHILD_COOKIE_NAME);
}

export async function createChildProfile(
  _prevState: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  const parsed = parseChildProfileForm(formData);

  if (parsed.error) {
    return { error: parsed.error };
  }

  const { supabase, user } = await getAuthenticatedSupabase();

  if (!user) {
    return { error: "You need to sign in again before creating a child profile." };
  }

  const { data: insertedChild, error } = await supabase
    .from("children")
    .insert({
      parent_user_id: user.id,
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      date_of_birth: parsed.dateOfBirth,
      is_archived: false,
    })
    .select("id")
    .single();

  if (error || !insertedChild) {
    return { error: "We couldn't save the child profile. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CHILD_COOKIE_NAME, insertedChild.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidateChildPages();
  return { error: null };
}

export async function updateChildProfile(
  _prevState: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  const childId = formData.get("child_id");

  if (typeof childId !== "string" || !childId) {
    return { error: "We couldn't find that child profile." };
  }

  const parsed = parseChildProfileForm(formData);

  if (parsed.error) {
    return { error: parsed.error };
  }

  const { supabase, user } = await getAuthenticatedSupabase();

  if (!user) {
    return { error: "You need to sign in again before updating a child profile." };
  }

  const { error } = await supabase
    .from("children")
    .update({
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      date_of_birth: parsed.dateOfBirth,
    })
    .eq("id", childId)
    .eq("parent_user_id", user.id);

  if (error) {
    return { error: "We couldn't update the child profile. Please try again." };
  }

  revalidateChildPages();
  return { error: null };
}

export async function archiveChildProfile(formData: FormData) {
  const childId = formData.get("child_id");

  if (typeof childId !== "string" || !childId) {
    redirect("/children");
  }

  const { supabase, user } = await getAuthenticatedSupabase();

  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("children")
    .update({ is_archived: true })
    .eq("id", childId)
    .eq("parent_user_id", user.id);

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_CHILD_COOKIE_NAME)?.value === childId) {
    await setNextActiveChildForParent(user.id);
  }

  revalidateChildPages();
  redirect("/children");
}

export async function unarchiveChildProfile(formData: FormData) {
  const childId = formData.get("child_id");

  if (typeof childId !== "string" || !childId) {
    redirect("/children");
  }

  const { supabase, user } = await getAuthenticatedSupabase();

  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("children")
    .update({ is_archived: false })
    .eq("id", childId)
    .eq("parent_user_id", user.id);

  revalidateChildPages();
  redirect("/children");
}

export async function deleteChildProfile(formData: FormData) {
  const childId = formData.get("child_id");

  if (typeof childId !== "string" || !childId) {
    redirect("/children");
  }

  const { supabase, user } = await getAuthenticatedSupabase();

  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("children")
    .delete()
    .eq("id", childId)
    .eq("parent_user_id", user.id);

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_CHILD_COOKIE_NAME)?.value === childId) {
    await setNextActiveChildForParent(user.id);
  }

  revalidateChildPages();
  redirect("/children");
}

export async function setActiveChildContext(formData: FormData) {
  const childId = formData.get("child_id");
  const redirectPath = formData.get("redirect_path");

  if (typeof redirectPath !== "string" || !redirectPath) {
    redirect("/dashboard");
  }

  if (typeof childId !== "string" || !childId) {
    redirect(redirectPath);
  }

  const { supabase, user } = await getAuthenticatedSupabase();

  if (!user) {
    redirect("/login");
  }

  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("parent_user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();

  if (child) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_CHILD_COOKIE_NAME, child.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  redirect(redirectPath);
}
